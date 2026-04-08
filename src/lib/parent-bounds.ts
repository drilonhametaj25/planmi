/* parent-bounds.ts — Ricalcola i bounds (startDate/endDate) di un task padre
   per assicurarsi che copra tutti i sottotask. Il padre può essere più grande ma mai più piccolo.
   Risale ricorsivamente verso la root. */

import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

function parseD(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}
function formatD(ms: number): string {
  return new Date(ms).toISOString().split("T")[0]!;
}

/**
 * Ricalcola i bounds di un task padre per coprire tutti i sottotask.
 * Se il padre è più piccolo dei figli, lo espande. Risale ricorsivamente.
 */
export async function recalculateParentBounds(taskId: string) {
  const children = await db
    .select({ startDate: tasks.startDate, endDate: tasks.endDate })
    .from(tasks)
    .where(eq(tasks.parentTaskId, taskId));

  if (children.length === 0) return;

  const minChildStartMs = Math.min(
    ...children.map((c) => parseD(c.startDate))
  );
  const maxChildEndMs = Math.max(...children.map((c) => parseD(c.endDate)));

  const [parent] = await db
    .select({
      id: tasks.id,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      parentTaskId: tasks.parentTaskId,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!parent) return;

  const update: Record<string, unknown> = {};

  if (parseD(parent.startDate) > minChildStartMs) {
    update.startDate = formatD(minChildStartMs);
  }
  if (parseD(parent.endDate) < maxChildEndMs) {
    update.endDate = formatD(maxChildEndMs);
  }

  if (Object.keys(update).length > 0) {
    update.updatedAt = new Date();
    await db.update(tasks).set(update).where(eq(tasks.id, taskId));
  }

  // Risali: se questo task ha a sua volta un padre, controlla anche quello
  if (parent.parentTaskId) {
    await recalculateParentBounds(parent.parentTaskId);
  }
}
