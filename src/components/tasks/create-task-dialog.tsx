/* create-task-dialog.tsx — Dialog completo per creazione task. Auto-scheduling: suggerisce date ottimali in base a dipendenze, parent, milestone, carico. */
"use client";

import { useState, useEffect, useCallback } from "react";
import type { Task, Milestone } from "@/db/schema";
import type { PredecessorDep } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useAutoSchedule } from "@/hooks/use-auto-schedule";
import { ScheduleSuggestionBanner } from "./schedule-suggestion-banner";
import { TaskPicker } from "./task-picker";
import { calculateEndFromHours } from "@/lib/task-defaults";

interface CreateTaskDialogProps {
  projectId: string;
  tasks: Task[];
  milestones: Milestone[];
  onCreate: (data: Record<string, unknown>) => Promise<unknown>;
  onCreateDependency?: (data: {
    predecessorId: string;
    successorId: string;
    dependencyType: string;
    lagDays: number;
  }) => Promise<unknown>;
  onMutate: () => Promise<unknown>;
  onSelectTask?: (taskId: string) => void;
}

const TASK_TYPES = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "database", label: "Database" },
  { value: "api", label: "API" },
  { value: "design", label: "Design" },
  { value: "testing", label: "Testing" },
  { value: "devops", label: "DevOps" },
  { value: "documentation", label: "Docs" },
  { value: "bug_fix", label: "Bug Fix" },
  { value: "feature", label: "Feature" },
  { value: "refactoring", label: "Refactoring" },
  { value: "research", label: "Research" },
  { value: "meeting", label: "Meeting" },
  { value: "setup", label: "Setup" },
  { value: "deployment", label: "Deploy" },
  { value: "altro", label: "Altro" },
];

export function CreateTaskDialog({
  projectId,
  tasks,
  milestones,
  onCreate,
  onCreateDependency,
  onMutate,
  onSelectTask,
}: CreateTaskDialogProps) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("feature");
  const [priority, setPriority] = useState("medium");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]!
  );
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    return d.toISOString().split("T")[0]!;
  });
  const [parentTaskId, setParentTaskId] = useState<string | null>(null);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [estimatedHours, setEstimatedHours] = useState("");
  const [notes, setNotes] = useState("");
  const [executionMode, setExecutionMode] = useState<"internal" | "supplier">("internal");

  // Predecessori
  const [predecessorDeps, setPredecessorDeps] = useState<PredecessorDep[]>([]);
  const [addingPred, setAddingPred] = useState(false);
  const [newPredId, setNewPredId] = useState<string | null>(null);
  const [newPredType, setNewPredType] = useState<"FS" | "SS" | "FF" | "SF">("FS");
  const [newPredLag, setNewPredLag] = useState(0);

  // Auto-schedule
  const { suggestion, isLoading: scheduleLoading, trigger: triggerSchedule, reset: resetSchedule } =
    useAutoSchedule(projectId);

  // Trigger auto-schedule quando cambiano i parametri rilevanti
  const doTrigger = useCallback(() => {
    triggerSchedule({
      taskType,
      estimatedHours: estimatedHours ? Number(estimatedHours) : null,
      parentTaskId,
      milestoneId,
      predecessorDeps,
    });
  }, [triggerSchedule, taskType, estimatedHours, parentTaskId, milestoneId, predecessorDeps]);

  useEffect(() => {
    if (open) doTrigger();
  }, [open, doTrigger]);

  // ── Auto-compute endDate quando ore stimate o startDate cambiano ──
  useEffect(() => {
    const hours = Number(estimatedHours);
    if (hours > 0 && startDate) {
      setEndDate(calculateEndFromHours(startDate, hours));
    }
  }, [estimatedHours, startDate]);

  // ── Auto-apply suggestion start quando ci sono vincoli da dipendenze ──
  useEffect(() => {
    if (!suggestion || !open) return;
    const hasDep = suggestion.constraints.some((c) => c.type === "dependency");
    if (hasDep) {
      // Applica automaticamente la data di inizio suggerita
      setStartDate(suggestion.suggestedStartDate);
      // Se non ci sono ore stimate, applica anche la data di fine suggerita
      if (!estimatedHours || Number(estimatedHours) <= 0) {
        setEndDate(suggestion.suggestedEndDate);
      }
      // Se ci sono ore, endDate sarà ricalcolato dall'effetto sopra
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion]);

  // Solo task di primo livello come possibili parent
  const topLevelTasks = tasks.filter((t) => !t.parentTaskId);

  // Task disponibili come predecessori (escluso i già selezionati)
  const selectedPredIds = new Set(predecessorDeps.map((d) => d.predecessorId));
  const availablePredTasks = tasks.filter((t) => !selectedPredIds.has(t.id));

  function resetForm() {
    setTitle("");
    setDescription("");
    setTaskType("feature");
    setPriority("medium");
    setStartDate(new Date().toISOString().split("T")[0]!);
    const d = new Date();
    d.setDate(d.getDate() + 4);
    setEndDate(d.toISOString().split("T")[0]!);
    setParentTaskId(null);
    setMilestoneId(null);
    setEstimatedHours("");
    setNotes("");
    setExecutionMode("internal");
    setPredecessorDeps([]);
    setAddingPred(false);
    setNewPredId(null);
    setNewPredType("FS");
    setNewPredLag(0);
    resetSchedule();
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    try {
      const result = await onCreate({
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        taskType,
        priority,
        startDate,
        endDate,
        parentTaskId: parentTaskId || undefined,
        milestoneId: milestoneId || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        executionMode,
        notes: notes.trim() || undefined,
      });
      // Crea le dipendenze se presenti
      const newTask = result as { data?: { id?: string } } | undefined;
      const newTaskId = newTask?.data?.id;
      if (newTaskId && predecessorDeps.length > 0 && onCreateDependency) {
        for (const dep of predecessorDeps) {
          await onCreateDependency({
            predecessorId: dep.predecessorId,
            successorId: newTaskId,
            dependencyType: dep.dependencyType,
            lagDays: dep.lagDays,
          });
        }
      }

      await onMutate();
      setOpen(false);
      resetForm();
      toast.success("Task creato");

      // Apri il detail panel del task appena creato
      if (newTaskId && onSelectTask) {
        onSelectTask(newTaskId);
      }
    } catch {
      toast.error("Errore nella creazione");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Task
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuovo Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto">
          {/* Titolo */}
          <div className="space-y-1.5">
            <Label className="text-xs">Titolo *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es: Implementa login page"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) handleCreate();
              }}
            />
          </div>

          {/* Descrizione */}
          <div className="space-y-1.5">
            <Label className="text-xs">Descrizione</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cosa va fatto..."
            />
          </div>

          {/* Tipo + Priorità */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={taskType} onValueChange={(v) => { if (v) setTaskType(v); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Priorità</Label>
              <Select value={priority} onValueChange={(v) => { if (v) setPriority(v); }}>
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
                  "flex-1 h-8 rounded-md border text-xs font-medium transition-colors",
                  executionMode === "internal"
                    ? "border-pm-accent bg-pm-accent/10 text-pm-accent"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
                onClick={() => setExecutionMode("internal")}
              >
                Interno
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 h-8 rounded-md border text-xs font-medium transition-colors",
                  executionMode === "supplier"
                    ? "border-warning bg-warning/10 text-warning"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                )}
                onClick={() => setExecutionMode("supplier")}
              >
                Fornitore
              </button>
            </div>
            {executionMode === "supplier" && (
              <p className="text-[10px] text-muted-foreground">
                I task fornitore non vengono conteggiati nel carico di lavoro e non vengono traslati dall&apos;ottimizzatore.
              </p>
            )}
          </div>

          {/* Ore stimate → calcolo automatico durata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Ore stimate</Label>
              <Input
                type="number"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="Es: 24"
                min={0}
                step={0.5}
              />
            </div>
            {Number(estimatedHours) > 0 && (
              <div className="flex items-end pb-1">
                <span className="text-xs text-muted-foreground font-mono">
                  {Number(estimatedHours)}h → {Math.max(1, Math.ceil(Number(estimatedHours) / 8))}g lavorativi
                </span>
              </div>
            )}
          </div>

          {/* Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">
                Data inizio *
                {predecessorDeps.length > 0 && suggestion && (
                  <span className="text-[10px] text-pm-accent ml-1 font-normal">auto da dipendenza</span>
                )}
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                Data fine *
                {Number(estimatedHours) > 0 && (
                  <span className="text-[10px] text-pm-accent ml-1 font-normal">calcolata da ore</span>
                )}
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          {/* Parent task (sottotask di...) */}
          <div className="space-y-1.5">
            <Label className="text-xs">Sottotask di</Label>
            <Select
              value={parentTaskId ?? "__none__"}
              onValueChange={(v) => setParentTaskId(v === "__none__" ? null : v ?? null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nessuno (task principale)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessuno (task principale)</SelectItem>
                {topLevelTasks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Milestone */}
          <div className="space-y-1.5">
            <Label className="text-xs">Milestone</Label>
            <Select
              value={milestoneId ?? "__none__"}
              onValueChange={(v) => setMilestoneId(v === "__none__" ? null : v ?? null)}
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

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note aggiuntive..."
            />
          </div>

          {/* Auto-schedule suggestion */}
          <ScheduleSuggestionBanner
            suggestion={suggestion}
            isLoading={scheduleLoading}
            currentStartDate={startDate}
            currentEndDate={endDate}
            onAccept={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
            tasks={tasks}
          />

          {/* Predecessori */}
          <div className="space-y-1.5">
            <Label className="text-xs">Predecessori (dipendenze)</Label>

            {/* Lista predecessori aggiunti */}
            {predecessorDeps.length > 0 && (
              <div className="space-y-1">
                {predecessorDeps.map((dep) => {
                  const predTask = tasks.find((t) => t.id === dep.predecessorId);
                  return (
                    <div
                      key={dep.predecessorId}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-background-elevated text-xs"
                    >
                      <Check className="h-3 w-3 text-pm-accent shrink-0" />
                      <span className="truncate flex-1">
                        {predTask?.title ?? dep.predecessorId.slice(0, 8)}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {dep.dependencyType}
                        {dep.lagDays !== 0 && ` +${dep.lagDays}g`}
                      </span>
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setPredecessorDeps((prev) =>
                            prev.filter((d) => d.predecessorId !== dep.predecessorId)
                          );
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Form aggiunta predecessore — tree picker */}
            {addingPred ? (
              <div className="space-y-2 rounded-md border border-border bg-background p-2">
                {/* Task selezionato */}
                {newPredId ? (
                  <div className="flex items-center gap-2 px-2 py-1 rounded bg-pm-accent/10 border border-pm-accent/20 text-xs">
                    <Check className="h-3 w-3 text-pm-accent shrink-0" />
                    <span className="truncate flex-1 font-medium">
                      {tasks.find((t) => t.id === newPredId)?.title ?? ""}
                    </span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setNewPredId(null)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <TaskPicker
                    tasks={tasks}
                    excludeIds={selectedPredIds}
                    onSelect={(id) => setNewPredId(id)}
                    placeholder="Cerca task..."
                  />
                )}

                {/* Tipo + Lag */}
                <div className="flex gap-2">
                  <Select
                    value={newPredType}
                    onValueChange={(v) => { if (v) setNewPredType(v as "FS" | "SS" | "FF" | "SF"); }}
                  >
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
                      value={newPredLag}
                      onChange={(e) => setNewPredLag(Number(e.target.value))}
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
                    disabled={!newPredId}
                    onClick={() => {
                      if (!newPredId) return;
                      setPredecessorDeps((prev) => [
                        ...prev,
                        {
                          predecessorId: newPredId,
                          dependencyType: newPredType,
                          lagDays: newPredLag,
                        },
                      ]);
                      setNewPredId(null);
                      setNewPredType("FS");
                      setNewPredLag(0);
                      setAddingPred(false);
                    }}
                  >
                    Aggiungi
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setAddingPred(false);
                      setNewPredId(null);
                    }}
                  >
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setAddingPred(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Aggiungi predecessore
              </Button>
            )}
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            onClick={handleCreate}
            disabled={!title.trim() || !startDate || !endDate || creating}
          >
            {creating ? "Creazione..." : "Crea Task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
