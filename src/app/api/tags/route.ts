/* route.ts — GET /api/tags — Ritorna tutti i tag unici dai task, per autocomplete. */
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { parseTags } from "@/lib/tags";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");

    let rows;
    if (projectId) {
      rows = await db
        .select({ tags: tasks.tags })
        .from(tasks)
        .where(eq(tasks.projectId, projectId));
    } else {
      rows = await db.select({ tags: tasks.tags }).from(tasks);
    }

    const tagSet = new Set<string>();
    for (const row of rows) {
      for (const tag of parseTags(row.tags)) {
        tagSet.add(tag);
      }
    }

    return successResponse([...tagSet].sort());
  } catch (e) {
    console.error("GET /api/tags error:", e);
    return errorResponse("Errore nel caricamento tag", 500);
  }
}
