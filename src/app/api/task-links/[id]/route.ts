/* route.ts — DELETE/PATCH /api/task-links/[id] — Elimina o aggiorna un collegamento (+ inverso). */
import { db } from "@/db";
import { taskLinks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    // Carica il link per trovare l'inverso
    const [link] = await db.select().from(taskLinks).where(eq(taskLinks.id, id));
    if (!link) {
      return errorResponse("Collegamento non trovato", 404);
    }

    // Elimina il link
    await db.delete(taskLinks).where(eq(taskLinks.id, id));

    // Elimina l'inverso
    await db
      .delete(taskLinks)
      .where(
        and(
          eq(taskLinks.sourceTaskId, link.targetTaskId),
          eq(taskLinks.targetTaskId, link.sourceTaskId)
        )
      );

    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /api/task-links/[id] error:", e);
    return errorResponse("Errore nella cancellazione collegamento", 500);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { notes?: string };

    const [updated] = await db
      .update(taskLinks)
      .set({ notes: body.notes ?? null })
      .where(eq(taskLinks.id, id))
      .returning();

    if (!updated) {
      return errorResponse("Collegamento non trovato", 404);
    }

    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /api/task-links/[id] error:", e);
    return errorResponse("Errore nell'aggiornamento collegamento", 500);
  }
}
