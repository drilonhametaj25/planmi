/* route.ts — POST /api/tasks/[id]/optimize. Ottimizza un singolo task padre
   usando l'ottimizzatore globale del progetto e filtrando i risultati
   per il task richiesto e i suoi discendenti.
   - ?preview=true → preview senza applicare */
import { db } from "@/db";
import { tasks, dependencies, timeOff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { optimizeProject, buildTimeOffMaps, type WorkloadTask } from "@/lib/workload-optimizer";
import { recalculateParentBounds } from "@/lib/parent-bounds";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const isPreview = url.searchParams.get("preview") === "true";
    const startFrom = url.searchParams.get("startFrom") ?? undefined;

    const [parentTask] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!parentTask) return errorResponse("Task non trovato", 404);

    // Carica tutti i task del progetto (serve contesto completo per le dipendenze)
    const allTaskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, parentTask.projectId));

    const subtasks = allTaskRows.filter((t) => t.parentTaskId === id);
    if (subtasks.length === 0) {
      return errorResponse("Il task non ha sottotask da ottimizzare", 400);
    }

    // Carica dipendenze
    const taskIds = new Set(allTaskRows.map((t) => t.id));
    const allDeps = await db.select().from(dependencies);
    const projectDeps = allDeps.filter(
      (d) => taskIds.has(d.predecessorId) && taskIds.has(d.successorId)
    );

    // Carica time-off
    const allTimeOff = await db.select().from(timeOff);
    const { blockedDates, dayCapacity } = buildTimeOffMaps(allTimeOff);

    const workloadTasks: WorkloadTask[] = allTaskRows.map((t) => ({
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
    }));

    const shiftDeps = projectDeps.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
      dependencyType: (d.dependencyType ?? "FS") as "FS" | "SS" | "FF" | "SF",
      lagDays: d.lagDays ?? 0,
    }));

    const today = new Date().toISOString().split("T")[0]!;

    // Usa l'ottimizzatore globale per avere il contesto completo delle dipendenze
    const fullResult = optimizeProject(workloadTasks, shiftDeps, today, { blockedDates, dayCapacity, startFrom });

    // Filtra: solo cambiamenti relativi a questo task padre e i suoi sottotask
    const relevantIds = new Set([id, ...subtasks.map((s) => s.id)]);
    const filteredChanges = fullResult.changes.filter((c) => relevantIds.has(c.taskId));

    const result = {
      changes: filteredChanges,
      warnings: fullResult.warnings,
      stats: {
        totalTasksChanged: filteredChanges.length,
        parentTasksChanged: filteredChanges.filter((c) => c.taskId === id).length,
        subtasksChanged: filteredChanges.filter((c) => c.taskId !== id).length,
        standaloneChanged: 0,
      },
    };

    if (isPreview) {
      return successResponse(result);
    }

    // Applica
    if (filteredChanges.length === 0) {
      return successResponse({ ...result, applied: true, message: "Nessun cambiamento necessario" });
    }

    for (const change of filteredChanges) {
      await db
        .update(tasks)
        .set({
          startDate: change.newStartDate,
          endDate: change.newEndDate,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, change.taskId));
    }

    // Ricalcola bounds
    await recalculateParentBounds(id);
    if (parentTask.parentTaskId) {
      await recalculateParentBounds(parentTask.parentTaskId);
    }

    return successResponse({ ...result, applied: true });
  } catch (e) {
    console.error("POST /api/tasks/[id]/optimize error:", e);
    return errorResponse("Errore nell'ottimizzazione", 500);
  }
}
