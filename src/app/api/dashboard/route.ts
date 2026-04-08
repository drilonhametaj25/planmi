/* route.ts — GET /api/dashboard. Dati aggregati per la dashboard: KPI globali, progetti attivi, task urgenti. */
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { eq, sql, count, and, ne } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0]!;

    // KPI globali
    const [stats] = await db
      .select({
        totalOpen: count(
          sql`CASE WHEN ${tasks.status} != 'done' THEN 1 END`
        ),
        overdue: count(
          sql`CASE WHEN ${tasks.endDate} < ${today} AND ${tasks.status} != 'done' THEN 1 END`
        ),
        inProgress: count(
          sql`CASE WHEN ${tasks.status} = 'in_progress' THEN 1 END`
        ),
        blocked: count(
          sql`CASE WHEN ${tasks.status} = 'blocked' THEN 1 END`
        ),
      })
      .from(tasks);

    // Progetti attivi count
    const [projectStats] = await db
      .select({ active: count() })
      .from(projects)
      .where(eq(projects.status, "active"));

    // Progetti attivi con dettagli
    const activeProjects = await db
      .select()
      .from(projects)
      .where(eq(projects.status, "active"))
      .orderBy(projects.updatedAt);

    // Per ogni progetto attivo, calcola stats
    const projectsWithStats = await Promise.all(
      activeProjects.map(async (project) => {
        const [pStats] = await db
          .select({
            total: count(),
            completed: count(
              sql`CASE WHEN ${tasks.status} = 'done' THEN 1 END`
            ),
            overdue: count(
              sql`CASE WHEN ${tasks.endDate} < ${today} AND ${tasks.status} != 'done' THEN 1 END`
            ),
          })
          .from(tasks)
          .where(eq(tasks.projectId, project.id));

        const total = pStats?.total ?? 0;
        const completed = Number(pStats?.completed ?? 0);
        return {
          ...project,
          totalTasks: total,
          completedTasks: completed,
          overdueTasks: Number(pStats?.overdue ?? 0),
          progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      })
    );

    // Task urgenti (scaduti o in scadenza entro 3 giorni)
    const urgentTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          ne(tasks.status, "done"),
          sql`${tasks.endDate} <= ${today}::date + interval '3 days'`
        )
      )
      .orderBy(tasks.endDate);

    return successResponse({
      kpi: {
        totalOpen: Number(stats?.totalOpen ?? 0),
        overdue: Number(stats?.overdue ?? 0),
        inProgress: Number(stats?.inProgress ?? 0),
        blocked: Number(stats?.blocked ?? 0),
        activeProjects: projectStats?.active ?? 0,
      },
      projects: projectsWithStats,
      urgentTasks: urgentTasks.slice(0, 10),
    });
  } catch (e) {
    console.error("GET /api/dashboard error:", e);
    return errorResponse("Errore nel caricamento dashboard", 500);
  }
}
