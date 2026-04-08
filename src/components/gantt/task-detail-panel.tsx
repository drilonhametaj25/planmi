/* task-detail-panel.tsx — Pannello laterale dettaglio task. Edit inline, gestione dipendenze (crea/rimuovi), sottotask. */
"use client";

import { useState, useEffect } from "react";
import type { Task, Dependency, Milestone } from "@/db/schema";
import { X, Plus, Trash2, Link2, ArrowRight, Check, AlertTriangle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatShortDate, parseDate, daysBetween } from "@/lib/gantt/timeline";
import { toast } from "sonner";
import { useAutoSchedule } from "@/hooks/use-auto-schedule";
import { ScheduleSuggestionBanner } from "@/components/tasks/schedule-suggestion-banner";
import { calculateEndFromHours } from "@/lib/task-defaults";
import { TaskPicker } from "@/components/tasks/task-picker";
import { detectHoursMismatch, type WorkloadTask, type OptimizeProjectResult } from "@/lib/workload-optimizer";
import { countWorkdays } from "@/lib/shifting-engine";
import { OptimizePreviewDialog } from "@/components/tasks/optimize-preview-dialog";
import { TagInput } from "@/components/search/tag-input";
import { useTags } from "@/hooks/use-tags";
import { parseTags } from "@/lib/tags";
import type { TaskLinkRow } from "@/db/schema";
import { LINK_TYPE_LABELS, LINK_TYPE_COLORS, type LinkType } from "@/lib/task-links";

interface TaskDetailPanelProps {
  task: Task;
  dependencies: Dependency[];
  tasks: Task[];
  milestones: Milestone[];
  onClose: () => void;
  onUpdate: (taskId: string, data: Record<string, unknown>) => void;
  onCreateDependency: (data: {
    predecessorId: string;
    successorId: string;
    dependencyType: string;
    lagDays: number;
  }) => Promise<void>;
  onDeleteDependency: (id: string) => Promise<void>;
  onCreateSubtask: (data: { parentTaskId: string; title: string; startDate: string; endDate: string }) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onMoveTask?: (taskId: string, newStart: string, newEnd: string) => Promise<void>;
  onSelectTask: (taskId: string) => void;
  projectId: string;
  onMutate?: () => Promise<unknown>;
  taskLinks?: TaskLinkRow[];
  onCreateTaskLink?: (data: { sourceTaskId: string; targetTaskId: string; linkType: string; notes?: string }) => Promise<void>;
  onDeleteTaskLink?: (id: string) => Promise<void>;
  onContinueTask?: (data: { id: string; targetParentTaskId: string; title?: string }) => Promise<unknown>;
}

const DEP_TYPE_LABELS: Record<string, string> = {
  FS: "Finish → Start",
  SS: "Start → Start",
  FF: "Finish → Finish",
  SF: "Start → Finish",
};

export function TaskDetailPanel({
  task,
  dependencies,
  tasks,
  milestones,
  onClose,
  onUpdate,
  onCreateDependency,
  onDeleteDependency,
  onCreateSubtask,
  onDeleteTask,
  onMoveTask,
  onSelectTask,
  projectId,
  onMutate,
  taskLinks = [],
  onCreateTaskLink,
  onDeleteTaskLink,
  onContinueTask,
}: TaskDetailPanelProps) {
  const [title, setTitle] = useState(task.title);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [localProgress, setLocalProgress] = useState(task.progress ?? 0);
  const [localHours, setLocalHours] = useState(task.estimatedHours ?? "");

  // Optimize preview state
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizePreview, setOptimizePreview] = useState<OptimizeProjectResult | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);

  // Drag & drop per dipendenze (HTML5 native, dai sidebar task)
  const [dragOverZone, setDragOverZone] = useState<"pred" | "succ" | null>(null);

  // Sync when task changes
  useEffect(() => {
    setTitle(task.title);
    setLocalProgress(task.progress ?? 0);
    setLocalHours(task.estimatedHours ?? "");
  }, [task.id, task.title, task.progress, task.estimatedHours]);

  // Subtask state
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState("");

  const subtasks = tasks.filter((t) => t.parentTaskId === task.id);
  const parentTask = task.parentTaskId ? tasks.find((t) => t.id === task.parentTaskId) : null;

  // New dependency form state
  const [showAddPred, setShowAddPred] = useState(false);
  const [showAddSucc, setShowAddSucc] = useState(false);
  const [newDepTaskId, setNewDepTaskId] = useState<string>("");
  const [newDepType, setNewDepType] = useState("FS");
  const [newDepLag, setNewDepLag] = useState(0);

  const isScheduled = !!task.startDate && !!task.endDate;
  const start = task.startDate ? parseDate(task.startDate) : null;
  const end = task.endDate ? parseDate(task.endDate) : null;
  const duration = start && end ? daysBetween(start, end) + 1 : null;

  const predecessors = dependencies
    .filter((d) => d.successorId === task.id)
    .map((d) => ({
      dep: d,
      task: tasks.find((t) => t.id === d.predecessorId),
    }));

  const successors = dependencies
    .filter((d) => d.predecessorId === task.id)
    .map((d) => ({
      dep: d,
      task: tasks.find((t) => t.id === d.successorId),
    }));

  // Task disponibili per nuove dipendenze (escluso il task corrente e quelli già collegati)
  const existingPredIds = new Set(predecessors.map((p) => p.dep.predecessorId));
  const existingSuccIds = new Set(successors.map((s) => s.dep.successorId));

  const availableForPred = tasks.filter(
    (t) => t.id !== task.id && !existingPredIds.has(t.id)
  );
  const availableForSucc = tasks.filter(
    (t) => t.id !== task.id && !existingSuccIds.has(t.id)
  );

  // Auto-schedule dopo cambio dipendenze
  const { suggestion: rescheduleSuggestion, isLoading: rescheduleLoading, trigger: triggerReschedule, reset: resetReschedule } =
    useAutoSchedule(projectId);

  const { tags: tagSuggestions } = useTags(projectId);
  const taskTags = parseTags(task.tags);

  /** Trigger auto-schedule con una lista di predecessori esplicita (evita stale closure su dependencies prop) */
  function triggerRescheduleWith(preds: { predecessorId: string; dependencyType: "FS" | "SS" | "FF" | "SF"; lagDays: number }[]) {
    triggerReschedule({
      taskType: task.taskType ?? null,
      estimatedHours: task.estimatedHours ? Number(task.estimatedHours) : null,
      parentTaskId: task.parentTaskId ?? null,
      milestoneId: task.milestoneId ?? null,
      predecessorDeps: preds,
    });
  }

  // Reset reschedule quando cambia task
  useEffect(() => {
    resetReschedule();
  }, [task.id, resetReschedule]);

  async function handleAddDependency(direction: "pred" | "succ") {
    if (!newDepTaskId) return;
    try {
      await onCreateDependency({
        predecessorId: direction === "pred" ? newDepTaskId : task.id,
        successorId: direction === "pred" ? task.id : newDepTaskId,
        dependencyType: newDepType,
        lagDays: newDepLag,
      });

      // Costruisci la lista predecessori aggiornata PRIMA del revalidate SWR
      // (evita stale closure: dependencies prop non è ancora aggiornato)
      const currentPreds = dependencies
        .filter((d) => d.successorId === task.id)
        .map((d) => ({
          predecessorId: d.predecessorId,
          dependencyType: (d.dependencyType ?? "FS") as "FS" | "SS" | "FF" | "SF",
          lagDays: d.lagDays ?? 0,
        }));

      if (direction === "pred") {
        currentPreds.push({
          predecessorId: newDepTaskId,
          dependencyType: newDepType as "FS" | "SS" | "FF" | "SF",
          lagDays: newDepLag,
        });
      }

      setNewDepTaskId("");
      setNewDepType("FS");
      setNewDepLag(0);
      setShowAddPred(false);
      setShowAddSucc(false);
      toast.success("Dipendenza creata");

      // Trigger subito con i dati corretti (no setTimeout, no stale closure)
      triggerRescheduleWith(currentPreds);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore creazione dipendenza");
    }
  }

  async function handleDeleteDep(depId: string) {
    try {
      await onDeleteDependency(depId);

      // Costruisci lista predecessori escludendo la dipendenza appena rimossa
      const currentPreds = dependencies
        .filter((d) => d.successorId === task.id && d.id !== depId)
        .map((d) => ({
          predecessorId: d.predecessorId,
          dependencyType: (d.dependencyType ?? "FS") as "FS" | "SS" | "FF" | "SF",
          lagDays: d.lagDays ?? 0,
        }));

      toast.success("Dipendenza rimossa");
      triggerRescheduleWith(currentPreds);
    } catch {
      toast.error("Errore rimozione dipendenza");
    }
  }

  /** Drop da sidebar: apre il form di conferma pre-compilato con il task droppato */
  function handleDropDependency(droppedTaskId: string, direction: "pred" | "succ") {
    if (droppedTaskId === task.id) return;
    if (direction === "pred" && existingPredIds.has(droppedTaskId)) {
      toast.info("Dipendenza già presente");
      return;
    }
    if (direction === "succ" && existingSuccIds.has(droppedTaskId)) {
      toast.info("Dipendenza già presente");
      return;
    }

    // Pre-compila il form e mostralo per conferma
    resetAddForm();
    setNewDepTaskId(droppedTaskId);
    setNewDepType("FS");
    setNewDepLag(0);
    if (direction === "pred") {
      setShowAddPred(true);
    } else {
      setShowAddSucc(true);
    }
  }

  function resetAddForm() {
    setNewDepTaskId("");
    setNewDepType("FS");
    setNewDepLag(0);
    setShowAddPred(false);
    setShowAddSucc(false);
  }

  return (
    <div className="fixed right-0 top-0 h-full w-96 border-l border-border bg-card shadow-xl z-40 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-sm font-semibold">Dettaglio Task</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-5 p-4">
        {/* Titolo */}
        <div className="space-y-1.5">
          <Label className="text-xs">Titolo</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              if (title !== task.title) {
                onUpdate(task.id, { title });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>

        {/* Toggle completamento rapido */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const newStatus = task.status === "done" ? "todo" : "done";
              onUpdate(task.id, { status: newStatus });
            }}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors w-full justify-center",
              task.status === "done"
                ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
                : "border-border bg-background hover:bg-background-elevated text-foreground"
            )}
          >
            {task.status === "done" ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Completato
              </>
            ) : (
              "Segna come completato"
            )}
          </button>
        </div>

        {/* Descrizione */}
        <div className="space-y-1.5">
          <Label className="text-xs">Descrizione</Label>
          <Textarea
            key={task.id + "-desc"}
            placeholder="Descrivi cosa va fatto..."
            rows={3}
            className="text-xs resize-none"
            defaultValue={task.description ?? ""}
            onBlur={(e) => {
              const val = (e.target as HTMLTextAreaElement).value;
              if (val !== (task.description ?? "")) {
                onUpdate(task.id, { description: val || null });
              }
            }}
          />
        </div>

        {/* Stato + Priorità in row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Stato</Label>
            <Select
              value={task.status ?? "todo"}
              onValueChange={(v) => { if (v) onUpdate(task.id, { status: v }); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">Todo</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priorità</Label>
            <Select
              value={task.priority ?? "medium"}
              onValueChange={(v) => { if (v) onUpdate(task.id, { priority: v }); }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Esecuzione: Interno / Fornitore */}
        <div className="space-y-1.5">
          <Label className="text-xs">Esecuzione</Label>
          <div className="flex gap-2">
            <button
              type="button"
              className={cn(
                "flex-1 h-7 rounded-md border text-xs font-medium transition-colors",
                (task.executionMode ?? "internal") === "internal"
                  ? "border-pm-accent bg-pm-accent/10 text-pm-accent"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              )}
              onClick={() => onUpdate(task.id, { executionMode: "internal" })}
            >
              Interno
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 h-7 rounded-md border text-xs font-medium transition-colors",
                task.executionMode === "supplier"
                  ? "border-warning bg-warning/10 text-warning"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              )}
              onClick={() => onUpdate(task.id, { executionMode: "supplier" })}
            >
              Fornitore
            </button>
          </div>
        </div>

        {/* Date */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Inizio</Label>
            <Input
              type="date"
              value={task.startDate ?? ""}
              onChange={(e) =>
                onUpdate(task.id, { startDate: e.target.value || null })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fine</Label>
            <Input
              type="date"
              value={task.endDate ?? ""}
              onChange={(e) =>
                onUpdate(task.id, { endDate: e.target.value || null })
              }
            />
          </div>
        </div>

        {isScheduled ? (
          <div className="text-xs text-muted-foreground font-mono">
            {formatShortDate(start!)} → {formatShortDate(end!)} · {duration} giorni
          </div>
        ) : (
          <div className="text-xs text-warning/70 italic">
            Da schedulare — imposta le date per posizionare nel Gantt
          </div>
        )}

        {/* Orari intra-giornalieri (solo per task foglia) */}
        {!subtasks.length && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ora inizio</Label>
              <Input
                type="time"
                step="900"
                className="h-8 text-xs"
                value={task.startTime ?? ""}
                onChange={(e) =>
                  onUpdate(task.id, { startTime: e.target.value || null })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ora fine</Label>
              <Input
                type="time"
                step="900"
                className="h-8 text-xs"
                value={task.endTime ?? ""}
                onChange={(e) =>
                  onUpdate(task.id, { endTime: e.target.value || null })
                }
              />
            </div>
          </div>
        )}

        {/* Ore stimate → ricalcola endDate */}
        <div className="space-y-1.5">
          <Label className="text-xs">Ore stimate</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              className="h-8 w-24 text-xs"
              value={localHours}
              onChange={(e) => setLocalHours(e.target.value)}
              min={0}
              step={0.5}
              placeholder="—"
              onBlur={() => {
                const val = localHours ? Number(localHours) : null;
                const oldVal = task.estimatedHours ? Number(task.estimatedHours) : null;
                if (val !== oldVal) {
                  const updates: Record<string, unknown> = { estimatedHours: val };
                  if (val && val > 0 && task.startDate) {
                    updates.endDate = calculateEndFromHours(task.startDate, val);
                  }
                  onUpdate(task.id, updates);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            {localHours && Number(localHours) > 0 && (
              <span className="text-[10px] text-muted-foreground font-mono">
                = {Math.max(1, Math.ceil(Number(localHours) / 8))}g lav.
              </span>
            )}
          </div>
        </div>

        {/* Milestone */}
        <div className="space-y-1.5">
          <Label className="text-xs">Milestone</Label>
          <Select
            value={task.milestoneId ?? "__none__"}
            onValueChange={(v) => {
              if (v) onUpdate(task.id, { milestoneId: v === "__none__" ? null : v });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Nessuna" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Nessuna</SelectItem>
              {milestones.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.title} ({m.date})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Progresso */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Progresso: {localProgress}%</Label>
          </div>

          {/* Slider manuale — sempre visibile */}
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={localProgress}
            onChange={(e) => setLocalProgress(Number(e.target.value))}
            onPointerUp={() => {
              if (localProgress !== (task.progress ?? 0)) {
                onUpdate(task.id, { progress: localProgress });
              }
            }}
            className="w-full accent-[var(--primary)]"
          />

          {/* Barra auto dai sottotask — mostrata in aggiunta se ci sono sottotask */}
          {subtasks.length > 0 && (() => {
            const subtaskProgress = subtasks.length > 0
              ? Math.round(subtasks.reduce((sum, st) => sum + (st.progress ?? 0), 0) / subtasks.length)
              : 0;
            return (
              <div className="space-y-0.5">
                <span className="text-[10px] text-muted-foreground">
                  Auto dai sottotask: {subtaskProgress}%
                </span>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/50 transition-all"
                    style={{ width: `${subtaskProgress}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>

        {/* Note */}
        <div className="space-y-1.5">
          <Label className="text-xs">Note</Label>
          <Textarea
            placeholder="Appunti, link, riferimenti..."
            rows={2}
            className="text-xs resize-none"
            defaultValue={task.notes ?? ""}
            onBlur={(e) => {
              const val = (e.target as HTMLTextAreaElement).value;
              if (val !== (task.notes ?? "")) {
                onUpdate(task.id, { notes: val || null });
              }
            }}
          />
        </div>

        {/* Tag */}
        <div className="space-y-1.5">
          <Label className="text-xs">Tag</Label>
          <TagInput
            tags={taskTags}
            onChange={(newTags) => onUpdate(task.id, { tags: newTags })}
            suggestions={tagSuggestions}
            placeholder="Aggiungi tag..."
          />
        </div>

        {/* ═══════ COLLEGAMENTI (Task Links) ═══════ */}
        {(() => {
          const myLinks = taskLinks.filter((l) => l.sourceTaskId === task.id);
          if (myLinks.length === 0 && !onCreateTaskLink) return null;
          return (
            <div className="border-t border-border pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Collegamenti</span>
              </div>
              {myLinks.length > 0 && (
                <div className="space-y-1">
                  {myLinks.map((link) => {
                    const targetTask = tasks.find((t) => t.id === link.targetTaskId);
                    const lt = link.linkType as LinkType;
                    return (
                      <div
                        key={link.id}
                        className="flex items-center gap-2 text-xs bg-background-elevated rounded px-2 py-1.5"
                      >
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", LINK_TYPE_COLORS[lt])}>
                          {LINK_TYPE_LABELS[lt]}
                        </span>
                        {targetTask ? (
                          <button
                            className="truncate hover:text-primary transition-colors text-left flex-1"
                            onClick={() => onSelectTask(targetTask.id)}
                          >
                            {targetTask.title}
                          </button>
                        ) : (
                          <span className="text-muted-foreground italic flex-1">Task esterno</span>
                        )}
                        {onDeleteTaskLink && (
                          <button
                            onClick={() => onDeleteTaskLink(link.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {onCreateTaskLink && (
                <AddTaskLinkForm
                  taskId={task.id}
                  tasks={tasks}
                  existingLinkIds={new Set(myLinks.map((l) => l.targetTaskId))}
                  onCreateLink={onCreateTaskLink}
                  onContinueTask={onContinueTask}
                />
              )}
            </div>
          );
        })()}

        {/* ═══════ PARENT + SOTTOTASK ═══════ */}
        <div className="border-t border-border pt-4 space-y-3">
          {/* Link al parent */}
          {parentTask && (
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Task padre</span>
              <button
                className="flex items-center gap-2 text-xs bg-background-elevated rounded px-2 py-1.5 w-full text-left hover:bg-muted transition-colors"
                onClick={() => onSelectTask(parentTask.id)}
              >
                <span className="text-muted-foreground">↑</span>
                <span className="truncate">{parentTask.title}</span>
              </button>
            </div>
          )}

          {/* Sottotask */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sottotask ({subtasks.length})
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setShowAddSubtask(!showAddSubtask)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {subtasks.length === 0 && !showAddSubtask && (
              <p className="text-[11px] text-muted-foreground italic">Nessun sottotask</p>
            )}

            {subtasks.map((st) => (
              <button
                key={st.id}
                className="flex items-center gap-2 text-xs bg-background-elevated rounded px-2 py-1.5 w-full text-left hover:bg-muted transition-colors group"
                onClick={() => onSelectTask(st.id)}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    st.status === "done" ? "bg-success" :
                    st.status === "blocked" ? "bg-critical" :
                    st.status === "in_progress" ? "bg-pm-accent" :
                    "bg-muted-foreground"
                  )}
                />
                <span className={cn("truncate flex-1", st.status === "done" && "line-through text-muted-foreground")}>
                  {st.title}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {st.progress ?? 0}%
                </span>
              </button>
            ))}

            {/* Banner mismatch ore padre/sottotask — solo per task schedulati */}
            {subtasks.length > 0 && isScheduled && (() => {
              const workloadTasks: WorkloadTask[] = tasks
                .filter((t) => t.startDate && t.endDate)
                .map((t) => ({
                  id: t.id,
                  title: t.title,
                  parentTaskId: t.parentTaskId,
                  startDate: t.startDate!,
                  endDate: t.endDate!,
                  status: t.status,
                  priority: t.priority,
                  estimatedHours: t.estimatedHours,
                  executionMode: t.executionMode,
                  projectId: t.projectId,
                  sortOrder: t.sortOrder,
                }));
              const mismatches = detectHoursMismatch(workloadTasks);
              const mismatch = mismatches.find((m) => m.parentTaskId === task.id);
              if (!mismatch) return null;

              const subtaskHoursTotal = subtasks
                .filter((s) => s.status !== "done")
                .reduce((sum, s) => sum + (s.estimatedHours ? parseFloat(s.estimatedHours) : 0), 0);
              const parentWorkdays = countWorkdays(task.startDate!, task.endDate!);

              return (
                <div className={cn(
                  "rounded-md border p-2.5 space-y-2 text-xs",
                  mismatch.severity === "critical"
                    ? "border-critical/30 bg-critical/5"
                    : mismatch.severity === "warning"
                    ? "border-warning/30 bg-warning/5"
                    : "border-border bg-muted/30"
                )}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn(
                      "h-3.5 w-3.5 shrink-0 mt-0.5",
                      mismatch.severity === "critical" ? "text-critical" : "text-warning"
                    )} />
                    <div className="space-y-1 flex-1">
                      <p className="font-medium">Le tempistiche non tornano</p>
                      <p className="text-muted-foreground">
                        Sottotask: <span className="font-mono">{subtaskHoursTotal}h</span> richieste
                        {" · "}
                        Padre: <span className="font-mono">{parentWorkdays}g × 8h = {parentWorkdays * 8}h</span> disponibili
                        {" · "}
                        Deficit: <span className="font-mono text-critical">{Math.ceil(mismatch.deficit)}h</span>
                      </p>
                      {mismatch.subtasksWithoutHours.length > 0 && (
                        <p className="text-muted-foreground/70">
                          {mismatch.subtasksWithoutHours.length} sottotask senza ore stimate
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5"
                    onClick={async () => {
                      setOptimizeOpen(true);
                      setOptimizeLoading(true);
                      setOptimizePreview(null);
                      try {
                        const res = await fetch(`/api/tasks/${task.id}/optimize?preview=true`, { method: "POST" });
                        if (!res.ok) {
                          const err = await res.json();
                          throw new Error(err.error ?? "Errore");
                        }
                        const json = await res.json();
                        setOptimizePreview(json.data);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Errore preview");
                        setOptimizeOpen(false);
                      } finally {
                        setOptimizeLoading(false);
                      }
                    }}
                  >
                    <Zap className="h-3 w-3" />
                    Ottimizza tempistiche
                  </Button>
                </div>
              );
            })()}

            {/* Form aggiungi sottotask */}
            {showAddSubtask && (
              <div className="flex gap-1.5">
                <Input
                  value={subtaskTitle}
                  onChange={(e) => setSubtaskTitle(e.target.value)}
                  placeholder="Nome sottotask..."
                  className="h-7 text-xs flex-1"
                  autoFocus
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && subtaskTitle.trim()) {
                      try {
                        await onCreateSubtask({
                          parentTaskId: task.id,
                          title: subtaskTitle.trim(),
                          startDate: task.startDate ?? new Date().toISOString().split("T")[0]!,
                          endDate: task.endDate ?? new Date().toISOString().split("T")[0]!,
                        });
                        setSubtaskTitle("");
                        toast.success("Sottotask creato");
                      } catch {
                        toast.error("Errore creazione sottotask");
                      }
                    }
                    if (e.key === "Escape") {
                      setShowAddSubtask(false);
                      setSubtaskTitle("");
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-7 text-xs px-2"
                  disabled={!subtaskTitle.trim()}
                  onClick={async () => {
                    if (!subtaskTitle.trim()) return;
                    try {
                      await onCreateSubtask({
                        parentTaskId: task.id,
                        title: subtaskTitle.trim(),
                        startDate: task.startDate ?? new Date().toISOString().split("T")[0]!,
                        endDate: task.endDate ?? new Date().toISOString().split("T")[0]!,
                      });
                      setSubtaskTitle("");
                      toast.success("Sottotask creato");
                    } catch {
                      toast.error("Errore creazione sottotask");
                    }
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ═══════ DIPENDENZE ═══════ */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-xs font-semibold uppercase tracking-wider">Dipendenze</Label>
          </div>

          {/* Suggerimento rischedula — solo per task schedulati */}
          {rescheduleSuggestion && isScheduled && (
            <div className="space-y-1.5">
              <ScheduleSuggestionBanner
                suggestion={rescheduleSuggestion}
                isLoading={rescheduleLoading}
                currentStartDate={task.startDate!}
                currentEndDate={task.endDate!}
                onAccept={async (s, e) => {
                  if (onMoveTask) {
                    await onMoveTask(task.id, s, e);
                    resetReschedule();
                  }
                }}
                tasks={tasks}
              />
            </div>
          )}
          {rescheduleLoading && !rescheduleSuggestion && isScheduled && (
            <ScheduleSuggestionBanner
              suggestion={null}
              isLoading={true}
              currentStartDate={task.startDate!}
              currentEndDate={task.endDate!}
              onAccept={() => {}}
              tasks={tasks}
            />
          )}

          {/* Predecessori — drop zone */}
          <div
            className={cn(
              "space-y-1.5 rounded-lg p-2.5 -m-2.5 min-h-[60px] transition-all border-2 border-transparent",
              dragOverZone === "pred"
                ? "border-pm-accent/50 bg-pm-accent/5 border-dashed"
                : "border-transparent"
            )}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-task-id")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "link";
                setDragOverZone("pred");
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverZone(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverZone(null);
              const taskId = e.dataTransfer.getData("application/x-task-id");
              if (taskId) handleDropDependency(taskId, "pred");
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Predecessori (questo task dipende da...)
                {dragOverZone === "pred" && (
                  <span className="text-pm-accent ml-1">← rilascia qui</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => { resetAddForm(); setShowAddPred(true); }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {predecessors.length === 0 && !showAddPred && !dragOverZone && (
              <p className="text-[11px] text-muted-foreground italic">Nessun predecessore</p>
            )}

            {predecessors.map(({ dep, task: predTask }) => (
              <button
                key={dep.id}
                className="flex items-center gap-2 text-xs bg-background-elevated rounded px-2 py-1.5 group w-full text-left hover:bg-muted transition-colors"
                onClick={() => predTask && onSelectTask(predTask.id)}
              >
                <span className="font-mono text-pm-accent font-medium w-6 shrink-0">
                  {dep.dependencyType}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 hover:underline">
                  {predTask?.title ?? "???"}
                </span>
                {dep.lagDays !== 0 && dep.lagDays != null && (
                  <span className="text-warning shrink-0">+{dep.lagDays}g</span>
                )}
                <span
                  role="button"
                  className="h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 shrink-0 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleDeleteDep(dep.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </button>
            ))}

            {/* Form aggiungi predecessore — tree picker */}
            {showAddPred && (
              <AddDependencyTreeForm
                tasks={tasks}
                excludeIds={new Set([task.id, ...existingPredIds])}
                depType={newDepType}
                onDepTypeChange={setNewDepType}
                lagDays={newDepLag}
                onLagChange={setNewDepLag}
                onSelect={(taskId) => {
                  setNewDepTaskId(taskId);
                  // Auto-confirm: seleziona task e conferma in un colpo
                  setNewDepTaskId(taskId);
                }}
                onConfirm={() => handleAddDependency("pred")}
                onCancel={resetAddForm}
                selectedTaskId={newDepTaskId}
              />
            )}
          </div>

          {/* Successori — drop zone */}
          <div
            className={cn(
              "space-y-1.5 rounded-lg p-2.5 -m-2.5 min-h-[60px] transition-all border-2 border-transparent",
              dragOverZone === "succ"
                ? "border-pm-accent/50 bg-pm-accent/5 border-dashed"
                : "border-transparent"
            )}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("application/x-task-id")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "link";
                setDragOverZone("succ");
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDragOverZone(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverZone(null);
              const taskId = e.dataTransfer.getData("application/x-task-id");
              if (taskId) handleDropDependency(taskId, "succ");
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Successori (dipendono da questo task)
                {dragOverZone === "succ" && (
                  <span className="text-pm-accent ml-1">← rilascia qui</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => { resetAddForm(); setShowAddSucc(true); }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {successors.length === 0 && !showAddSucc && !dragOverZone && (
              <p className="text-[11px] text-muted-foreground italic">Nessun successore</p>
            )}

            {successors.map(({ dep, task: succTask }) => (
              <button
                key={dep.id}
                className="flex items-center gap-2 text-xs bg-background-elevated rounded px-2 py-1.5 group w-full text-left hover:bg-muted transition-colors"
                onClick={() => succTask && onSelectTask(succTask.id)}
              >
                <span className="font-mono text-pm-accent font-medium w-6 shrink-0">
                  {dep.dependencyType}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate flex-1 hover:underline">
                  {succTask?.title ?? "???"}
                </span>
                {dep.lagDays !== 0 && dep.lagDays != null && (
                  <span className="text-warning shrink-0">+{dep.lagDays}g</span>
                )}
                <span
                  role="button"
                  className="h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 shrink-0 text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); handleDeleteDep(dep.id); }}
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </button>
            ))}

            {/* Form aggiungi successore — tree picker */}
            {showAddSucc && (
              <AddDependencyTreeForm
                tasks={tasks}
                excludeIds={new Set([task.id, ...existingSuccIds])}
                depType={newDepType}
                onDepTypeChange={setNewDepType}
                lagDays={newDepLag}
                onLagChange={setNewDepLag}
                onSelect={(taskId) => setNewDepTaskId(taskId)}
                onConfirm={() => handleAddDependency("succ")}
                onCancel={resetAddForm}
                selectedTaskId={newDepTaskId}
              />
            )}
          </div>
        </div>

        {/* ═══════ ELIMINA TASK ═══════ */}
        <div className="border-t border-border pt-4">
          <Button
            variant="ghost"
            className="w-full h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Elimina task
          </Button>
        </div>
      </div>

      {/* Dialog conferma eliminazione */}
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        task={task}
        tasks={tasks}
        dependencies={dependencies}
        deleting={deleting}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDeleteTask(task.id);
            setShowDeleteConfirm(false);
            onClose();
            toast.success("Task eliminato");
          } catch {
            toast.error("Errore nell'eliminazione");
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* Dialog preview ottimizzazione */}
      <OptimizePreviewDialog
        open={optimizeOpen}
        onOpenChange={setOptimizeOpen}
        preview={optimizePreview}
        isLoading={optimizeLoading}
        title={`Ottimizza "${task.title}"`}
        onConfirm={async () => {
          try {
            const res = await fetch(`/api/tasks/${task.id}/optimize`, { method: "POST" });
            if (!res.ok) throw new Error("Errore applicazione");
            const json = await res.json();
            toast.success(`${json.data.stats.totalTasksChanged} task ottimizzati`);
            if (onMutate) await onMutate();
          } catch {
            toast.error("Errore nell'applicazione dell'ottimizzazione");
          }
        }}
      />
    </div>
  );
}

/** Dialog di conferma eliminazione con analisi impatto */
function DeleteConfirmDialog({
  open,
  onOpenChange,
  task,
  tasks,
  dependencies,
  deleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task;
  tasks: Task[];
  dependencies: Dependency[];
  deleting: boolean;
  onConfirm: () => void;
}) {
  // Analisi impatto
  const subtasks = tasks.filter((t) => t.parentTaskId === task.id);
  const allDescendants = getAllDescendants(task.id, tasks);
  const hasSubtasks = subtasks.length > 0;

  // Dipendenze che verranno rimosse (incluso quelle dei discendenti)
  const affectedTaskIds = new Set([task.id, ...allDescendants.map((t) => t.id)]);
  const affectedDeps = dependencies.filter(
    (d) => affectedTaskIds.has(d.predecessorId) || affectedTaskIds.has(d.successorId)
  );

  // Task che perderanno un predecessore (non inclusi nella cancellazione)
  const orphanedSuccessors = affectedDeps
    .filter((d) => affectedTaskIds.has(d.predecessorId) && !affectedTaskIds.has(d.successorId))
    .map((d) => tasks.find((t) => t.id === d.successorId))
    .filter(Boolean) as Task[];

  // Task che perderanno un successore
  const orphanedPredecessors = affectedDeps
    .filter((d) => affectedTaskIds.has(d.successorId) && !affectedTaskIds.has(d.predecessorId))
    .map((d) => tasks.find((t) => t.id === d.predecessorId))
    .filter(Boolean) as Task[];

  const parentTask = task.parentTaskId
    ? tasks.find((t) => t.id === task.parentTaskId)
    : null;

  const hasImpact =
    hasSubtasks ||
    affectedDeps.length > 0 ||
    parentTask != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Elimina task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">
            Stai per eliminare <strong>&quot;{task.title}&quot;</strong>.
            {!hasImpact && " Questa azione è irreversibile."}
          </p>

          {hasImpact && (
            <div className="space-y-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-xs font-semibold text-destructive uppercase tracking-wider">
                Impatto eliminazione
              </p>

              {/* Sottotask che verranno cancellati */}
              {hasSubtasks && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">
                    {allDescendants.length} sottotask verranno eliminati:
                  </p>
                  <ul className="space-y-0.5">
                    {allDescendants.slice(0, 5).map((st) => (
                      <li
                        key={st.id}
                        className="text-xs text-muted-foreground flex items-center gap-1.5 pl-2"
                      >
                        <span className="h-1 w-1 rounded-full bg-destructive shrink-0" />
                        {st.title}
                      </li>
                    ))}
                    {allDescendants.length > 5 && (
                      <li className="text-xs text-muted-foreground pl-2">
                        ...e altri {allDescendants.length - 5}
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {/* Dipendenze che si rompono */}
              {orphanedSuccessors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">
                    {orphanedSuccessors.length} task perderanno un predecessore:
                  </p>
                  <ul className="space-y-0.5">
                    {orphanedSuccessors.slice(0, 5).map((t) => (
                      <li
                        key={t.id}
                        className="text-xs text-muted-foreground flex items-center gap-1.5 pl-2"
                      >
                        <span className="h-1 w-1 rounded-full bg-warning shrink-0" />
                        {t.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {orphanedPredecessors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">
                    {orphanedPredecessors.length} task perderanno un successore:
                  </p>
                  <ul className="space-y-0.5">
                    {orphanedPredecessors.slice(0, 3).map((t) => (
                      <li
                        key={t.id}
                        className="text-xs text-muted-foreground flex items-center gap-1.5 pl-2"
                      >
                        <span className="h-1 w-1 rounded-full bg-warning shrink-0" />
                        {t.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Parent che verrà ricalcolato */}
              {parentTask && (
                <p className="text-xs text-muted-foreground">
                  Il progresso di &quot;{parentTask.title}&quot; verrà ricalcolato.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={deleting}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={onConfirm}
              disabled={deleting}
            >
              {deleting ? "Eliminazione..." : "Elimina"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Raccoglie ricorsivamente tutti i discendenti di un task */
function getAllDescendants(taskId: string, tasks: Task[]): Task[] {
  const children = tasks.filter((t) => t.parentTaskId === taskId);
  const result: Task[] = [...children];
  for (const child of children) {
    result.push(...getAllDescendants(child.id, tasks));
  }
  return result;
}

/** Form inline per aggiungere un collegamento o continuare un task */
function AddTaskLinkForm({
  taskId,
  tasks: allTasks,
  existingLinkIds,
  onCreateLink,
  onContinueTask,
}: {
  taskId: string;
  tasks: Task[];
  existingLinkIds: Set<string>;
  onCreateLink: (data: { sourceTaskId: string; targetTaskId: string; linkType: string }) => Promise<void>;
  onContinueTask?: (data: { id: string; targetParentTaskId: string; title?: string }) => Promise<unknown>;
}) {
  const [mode, setMode] = useState<null | "link" | "continue">(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [linkType, setLinkType] = useState<string>("related_to");

  const parentTasks = allTasks.filter(
    (t) => t.id !== taskId && !t.parentTaskId && !existingLinkIds.has(t.id)
  );
  const linkableTasks = allTasks.filter(
    (t) => t.id !== taskId && !existingLinkIds.has(t.id)
  );

  if (!mode) {
    return (
      <div className="flex gap-1">
        <button
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          onClick={() => setMode("link")}
        >
          <Link2 className="h-3 w-3" />
          Collega
        </button>
        {onContinueTask && (
          <button
            className="flex items-center gap-1 text-[11px] text-blue-400 hover:underline ml-2"
            onClick={() => setMode("continue")}
          >
            <ArrowRight className="h-3 w-3" />
            Continua in...
          </button>
        )}
      </div>
    );
  }

  if (mode === "continue") {
    return (
      <div className="space-y-2 bg-background-elevated rounded p-2">
        <span className="text-[11px] font-medium">Scegli il task padre di destinazione</span>
        <TaskPicker
          tasks={parentTasks}
          onSelect={(id) => setSelectedTaskId(id)}

          excludeIds={new Set([taskId])}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[11px]"
            onClick={() => { setMode(null); setSelectedTaskId(null); }}
          >
            Annulla
          </Button>
          <Button
            size="sm"
            className="h-6 text-[11px]"
            disabled={!selectedTaskId}
            onClick={async () => {
              if (!selectedTaskId || !onContinueTask) return;
              try {
                await onContinueTask({ id: taskId, targetParentTaskId: selectedTaskId });
                toast.success("Task di continuazione creato");
                setMode(null);
                setSelectedTaskId(null);
              } catch {
                toast.error("Errore nella continuazione");
              }
            }}
          >
            Crea continuazione
          </Button>
        </div>
      </div>
    );
  }

  // mode === "link"
  return (
    <div className="space-y-2 bg-background-elevated rounded p-2">
      <div className="flex gap-2">
        <Select value={linkType} onValueChange={(v) => { if (v) setLinkType(v); }}>
          <SelectTrigger className="h-6 text-[11px] w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="related_to">Correlato</SelectItem>
            <SelectItem value="continues_in">Continua in</SelectItem>
            <SelectItem value="continued_from">Continuato da</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <TaskPicker
        tasks={linkableTasks}
        onSelect={(id) => setSelectedTaskId(id)}
        excludeIds={new Set([taskId])}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[11px]"
          onClick={() => { setMode(null); setSelectedTaskId(null); }}
        >
          Annulla
        </Button>
        <Button
          size="sm"
          className="h-6 text-[11px]"
          disabled={!selectedTaskId}
          onClick={async () => {
            if (!selectedTaskId) return;
            try {
              await onCreateLink({
                sourceTaskId: taskId,
                targetTaskId: selectedTaskId,
                linkType,
              });
              toast.success("Collegamento creato");
              setMode(null);
              setSelectedTaskId(null);
            } catch {
              toast.error("Errore nella creazione del collegamento");
            }
          }}
        >
          Collega
        </Button>
      </div>
    </div>
  );
}

/** Form per aggiungere dipendenza con tree picker ricercabile */
function AddDependencyTreeForm({
  tasks: allTasks,
  excludeIds,
  depType,
  onDepTypeChange,
  lagDays,
  onLagChange,
  onSelect,
  onConfirm,
  onCancel,
  selectedTaskId,
}: {
  tasks: Task[];
  excludeIds: Set<string>;
  depType: string;
  onDepTypeChange: (type: string) => void;
  lagDays: number;
  onLagChange: (days: number) => void;
  onSelect: (taskId: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  selectedTaskId: string;
}) {
  const selectedTask = allTasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="space-y-2 rounded-md border border-border bg-background p-2">
      {/* Task selezionato */}
      {selectedTask ? (
        <div className="flex items-center gap-2 px-2 py-1 rounded bg-pm-accent/10 border border-pm-accent/20 text-xs">
          <Check className="h-3 w-3 text-pm-accent shrink-0" />
          <span className="truncate flex-1 font-medium">{selectedTask.title}</span>
          <button
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onSelect("")}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <TaskPicker
          tasks={allTasks}
          excludeIds={excludeIds}
          onSelect={onSelect}
          placeholder="Cerca task..."
        />
      )}

      {/* Tipo + Lag */}
      <div className="flex gap-2">
        <Select value={depType} onValueChange={(v) => { if (v) onDepTypeChange(v); }}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="FS">FS (Finish→Start)</SelectItem>
            <SelectItem value="SS">SS (Start→Start)</SelectItem>
            <SelectItem value="FF">FF (Finish→Finish)</SelectItem>
            <SelectItem value="SF">SF (Start→Finish)</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={lagDays}
            onChange={(e) => onLagChange(Number(e.target.value))}
            className="h-7 w-16 text-xs"
            min={0}
          />
          <span className="text-[10px] text-muted-foreground">lag</span>
        </div>
      </div>

      {/* Bottoni */}
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-7 text-xs flex-1"
          onClick={onConfirm}
          disabled={!selectedTaskId}
        >
          Aggiungi
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onCancel}
        >
          Annulla
        </Button>
      </div>
    </div>
  );
}
