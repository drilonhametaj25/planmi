/* route.ts — GET /api/projects/[id]/suggestions. Genera suggerimenti per un progetto. */
import { db } from "@/db";
import { tasks, dependencies, taskHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { generateSuggestions } from "@/lib/suggestions-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, id));

    const taskIds = projectTasks.map((t) => t.id);
    const allDeps = await db.select().from(dependencies);
    const projectDeps = allDeps.filter(
      (d) =>
        taskIds.includes(d.predecessorId) || taskIds.includes(d.successorId)
    );

    const history = await db
      .select()
      .from(taskHistory)
      .where(eq(taskHistory.projectId, id));

    const today = new Date().toISOString().split("T")[0]!;

    const suggestions = generateSuggestions({
      tasks: projectTasks,
      dependencies: projectDeps,
      history,
      today,
    });

    return successResponse(suggestions);
  } catch (e) {
    console.error("GET /api/projects/[id]/suggestions error:", e);
    return errorResponse("Errore nel calcolo suggerimenti", 500);
  }
}
