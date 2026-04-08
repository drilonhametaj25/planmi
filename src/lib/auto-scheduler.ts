/* auto-scheduler.ts — Calcola la posizione ottimale per un nuovo task nella timeline.
   Funzione pura, deterministico: stessi input → stessi output. Zero side effects. */

import { calculateShifts, addWorkdays, countWorkdays } from "./shifting-engine";
import type { ShiftTask, ShiftDependency, ShiftEntry } from "./shifting-engine";
import { getDefaultDays } from "./task-defaults";

// ── Tipi input ──

export interface PredecessorDep {
  predecessorId: string;
  dependencyType: "FS" | "SS" | "FF" | "SF";
  lagDays: number;
}

export interface AutoScheduleInput {
  taskType: string | null;
  estimatedHours: number | null;
  parentTaskId: string | null;
  milestoneId: string | null;
  predecessorDeps: PredecessorDep[];
  allTasks: ShiftTask[];
  allDependencies: ShiftDependency[];
  milestones: { id: string; date: string }[];
  today: string; // YYYY-MM-DD
}

// ── Tipi output ──

export interface ScheduleConstraint {
  type:
    | "dependency"
    | "parent_bounds"
    | "milestone_deadline"
    | "parallel_load"
    | "today";
  description: string;
  boundDate: string;
  sourceId: string;
}

export interface ScheduleWarning {
  type:
    | "milestone_exceeded"
    | "parent_exceeded"
    | "overloaded_period"
    | "no_valid_window";
  severity: "warning" | "critical";
  description: string;
}

export interface AutoScheduleResult {
  suggestedStartDate: string;
  suggestedEndDate: string;
  durationDays: number;
  constraints: ScheduleConstraint[];
  shifts: ShiftEntry[];
  warnings: ScheduleWarning[];
}

// ── Utility date (pure, no side effects) ──

function parseD(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}

function formatD(ms: number): string {
  return new Date(ms).toISOString().split("T")[0]!;
}

function addDaysMs(ms: number, days: number): number {
  return ms + days * 86400000;
}

function addDays(dateStr: string, days: number): string {
  return formatD(addDaysMs(parseD(dateStr), days));
}

const DAY_MS = 86400000;

function isWeekendMs(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day === 0 || day === 6;
}

function skipToWorkdayMs(ms: number): number {
  const day = new Date(ms).getUTCDay();
  if (day === 6) return ms + 2 * DAY_MS; // Sab → Lun
  if (day === 0) return ms + DAY_MS;      // Dom → Lun
  return ms;
}

/**
 * Calcola la posizione ottimale per un task nella timeline.
 *
 * Algoritmo:
 * 1. Calcola durata da estimatedHours o taskType defaults
 * 2. Calcola earliest start da dipendenze predecessori (FS/SS/FF/SF + lag)
 * 3. Applica vincoli parent (sottotask dentro i limiti del padre)
 * 4. Applica vincoli milestone (finire prima della deadline)
 * 5. Controlla carico parallelo (soft: nudge se >5 task sovrapposti)
 * 6. Risolvi: start = max(today, dep floor, parent start), end = start + duration
 * 7. Calcola impatto downstream via shifting engine
 */
export function calculateAutoSchedule(
  input: AutoScheduleInput
): AutoScheduleResult {
  const {
    taskType,
    estimatedHours,
    parentTaskId,
    milestoneId,
    predecessorDeps,
    allTasks,
    allDependencies,
    milestones,
    today,
  } = input;

  const constraints: ScheduleConstraint[] = [];
  const warnings: ScheduleWarning[] = [];

  // ── 1. Calcola durata ──
  let durationDays: number;
  if (estimatedHours && estimatedHours > 0) {
    durationDays = Math.max(1, Math.ceil(estimatedHours / 8));
  } else {
    durationDays = getDefaultDays(taskType);
  }
  // Durata minima 1 giorno
  if (durationDays < 1) durationDays = 1;

  // ── 2. Earliest start da dipendenze (weekend-aware) ──
  let earliestStartMs = skipToWorkdayMs(parseD(today));

  constraints.push({
    type: "today",
    description: "Non prima di oggi",
    boundDate: formatD(earliestStartMs),
    sourceId: "",
  });

  const taskMap = new Map<string, ShiftTask>();
  for (const t of allTasks) taskMap.set(t.id, t);

  for (const dep of predecessorDeps) {
    const pred = taskMap.get(dep.predecessorId);
    if (!pred) continue;

    const lag = dep.lagDays;
    let minStartMs: number;
    let description: string;

    switch (dep.dependencyType) {
      case "FS": {
        // successor.start >= primo lavorativo dopo pred.end + lag lavorativi
        const dayAfterEnd = addDays(pred.endDate, 1);
        minStartMs = parseD(addWorkdays(dayAfterEnd, lag));
        description = `Inizia dopo fine predecessore (+${lag}g lag) [FS]`;
        break;
      }
      case "SS": {
        // successor.start >= predecessor.start + lag lavorativi
        minStartMs = parseD(addWorkdays(pred.startDate, lag));
        description = `Inizia con predecessore (+${lag}g lag) [SS]`;
        break;
      }
      case "FF": {
        // successor.end >= predecessor.end + lag lavorativi → arretra start
        const minEndStr = addWorkdays(pred.endDate, lag);
        // start = end - (duration-1) lavorativi indietro
        let ms = parseD(minEndStr);
        let remaining = durationDays - 1;
        while (remaining > 0) {
          ms -= DAY_MS;
          if (!isWeekendMs(ms)) remaining--;
        }
        minStartMs = ms;
        description = `Finisce con predecessore (+${lag}g lag) [FF]`;
        break;
      }
      case "SF": {
        // successor.end >= predecessor.start + lag lavorativi → arretra start
        const minEndStr = addWorkdays(pred.startDate, lag);
        let ms = parseD(minEndStr);
        let remaining = durationDays - 1;
        while (remaining > 0) {
          ms -= DAY_MS;
          if (!isWeekendMs(ms)) remaining--;
        }
        minStartMs = ms;
        description = `Finisce quando inizia predecessore (+${lag}g lag) [SF]`;
        break;
      }
    }

    if (minStartMs > earliestStartMs) {
      earliestStartMs = minStartMs;
      constraints.push({
        type: "dependency",
        description,
        boundDate: formatD(minStartMs),
        sourceId: dep.predecessorId,
      });
    }
  }

  // ── 3. Vincoli parent ──
  if (parentTaskId) {
    const parent = taskMap.get(parentTaskId);
    if (parent) {
      const parentStartMs = skipToWorkdayMs(parseD(parent.startDate));
      const parentEndMs = parseD(parent.endDate);

      if (parentStartMs > earliestStartMs) {
        earliestStartMs = parentStartMs;
        constraints.push({
          type: "parent_bounds",
          description: "Non prima dell'inizio del task padre",
          boundDate: formatD(parentStartMs),
          sourceId: parentTaskId,
        });
      }

      // Controlla se il task ci sta dentro il padre (usando giorni lavorativi)
      const suggestedEndStr = addWorkdays(formatD(earliestStartMs), durationDays - 1);
      if (parseD(suggestedEndStr) > parentEndMs) {
        warnings.push({
          type: "parent_exceeded",
          severity: "warning",
          description: `Il task (${durationDays}g lav.) supera la fine del padre (${parent.endDate})`,
        });
      }
    }
  }

  // ── 4. Vincoli milestone ──
  if (milestoneId) {
    const milestone = milestones.find((m) => m.id === milestoneId);
    if (milestone) {
      const milestoneMs = parseD(milestone.date);
      // Arretra dalla milestone di (durationDays-1) lavorativi per trovare l'ultimo start valido
      let latestStartMs = milestoneMs;
      let remaining = durationDays - 1;
      while (remaining > 0) {
        latestStartMs -= DAY_MS;
        if (!isWeekendMs(latestStartMs)) remaining--;
      }

      if (earliestStartMs > latestStartMs) {
        warnings.push({
          type: "milestone_exceeded",
          severity: "critical",
          description: `Il task non riesce a finire entro la milestone (${milestone.date})`,
        });
      } else {
        constraints.push({
          type: "milestone_deadline",
          description: `Deve finire entro milestone ${milestone.date}`,
          boundDate: milestone.date,
          sourceId: milestoneId,
        });
      }
    }
  }

  // ── 5. Carico parallelo (soft constraint, nudge solo su lavorativi) ──
  let suggestedStartMs = skipToWorkdayMs(earliestStartMs);
  const suggestedEndStrInitial = addWorkdays(formatD(suggestedStartMs), durationDays - 1);
  const suggestedEndMsInitial = parseD(suggestedEndStrInitial);

  const MAX_PARALLEL = 5;
  const MAX_NUDGE_DAYS = 3;
  let bestStart = suggestedStartMs;
  let bestOverlap = countOverlap(suggestedStartMs, suggestedEndMsInitial, allTasks);

  if (bestOverlap > MAX_PARALLEL) {
    let nudgeCount = 0;
    let candidateMs = suggestedStartMs;
    while (nudgeCount < MAX_NUDGE_DAYS) {
      candidateMs += DAY_MS;
      if (isWeekendMs(candidateMs)) continue; // salta weekend
      nudgeCount++;
      const candidateEndStr = addWorkdays(formatD(candidateMs), durationDays - 1);
      const overlap = countOverlap(candidateMs, parseD(candidateEndStr), allTasks);

      if (overlap < bestOverlap) {
        bestOverlap = overlap;
        bestStart = candidateMs;
      }
      if (overlap <= MAX_PARALLEL) break;
    }

    if (bestStart !== suggestedStartMs) {
      suggestedStartMs = bestStart;
      constraints.push({
        type: "parallel_load",
        description: `Spostato per ridurre carico parallelo`,
        boundDate: formatD(bestStart),
        sourceId: "",
      });

      if (bestOverlap > MAX_PARALLEL) {
        warnings.push({
          type: "overloaded_period",
          severity: "warning",
          description: `${bestOverlap} task in parallelo nel periodo suggerito`,
        });
      }
    }
  }

  // ── 6. Risolvi date finali (solo giorni lavorativi) ──
  const suggestedStartDate = formatD(suggestedStartMs);
  const suggestedEndDate = addWorkdays(suggestedStartDate, durationDays - 1);

  // ── 7. Calcola impatto downstream ──
  // Inietta un task sintetico e le sue dipendenze nel grafo
  const syntheticId = "__auto_schedule_synthetic__";
  const syntheticTask: ShiftTask = {
    id: syntheticId,
    startDate: suggestedStartDate,
    endDate: suggestedEndDate,
  };

  const syntheticDeps: ShiftDependency[] = predecessorDeps.map((dep) => ({
    predecessorId: dep.predecessorId,
    successorId: syntheticId,
    dependencyType: dep.dependencyType,
    lagDays: dep.lagDays,
  }));

  // Se il nuovo task ha successori tra quelli esistenti (raro alla creazione),
  // non li includiamo qui — verranno gestiti quando l'utente li aggiunge

  const allTasksWithSynthetic = [...allTasks, syntheticTask];
  const allDepsWithSynthetic = [...allDependencies, ...syntheticDeps];

  const shiftResult = calculateShifts(
    syntheticId,
    suggestedStartDate,
    suggestedEndDate,
    allTasksWithSynthetic,
    allDepsWithSynthetic
  );

  // Filtra shift che sono solo il task sintetico stesso
  const shifts = shiftResult.shifts.filter((s) => s.taskId !== syntheticId);

  return {
    suggestedStartDate,
    suggestedEndDate,
    durationDays,
    constraints: constraints.filter((c) => c.type !== "today" || constraints.length === 1),
    shifts,
    warnings,
  };
}

// ── Helper: conta quanti task esistenti sovrappongono un periodo ──

function countOverlap(
  startMs: number,
  endMs: number,
  tasks: ShiftTask[]
): number {
  let count = 0;
  for (const t of tasks) {
    const tStart = parseD(t.startDate);
    const tEnd = parseD(t.endDate);
    // Overlapping se: tStart <= endMs && tEnd >= startMs
    if (tStart <= endMs && tEnd >= startMs) {
      count++;
    }
  }
  return count;
}
