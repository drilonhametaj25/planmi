/* route.ts — GET/PATCH/DELETE /api/tasks/[id]. Update con auto-progress: done→100%, parent ricalcolato dai figli.
   Quando startDate cambia su un task padre, trasla tutti i discendenti della stessa delta. */
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { updateTaskSchema } from "@/lib/validators";
import { recalculateParentBounds } from "@/lib/parent-bounds";

// ── Utility date ──
function parseD(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}
function formatD(ms: number): string {
  return new Date(ms).toISOString().split("T")[0]!;
}

/** Raccoglie ricorsivamente tutti i discendenti di un task */
function getAllDescendants<T extends { id: string; parentTaskId: string | null }>(
  taskId: string,
  allTasks: T[]
): T[] {
  const children = allTasks.filter((t) => t.parentTaskId === taskId);
  const result: T[] = [...children];
  for (const child of children) {
    result.push(...getAllDescendants(child.id, allTasks));
  }
  return result;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));

    if (!task) {
      return errorResponse("Task non trovato", 404);
    }

    return successResponse(task);
  } catch (e) {
    console.error("GET /api/tasks/[id] error:", e);
    return errorResponse("Errore nel caricamento task", 500);
  }
}

/**
 * Ricalcola il progress di un task padre come media ponderata (per durata) dei suoi sottotask.
 * Se non ha sottotask, non fa nulla.
 */
async function recalculateParentProgress(parentId: string) {
  const children = await db
    .select()
    .from(tasks)
    .where(eq(tasks.parentTaskId, parentId));

  if (children.length === 0) return;

  // Peso = durata in giorni di ogni sottotask
  let totalWeight = 0;
  let weightedProgress = 0;

  for (const child of children) {
    const start = new Date(child.startDate + "T00:00:00Z").getTime();
    const end = new Date(child.endDate + "T00:00:00Z").getTime();
    const durationDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const progress = child.progress ?? 0;

    totalWeight += durationDays;
    weightedProgress += durationDays * progress;
  }

  const parentProgress =
    totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;

  // Determina lo status del padre in base ai figli
  const allDone = children.every((c) => c.status === "done");
  const anyBlocked = children.some((c) => c.status === "blocked");
  const anyInProgress = children.some(
    (c) => c.status === "in_progress" || c.status === "in_review"
  );

  const parentStatus = allDone
    ? "done"
    : anyBlocked
      ? "blocked"
      : anyInProgress || parentProgress > 0
        ? "in_progress"
        : undefined; // non cambiare status se tutto è ancora todo

  const updateData: Record<string, unknown> = {
    progress: parentProgress,
    updatedAt: new Date(),
  };
  if (parentStatus) {
    updateData.status = parentStatus;
  }

  await db.update(tasks).set(updateData).where(eq(tasks.id, parentId));

  // Ricorsione: se il padre ha a sua volta un padre, ricalcola anche quello
  const [parent] = await db.select().from(tasks).where(eq(tasks.id, parentId));
  if (parent?.parentTaskId) {
    await recalculateParentProgress(parent.parentTaskId);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateTaskSchema);
    if (parsed.error) return parsed.error;

    // Carica task corrente per avere parentTaskId
    const [current] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!current) {
      return errorResponse("Task non trovato", 404);
    }

    const updateData: Record<string, unknown> = {
      ...parsed.data,
      updatedAt: new Date(),
    };

    // Auto-progress: se status→done, progress=100. Se status→todo, progress=0.
    if (parsed.data.status === "done") {
      updateData.progress = 100;
    } else if (parsed.data.status === "todo" && current.status === "done") {
      updateData.progress = 0;
    }

    // Converti numeri nullable per campi numeric del DB
    if (parsed.data.estimatedHours !== undefined) {
      updateData.estimatedHours =
        parsed.data.estimatedHours !== null
          ? String(parsed.data.estimatedHours)
          : null;
    }
    if (parsed.data.actualHours !== undefined) {
      updateData.actualHours =
        parsed.data.actualHours !== null
          ? String(parsed.data.actualHours)
          : null;
    }

    const [updated] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, id))
      .returning();

    if (!updated) {
      return errorResponse("Task non trovato", 404);
    }

    // ── Cascata sottotask: se startDate è cambiato, trasla tutti i discendenti ──
    if (
      parsed.data.startDate &&
      parsed.data.startDate !== current.startDate
    ) {
      const deltaMs =
        parseD(parsed.data.startDate) - parseD(current.startDate);
      if (deltaMs !== 0) {
        const allProjectTasks = await db
          .select()
          .from(tasks)
          .where(eq(tasks.projectId, current.projectId));
        const descendants = getAllDescendants(id, allProjectTasks);
        for (const desc of descendants) {
          await db
            .update(tasks)
            .set({
              startDate: formatD(parseD(desc.startDate) + deltaMs),
              endDate: formatD(parseD(desc.endDate) + deltaMs),
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, desc.id));
        }
      }
    }

    // ── Bounds padre ↔ figli ──
    // Se questo task ha figli, assicurati che li copra tutti (expand se servono)
    await recalculateParentBounds(id);
    // Se questo task ha un padre, assicurati che il padre lo copra
    if (updated.parentTaskId) {
      await recalculateParentBounds(updated.parentTaskId);
      await recalculateParentProgress(updated.parentTaskId);
    }

    // Ricarica il task con i bounds corretti prima di rispondere
    const [final] = await db.select().from(tasks).where(eq(tasks.id, id));
    return successResponse(final ?? updated);
  } catch (e) {
    console.error("PATCH /api/tasks/[id] error:", e);
    return errorResponse("Errore nell'aggiornamento task", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(tasks)
      .where(eq(tasks.id, id))
      .returning();

    if (!deleted) {
      return errorResponse("Task non trovato", 404);
    }

    // Se il task cancellato aveva un padre, ricalcola il progress
    if (deleted.parentTaskId) {
      await recalculateParentProgress(deleted.parentTaskId);
    }

    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /api/tasks/[id] error:", e);
    return errorResponse("Errore nella cancellazione task", 500);
  }
}
