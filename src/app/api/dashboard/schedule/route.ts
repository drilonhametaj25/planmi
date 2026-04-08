/* route.ts — GET /api/dashboard/schedule. Genera lo schedule giornaliero ottimizzato
   su tutti i progetti attivi. Mostra cosa fare ogni giorno rispettando dipendenze e 8h/giorno. */
import { db } from "@/db";
import { projects, tasks, dependencies, timeOff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { generateDailySchedule, buildTimeOffMaps, type WorkloadTask } from "@/lib/workload-optimizer";

export async function GET() {
  try {
    const today = new Date().toISOString().split("T")[0]!;

    // Carica tutti i progetti attivi
    const activeProjects = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.status, "active"));

    if (activeProjects.length === 0) {
      return successResponse({
        days: [],
        unschedulable: [],
        totalWorkdays: 0,
        warnings: [],
      });
    }

    const projectMap = new Map(activeProjects.map((p) => [p.id, p.name]));
    const projectIds = activeProjects.map((p) => p.id);

    // Carica tutti i task non completati di tutti i progetti attivi
    const allTasks: WorkloadTask[] = [];
    const allDeps: { predecessorId: string; successorId: string; dependencyType: string; lagDays: number }[] = [];

    for (const pid of projectIds) {
      const projectTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.projectId, pid));

      for (const t of projectTasks) {
        // Skip unscheduled tasks (no dates)
        if (!t.startDate || !t.endDate) continue;
        allTasks.push({
          id: t.id,
          title: t.title,
          parentTaskId: t.parentTaskId,
          startDate: t.startDate,
          endDate: t.endDate,
          status: t.status,
          priority: t.priority,
          estimatedHours: t.estimatedHours,
          executionMode: t.executionMode,
          projectId: t.projectId,
          projectName: projectMap.get(t.projectId) ?? "",
          sortOrder: t.sortOrder,
        });
      }

      const taskIds = projectTasks.map((t) => t.id);
      const deps = await db.select().from(dependencies);
      for (const d of deps) {
        if (taskIds.includes(d.predecessorId) && taskIds.includes(d.successorId)) {
          allDeps.push({
            predecessorId: d.predecessorId,
            successorId: d.successorId,
            dependencyType: d.dependencyType ?? "FS",
            lagDays: d.lagDays ?? 0,
          });
        }
      }
    }

    // Carica time-off
    const allTimeOff = await db.select().from(timeOff);
    const { blockedDates, dayCapacity } = buildTimeOffMaps(allTimeOff);

    const result = generateDailySchedule(
      allTasks,
      allDeps.map((d) => ({
        ...d,
        dependencyType: d.dependencyType as "FS" | "SS" | "FF" | "SF",
      })),
      today,
      30,
      { blockedDates, dayCapacity }
    );

    return successResponse(result);
  } catch (e) {
    console.error("GET /api/dashboard/schedule error:", e);
    return errorResponse("Errore generazione schedule", 500);
  }
}
