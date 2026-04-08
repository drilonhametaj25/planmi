/* plan-generator.ts — Genera un piano automatico: suggerisce dipendenze per tipo task + ottimizza date.
   Funzione pura, zero side effects. */

import { wouldCreateCycle, buildAdjacencyList } from "./dependency-graph";
import { optimizeProject, type WorkloadTask, type TaskChange, type OptimizeProjectResult } from "./workload-optimizer";
import type { ShiftDependency } from "./shifting-engine";

// ── Ordine euristico per tipo task ──
export const TYPE_ORDER: Record<string, number> = {
  research: 0,
  design: 1,
  database: 2,
  setup: 2,
  api: 3,
  backend: 3,
  frontend: 4,
  testing: 5,
  documentation: 5,
  deployment: 6,
};

const DEFAULT_ORDER = 3;

export interface SuggestedDependency {
  predecessorId: string;
  predecessorTitle: string;
  successorId: string;
  successorTitle: string;
  dependencyType: "FS";
  lagDays: number;
  reason: string;
}

export interface PlanGeneratorResult {
  suggestedDeps: SuggestedDependency[];
  changes: TaskChange[];
  warnings: string[];
  stats: {
    totalTasksChanged: number;
    depsAdded: number;
  };
}

export type PlanTask = WorkloadTask & { taskType?: string | null };

export interface PlanGeneratorInput {
  tasks: PlanTask[];
  existingDeps: ShiftDependency[];
  today: string;
  options?: {
    blockedDates?: Set<string>;
    dayCapacity?: Map<string, number>;
    startFrom?: string;
    suggestDependencies?: boolean;
  };
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Genera un piano completo: suggerisce dipendenze + ottimizza date. */
export function generatePlan(input: PlanGeneratorInput): PlanGeneratorResult {
  const { tasks, existingDeps, today, options } = input;
  const suggestDeps = options?.suggestDependencies !== false;

  // Filtra task attivi (non done)
  const activeTasks: PlanTask[] = tasks.filter((t) => t.status !== "done");

  const suggestedDeps: SuggestedDependency[] = [];

  if (suggestDeps && activeTasks.length > 1) {
    // Build existing adjacency for cycle check
    const existingEdges = existingDeps.map((d) => ({
      predecessorId: d.predecessorId,
      successorId: d.successorId,
    }));

    // Set di task che hanno già predecessori
    const hasExistingPred = new Set<string>();
    for (const dep of existingDeps) {
      hasExistingPred.add(dep.successorId);
    }

    // Raggruppa per parent
    const groups = new Map<string | null, PlanTask[]>();
    for (const t of activeTasks) {
      const key = t.parentTaskId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }

    // Per ogni gruppo di sibling: suggerisci dipendenze per tipo
    for (const [, siblings] of groups) {
      if (siblings.length < 2) continue;

      // Ordina per TYPE_ORDER, poi per priorità
      const sorted = [...siblings].sort((a, b) => {
        const orderA = TYPE_ORDER[a.taskType ?? ""] ?? DEFAULT_ORDER;
        const orderB = TYPE_ORDER[b.taskType ?? ""] ?? DEFAULT_ORDER;
        if (orderA !== orderB) return orderA - orderB;
        const prioA = PRIORITY_ORDER[a.priority ?? "medium"] ?? 2;
        const prioB = PRIORITY_ORDER[b.priority ?? "medium"] ?? 2;
        return prioA - prioB;
      });

      // Suggerisci catena FS tra task consecutivi (solo per quelli senza predecessori)
      for (let i = 1; i < sorted.length; i++) {
        const pred = sorted[i - 1]!;
        const succ = sorted[i]!;

        // Skip se il successore ha già un predecessore
        if (hasExistingPred.has(succ.id)) continue;

        // Skip se esiste già una dipendenza diretta tra loro
        const alreadyLinked = existingDeps.some(
          (d) =>
            (d.predecessorId === pred.id && d.successorId === succ.id) ||
            (d.predecessorId === succ.id && d.successorId === pred.id)
        );
        if (alreadyLinked) continue;

        // Verifica cicli (incrementalmente con le dipendenze già suggerite)
        const allEdges = [
          ...existingEdges,
          ...suggestedDeps.map((s) => ({
            predecessorId: s.predecessorId,
            successorId: s.successorId,
          })),
        ];
        const adj = buildAdjacencyList(allEdges);
        if (wouldCreateCycle(adj, pred.id, succ.id)) continue;

        const predType = pred.taskType ?? "altro";
        const succType = succ.taskType ?? "altro";
        const reason =
          TYPE_ORDER[predType] !== undefined && TYPE_ORDER[succType] !== undefined
            ? `${predType} prima di ${succType} (ordine tipo)`
            : `${pred.title} prima di ${succ.title} (priorità)`;

        suggestedDeps.push({
          predecessorId: pred.id,
          predecessorTitle: pred.title,
          successorId: succ.id,
          successorTitle: succ.title,
          dependencyType: "FS",
          lagDays: 0,
          reason,
        });

        // Segna il successore come "ha un predecessore suggerito"
        hasExistingPred.add(succ.id);
      }
    }
  }

  // Merge deps esistenti + suggeriti per l'ottimizzazione
  const mergedDeps: ShiftDependency[] = [
    ...existingDeps,
    ...suggestedDeps.map((s) => ({
      predecessorId: s.predecessorId,
      successorId: s.successorId,
      dependencyType: s.dependencyType as "FS",
      lagDays: s.lagDays,
    })),
  ];

  // Ottimizza con dipendenze merged
  const optimizeResult: OptimizeProjectResult = optimizeProject(
    tasks,
    mergedDeps,
    today,
    {
      blockedDates: options?.blockedDates,
      dayCapacity: options?.dayCapacity,
      startFrom: options?.startFrom,
    }
  );

  return {
    suggestedDeps,
    changes: optimizeResult.changes,
    warnings: optimizeResult.warnings,
    stats: {
      totalTasksChanged: optimizeResult.stats.totalTasksChanged,
      depsAdded: suggestedDeps.length,
    },
  };
}
