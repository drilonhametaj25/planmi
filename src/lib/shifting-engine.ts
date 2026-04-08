/* shifting-engine.ts — Cuore dell'app. Calcola la propagazione delle date quando un task viene spostato.
   DEVE essere deterministico: stessi input → stessi output. Zero side effects, zero Date.now(). */

import {
  buildAdjacencyList,
  collectNodes,
  topologicalSort,
} from "./dependency-graph";

// ── Tipi input ──
export interface ShiftTask {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

export interface ShiftDependency {
  predecessorId: string;
  successorId: string;
  dependencyType: "FS" | "SS" | "FF" | "SF";
  lagDays: number;
}

// ── Tipi output ──
export interface ShiftEntry {
  taskId: string;
  oldStartDate: string;
  oldEndDate: string;
  newStartDate: string;
  newEndDate: string;
  reason: string;
}

export interface ShiftResult {
  shifts: ShiftEntry[];
  hasCircularDependency: boolean;
  circularPath?: string[];
}

// ── Utility date (pure, nessun side effect) ──
const DAY_MS = 86400000;

function parseD(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}

function formatD(ms: number): string {
  return new Date(ms).toISOString().split("T")[0]!;
}

function addDays(dateStr: string, days: number): string {
  const ms = parseD(dateStr);
  return formatD(ms + days * DAY_MS);
}

function maxDate(a: string, b: string): string {
  return parseD(a) >= parseD(b) ? a : b;
}

// ── Workday helpers (Lun-Ven, salta Sab-Dom) ──

function isWeekendMs(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

/** Controlla se un giorno è non-lavorativo (weekend o giorno bloccato da ferie/permessi). */
function isNonWorkday(ms: number, blockedDates?: Set<string>): boolean {
  if (isWeekendMs(ms)) return true;
  if (blockedDates && blockedDates.has(formatD(ms))) return true;
  return false;
}

function skipToWorkdayMs(ms: number, blockedDates?: Set<string>): number {
  // Safety: max 365 iterazioni
  for (let i = 0; i < 365; i++) {
    if (!isNonWorkday(ms, blockedDates)) return ms;
    ms += DAY_MS;
  }
  return ms;
}

/** Avanza di N giorni lavorativi (salta weekend e giorni bloccati). Snap a lavorativo prima di contare. */
export function addWorkdays(dateStr: string, n: number, blockedDates?: Set<string>): string {
  let ms = skipToWorkdayMs(parseD(dateStr), blockedDates);
  let remaining = n;
  while (remaining > 0) {
    ms += DAY_MS;
    if (!isNonWorkday(ms, blockedDates)) remaining--;
  }
  return formatD(ms);
}

/** Conta giorni lavorativi tra due date (incluse entrambe). Salta weekend e giorni bloccati. */
export function countWorkdays(startDate: string, endDate: string, blockedDates?: Set<string>): number {
  let ms = parseD(startDate);
  const endMs = parseD(endDate);
  let count = 0;
  while (ms <= endMs) {
    if (!isNonWorkday(ms, blockedDates)) count++;
    ms += DAY_MS;
  }
  return count;
}

/**
 * Calcola tutti gli shift necessari quando un task viene spostato.
 *
 * Algoritmo:
 * 1. Costruisci il grafo delle dipendenze
 * 2. Topological sort (fallisci se ciclo)
 * 3. Applica la nuova posizione del task spostato
 * 4. Propaga in ordine topologico: per ogni task, calcola la data minima
 *    in base a TUTTI i suoi predecessori e sposta se necessario
 */
export function calculateShifts(
  movedTaskId: string,
  newStartDate: string,
  newEndDate: string,
  allTasks: ShiftTask[],
  allDependencies: ShiftDependency[],
  options?: { blockedDates?: Set<string>; supplierTaskIds?: Set<string> }
): ShiftResult {
  const blockedDates = options?.blockedDates;
  const supplierTaskIds = options?.supplierTaskIds;
  // 1. Costruisci il grafo
  const adj = buildAdjacencyList(allDependencies);
  const nodes = collectNodes(allDependencies);

  // Aggiungi nodi senza dipendenze
  for (const task of allTasks) {
    nodes.add(task.id);
  }

  // 2. Topological sort
  const sorted = topologicalSort(adj, nodes);
  if (!sorted) {
    return {
      shifts: [],
      hasCircularDependency: true,
      circularPath: [], // Il dettaglio del ciclo verrà aggiunto se necessario
    };
  }

  // 3. Crea una mappa delle posizioni correnti (modificabile)
  const taskMap = new Map<string, { startDate: string; endDate: string }>();
  for (const task of allTasks) {
    taskMap.set(task.id, {
      startDate: task.startDate,
      endDate: task.endDate,
    });
  }

  // Mappa per salvare le posizioni originali
  const originalMap = new Map<string, { startDate: string; endDate: string }>();
  for (const task of allTasks) {
    originalMap.set(task.id, {
      startDate: task.startDate,
      endDate: task.endDate,
    });
  }

  // Applica lo spostamento del task mosso
  taskMap.set(movedTaskId, {
    startDate: newStartDate,
    endDate: newEndDate,
  });

  // 4. Costruisci mappa inversa: successore → lista predecessori con tipo di dipendenza
  const predMap = new Map<
    string,
    { predecessorId: string; dependencyType: string; lagDays: number }[]
  >();
  for (const dep of allDependencies) {
    const list = predMap.get(dep.successorId) ?? [];
    list.push({
      predecessorId: dep.predecessorId,
      dependencyType: dep.dependencyType,
      lagDays: dep.lagDays,
    });
    predMap.set(dep.successorId, list);
  }

  // 5. Propaga in ordine topologico
  for (const nodeId of sorted) {
    if (nodeId === movedTaskId) continue; // già spostato manualmente

    // Task fornitore: NON vengono traslati (gestiti esternamente)
    if (supplierTaskIds?.has(nodeId)) continue;

    const preds = predMap.get(nodeId);
    if (!preds || preds.length === 0) continue;

    const current = taskMap.get(nodeId);
    if (!current) continue;

    const curWorkdays = countWorkdays(current.startDate, current.endDate, blockedDates);
    let constrainedStart = current.startDate;
    let constrainedEnd = current.endDate;

    for (const pred of preds) {
      const predPos = taskMap.get(pred.predecessorId);
      if (!predPos) continue;

      const lag = pred.lagDays;

      switch (pred.dependencyType) {
        case "FS": {
          const minStart = addWorkdays(addDays(predPos.endDate, 1), lag, blockedDates);
          constrainedStart = maxDate(constrainedStart, minStart);
          break;
        }
        case "SS": {
          const minStart = addWorkdays(predPos.startDate, lag, blockedDates);
          constrainedStart = maxDate(constrainedStart, minStart);
          break;
        }
        case "FF": {
          const minEnd = addWorkdays(predPos.endDate, lag, blockedDates);
          constrainedEnd = maxDate(constrainedEnd, minEnd);
          break;
        }
        case "SF": {
          const minEnd = addWorkdays(predPos.startDate, lag, blockedDates);
          constrainedEnd = maxDate(constrainedEnd, minEnd);
          break;
        }
      }
    }

    // Per FS e SS, quando lo start si sposta, mantieni la stessa durata in giorni lavorativi
    if (parseD(constrainedStart) > parseD(current.startDate)) {
      constrainedEnd = addWorkdays(constrainedStart, curWorkdays - 1, blockedDates);
    }

    // Per FF e SF, quando l'end si sposta (senza che start sia già spostato), shifta anche lo start
    if (
      parseD(constrainedEnd) > parseD(current.endDate) &&
      parseD(constrainedStart) === parseD(current.startDate)
    ) {
      let ms = parseD(constrainedEnd);
      let remaining = curWorkdays - 1;
      while (remaining > 0) {
        ms -= DAY_MS;
        if (!isNonWorkday(ms, blockedDates)) remaining--;
      }
      constrainedStart = formatD(ms);
    }

    // Aggiorna posizione se cambiata
    if (
      constrainedStart !== current.startDate ||
      constrainedEnd !== current.endDate
    ) {
      taskMap.set(nodeId, {
        startDate: constrainedStart,
        endDate: constrainedEnd,
      });
    }
  }

  // 6. Colleziona gli shift (escluso il task mosso manualmente)
  const shifts: ShiftEntry[] = [];
  for (const [taskId, newPos] of taskMap) {
    const original = originalMap.get(taskId);
    if (!original) continue;

    if (
      taskId !== movedTaskId &&
      (newPos.startDate !== original.startDate ||
        newPos.endDate !== original.endDate)
    ) {
      shifts.push({
        taskId,
        oldStartDate: original.startDate,
        oldEndDate: original.endDate,
        newStartDate: newPos.startDate,
        newEndDate: newPos.endDate,
        reason: `Spostato per dipendenza da predecessore`,
      });
    }
  }

  return {
    shifts,
    hasCircularDependency: false,
  };
}
