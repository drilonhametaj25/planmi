/* route.ts — GET /api/projects/[id]/tasks (tutti i task con deps), POST (crea task). */
import { db } from "@/db";
import { tasks, dependencies } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { createTaskSchema } from "@/lib/validators";
import { recalculateParentBounds } from "@/lib/parent-bounds";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, id))
      .orderBy(asc(tasks.sortOrder), asc(tasks.createdAt));

    const taskIds = projectTasks.map((t) => t.id);
    let projectDeps: (typeof dependencies.$inferSelect)[] = [];
    if (taskIds.length > 0) {
      const allDeps = await db.select().from(dependencies);
      projectDeps = allDeps.filter(
        (d) =>
          taskIds.includes(d.predecessorId) || taskIds.includes(d.successorId)
      );
    }

    return successResponse({ tasks: projectTasks, dependencies: projectDeps });
  } catch (e) {
    console.error("GET /api/projects/[id]/tasks error:", e);
    return errorResponse("Errore nel caricamento task", 500);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createTaskSchema);
    if (parsed.error) return parsed.error;

    // Assicura che projectId corrisponda alla route
    // Converti estimatedHours da number a string per il campo numeric del DB
    const { estimatedHours, ...rest } = parsed.data;
    const [task] = await db
      .insert(tasks)
      .values({
        ...rest,
        projectId: id,
        estimatedHours: estimatedHours != null ? String(estimatedHours) : undefined,
      })
      .returning();

    // Se è un sottotask, assicurati che il padre lo copra
    if (task?.parentTaskId) {
      await recalculateParentBounds(task.parentTaskId);
    }

    return successResponse(task, 201);
  } catch (e) {
    console.error("POST /api/projects/[id]/tasks error:", e);
    return errorResponse("Errore nella creazione task", 500);
  }
}
