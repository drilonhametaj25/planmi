/* suggestions-engine.ts — Motore suggerimenti rule-based. Analizza stato progetti e genera alert actionable. Funzione pura. */

import type { Task, Dependency, TaskHistory } from "@/db/schema";
import { getDefaultDays } from "./task-defaults";

export type SuggestionSeverity = "info" | "warning" | "critical";

export interface Suggestion {
  id: string;
  type: string;
  severity: SuggestionSeverity;
  title: string;
  description: string;
  affectedTaskIds: string[];
}

interface SuggestionsInput {
  tasks: Task[];
  dependencies: Dependency[];
  history: TaskHistory[];
  today: string; // YYYY-MM-DD, passato esplicitamente per deterministicità
}

function daysDiff(a: string, b: string): number {
  const msA = new Date(a + "T00:00:00Z").getTime();
  const msB = new Date(b + "T00:00:00Z").getTime();
  return Math.round((msB - msA) / 86400000);
}

/**
 * Genera suggerimenti basati sullo stato corrente del progetto.
 * Ogni regola produce 0+ suggerimenti con severity (info/warning/critical).
 */
export function generateSuggestions(input: SuggestionsInput): Suggestion[] {
  const { tasks, dependencies, history, today } = input;
  const suggestions: Suggestion[] = [];
  let idCounter = 0;
  const nextId = () => `sug-${++idCounter}`;

  // ── REGOLA 1: Task scaduti ──
  for (const task of tasks) {
    if (task.status === "done") continue;
    const daysOverdue = daysDiff(task.endDate, today);
    if (daysOverdue > 0) {
      suggestions.push({
        id: nextId(),
        type: "overdue",
        severity: "critical",
        title: `Task in ritardo di ${daysOverdue} giorni`,
        description: `"${task.title}" doveva finire il ${task.endDate}`,
        affectedTaskIds: [task.id],
      });
    }
  }

  // ── REGOLA 2: Task indietro rispetto al piano ──
  for (const task of tasks) {
    if (task.status === "done" || task.status === "todo") continue;
    const totalDuration = daysDiff(task.startDate, task.endDate) + 1;
    const elapsed = daysDiff(task.startDate, today);
    if (elapsed <= 0 || totalDuration <= 0) continue;

    const expectedProgress = Math.min(100, Math.round((elapsed / totalDuration) * 100));
    const actualProgress = task.progress ?? 0;

    if (actualProgress < expectedProgress - 20) {
      suggestions.push({
        id: nextId(),
        type: "behind_schedule",
        severity: "warning",
        title: `Task indietro rispetto al piano`,
        description: `"${task.title}": progresso ${actualProgress}% vs ${expectedProgress}% atteso`,
        affectedTaskIds: [task.id],
      });
    }
  }

  // ── REGOLA 3: Progetto a rischio (>30% task in ritardo o blocked) ──
  const activeTasks = tasks.filter((t) => t.status !== "done");
  if (activeTasks.length > 0) {
    const problematicTasks = activeTasks.filter(
      (t) =>
        t.status === "blocked" ||
        (t.status !== "done" && daysDiff(t.endDate, today) > 0)
    );
    const ratio = problematicTasks.length / activeTasks.length;
    if (ratio > 0.3) {
      suggestions.push({
        id: nextId(),
        type: "project_at_risk",
        severity: "critical",
        title: `Progetto a rischio`,
        description: `${Math.round(ratio * 100)}% dei task sono in ritardo o bloccati (${problematicTasks.length}/${activeTasks.length})`,
        affectedTaskIds: problematicTasks.map((t) => t.id),
      });
    }
  }

  // ── REGOLA 4: Nessun task in progress ──
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const hasNonDoneTasks = tasks.some((t) => t.status !== "done");
  if (inProgressTasks.length === 0 && hasNonDoneTasks) {
    suggestions.push({
      id: nextId(),
      type: "no_in_progress",
      severity: "info",
      title: `Nessun task in lavorazione`,
      description: `Ci sono ${tasks.filter((t) => t.status === "todo").length} task da fare`,
      affectedTaskIds: [],
    });
  }

  // ── REGOLA 5: Troppe cose in parallelo ──
  if (inProgressTasks.length > 5) {
    suggestions.push({
      id: nextId(),
      type: "too_many_parallel",
      severity: "warning",
      title: `Troppi task in parallelo`,
      description: `Hai ${inProgressTasks.length} task in progress. Rischio context switching.`,
      affectedTaskIds: inProgressTasks.map((t) => t.id),
    });
  }

  // ── REGOLA 6: Bottleneck (task con molti successori che è bloccato/in ritardo) ──
  const successorCount = new Map<string, number>();
  for (const dep of dependencies) {
    successorCount.set(
      dep.predecessorId,
      (successorCount.get(dep.predecessorId) ?? 0) + 1
    );
  }

  for (const [taskId, count] of successorCount) {
    if (count < 3) continue;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) continue;
    if (
      task.status === "blocked" ||
      (task.status !== "done" && daysDiff(task.endDate, today) > 0)
    ) {
      suggestions.push({
        id: nextId(),
        type: "bottleneck",
        severity: "critical",
        title: `Bottleneck: blocca ${count} task`,
        description: `"${task.title}" è ${task.status === "blocked" ? "bloccato" : "in ritardo"} e blocca ${count} altri task`,
        affectedTaskIds: [taskId],
      });
    }
  }

  // ── REGOLA 7: Stima irrealistica ──
  // Solo se c'è abbastanza storico per quel tipo di task (min 2 completamenti)
  const avgByType = new Map<string, number>();
  const countByType = new Map<string, number>();
  for (const h of history) {
    if (!h.taskType || !h.actualDays) continue;
    avgByType.set(
      h.taskType,
      (avgByType.get(h.taskType) ?? 0) + h.actualDays
    );
    countByType.set(h.taskType, (countByType.get(h.taskType) ?? 0) + 1);
  }

  for (const [type, total] of avgByType) {
    const count = countByType.get(type) ?? 1;
    avgByType.set(type, total / count);
  }

  // Set di task padre (hanno sottotask)
  const parentTaskIds = new Set<string>();
  for (const t of tasks) {
    if (t.parentTaskId) parentTaskIds.add(t.parentTaskId);
  }

  for (const task of tasks) {
    if (task.status === "done") continue;
    // Skip task padre (la loro durata dipende dai figli, non da una stima propria)
    if (parentTaskIds.has(task.id)) continue;
    // Skip task fornitore
    if (task.executionMode === "supplier") continue;
    // Skip task senza tipo (non possiamo confrontare senza storico)
    if (!task.taskType) continue;
    // Solo se c'è storico reale per questo tipo (min 2 completamenti)
    const historyCount = countByType.get(task.taskType) ?? 0;
    if (historyCount < 2) continue;

    const duration = daysDiff(task.startDate, task.endDate) + 1;
    const avg = avgByType.get(task.taskType)!;
    if (duration < avg * 0.5) {
      suggestions.push({
        id: nextId(),
        type: "unrealistic_estimate",
        severity: "warning",
        title: `Stima ottimistica`,
        description: `"${task.title}": stimato ${duration}g, media storica ${avg.toFixed(1)}g per task tipo "${task.taskType}"`,
        affectedTaskIds: [task.id],
      });
    }
  }

  // ── REGOLA 8: Task completabili che sbloccano molti successori ──
  for (const [taskId, count] of successorCount) {
    if (count < 2) continue;
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === "done" || task.status === "blocked") continue;
    if (task.status === "in_progress" && (task.progress ?? 0) >= 70) {
      suggestions.push({
        id: nextId(),
        type: "unlock_potential",
        severity: "info",
        title: `Completare questo task sblocca ${count} altri task`,
        description: `"${task.title}" è al ${task.progress}% e sblocca ${count} successori`,
        affectedTaskIds: [taskId],
      });
    }
  }

  // Ordina per severity: critical > warning > info
  const severityOrder: Record<string, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  suggestions.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2)
  );

  return suggestions;
}
