/* page.tsx — Pagina progetto con 3 viste (Gantt/Board/List), creazione task, suggerimenti. */
"use client";

import { useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useProject } from "@/hooks/use-projects";
import { useProjectTasks } from "@/hooks/use-tasks";
import { useDependencies } from "@/hooks/use-dependencies";
import { useMilestones } from "@/hooks/use-milestones";
import { useSuggestions } from "@/hooks/use-suggestions";
import { GanttChart } from "@/components/gantt/gantt-chart";
import { TaskDetailPanel } from "@/components/gantt/task-detail-panel";
import { BoardView } from "@/components/board/board-view";
import { ListView } from "@/components/list/list-view";
import { SuggestionsPanel } from "@/components/suggestions/suggestions-panel";
import { MilestoneSection } from "@/components/milestones/milestone-section";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { OptimizePreviewDialog } from "@/components/tasks/optimize-preview-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import type { OptimizeProjectResult } from "@/lib/workload-optimizer";

type ViewType = "gantt" | "board" | "list";

export default function ProjectPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;

  const { project, isLoading: projectLoading } = useProject(projectId);
  const {
    tasks,
    dependencies,
    mutate: mutateTasks,
    updateTask,
    deleteTask,
    moveTask,
    createTask,
    reorderTasks,
  } = useProjectTasks(projectId);
  const { createDependency, deleteDependency } = useDependencies(projectId);
  const {
    milestones,
    mutate: mutateMilestones,
    createMilestone,
    updateMilestone,
    deleteMilestone,
  } = useMilestones(projectId);
  const { suggestions } = useSuggestions(projectId);

  const initialView = (searchParams.get("view") as ViewType) || "gantt";
  const [view, setView] = useState<ViewType>(initialView);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Optimize state
  const [optimizeOpen, setOptimizeOpen] = useState(false);
  const [optimizePreview, setOptimizePreview] = useState<OptimizeProjectResult | null>(null);
  const [optimizeLoading, setOptimizeLoading] = useState(false);
  const [optimizeStartFrom, setOptimizeStartFrom] = useState(
    new Date().toISOString().split("T")[0]!
  );

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  // ── Helper: optimistic update su task nella cache SWR ──
  type TasksCache = { data: { tasks: typeof tasks; dependencies: typeof dependencies } } | undefined;

  const optimisticUpdateTask = useCallback(
    (taskId: string, changes: Partial<typeof tasks[number]>) => {
      mutateTasks(
        (current: TasksCache) => {
          if (!current?.data) return current;
          return {
            ...current,
            data: {
              ...current.data,
              tasks: current.data.tasks.map((t) =>
                t.id === taskId ? { ...t, ...changes } : t
              ),
            },
          };
        },
        { revalidate: false }
      );
    },
    [mutateTasks]
  );

  // ── Move: optimistic (task + discendenti) → API → revalidate ──
  const handleTaskMove = useCallback(
    async (taskId: string, newStart: string, newEnd: string) => {
      // 1. Optimistic: aggiorna task + tutti i discendenti nella cache
      const movedTask = tasks.find((t) => t.id === taskId);
      if (movedTask) {
        const deltaMs =
          new Date(newStart + "T00:00:00Z").getTime() -
          new Date(movedTask.startDate + "T00:00:00Z").getTime();

        // Raccolta ricorsiva discendenti
        function collectDescIds(parentId: string): Set<string> {
          const ids = new Set<string>();
          for (const t of tasks) {
            if (t.parentTaskId === parentId) {
              ids.add(t.id);
              for (const childId of collectDescIds(t.id)) ids.add(childId);
            }
          }
          return ids;
        }
        const descendantIds = collectDescIds(taskId);

        mutateTasks(
          (current: TasksCache) => {
            if (!current?.data) return current;
            return {
              ...current,
              data: {
                ...current.data,
                tasks: current.data.tasks.map((t) => {
                  if (t.id === taskId) {
                    return { ...t, startDate: newStart, endDate: newEnd };
                  }
                  if (descendantIds.has(t.id)) {
                    const s = new Date(t.startDate + "T00:00:00Z").getTime() + deltaMs;
                    const e = new Date(t.endDate + "T00:00:00Z").getTime() + deltaMs;
                    return {
                      ...t,
                      startDate: new Date(s).toISOString().split("T")[0]!,
                      endDate: new Date(e).toISOString().split("T")[0]!,
                    };
                  }
                  return t;
                }),
              },
            };
          },
          { revalidate: false }
        );
      } else {
        optimisticUpdateTask(taskId, { startDate: newStart, endDate: newEnd });
      }

      // 2. API call in background
      try {
        await moveTask({
          id: taskId,
          newStartDate: newStart,
          newEndDate: newEnd,
        });
        // 3. Revalidate per applicare eventuali shift dal server
        await mutateTasks();
      } catch {
        await mutateTasks(); // Rollback: refetch dati reali
        toast.error("Errore nello spostamento");
      }
    },
    [tasks, moveTask, mutateTasks, optimisticUpdateTask]
  );

  // ── Resize: optimistic → API → revalidate ──
  const handleTaskResize = useCallback(
    async (taskId: string, newStart: string, newEnd: string) => {
      optimisticUpdateTask(taskId, {
        startDate: newStart,
        endDate: newEnd,
      });
      try {
        await updateTask({
          id: taskId,
          data: { startDate: newStart, endDate: newEnd },
        });
        await mutateTasks();
      } catch {
        await mutateTasks();
        toast.error("Errore nell'aggiornamento");
      }
    },
    [updateTask, mutateTasks, optimisticUpdateTask]
  );

  // ── Update generico: optimistic per tutti i campi diretti ──
  const handleUpdateTask = useCallback(
    async (taskId: string, data: Record<string, unknown>) => {
      // Optimistic: applica subito tutti i campi alla cache locale
      const optimisticData: Partial<typeof tasks[number]> = {};
      if (data.status === "done") {
        optimisticData.status = "done";
        optimisticData.progress = 100;
      } else if (data.status === "todo") {
        optimisticData.status = "todo";
        optimisticData.progress = 0;
      }
      if (data.status && data.status !== "done" && data.status !== "todo") {
        optimisticData.status = data.status as typeof tasks[number]["status"];
      }
      if (data.progress !== undefined) optimisticData.progress = data.progress as number;
      if (data.startDate) optimisticData.startDate = data.startDate as string;
      if (data.endDate) optimisticData.endDate = data.endDate as string;
      if (data.estimatedHours !== undefined) {
        optimisticData.estimatedHours = data.estimatedHours != null ? String(data.estimatedHours) : null;
      }
      if (data.priority) optimisticData.priority = data.priority as typeof tasks[number]["priority"];
      if (data.executionMode) optimisticData.executionMode = data.executionMode as typeof tasks[number]["executionMode"];

      if (Object.keys(optimisticData).length > 0) {
        optimisticUpdateTask(taskId, optimisticData);
      }

      try {
        await updateTask({ id: taskId, data });
        await mutateTasks(); // Revalidate per parent auto-progress
      } catch {
        await mutateTasks();
        toast.error("Errore nell'aggiornamento");
      }
    },
    [updateTask, mutateTasks, optimisticUpdateTask]
  );

  // ── Toggle completamento: optimistic ──
  const handleToggleComplete = useCallback(
    async (taskId: string, done: boolean) => {
      optimisticUpdateTask(taskId, {
        status: done ? "done" : "todo",
        progress: done ? 100 : 0,
      } as Partial<typeof tasks[number]>);

      try {
        await updateTask({
          id: taskId,
          data: { status: done ? "done" : "todo" },
        });
        await mutateTasks(); // Revalidate per parent auto-progress
      } catch {
        await mutateTasks();
        toast.error("Errore nell'aggiornamento");
      }
    },
    [updateTask, mutateTasks, optimisticUpdateTask]
  );

  // ── Dipendenze: non servono optimistic (sono meno frequenti) ──
  const handleCreateDependency = useCallback(
    async (data: {
      predecessorId: string;
      successorId: string;
      dependencyType: string;
      lagDays: number;
    }) => {
      await createDependency({
        ...data,
        dependencyType: data.dependencyType as "FS" | "SS" | "FF" | "SF",
      });
      await mutateTasks();
    },
    [createDependency, mutateTasks]
  );

  const handleDeleteDependency = useCallback(
    async (id: string) => {
      await deleteDependency(id);
      await mutateTasks();
    },
    [deleteDependency, mutateTasks]
  );

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      await deleteTask({ id: taskId });
      setSelectedTaskId(null);
      await mutateTasks();
    },
    [deleteTask, mutateTasks]
  );

  // ── Reorder: optimistic → API → revalidate ──
  const handleReorderTasks = useCallback(
    async (updates: { id: string; sortOrder: number }[]) => {
      // Optimistic: aggiorna sortOrder nella cache
      mutateTasks(
        (current: TasksCache) => {
          if (!current?.data) return current;
          const orderMap = new Map(updates.map((u) => [u.id, u.sortOrder]));
          return {
            ...current,
            data: {
              ...current.data,
              tasks: current.data.tasks.map((t) =>
                orderMap.has(t.id) ? { ...t, sortOrder: orderMap.get(t.id)! } : t
              ),
            },
          };
        },
        { revalidate: false }
      );
      try {
        await reorderTasks({ updates });
        await mutateTasks();
      } catch {
        await mutateTasks();
        toast.error("Errore nel riordinamento");
      }
    },
    [reorderTasks, mutateTasks]
  );

  // ── Ottimizzazione globale: preview + apply ──
  const handleOptimizePreview = useCallback(async (startFrom?: string) => {
    setOptimizeOpen(true);
    setOptimizeLoading(true);
    setOptimizePreview(null);
    const sf = startFrom ?? optimizeStartFrom;
    try {
      const params = new URLSearchParams({ preview: "true" });
      if (sf) params.set("startFrom", sf);
      const res = await fetch(`/api/projects/${projectId}/optimize?${params}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Errore preview");
      const json = await res.json();
      setOptimizePreview(json.data);
    } catch {
      toast.error("Errore nel calcolo dell'ottimizzazione");
      setOptimizeOpen(false);
    } finally {
      setOptimizeLoading(false);
    }
  }, [projectId, optimizeStartFrom]);

  const handleOptimizeApply = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (optimizeStartFrom) params.set("startFrom", optimizeStartFrom);
      const res = await fetch(`/api/projects/${projectId}/optimize?${params}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Errore applicazione");
      const json = await res.json();
      toast.success(`${json.data.stats.totalTasksChanged} task ottimizzati`);
      await mutateTasks();
    } catch {
      toast.error("Errore nell'applicazione dell'ottimizzazione");
    }
  }, [projectId, mutateTasks, optimizeStartFrom]);

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Caricamento...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Progetto non trovato
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)] gap-3">
      {/* Header progetto */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: project.color ?? "#3B82F6" }}
          />
          <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
          <span className="text-xs text-muted-foreground font-mono">
            {tasks.length} task
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-muted-foreground hover:text-pm-accent"
            onClick={() => handleOptimizePreview()}
          >
            <Zap className="h-3.5 w-3.5" />
            Ottimizza
          </Button>

          <CreateTaskDialog
            projectId={projectId}
            tasks={tasks}
            milestones={milestones}
            onCreate={createTask}
            onCreateDependency={handleCreateDependency}
            onMutate={mutateTasks}
            onSelectTask={setSelectedTaskId}
          />

          {/* View tabs */}
          <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
            <TabsList>
              <TabsTrigger value="gantt">Gantt</TabsTrigger>
              <TabsTrigger value="board">Board</TabsTrigger>
              <TabsTrigger value="list">Lista</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Suggerimenti + Milestones */}
      <div className="flex gap-4 shrink-0">
        {suggestions.length > 0 && (
          <div className="flex-1">
            <SuggestionsPanel suggestions={suggestions} />
          </div>
        )}
        <div className={suggestions.length > 0 ? "w-80 shrink-0" : "flex-1"}>
          <MilestoneSection
            milestones={milestones}
            onCreateMilestone={createMilestone}
            onUpdateMilestone={updateMilestone}
            onDeleteMilestone={deleteMilestone}
            onMutate={mutateMilestones}
          />
        </div>
      </div>

      {/* Vista attiva */}
      <div className="flex-1 overflow-hidden">
        {view === "gantt" && (
          <GanttChart
            tasks={tasks}
            dependencies={dependencies}
            milestones={milestones}
            selectedTaskId={selectedTaskId}
            onTaskSelect={setSelectedTaskId}
            onTaskMove={handleTaskMove}
            onTaskResize={handleTaskResize}
            onTaskToggleComplete={handleToggleComplete}
            onReorderTasks={handleReorderTasks}
          />
        )}

        {view === "board" && (
          <BoardView
            tasks={tasks}
            onUpdateTask={handleUpdateTask}
            onSelectTask={(id) => setSelectedTaskId(id)}
          />
        )}

        {view === "list" && (
          <ListView
            tasks={tasks}
            onUpdateTask={handleUpdateTask}
            onSelectTask={(id) => setSelectedTaskId(id)}
            onReorderTasks={handleReorderTasks}
          />
        )}
      </div>

      {/* Task detail panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          dependencies={dependencies}
          tasks={tasks}
          milestones={milestones}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={handleUpdateTask}
          onCreateDependency={handleCreateDependency}
          onDeleteDependency={handleDeleteDependency}
          onCreateSubtask={async (data) => {
            await createTask({
              projectId,
              parentTaskId: data.parentTaskId,
              title: data.title,
              startDate: data.startDate,
              endDate: data.endDate,
            });
            await mutateTasks();
          }}
          onDeleteTask={handleDeleteTask}
          onMoveTask={handleTaskMove}
          onSelectTask={(id) => setSelectedTaskId(id)}
          projectId={projectId}
          onMutate={mutateTasks}
        />
      )}

      {/* Optimize preview dialog */}
      <OptimizePreviewDialog
        open={optimizeOpen}
        onOpenChange={setOptimizeOpen}
        preview={optimizePreview}
        isLoading={optimizeLoading}
        onConfirm={handleOptimizeApply}
        startFrom={optimizeStartFrom}
        onStartFromChange={(d) => {
          setOptimizeStartFrom(d);
          handleOptimizePreview(d);
        }}
      />
    </div>
  );
}
