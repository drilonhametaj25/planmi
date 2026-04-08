/* route.ts — POST /api/tasks/reorder. Aggiorna sortOrder di multipli task in batch. */
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { reorderTasksSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, reorderTasksSchema);
    if (parsed.error) return parsed.error;

    await Promise.all(
      parsed.data.updates.map((update) =>
        db
          .update(tasks)
          .set({ sortOrder: update.sortOrder })
          .where(eq(tasks.id, update.id))
      )
    );

    return successResponse({ updated: parsed.data.updates.length });
  } catch (e) {
    console.error("POST /api/tasks/reorder error:", e);
    return errorResponse("Errore nel riordinamento task", 500);
  }
}
