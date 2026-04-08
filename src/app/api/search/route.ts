/* route.ts — GET /api/search — Ricerca globale full-text su task (titolo, descrizione, note, tag). */
import { db } from "@/db";
import { tasks, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const projectId = url.searchParams.get("projectId");
    const tagsParam = url.searchParams.get("tags");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);

    if (!q && !tagsParam) {
      return successResponse([]);
    }

    // Carica tutti i progetti per il nome
    const allProjects = await db.select().from(projects);
    const projectMap = new Map(allProjects.map((p) => [p.id, p.name]));

    // Carica task (scoped per progetto se specificato)
    let allTasks;
    if (projectId) {
      allTasks = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
    } else {
      allTasks = await db.select().from(tasks);
    }

    const qLower = q.toLowerCase();
    const filterTags = tagsParam
      ? tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    const results: Array<{
      task: typeof allTasks[number];
      matchedField: string;
      matchSnippet: string;
      projectName: string;
    }> = [];

    for (const task of allTasks) {
      // Tag filter: se specificati, il task deve contenere TUTTI i tag richiesti
      if (filterTags.length > 0) {
        const taskTags = task.tags?.toLowerCase() ?? "";
        const hasAllTags = filterTags.every((ft) => taskTags.includes(`"${ft}"`));
        if (!hasAllTags) continue;
      }

      // Se non c'è query testuale ma solo tag filter, includi il task
      if (!q) {
        results.push({
          task,
          matchedField: "tags",
          matchSnippet: task.tags ?? "",
          projectName: projectMap.get(task.projectId) ?? "",
        });
        if (results.length >= limit) break;
        continue;
      }

      // Full-text search con priorità: title > description > notes > tags
      let matchedField = "";
      let matchSnippet = "";

      if (task.title.toLowerCase().includes(qLower)) {
        matchedField = "title";
        matchSnippet = task.title;
      } else if (task.description?.toLowerCase().includes(qLower)) {
        matchedField = "description";
        matchSnippet = extractSnippet(task.description, qLower);
      } else if (task.notes?.toLowerCase().includes(qLower)) {
        matchedField = "notes";
        matchSnippet = extractSnippet(task.notes, qLower);
      } else if (task.tags?.toLowerCase().includes(qLower)) {
        matchedField = "tags";
        matchSnippet = task.tags;
      }

      if (matchedField) {
        results.push({
          task,
          matchedField,
          matchSnippet,
          projectName: projectMap.get(task.projectId) ?? "",
        });
        if (results.length >= limit) break;
      }
    }

    return successResponse(results);
  } catch (e) {
    console.error("GET /api/search error:", e);
    return errorResponse("Errore nella ricerca", 500);
  }
}

/** Estrae un frammento di testo attorno al match (~60 char prima e dopo). */
function extractSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text.slice(0, 120);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 60);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet += "...";
  return snippet;
}
