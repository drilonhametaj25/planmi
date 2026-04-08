/* route.ts — PATCH/DELETE /api/milestones/[id]. Aggiornamento e cancellazione milestone. */
import { db } from "@/db";
import { milestones } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { updateMilestoneSchema } from "@/lib/validators";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateMilestoneSchema);
    if (parsed.error) return parsed.error;

    const [updated] = await db
      .update(milestones)
      .set(parsed.data)
      .where(eq(milestones.id, id))
      .returning();

    if (!updated) {
      return errorResponse("Milestone non trovata", 404);
    }

    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /api/milestones/[id] error:", e);
    return errorResponse("Errore nell'aggiornamento milestone", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(milestones)
      .where(eq(milestones.id, id))
      .returning();

    if (!deleted) {
      return errorResponse("Milestone non trovata", 404);
    }

    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /api/milestones/[id] error:", e);
    return errorResponse("Errore nella cancellazione milestone", 500);
  }
}
