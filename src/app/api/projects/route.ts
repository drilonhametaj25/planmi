/* route.ts — GET /api/projects (lista con stats), POST /api/projects (crea progetto). */
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { createProjectSchema } from "@/lib/validators";

export async function GET() {
  try {
    const allProjects = await db.select().from(projects).orderBy(projects.updatedAt);

    const projectStats = await Promise.all(
      allProjects.map(async (project) => {
        const stats = await db
          .select({
            total: count(),
            completed: count(
              sql`CASE WHEN ${tasks.status} = 'done' THEN 1 END`
            ),
            overdue: count(
              sql`CASE WHEN ${tasks.endDate} < CURRENT_DATE AND ${tasks.status} != 'done' THEN 1 END`
            ),
          })
          .from(tasks)
          .where(eq(tasks.projectId, project.id));

        const s = stats[0];
        const total = s?.total ?? 0;
        const completed = Number(s?.completed ?? 0);
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          ...project,
          totalTasks: total,
          completedTasks: completed,
          overdueTasks: Number(s?.overdue ?? 0),
          progress,
        };
      })
    );

    return successResponse(projectStats);
  } catch (e) {
    console.error("GET /api/projects error:", e);
    return errorResponse("Errore nel caricamento progetti", 500);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, createProjectSchema);
    if (parsed.error) return parsed.error;

    const [project] = await db
      .insert(projects)
      .values(parsed.data)
      .returning();

    return successResponse(project, 201);
  } catch (e) {
    console.error("POST /api/projects error:", e);
    return errorResponse("Errore nella creazione progetto", 500);
  }
}
