/* critical-path.ts — Calcolo percorso critico del progetto. Forward pass + backward pass. Funzione pura. */

export interface CriticalPathTask {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
}

export interface CriticalPathDependency {
  predecessorId: string;
  successorId: string;
  dependencyType: "FS" | "SS" | "FF" | "SF";
  lagDays: number;
}

export interface CriticalPathResult {
  criticalTaskIds: string[];
  projectEndDate: string;
  totalDurationDays: number;
}

function parseD(s: string): number {
  return new Date(s + "T00:00:00Z").getTime();
}

function formatD(ms: number): string {
  return new Date(ms).toISOString().split("T")[0]!;
}

function daysDiff(a: string, b: string): number {
  return Math.round((parseD(b) - parseD(a)) / 86400000);
}

/**
 * Calcola il percorso critico usando forward pass e backward pass.
 *
 * 1. Forward pass: calcola earliest start (ES) e earliest finish (EF) per ogni task
 * 2. Backward pass: calcola latest start (LS) e latest finish (LF) partendo dalla fine
 * 3. Float = LS - ES. Task con float === 0 sono sul percorso critico.
 */
export function calculateCriticalPath(
  tasks: CriticalPathTask[],
  dependencies: CriticalPathDependency[]
): CriticalPathResult {
  if (tasks.length === 0) {
    return {
      criticalTaskIds: [],
      projectEndDate: new Date().toISOString().split("T")[0]!,
      totalDurationDays: 0,
    };
  }

  // Costruisci mappe
  const taskMap = new Map<string, CriticalPathTask>();
  for (const t of tasks) taskMap.set(t.id, t);

  // Predecessori per ogni task
  const predMap = new Map<
    string,
    { predecessorId: string; dependencyType: string; lagDays: number }[]
  >();
  // Successori per ogni task
  const succMap = new Map<string, string[]>();

  for (const dep of dependencies) {
    const preds = predMap.get(dep.successorId) ?? [];
    preds.push(dep);
    predMap.set(dep.successorId, preds);

    const succs = succMap.get(dep.predecessorId) ?? [];
    succs.push(dep.successorId);
    succMap.set(dep.predecessorId, succs);
  }

  // Forward pass: ES, EF per ogni task (in millisecondi)
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  // Processa in ordine: task senza predecessori prima, poi via BFS
  const processed = new Set<string>();
  const queue: string[] = [];

  // Task senza predecessori
  for (const t of tasks) {
    if (!predMap.has(t.id) || predMap.get(t.id)!.length === 0) {
      es.set(t.id, parseD(t.startDate));
      ef.set(t.id, parseD(t.endDate));
      processed.add(t.id);
      queue.push(t.id);
    }
  }

  // BFS propagation
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const nodeEF = ef.get(nodeId)!;

    for (const succId of succMap.get(nodeId) ?? []) {
      if (processed.has(succId)) continue;

      // Controlla se tutti i predecessori sono processati
      const preds = predMap.get(succId) ?? [];
      const allPredsProcessed = preds.every((p) =>
        processed.has(p.predecessorId)
      );
      if (!allPredsProcessed) continue;

      const task = taskMap.get(succId);
      if (!task) continue;

      const taskDuration = daysDiff(task.startDate, task.endDate);

      // Calcola ES basandosi su tutti i predecessori
      let maxES = parseD(task.startDate);
      for (const pred of preds) {
        const predTask = taskMap.get(pred.predecessorId);
        if (!predTask) continue;

        const lag = pred.lagDays * 86400000;

        switch (pred.dependencyType) {
          case "FS":
            maxES = Math.max(maxES, (ef.get(pred.predecessorId) ?? 0) + 86400000 + lag);
            break;
          case "SS":
            maxES = Math.max(maxES, (es.get(pred.predecessorId) ?? 0) + lag);
            break;
          case "FF": {
            const minEF = (ef.get(pred.predecessorId) ?? 0) + lag;
            maxES = Math.max(maxES, minEF - taskDuration * 86400000);
            break;
          }
          case "SF": {
            const minEF = (es.get(pred.predecessorId) ?? 0) + lag;
            maxES = Math.max(maxES, minEF - taskDuration * 86400000);
            break;
          }
        }
      }

      es.set(succId, maxES);
      ef.set(succId, maxES + taskDuration * 86400000);
      processed.add(succId);
      queue.push(succId);
    }
  }

  // Gestisci task non raggiungibili (senza dipendenze nel grafo)
  for (const t of tasks) {
    if (!processed.has(t.id)) {
      es.set(t.id, parseD(t.startDate));
      ef.set(t.id, parseD(t.endDate));
      processed.add(t.id);
    }
  }

  // Project end = max EF
  let projectEnd = 0;
  for (const [, v] of ef) {
    projectEnd = Math.max(projectEnd, v);
  }

  // Backward pass: LS, LF
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  // Inizializza: task senza successori hanno LF = project end
  for (const t of tasks) {
    if (!succMap.has(t.id) || succMap.get(t.id)!.length === 0) {
      lf.set(t.id, projectEnd);
      const taskDuration = daysDiff(t.startDate, t.endDate);
      ls.set(t.id, projectEnd - taskDuration * 86400000);
    }
  }

  // BFS inverso
  const processedBack = new Set<string>();
  const backQueue: string[] = [];

  for (const t of tasks) {
    if (ls.has(t.id)) {
      processedBack.add(t.id);
      backQueue.push(t.id);
    }
  }

  while (backQueue.length > 0) {
    const nodeId = backQueue.shift()!;

    for (const pred of predMap.get(nodeId) ?? []) {
      const predId = pred.predecessorId;
      if (processedBack.has(predId)) continue;

      const succs = succMap.get(predId) ?? [];
      const allSuccsProcessed = succs.every((s) => processedBack.has(s));
      if (!allSuccsProcessed) continue;

      const predTask = taskMap.get(predId);
      if (!predTask) continue;

      const taskDuration = daysDiff(predTask.startDate, predTask.endDate);

      let minLF = projectEnd;
      for (const succId of succs) {
        // Trova il tipo di dipendenza tra predId e succId
        const deps = dependencies.filter(
          (d) => d.predecessorId === predId && d.successorId === succId
        );
        for (const dep of deps) {
          const lag = dep.lagDays * 86400000;
          switch (dep.dependencyType) {
            case "FS":
              minLF = Math.min(minLF, (ls.get(succId) ?? projectEnd) - 86400000 - lag);
              break;
            case "SS":
              minLF = Math.min(
                minLF,
                (ls.get(succId) ?? projectEnd) - lag + taskDuration * 86400000
              );
              break;
            case "FF":
              minLF = Math.min(minLF, (lf.get(succId) ?? projectEnd) - lag);
              break;
            case "SF":
              minLF = Math.min(
                minLF,
                (lf.get(succId) ?? projectEnd) - lag + taskDuration * 86400000
              );
              break;
          }
        }
      }

      lf.set(predId, minLF);
      ls.set(predId, minLF - taskDuration * 86400000);
      processedBack.add(predId);
      backQueue.push(predId);
    }
  }

  // Gestisci non raggiungibili nel backward pass
  for (const t of tasks) {
    if (!processedBack.has(t.id)) {
      lf.set(t.id, projectEnd);
      const taskDuration = daysDiff(t.startDate, t.endDate);
      ls.set(t.id, projectEnd - taskDuration * 86400000);
    }
  }

  // Calcola float e identifica critical path
  const criticalTaskIds: string[] = [];
  for (const t of tasks) {
    const esVal = es.get(t.id) ?? 0;
    const lsVal = ls.get(t.id) ?? 0;
    const float = lsVal - esVal;
    if (Math.abs(float) < 86400000) {
      // Float ~0 (meno di 1 giorno)
      criticalTaskIds.push(t.id);
    }
  }

  const projectStartMs = Math.min(...Array.from(es.values()));
  const totalDurationDays = Math.round(
    (projectEnd - projectStartMs) / 86400000
  );

  return {
    criticalTaskIds,
    projectEndDate: formatD(projectEnd),
    totalDurationDays,
  };
}
