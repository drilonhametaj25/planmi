/* workload-optimizer.ts — Motore di ottimizzazione carico di lavoro.
   Funzioni pure: rileva mismatch ore padre/figli, ottimizza progetto globalmente
   rispettando dipendenze inter-padre, genera schedule giornaliero.

   L'ottimizzatore globale:
   1. Ordina topologicamente i task padre in base alle dipendenze tra padri
   2. Per ogni padre, calcola la finestra valida (dopo predecessori + lag)
   3. Schedula i sottotask all'interno della finestra rispettando dipendenze e 8h/giorno
   4. Aggiorna le date del padre per coprire i sottotask schedulati
   5. I task foglia standalone vengono schedulati dopo i predecessori
*/

import { addWorkdays, countWorkdays } from "./shifting-engine";
import type { ShiftDependency } from "./shifting-engine";

// ── Time-off → scheduling data ──

export interface TimeOffEntry {
  startDate: string;
  endDate: string;
  hoursPerDay: string | null;  // null = full day off
}

/**
 * Converte le entry time-off in strutture usabili dall'ottimizzatore:
 * - blockedDates: Set di date con giornata piena di assenza (da trattare come weekend)
 * - dayCapacity: Map di date → ore di assenza (per permessi parziali)
 */
export function buildTimeOffMaps(entries: TimeOffEntry[]): {
  blockedDates: Set<string>;
  dayCapacity: Map<string, number>;
} {
  const blockedDates = new Set<string>();
  const dayCapacity = new Map<string, number>();
  const DAY = 86400000;

  for (const entry of entries) {
    const hoursOff = entry.hoursPerDay ? parseFloat(entry.hoursPerDay) : 8;
    let ms = new Date(entry.startDate + "T00:00:00Z").getTime();
    const endMs = new Date(entry.endDate + "T00:00:00Z").getTime();

    while (ms <= endMs) {
      const dateStr = new Date(ms).toISOString().split("T")[0]!;
      if (hoursOff >= 8) {
        blockedDates.add(dateStr);
      } else {
        // Accumula ore di assenza per lo stesso giorno
        dayCapacity.set(dateStr, (dayCapacity.get(dateStr) ?? 0) + hoursOff);
      }
      ms += DAY;
    }
  }

  return { blockedDates, dayCapacity };
}

// ── Tipi ──

export interface WorkloadTask {
  id: string;
  title: string;
  parentTaskId: string | null;
  startDate: string;       // YYYY-MM-DD
  endDate: string;
  status: string | null;
  priority: string | null;
  estimatedHours: string | null;  // numeric from DB as string
  executionMode: string | null;   // "internal" | "supplier"
  projectId: string;
  projectName?: string;
  sortOrder: number | null;
}

export interface HoursMismatch {
  parentTaskId: string;
  parentTitle: string;
  parentDurationWorkdays: number;
  parentAvailableHours: number;
  subtaskTotalHours: number;
  subtasksWithoutHours: string[];
  deficit: number;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface TaskChange {
  taskId: string;
  taskTitle: string;
  parentTaskId: string | null;
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
}

export interface OptimizeProjectResult {
  changes: TaskChange[];
  warnings: string[];
  stats: {
    totalTasksChanged: number;
    parentTasksChanged: number;
    subtasksChanged: number;
    standaloneChanged: number;
  };
}

export interface DailySlot {
  date: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  hours: number;
  priority: string;
}

export interface DailySchedule {
  date: string;
  dayOfWeek: string;
  slots: DailySlot[];
  totalHours: number;
  overloaded: boolean;
  maxCapacity?: number;  // default 8, ridotto da permessi parziali
}

export interface OptimizedScheduleResult {
  days: DailySchedule[];
  unschedulable: { taskId: string; taskTitle: string; reason: string }[];
  totalWorkdays: number;
  warnings: string[];
}

// ── Utilities ──

const DAY_MS = 86400000;

function parseD(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}

function formatD(ms: number): string {
  return new Date(ms).toISOString().split("T")[0]!;
}

function isWeekendMs(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

function isNonWorkday(ms: number, blockedDates?: Set<string>): boolean {
  if (isWeekendMs(ms)) return true;
  if (blockedDates && blockedDates.has(formatD(ms))) return true;
  return false;
}

function skipToWorkdayMs(ms: number, blockedDates?: Set<string>): number {
  for (let i = 0; i < 365; i++) {
    if (!isNonWorkday(ms, blockedDates)) return ms;
    ms += DAY_MS;
  }
  return ms;
}

function maxDate(a: string, b: string): string {
  return parseD(a) >= parseD(b) ? a : b;
}

const DAY_NAMES = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

function getDayName(dateStr: string): string {
  return DAY_NAMES[new Date(dateStr + "T00:00:00Z").getUTCDay()] ?? "";
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Kahn's topological sort. Returns sorted IDs or null if cycle. */
function topoSort(
  ids: string[],
  predMap: Map<string, { predId: string }[]>
): string[] | null {
  const inDeg = new Map<string, number>();
  const succMap = new Map<string, string[]>();
  for (const id of ids) inDeg.set(id, 0);

  for (const [succId, preds] of predMap) {
    if (!inDeg.has(succId)) continue;
    for (const p of preds) {
      if (!inDeg.has(p.predId)) continue;
      inDeg.set(succId, (inDeg.get(succId) ?? 0) + 1);
      const s = succMap.get(p.predId) ?? [];
      s.push(succId);
      succMap.set(p.predId, s);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    queue.sort(); // deterministic
    const id = queue.shift()!;
    sorted.push(id);
    for (const succId of succMap.get(id) ?? []) {
      const newDeg = (inDeg.get(succId) ?? 1) - 1;
      inDeg.set(succId, newDeg);
      if (newDeg === 0) queue.push(succId);
    }
  }

  if (sorted.length < ids.length) return null; // cycle
  return sorted;
}

// ── 1. Rileva mismatch ore padre/figli ──

export function detectHoursMismatch(
  tasks: WorkloadTask[]
): HoursMismatch[] {
  const result: HoursMismatch[] = [];

  const childrenMap = new Map<string, WorkloadTask[]>();
  for (const t of tasks) {
    if (t.parentTaskId) {
      const siblings = childrenMap.get(t.parentTaskId) ?? [];
      siblings.push(t);
      childrenMap.set(t.parentTaskId, siblings);
    }
  }

  for (const [parentId, children] of childrenMap) {
    const parent = tasks.find((t) => t.id === parentId);
    if (!parent) continue;
    if (parent.status === "done") continue;

    const parentWorkdays = countWorkdays(parent.startDate, parent.endDate);
    const parentAvailableHours = parentWorkdays * 8;

    let subtaskTotalHours = 0;
    const subtasksWithoutHours: string[] = [];

    for (const child of children) {
      if (child.status === "done") continue;
      const hours = child.estimatedHours ? parseFloat(child.estimatedHours) : 0;
      if (hours > 0) {
        subtaskTotalHours += hours;
      } else {
        subtasksWithoutHours.push(child.id);
      }
    }

    if (subtaskTotalHours === 0 && subtasksWithoutHours.length > 0) continue;

    const deficit = subtaskTotalHours - parentAvailableHours;

    if (deficit > 0) {
      const severity: HoursMismatch["severity"] =
        deficit > parentAvailableHours * 0.5 ? "critical" :
        deficit > parentAvailableHours * 0.2 ? "warning" : "info";

      let message = `I sottotask richiedono ${subtaskTotalHours}h ma il task padre ha solo ${parentAvailableHours}h disponibili (${parentWorkdays} giorni × 8h). Mancano ${Math.ceil(deficit)}h.`;
      if (subtasksWithoutHours.length > 0) {
        message += ` ${subtasksWithoutHours.length} sottotask senza ore stimate.`;
      }

      result.push({
        parentTaskId: parentId,
        parentTitle: parent.title,
        parentDurationWorkdays: parentWorkdays,
        parentAvailableHours,
        subtaskTotalHours,
        subtasksWithoutHours,
        deficit,
        severity,
        message,
      });
    }
  }

  return result;
}

// ── 2. Ottimizzazione globale progetto ──

/**
 * Ottimizza l'intero progetto rispettando TUTTE le dipendenze:
 * - Dipendenze tra task padre (es: padre A →FS→ padre B)
 * - Dipendenze tra sottotask
 * - Dipendenze tra sottotask e task di altri padri
 * - Cap 8h/giorno
 *
 * Algoritmo:
 * 1. Costruisci il grafo "effettivo" delle dipendenze:
 *    - Se una dep è tra due task padre, i sottotask di B partono dopo i sottotask di A finiscono
 *    - Se una dep è tra un sottotask e un task esterno, si rispetta direttamente
 * 2. Topological sort di TUTTI i task padre + standalone in base alle dipendenze
 * 3. Schedula in ordine: per ogni task, calcola earliest start dalle dipendenze
 *    - Se è un padre: schedula i suoi sottotask in ordine topologico interno
 *    - Se è standalone: piazza direttamente
 * 4. Ricalcola date padre = min(subtask starts) .. max(subtask ends)
 */
export function optimizeProject(
  allTasks: WorkloadTask[],
  allDeps: ShiftDependency[],
  today: string,
  options?: { blockedDates?: Set<string>; dayCapacity?: Map<string, number>; startFrom?: string }
): OptimizeProjectResult {
  const warnings: string[] = [];
  const newPositions = new Map<string, { start: string; end: string }>();
  const blockedDates = options?.blockedDates;
  const dayCapacity = options?.dayCapacity;
  // Data di partenza per l'ottimizzazione: se specificata, usa quella; altrimenti oggi
  const scheduleFloor = options?.startFrom ?? today;

  // ── Classificazione task ──
  const childrenMap = new Map<string, WorkloadTask[]>();
  for (const t of allTasks) {
    if (t.parentTaskId) {
      const siblings = childrenMap.get(t.parentTaskId) ?? [];
      siblings.push(t);
      childrenMap.set(t.parentTaskId, siblings);
    }
  }

  const parentIds = new Set(childrenMap.keys());
  const taskById = new Map(allTasks.map((t) => [t.id, t]));

  // Task attivi (non done)
  const activeTasks = allTasks.filter((t) => t.status !== "done");
  const activeIds = new Set(activeTasks.map((t) => t.id));

  // Trova il "padre effettivo" di un task (se è un sottotask, il suo padre; altrimenti sé stesso)
  function effectiveParent(taskId: string): string {
    const t = taskById.get(taskId);
    if (t?.parentTaskId && parentIds.has(t.parentTaskId)) return t.parentTaskId;
    return taskId;
  }

  // ── Costruisci grafo di dipendenze tra "unità di scheduling" ──
  // Un'unità è: un task padre (che contiene sottotask) o un task standalone
  // Se una dep coinvolge un sottotask, la "alziamo" al livello del suo padre

  const unitIds = new Set<string>();
  for (const t of activeTasks) {
    if (parentIds.has(t.id)) {
      unitIds.add(t.id); // è un padre
    } else if (!t.parentTaskId || !parentIds.has(t.parentTaskId)) {
      unitIds.add(t.id); // è standalone (non è figlio di nessun padre attivo)
    }
    // sottotask: non sono unità, sono gestiti dentro il padre
  }

  // Dipendenze "sollevate" a livello di unità
  const unitPredMap = new Map<string, { predId: string; depType: string; lag: number }[]>();
  // Anche dipendenze raw per i sottotask interni
  const rawPredMap = new Map<string, { predId: string; depType: string; lag: number }[]>();

  for (const dep of allDeps) {
    if (!activeIds.has(dep.predecessorId) || !activeIds.has(dep.successorId)) continue;

    // Salva raw per uso interno
    const rawPreds = rawPredMap.get(dep.successorId) ?? [];
    rawPreds.push({ predId: dep.predecessorId, depType: dep.dependencyType, lag: dep.lagDays });
    rawPredMap.set(dep.successorId, rawPreds);

    // Solleva a livello unità
    const predUnit = effectiveParent(dep.predecessorId);
    const succUnit = effectiveParent(dep.successorId);

    if (predUnit === succUnit) continue; // dipendenza interna allo stesso padre, gestita dopo
    if (!unitIds.has(predUnit) || !unitIds.has(succUnit)) continue;

    const unitPreds = unitPredMap.get(succUnit) ?? [];
    // Evita duplicati
    if (!unitPreds.some((p) => p.predId === predUnit)) {
      unitPreds.push({ predId: predUnit, depType: dep.dependencyType, lag: dep.lagDays });
      unitPredMap.set(succUnit, unitPreds);
    }
  }

  // ── Topological sort delle unità ──
  const unitIdArr = [...unitIds];
  const sortedUnits = topoSort(unitIdArr, unitPredMap);

  if (!sortedUnits) {
    warnings.push("Dipendenza circolare rilevata tra task padre. Ottimizzazione parziale.");
    // Fallback: ordina per data inizio
    unitIdArr.sort((a, b) => parseD(taskById.get(a)!.startDate) - parseD(taskById.get(b)!.startDate));
  }

  const processingOrder = sortedUnits ?? unitIdArr;

  // Ordina per priorità dentro ogni livello topologico (stabile)
  // Per semplicità, usiamo l'ordine topologico direttamente — è già corretto

  // ── Carico giornaliero globale (mappa mutabile) ──
  const dailyLoad = new Map<string, number>();

  function addLoad(dateStr: string, hours: number) {
    dailyLoad.set(dateStr, (dailyLoad.get(dateStr) ?? 0) + hours);
  }

  /** Capacità disponibile in un giorno (considera ferie/permessi parziali) */
  function getAvailableHours(dateStr: string): number {
    const base = 8;
    const offHours = dayCapacity?.get(dateStr); // ore di assenza in quel giorno
    const capacity = offHours !== undefined ? Math.max(0, base - offHours) : base;
    return Math.max(0, capacity - (dailyLoad.get(dateStr) ?? 0));
  }

  /** Trova slot per un task con N ore: restituisce start/end lavorativi */
  function findSlot(
    earliestStart: string,
    hoursNeeded: number
  ): { start: string; end: string } {
    let currentMs = skipToWorkdayMs(parseD(earliestStart), blockedDates);
    let startDate = "";
    let endDate = "";
    let assignedHours = 0;

    // Safety: max 365 giorni di ricerca
    for (let i = 0; i < 365 && assignedHours < hoursNeeded; i++) {
      if (!isNonWorkday(currentMs, blockedDates)) {
        const dateStr = formatD(currentMs);
        const available = getAvailableHours(dateStr);
        if (available > 0.5) {
          const assign = Math.min(available, hoursNeeded - assignedHours);
          if (startDate === "") startDate = dateStr;
          endDate = dateStr;
          assignedHours += assign;
          addLoad(dateStr, assign);
        }
      }
      currentMs += DAY_MS;
    }

    return { start: startDate || earliestStart, end: endDate || earliestStart };
  }

  /** Calcola earliest start di un task basandosi sui suoi predecessori già posizionati */
  function calcEarliestStart(taskId: string, defaultStart: string): string {
    let earliestMs = parseD(defaultStart);
    const floorMs = parseD(scheduleFloor);
    earliestMs = Math.max(earliestMs, floorMs);

    const preds = rawPredMap.get(taskId) ?? [];
    for (const pred of preds) {
      const predPos = newPositions.get(pred.predId);
      if (!predPos) continue;

      switch (pred.depType) {
        case "FS": {
          const ms = parseD(addWorkdays(predPos.end, 1 + pred.lag, blockedDates));
          earliestMs = Math.max(earliestMs, ms);
          break;
        }
        case "SS": {
          const ms = parseD(addWorkdays(predPos.start, pred.lag, blockedDates));
          earliestMs = Math.max(earliestMs, ms);
          break;
        }
        case "FF":
        case "SF": {
          const ms = parseD(addWorkdays(predPos.end, pred.lag, blockedDates));
          earliestMs = Math.max(earliestMs, ms);
          break;
        }
      }
    }

    return formatD(skipToWorkdayMs(earliestMs, blockedDates));
  }

  /** Calcola earliest start di un'UNITÀ (padre o standalone) dai predecessori a livello unità */
  function calcUnitEarliestStart(unitId: string): string {
    let earliestMs = parseD(scheduleFloor);

    const unitPreds = unitPredMap.get(unitId) ?? [];
    for (const pred of unitPreds) {
      const predPos = newPositions.get(pred.predId);
      if (!predPos) continue;

      switch (pred.depType) {
        case "FS": {
          const ms = parseD(addWorkdays(predPos.end, 1 + pred.lag, blockedDates));
          earliestMs = Math.max(earliestMs, ms);
          break;
        }
        case "SS": {
          const ms = parseD(addWorkdays(predPos.start, pred.lag, blockedDates));
          earliestMs = Math.max(earliestMs, ms);
          break;
        }
        default: {
          const ms = parseD(addWorkdays(predPos.end, pred.lag, blockedDates));
          earliestMs = Math.max(earliestMs, ms);
          break;
        }
      }
    }

    return formatD(skipToWorkdayMs(earliestMs, blockedDates));
  }

  // ── Processa ogni unità in ordine topologico ──
  for (const unitId of processingOrder) {
    const unitTask = taskById.get(unitId);
    if (!unitTask) continue;

    // Task Fornitore: mantieni date originali, non ottimizzare (gestito esternamente)
    // Ma registra la posizione per il calcolo delle dipendenze
    const isSupplier = unitTask.executionMode === "supplier";
    if (isSupplier) {
      newPositions.set(unitId, { start: unitTask.startDate, end: unitTask.endDate });
      // Registra anche i sottotask del fornitore con le loro date originali
      const subs = childrenMap.get(unitId) ?? [];
      for (const sub of subs) {
        newPositions.set(sub.id, { start: sub.startDate, end: sub.endDate });
      }
      continue;
    }

    const unitEarliestStart = calcUnitEarliestStart(unitId);

    if (parentIds.has(unitId)) {
      // ── Task padre: schedula i sottotask ──
      const subs = (childrenMap.get(unitId) ?? []).filter((s) => s.status !== "done");
      if (subs.length === 0) {
        const hours = unitTask.estimatedHours ? parseFloat(unitTask.estimatedHours) : 0;
        if (hours > 0) {
          const slot = findSlot(unitEarliestStart, hours);
          newPositions.set(unitId, slot);
        } else {
          // Conta durata originale SENZA blockedDates (la durata intesa non cambia per le ferie)
          // Poi piazza CON blockedDates (salta le ferie nel calendario)
          const workdays = countWorkdays(unitTask.startDate, unitTask.endDate);
          const end = addWorkdays(unitEarliestStart, Math.max(0, workdays - 1), blockedDates);
          newPositions.set(unitId, { start: unitEarliestStart, end });
        }
        continue;
      }

      // Costruisci grafo dipendenze tra sottotask (solo interni)
      const subIds = new Set(subs.map((s) => s.id));
      const subPredMap = new Map<string, { predId: string; depType: string; lag: number }[]>();

      for (const dep of allDeps) {
        if (!subIds.has(dep.successorId)) continue;
        const preds = subPredMap.get(dep.successorId) ?? [];
        preds.push({ predId: dep.predecessorId, depType: dep.dependencyType, lag: dep.lagDays });
        subPredMap.set(dep.successorId, preds);
      }

      // Topological sort dei sottotask
      const subIdArr = subs.map((s) => s.id);
      const sortedSubs = topoSort(subIdArr, subPredMap) ?? subIdArr;

      // Ordina per: sortOrder → priorità (sortOrder è il fattore principale)
      const subsSorted = [...sortedSubs].sort((a, b) => {
        const topoA = sortedSubs.indexOf(a);
        const topoB = sortedSubs.indexOf(b);
        if (topoA !== topoB) return topoA - topoB;
        const ta = taskById.get(a)!;
        const tb = taskById.get(b)!;
        // sortOrder come fattore primario di tie-break
        const oa = ta.sortOrder ?? 999;
        const ob = tb.sortOrder ?? 999;
        if (oa !== ob) return oa - ob;
        const pa = PRIORITY_ORDER[ta.priority ?? "medium"] ?? 2;
        const pb = PRIORITY_ORDER[tb.priority ?? "medium"] ?? 2;
        return pa - pb;
      });

      let parentMinStartMs = parseD(unitEarliestStart);
      let parentMaxEndMs = parseD(unitEarliestStart);

      for (const subId of subsSorted) {
        const sub = taskById.get(subId)!;

        // Sottotask Fornitore: mantieni date originali, non contare nel carico
        if (sub.executionMode === "supplier") {
          newPositions.set(subId, { start: sub.startDate, end: sub.endDate });
          parentMaxEndMs = Math.max(parentMaxEndMs, parseD(sub.endDate));
          parentMinStartMs = Math.min(parentMinStartMs, parseD(sub.startDate));
          continue;
        }

        const hours = sub.estimatedHours ? parseFloat(sub.estimatedHours) : 0;

        let subEarliestStart = calcEarliestStart(subId, unitEarliestStart);
        subEarliestStart = maxDate(subEarliestStart, unitEarliestStart);

        if (hours > 0) {
          const slot = findSlot(subEarliestStart, hours);
          newPositions.set(subId, slot);
          parentMaxEndMs = Math.max(parentMaxEndMs, parseD(slot.end));
          parentMinStartMs = Math.min(parentMinStartMs, parseD(slot.start));
        } else {
          // Durata originale SENZA blockedDates, piazzamento CON blockedDates
          const workdays = countWorkdays(sub.startDate, sub.endDate);
          const end = addWorkdays(subEarliestStart, Math.max(0, workdays - 1), blockedDates);
          newPositions.set(subId, { start: subEarliestStart, end });
          parentMaxEndMs = Math.max(parentMaxEndMs, parseD(end));
          parentMinStartMs = Math.min(parentMinStartMs, parseD(subEarliestStart));
        }
      }

      // Date padre = encompass tutti i sottotask
      newPositions.set(unitId, {
        start: formatD(parentMinStartMs),
        end: formatD(parentMaxEndMs),
      });
    } else {
      // ── Task standalone (foglia senza padre) ──
      const standalone = unitTask;
      const hours = standalone.estimatedHours ? parseFloat(standalone.estimatedHours) : 0;
      const standaloneStart = calcEarliestStart(standalone.id, unitEarliestStart);
      const effectiveStart = maxDate(standaloneStart, unitEarliestStart);

      if (hours > 0) {
        const slot = findSlot(effectiveStart, hours);
        newPositions.set(standalone.id, slot);
      } else {
        // Durata originale SENZA blockedDates, piazzamento CON blockedDates
        const workdays = countWorkdays(standalone.startDate, standalone.endDate);
        const end = addWorkdays(effectiveStart, Math.max(0, workdays - 1), blockedDates);
        newPositions.set(standalone.id, { start: effectiveStart, end });
      }
    }
  }

  // ── Raccogli i cambiamenti ──
  const changes: TaskChange[] = [];
  let parentChanged = 0;
  let subtaskChanged = 0;
  let standaloneChanged = 0;

  for (const [taskId, newPos] of newPositions) {
    const task = taskById.get(taskId);
    if (!task) continue;
    if (task.status === "done") continue;
    if (task.executionMode === "supplier") continue; // Non modificare task fornitore

    if (newPos.start !== task.startDate || newPos.end !== task.endDate) {
      changes.push({
        taskId,
        taskTitle: task.title,
        parentTaskId: task.parentTaskId,
        oldStartDate: task.startDate,
        oldEndDate: task.endDate,
        newStartDate: newPos.start,
        newEndDate: newPos.end,
      });

      if (parentIds.has(taskId)) parentChanged++;
      else if (task.parentTaskId && parentIds.has(task.parentTaskId)) subtaskChanged++;
      else standaloneChanged++;
    }
  }

  return {
    changes,
    warnings,
    stats: {
      totalTasksChanged: changes.length,
      parentTasksChanged: parentChanged,
      subtasksChanged: subtaskChanged,
      standaloneChanged: standaloneChanged,
    },
  };
}

// ── 3. Schedule giornaliero ottimizzato globale ──

export function generateDailySchedule(
  tasks: WorkloadTask[],
  deps: ShiftDependency[],
  startDate: string,
  numWorkdays: number = 20,
  options?: { blockedDates?: Set<string>; dayCapacity?: Map<string, number> }
): OptimizedScheduleResult {
  const blockedDates = options?.blockedDates;
  const dayCapacity = options?.dayCapacity;
  const warnings: string[] = [];
  const unschedulable: OptimizedScheduleResult["unschedulable"] = [];

  const parentIds = new Set<string>();
  for (const t of tasks) {
    if (t.parentTaskId) parentIds.add(t.parentTaskId);
  }

  const leafTasks = tasks.filter(
    (t) => !parentIds.has(t.id) && t.status !== "done" && t.executionMode !== "supplier"
  );

  const taskIds = new Set(leafTasks.map((t) => t.id));
  const predMap = new Map<string, { predId: string; depType: string; lag: number }[]>();
  const succMap = new Map<string, string[]>();

  for (const dep of deps) {
    if (!taskIds.has(dep.predecessorId) || !taskIds.has(dep.successorId)) continue;
    const preds = predMap.get(dep.successorId) ?? [];
    preds.push({ predId: dep.predecessorId, depType: dep.dependencyType, lag: dep.lagDays });
    predMap.set(dep.successorId, preds);

    const succs = succMap.get(dep.predecessorId) ?? [];
    succs.push(dep.successorId);
    succMap.set(dep.predecessorId, succs);
  }

  // Topological sort
  const inDegree = new Map<string, number>();
  for (const t of leafTasks) inDegree.set(t.id, 0);
  for (const [succId, preds] of predMap) {
    inDegree.set(succId, preds.length);
  }

  const topoQueue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) topoQueue.push(id);
  }

  const sorted: string[] = [];
  const tempQ = [...topoQueue];
  while (tempQ.length > 0) {
    tempQ.sort((a, b) => {
      const ta = leafTasks.find((t) => t.id === a)!;
      const tb = leafTasks.find((t) => t.id === b)!;
      const pa = PRIORITY_ORDER[ta.priority ?? "medium"] ?? 2;
      const pb = PRIORITY_ORDER[tb.priority ?? "medium"] ?? 2;
      if (pa !== pb) return pa - pb;
      return parseD(ta.endDate) - parseD(tb.endDate);
    });

    const id = tempQ.shift()!;
    sorted.push(id);
    for (const succId of succMap.get(id) ?? []) {
      const newDeg = (inDegree.get(succId) ?? 1) - 1;
      inDegree.set(succId, newDeg);
      if (newDeg === 0) tempQ.push(succId);
    }
  }

  for (const t of leafTasks) {
    if (!sorted.includes(t.id)) {
      sorted.push(t.id);
      warnings.push(`Task "${t.title}" coinvolto in dipendenza circolare.`);
    }
  }

  // Genera i giorni lavorativi (salta weekend e giorni bloccati da ferie)
  const days: DailySchedule[] = [];
  let dayMs = skipToWorkdayMs(parseD(startDate), blockedDates);
  for (let i = 0; i < numWorkdays; i++) {
    while (isNonWorkday(dayMs, blockedDates)) dayMs += DAY_MS;
    const dateStr = formatD(dayMs);
    // Capacità ridotta per permessi parziali
    const offHours = dayCapacity?.get(dateStr);
    const maxCapacity = offHours !== undefined ? Math.max(0, 8 - offHours) : 8;
    days.push({
      date: dateStr,
      dayOfWeek: getDayName(dateStr),
      slots: [],
      totalHours: 0,
      overloaded: false,
      maxCapacity,
    });
    dayMs += DAY_MS;
  }

  const taskFinishDay = new Map<string, number>();

  for (const taskId of sorted) {
    const task = leafTasks.find((t) => t.id === taskId)!;
    const totalHours = task.estimatedHours ? parseFloat(task.estimatedHours) : 0;

    if (totalHours <= 0) {
      unschedulable.push({
        taskId: task.id,
        taskTitle: task.title,
        reason: "Ore stimate non specificate",
      });
      continue;
    }

    let minDayIndex = 0;
    const preds = predMap.get(taskId) ?? [];
    for (const pred of preds) {
      const predFinish = taskFinishDay.get(pred.predId);
      if (predFinish !== undefined) {
        switch (pred.depType) {
          case "FS":
            minDayIndex = Math.max(minDayIndex, predFinish + 1 + pred.lag);
            break;
          case "SS":
            minDayIndex = Math.max(minDayIndex, (taskFinishDay.get(pred.predId) ?? 0) + pred.lag);
            break;
          default:
            minDayIndex = Math.max(minDayIndex, predFinish + 1);
            break;
        }
      }
    }

    let remainingHours = totalHours;
    let firstDayAssigned = -1;
    let lastDayAssigned = -1;

    for (let di = minDayIndex; di < days.length && remainingHours > 0; di++) {
      const day = days[di]!;
      const cap = day.maxCapacity ?? 8;
      const available = cap - day.totalHours;
      if (available <= 0) continue;

      const assign = Math.min(available, remainingHours);
      day.slots.push({
        date: day.date,
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId,
        projectName: task.projectName ?? "",
        hours: Math.round(assign * 10) / 10,
        priority: task.priority ?? "medium",
      });
      day.totalHours = Math.round((day.totalHours + assign) * 10) / 10;

      if (firstDayAssigned === -1) firstDayAssigned = di;
      lastDayAssigned = di;
      remainingHours -= assign;
    }

    if (remainingHours > 0) {
      unschedulable.push({
        taskId: task.id,
        taskTitle: task.title,
        reason: `Non abbastanza giorni nel periodo. Rimangono ${Math.ceil(remainingHours)}h da schedulare.`,
      });
    }

    taskFinishDay.set(taskId, lastDayAssigned >= 0 ? lastDayAssigned : minDayIndex);

    if (lastDayAssigned >= 0 && days[lastDayAssigned]) {
      const scheduledEnd = days[lastDayAssigned]!.date;
      if (parseD(scheduledEnd) > parseD(task.endDate)) {
        warnings.push(
          `"${task.title}" finirebbe il ${scheduledEnd}, oltre la scadenza ${task.endDate}.`
        );
      }
    }
  }

  for (const day of days) {
    day.overloaded = day.totalHours > (day.maxCapacity ?? 8);
  }

  let lastNonEmpty = days.length - 1;
  while (lastNonEmpty > 0 && days[lastNonEmpty]!.slots.length === 0) lastNonEmpty--;
  const trimmedDays = days.slice(0, Math.min(lastNonEmpty + 3, days.length));

  return {
    days: trimmedDays,
    unschedulable,
    totalWorkdays: trimmedDays.filter((d) => d.slots.length > 0).length,
    warnings,
  };
}
