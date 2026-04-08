/* route.ts — POST /api/projects/[id]/generate-plan
   Genera un piano automatico: suggerisce dipendenze + ottimizza date. Sempre preview. */
import { db } from "@/db";
import { projects, tasks, dependencies, timeOff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { generatePlanSchema } from "@/lib/validators";
import { generatePlan, type PlanGeneratorResult } from "@/lib/plan-generator";
import { buildTimeOffMaps, type WorkloadTask } from "@/lib/workload-optimizer";
import type { ShiftDependency } from "@/lib/shifting-engine";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const parsed = await parseBody(request, generatePlanSchema);
    if (parsed.error) return parsed.error;

    // Verifica progetto
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) return errorResponse("Progetto non trovato", 404);

    // Carica dati
    const projectTasks = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
    const taskIds = projectTasks.map((t) => t.id);
    const allDeps = await db.select().from(dependencies);
    const projectDeps = allDeps.filter(
      (d) => taskIds.includes(d.predecessorId) || taskIds.includes(d.successorId)
    );
    const timeOffEntries = await db.select().from(timeOff);
    const { blockedDates, dayCapacity } = buildTimeOffMaps(timeOffEntries);

    const today = new Date().toISOString().split("T")[0]!;

    const workloadTasks: WorkloadTask[] = projectTasks.map((t) => ({
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
      sortOrder: t.sortOrder,
      taskType: t.taskType,
    }));

    const shiftDeps: ShiftDependency[] = projectDeps.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      dependencyType: (d.dependencyType ?? "FS") as "FS" | "SS" | "FF" | "SF",
      lagDays: d.lagDays ?? 0,
    }));

    const result: PlanGeneratorResult = generatePlan({
      tasks: workloadTasks,
      existingDeps: shiftDeps,
      today,
      options: {
        blockedDates,
        dayCapacity,
        startFrom: parsed.data.startFrom,
        suggestDependencies: parsed.data.suggestDependencies,
      },
    });

    return successResponse(result);
  } catch (e) {
    console.error("POST /api/projects/[id]/generate-plan error:", e);
    return errorResponse("Errore nella generazione del piano", 500);
  }
}
