/* route.ts — PATCH /api/time-off/[id], DELETE /api/time-off/[id]. */
import { db } from "@/db";
import { timeOff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { updateTimeOffSchema } from "@/lib/validators";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateTimeOffSchema);
    if (parsed.error) return parsed.error;

    const updates: Record<string, unknown> = {};
    if (parsed.data.startDate !== undefined) updates.startDate = parsed.data.startDate;
    if (parsed.data.endDate !== undefined) updates.endDate = parsed.data.endDate;
    if (parsed.data.type !== undefined) updates.type = parsed.data.type;
    if (parsed.data.hoursPerDay !== undefined) updates.hoursPerDay = parsed.data.hoursPerDay?.toString() ?? null;
    if (parsed.data.note !== undefined) updates.note = parsed.data.note;

    const [updated] = await db
      .update(timeOff)
      .set(updates)
      .where(eq(timeOff.id, id))
      .returning();

    if (!updated) return errorResponse("Non trovato", 404);
    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /api/time-off/[id] error:", e);
    return errorResponse("Errore nell'aggiornamento", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(timeOff)
      .where(eq(timeOff.id, id))
      .returning();

    if (!deleted) return errorResponse("Non trovato", 404);
    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /api/time-off/[id] error:", e);
    return errorResponse("Errore nell'eliminazione", 500);
  }
}
