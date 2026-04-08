/* route.ts — POST /api/projects/[id]/emergency-insert
   Inserisce un task di emergenza e trasla tutti gli altri task in avanti.
   - Con ?preview=true → restituisce preview senza applicare
   - Senza preview → crea il task e applica gli shift */
import { db } from "@/db";
import { projects, tasks, dependencies, timeOff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { emergencyInsertSchema } from "@/lib/validators";
import { shiftProjectFromDate, type ShiftTask, type ShiftDependency } from "@/lib/shifting-engine";
import { buildTimeOffMaps } from "@/lib/workload-optimizer";
import { recalculateParentBounds } from "@/lib/parent-bounds";
import { getDefaultDays } from "@/lib/task-defaults";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const url = new URL(request.url);
    const isPreview = url.searchParams.get("preview") === "true";

    const parsed = await parseBody(request, emergencyInsertSchema);
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
    const { blockedDates } = buildTimeOffMaps(timeOffEntries);

    // Calcola durata emergenza in workdays
    const hours = parsed.data.estimatedHours;
    const durationWorkdays = hours && hours > 0
      ? Math.ceil(hours / 8)
      : getDefaultDays(parsed.data.taskType ?? "altro");

    // Supplier task IDs
    const supplierTaskIds = new Set(
      projectTasks.filter((t) => t.executionMode === "supplier").map((t) => t.id)
    );

    // Calcola shift — solo task schedulati
    const scheduledTasks = projectTasks.filter((t) => t.startDate && t.endDate);
    const shiftTasks: ShiftTask[] = scheduledTasks.map((t) => ({
      id: t.id,
      startDate: t.startDate!,
      endDate: t.endDate!,
    }));
    const shiftDeps: ShiftDependency[] = projectDeps.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      dependencyType: (d.dependencyType ?? "FS") as "FS" | "SS" | "FF" | "SF",
      lagDays: d.lagDays ?? 0,
    }));

    const result = shiftProjectFromDate({
      insertDate: parsed.data.insertDate,
      durationWorkdays,
      allTasks: shiftTasks,
      allDependencies: shiftDeps,
      options: { blockedDates, supplierTaskIds },
    });

    const emergencyTask = {
      title: parsed.data.title,
      taskType: parsed.data.taskType ?? "altro",
      priority: parsed.data.priority,
      startDate: parsed.data.insertDate,
      endDate: result.emergencyEndDate,
      estimatedHours: hours ?? durationWorkdays * 8,
      description: parsed.data.description,
      notes: parsed.data.notes,
      parentTaskId: parsed.data.parentTaskId ?? null,
    };

    if (isPreview) {
      return successResponse({
        emergencyTask,
        shifts: result.shifts,
        stats: { tasksShifted: result.shifts.length },
      });
    }

    // ── Applica ──

    // 1. Crea il task di emergenza
    const [created] = await db
      .insert(tasks)
      .values({
        projectId,
        title: emergencyTask.title,
        taskType: emergencyTask.taskType,
        priority: emergencyTask.priority,
        startDate: emergencyTask.startDate,
        endDate: emergencyTask.endDate,
        estimatedHours: String(emergencyTask.estimatedHours),
        description: emergencyTask.description ?? undefined,
        notes: emergencyTask.notes ?? undefined,
        parentTaskId: emergencyTask.parentTaskId ?? undefined,
        status: "todo",
        progress: 0,
      })
      .returning();

    // 2. Applica tutti gli shift
    for (const shift of result.shifts) {
      await db
        .update(tasks)
        .set({
          startDate: shift.newStartDate,
          endDate: shift.newEndDate,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, shift.taskId));
    }

    // 3. Ricalcola bounds dei parent affetti
    const affectedParentIds = new Set<string>();
    for (const shift of result.shifts) {
      const t = projectTasks.find((pt) => pt.id === shift.taskId);
      if (t?.parentTaskId) affectedParentIds.add(t.parentTaskId);
    }
    if (created?.parentTaskId) affectedParentIds.add(created.parentTaskId);
    for (const pid of affectedParentIds) {
      await recalculateParentBounds(pid);
    }

    return successResponse({
      emergencyTask: created,
      shifts: result.shifts,
      stats: { tasksShifted: result.shifts.length },
    }, 201);
  } catch (e) {
    console.error("POST /api/projects/[id]/emergency-insert error:", e);
    return errorResponse("Errore nell'inserimento emergenza", 500);
  }
}
