/* route.ts — POST /api/tasks/[id]/move. Sposta un task e applica auto-shifting tramite shifting engine.
   Se il task ha sottotask, trasla anche quelli (stessa delta). */
import { db } from "@/db";
import { tasks, dependencies, timeOff } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { moveTaskSchema } from "@/lib/validators";
import { calculateShifts } from "@/lib/shifting-engine";
import { recalculateParentBounds } from "@/lib/parent-bounds";
import { buildTimeOffMaps } from "@/lib/workload-optimizer";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ── Utility date ──
function parseD(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}
function formatD(ms: number): string {
  return new Date(ms).toISOString().split("T")[0]!;
}

/** Raccoglie ricorsivamente tutti i discendenti di un task */
function getAllDescendants<T extends { id: string; parentTaskId: string | null }>(
  taskId: string,
  allTasks: T[]
): T[] {
  const children = allTasks.filter((t) => t.parentTaskId === taskId);
  const result: T[] = [...children];
  for (const child of children) {
    result.push(...getAllDescendants(child.id, allTasks));
  }
  return result;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, moveTaskSchema);
    if (parsed.error) return parsed.error;

    const { newStartDate, newEndDate } = parsed.data;

    // Carica il task corrente
    const [currentTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));
    if (!currentTask) {
      return errorResponse("Task non trovato", 404);
    }
    if (!currentTask.startDate || !currentTask.endDate) {
      return errorResponse("Impossibile spostare un task non schedulato", 400);
    }

    // Carica tutti i task del progetto
    const allTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, currentTask.projectId));

    // Carica tutte le dipendenze
    const taskIds = allTasks.map((t) => t.id);
    const allDeps = await db.select().from(dependencies);
    const projectDeps = allDeps.filter(
      (d) =>
        taskIds.includes(d.predecessorId) && taskIds.includes(d.successorId)
    );

    // Carica time-off per blockedDates
    const allTimeOff = await db.select().from(timeOff);
    const { blockedDates } = buildTimeOffMaps(allTimeOff);

    // Identifica task fornitore
    const supplierTaskIds = new Set(
      allTasks.filter((t) => t.executionMode === "supplier").map((t) => t.id)
    );

    // ── Cascata sottotask: calcola delta e pre-shifta discendenti ──
    const deltaMs = parseD(newStartDate) - parseD(currentTask.startDate!);
    const descendants = getAllDescendants(id, allTasks).filter(
      (t) => t.startDate && t.endDate
    );
    const descendantIds = new Set(descendants.map((d) => d.id));

    // Pre-shifta i discendenti nella lista task per il motore di shifting
    // così le dipendenze vengono calcolate sulle posizioni aggiornate
    // Solo task schedulati partecipano al shifting engine
    const scheduledTasks = allTasks.filter((t) => t.startDate && t.endDate);
    const preShiftedTasks = scheduledTasks.map((t) => {
      if (descendantIds.has(t.id)) {
        return {
          id: t.id,
          startDate: formatD(parseD(t.startDate!) + deltaMs),
          endDate: formatD(parseD(t.endDate!) + deltaMs),
        };
      }
      return { id: t.id, startDate: t.startDate!, endDate: t.endDate! };
    });

    // Calcola gli shift (dipendenze) con le posizioni pre-shiftate
    const result = calculateShifts(
      id,
      newStartDate,
      newEndDate,
      preShiftedTasks,
      projectDeps.map((d) => ({
        predecessorId: d.predecessorId,
        successorId: d.successorId,
        dependencyType: (d.dependencyType ?? "FS") as
          | "FS"
          | "SS"
          | "FF"
          | "SF",
        lagDays: d.lagDays ?? 0,
      })),
      { blockedDates, supplierTaskIds }
    );

    if (result.hasCircularDependency) {
      return errorResponse("Dipendenza circolare rilevata", 400);
    }

    // ── Applica: task padre ──
    await db
      .update(tasks)
      .set({
        startDate: newStartDate,
        endDate: newEndDate,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id));

    // ── Applica: discendenti (pre-shift + eventuali shift aggiuntivi da dipendenze) ──
    const allShifts = [...result.shifts];

    for (const desc of descendants) {
      const preShiftedStart = formatD(parseD(desc.startDate!) + deltaMs);
      const preShiftedEnd = formatD(parseD(desc.endDate!) + deltaMs);

      // Se il motore di shifting ha calcolato una posizione diversa per questo discendente
      // (a causa di una dipendenza esterna), usa quella
      const depShift = result.shifts.find((s) => s.taskId === desc.id);

      const finalStart = depShift ? depShift.newStartDate : preShiftedStart;
      const finalEnd = depShift ? depShift.newEndDate : preShiftedEnd;

      await db
        .update(tasks)
        .set({
          startDate: finalStart,
          endDate: finalEnd,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, desc.id));

      // Se non era già negli shift del motore, aggiungilo al report
      if (!depShift && deltaMs !== 0) {
        allShifts.push({
          taskId: desc.id,
          oldStartDate: desc.startDate!,
          oldEndDate: desc.endDate!,
          newStartDate: finalStart,
          newEndDate: finalEnd,
          reason: "Traslato con il task padre",
        });
      }
    }

    // ── Applica: shift da dipendenze per task NON discendenti ──
    // Se un task shiftato è un padre, trasla anche tutti i suoi sottotask (stessa delta)
    const shiftedTaskIds = new Set<string>(); // track per evitare doppi update
    for (const shift of result.shifts) {
      if (descendantIds.has(shift.taskId)) continue; // già gestito sopra
      shiftedTaskIds.add(shift.taskId);

      await db
        .update(tasks)
        .set({
          startDate: shift.newStartDate,
          endDate: shift.newEndDate,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, shift.taskId));

      // Se questo task shiftato è un padre, cascada ai suoi discendenti
      const shiftedTask = allTasks.find((t) => t.id === shift.taskId);
      if (!shiftedTask) continue;

      if (!shiftedTask.startDate) continue;
      const shiftDeltaMs =
        parseD(shift.newStartDate) - parseD(shiftedTask.startDate);
      if (shiftDeltaMs === 0) continue;

      const shiftedDescendants = getAllDescendants(shift.taskId, allTasks)
        .filter((t) => t.startDate && t.endDate);
      for (const desc of shiftedDescendants) {
        // Se il motore ha già calcolato uno shift specifico per questo discendente, usa quello
        const engineShift = result.shifts.find((s) => s.taskId === desc.id);
        if (engineShift) continue; // verrà gestito nel suo turno del loop esterno

        const newDescStart = formatD(parseD(desc.startDate!) + shiftDeltaMs);
        const newDescEnd = formatD(parseD(desc.endDate!) + shiftDeltaMs);

        shiftedTaskIds.add(desc.id);
        await db
          .update(tasks)
          .set({
            startDate: newDescStart,
            endDate: newDescEnd,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, desc.id));

        allShifts.push({
          taskId: desc.id,
          oldStartDate: desc.startDate!,
          oldEndDate: desc.endDate!,
          newStartDate: newDescStart,
          newEndDate: newDescEnd,
          reason: "Traslato con il task predecessore (dipendenza)",
        });
      }
    }

    // ── Bounds padre ↔ figli: assicurati che ogni padre copra i suoi figli ──
    // 1. Il task spostato potrebbe avere figli shiftati da dipendenze esterne → espandi
    await recalculateParentBounds(id);
    // 2. Se il task spostato è un sottotask, il suo padre deve coprirlo
    if (currentTask.parentTaskId) {
      await recalculateParentBounds(currentTask.parentTaskId);
    }
    // 3. Task shiftati da dipendenze: ricalcola bounds per i loro padri E per loro stessi (se sono padri)
    const checkedParents = new Set<string>();
    for (const shift of result.shifts) {
      if (descendantIds.has(shift.taskId)) continue;
      // Se il task shiftato è esso stesso un padre, ricalcola i suoi bounds
      // (i discendenti sono già stati traslati sopra, ma verifica coerenza)
      const hasChildren = allTasks.some((t) => t.parentTaskId === shift.taskId);
      if (hasChildren && !checkedParents.has(shift.taskId)) {
        checkedParents.add(shift.taskId);
        await recalculateParentBounds(shift.taskId);
      }
      // Se il task shiftato ha un padre, ricalcola bounds del padre
      const shiftedTask = allTasks.find((t) => t.id === shift.taskId);
      if (shiftedTask?.parentTaskId && !checkedParents.has(shiftedTask.parentTaskId)) {
        checkedParents.add(shiftedTask.parentTaskId);
        await recalculateParentBounds(shiftedTask.parentTaskId);
      }
    }

    // Ricarica il task aggiornato (con bounds corretti)
    const [movedTask] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));

    return successResponse({
      movedTask,
      shifts: allShifts,
    });
  } catch (e) {
    console.error("POST /api/tasks/[id]/move error:", e);
    return errorResponse("Errore nello spostamento task", 500);
  }
}
