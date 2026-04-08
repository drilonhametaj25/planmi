/* route.ts — POST /api/projects/[id]/auto-schedule. Calcola date ottimali per un nuovo task. */
import { db } from "@/db";
import { tasks, dependencies, milestones as milestonesTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { autoScheduleSchema } from "@/lib/validators";
import { calculateAutoSchedule } from "@/lib/auto-scheduler";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const parsed = await parseBody(request, autoScheduleSchema);
    if (parsed.error) return parsed.error;

    const {
      taskType,
      estimatedHours,
      parentTaskId,
      milestoneId,
      predecessorDeps,
    } = parsed.data;

    // Carica tutti i task del progetto
    const allTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));

    // Carica tutte le dipendenze del progetto
    const taskIds = new Set(allTasks.map((t) => t.id));
    const allDeps = await db.select().from(dependencies);
    const projectDeps = allDeps.filter(
      (d) => taskIds.has(d.predecessorId) && taskIds.has(d.successorId)
    );

    // Carica milestones del progetto
    const projectMilestones = await db
      .select()
      .from(milestonesTable)
      .where(eq(milestonesTable.projectId, projectId));

    const today = new Date().toISOString().split("T")[0]!;

    const result = calculateAutoSchedule({
      taskType: taskType ?? null,
      estimatedHours: estimatedHours ?? null,
      parentTaskId: parentTaskId ?? null,
      milestoneId: milestoneId ?? null,
      predecessorDeps: predecessorDeps.map((d) => ({
        predecessorId: d.predecessorId,
        dependencyType: d.dependencyType as "FS" | "SS" | "FF" | "SF",
        lagDays: d.lagDays,
      })),
      allTasks: allTasks.map((t) => ({
        id: t.id,
        startDate: t.startDate,
        endDate: t.endDate,
      })),
      allDependencies: projectDeps.map((d) => ({
        predecessorId: d.predecessorId,
        successorId: d.successorId,
        dependencyType: (d.dependencyType ?? "FS") as "FS" | "SS" | "FF" | "SF",
        lagDays: d.lagDays ?? 0,
      })),
      milestones: projectMilestones.map((m) => ({
        id: m.id,
        date: m.date,
      })),
      today,
    });

    return successResponse(result);
  } catch (e) {
    console.error("POST /api/projects/[id]/auto-schedule error:", e);
    return errorResponse("Errore nel calcolo auto-schedule", 500);
  }
}
