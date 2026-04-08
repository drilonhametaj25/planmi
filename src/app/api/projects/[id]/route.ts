/* route.ts — GET/PATCH/DELETE /api/projects/[id]. Singolo progetto con tasks e milestones. */
import { db } from "@/db";
import { projects, tasks, milestones, dependencies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { updateProjectSchema } from "@/lib/validators";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id));

    if (!project) {
      return errorResponse("Progetto non trovato", 404);
    }

    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, id))
      .orderBy(tasks.sortOrder);

    const projectMilestones = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id))
      .orderBy(milestones.date);

    // Carica dipendenze per tutti i task del progetto
    const taskIds = projectTasks.map((t) => t.id);
    let projectDependencies: (typeof dependencies.$inferSelect)[] = [];
    if (taskIds.length > 0) {
      const allDeps = await db.select().from(dependencies);
      projectDependencies = allDeps.filter(
        (d) =>
          taskIds.includes(d.predecessorId) || taskIds.includes(d.successorId)
      );
    }

    return successResponse({
      ...project,
      tasks: projectTasks,
      milestones: projectMilestones,
      dependencies: projectDependencies,
    });
  } catch (e) {
    console.error("GET /api/projects/[id] error:", e);
    return errorResponse("Errore nel caricamento progetto", 500);
  }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, updateProjectSchema);
    if (parsed.error) return parsed.error;

    const [updated] = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();

    if (!updated) {
      return errorResponse("Progetto non trovato", 404);
    }

    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /api/projects/[id] error:", e);
    return errorResponse("Errore nell'aggiornamento progetto", 500);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const [deleted] = await db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning();

    if (!deleted) {
      return errorResponse("Progetto non trovato", 404);
    }

    return successResponse({ deleted: true });
  } catch (e) {
    console.error("DELETE /api/projects/[id] error:", e);
    return errorResponse("Errore nella cancellazione progetto", 500);
  }
}
