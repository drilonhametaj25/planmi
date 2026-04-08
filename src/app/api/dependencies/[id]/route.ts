/* route.ts — DELETE /api/dependencies/[id]. Rimuove una dipendenza. */
import { db } from "@/db";
import { dependencies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(dependencies)
      .where(eq(dependencies.id, id))
      .returning();

    if (!deleted) {
      return errorResponse("Dipendenza non trovata", 404);
    }

    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /api/dependencies/[id] error:", e);
    return errorResponse("Errore nella cancellazione dipendenza", 500);
  }
}
