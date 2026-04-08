/* route.ts — POST /api/task-links — Crea un collegamento bidirezionale tra task. */
import { db } from "@/db";
import { taskLinks, tasks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { createTaskLinkSchema } from "@/lib/validators";
import { getInverseType } from "@/lib/task-links";

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, createTaskLinkSchema);
    if (parsed.error) return parsed.error;

    const { sourceTaskId, targetTaskId, linkType, notes } = parsed.data;

    // Previeni self-link
    if (sourceTaskId === targetTaskId) {
      return errorResponse("Non puoi collegare un task a se stesso", 400);
    }

    // Verifica che entrambi i task esistano
    const [source] = await db.select().from(tasks).where(eq(tasks.id, sourceTaskId));
    const [target] = await db.select().from(tasks).where(eq(tasks.id, targetTaskId));
    if (!source || !target) {
      return errorResponse("Uno o entrambi i task non esistono", 404);
    }

    // Previeni duplicati
    const existing = await db
      .select()
      .from(taskLinks)
      .where(
        and(
          eq(taskLinks.sourceTaskId, sourceTaskId),
          eq(taskLinks.targetTaskId, targetTaskId)
        )
      );
    if (existing.length > 0) {
      return errorResponse("Collegamento già esistente", 409);
    }

    // Crea link diretto
    const [link] = await db
      .insert(taskLinks)
      .values({ sourceTaskId, targetTaskId, linkType, notes })
      .returning();

    // Crea link inverso
    const inverseType = getInverseType(linkType);
    await db.insert(taskLinks).values({
      sourceTaskId: targetTaskId,
      targetTaskId: sourceTaskId,
      linkType: inverseType,
      notes,
    });

    return successResponse(link, 201);
  } catch (e) {
    console.error("POST /api/task-links error:", e);
    return errorResponse("Errore nella creazione collegamento", 500);
  }
}
