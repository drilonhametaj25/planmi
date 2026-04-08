/* route.ts — POST /api/projects/[id]/optimize
   Ottimizzazione globale di un progetto.
   - Con ?preview=true → restituisce preview dei cambiamenti senza applicarli
   - Senza preview → applica i cambiamenti al DB */
import { db } from "@/db";
import { projects, tasks, dependencies, timeOff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { optimizeProject, buildTimeOffMaps, type WorkloadTask } from "@/lib/workload-optimizer";
import { recalculateParentBounds } from "@/lib/parent-bounds";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: projectId } = await params;
    const url = new URL(request.url);
    const isPreview = url.searchParams.get("preview") === "true";
    const startFrom = url.searchParams.get("startFrom") ?? undefined;

    // Verifica progetto
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) return errorResponse("Progetto non trovato", 404);

    // Carica tutti i task
    const allTaskRows = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId));

    if (allTaskRows.length === 0) {
      return errorResponse("Nessun task nel progetto", 400);
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

    // Converti
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
    const result = optimizeProject(workloadTasks, shiftDeps, today, { blockedDates, dayCapacity, startFrom });

    if (isPreview) {
      return successResponse(result);
    }

    // ── Applica i cambiamenti ──
    if (result.changes.length === 0) {
      return successResponse({ ...result, applied: true, message: "Nessun cambiamento necessario" });
    }

    for (const change of result.changes) {
      await db
        .update(tasks)
        .set({
          startDate: change.newStartDate,
          endDate: change.newEndDate,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, change.taskId));
    }

    // Ricalcola tutti i parent bounds
    const parentTaskIds = new Set(
      result.changes
        .filter((c) => c.parentTaskId)
        .map((c) => c.parentTaskId!)
    );
    for (const parentId of parentTaskIds) {
      await recalculateParentBounds(parentId);
    }

    return successResponse({ ...result, applied: true });
  } catch (e) {
    console.error("POST /api/projects/[id]/optimize error:", e);
    return errorResponse("Errore nell'ottimizzazione", 500);
  }
}
