/* list-view.tsx — Vista tabellare task con struttura ad albero, sort, filtri, inline editing, checkbox completamento, drag & drop reorder. */
"use client";

import { useState, useMemo, useCallback } from "react";
import type { Task } from "@/db/schema";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, ChevronDown, Check, ArrowUpDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatShortDate, parseDate, daysBetween } from "@/lib/gantt/timeline";
import { buildTaskTree, filterVisibleNodes } from "@/lib/task-tree";
import { TagFilter } from "@/components/search/tag-filter";
import { parseTags } from "@/lib/tags";
import { useTags } from "@/hooks/use-tags";
import { statusLabel, priorityLabel } from "@/lib/labels";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ListViewProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => void;
  onSelectTask: (taskId: string) => void;
  onReorderTasks?: (updates: { id: string; sortOrder: number }[]) => void;
}

type SortKey = "title" | "status" | "priority" | "startDate" | "endDate" | "progress";
type SortDir = "asc" | "desc";

const STATUS_COLORS: Record<string, string> = {
  todo: "#71717A",
  in_progress: "#3B82F6",
  in_review: "#8B5CF6",
  done: "#22C55E",
  blocked: "#EF4444",
};

interface SortableListRowProps {
  node: ReturnType<typeof buildTaskTree>[number];
  collapsedIds: Set<string>;
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => void;
  onToggleCollapse: (taskId: string) => void;
}

function SortableListRow({
  node,
  collapsedIds,
  onSelectTask,
  onUpdateTask,
  onToggleCollapse,
}: SortableListRowProps) {
  const { task, depth, hasChildren } = node;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const start = task.startDate ? parseDate(task.startDate) : null;
  const end = task.endDate ? parseDate(task.endDate) : null;
  const duration = start && end ? daysBetween(start, end) + 1 : null;
  const isDone = task.status === "done";
  const isCollapsed = collapsedIds.has(task.id);
  const color = STATUS_COLORS[task.status ?? "todo"] ?? "#71717A";

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && { opacity: 0.4 }),
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="border-b border-border-subtle hover:bg-background-elevated/50 cursor-pointer transition-colors group"
      onClick={() => onSelectTask(task.id)}
    >
      <td className="w-8 px-1">
        <button
          className="h-5 w-4 flex items-center justify-center text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground cursor-grab active:cursor-grabbing transition-colors touch-none"
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      </td>
      <td className="px-3 py-2">
        <div
          className="flex items-center gap-1.5"
          style={{ paddingLeft: `${depth * 20}px` }}
        >
          {hasChildren ? (
            <button
              className="h-5 w-5 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(task.id);
              }}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}

          <button
            className={cn(
              "h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors",
              isDone
                ? "bg-success border-success"
                : "border-muted-foreground/40 hover:border-foreground"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onUpdateTask(task.id, {
                status: isDone ? "todo" : "done",
              });
            }}
          >
            {isDone && <Check className="h-2.5 w-2.5 text-white" />}
          </button>

          <span
            className="h-3 w-0.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />

          <span
            className={cn(
              "text-sm truncate",
              isDone && "line-through text-muted-foreground",
              depth > 0 && "text-xs"
            )}
          >
            {task.title}
          </span>
        </div>
      </td>

      <td className="px-3 py-2">
        <Select
          value={task.status ?? "todo"}
          onValueChange={(v) => {
            if (v) onUpdateTask(task.id, { status: v });
          }}
        >
          <SelectTrigger
            className="h-6 w-28 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
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
      </td>
      <td className="px-3 py-2">
        <Select
          value={task.priority ?? "medium"}
          onValueChange={(v) => {
            if (v) onUpdateTask(task.id, { priority: v });
          }}
        >
          <SelectTrigger
            className="h-6 w-24 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
        {start ? formatShortDate(start) : <span className="text-warning/60 italic">—</span>}
      </td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
        {end ? formatShortDate(end) : <span className="text-warning/60 italic">—</span>}
      </td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">
        {duration != null ? `${duration}g` : <span className="text-warning/60 italic">—</span>}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${task.progress ?? 0}%` }}
            />
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {task.progress ?? 0}%
          </span>
        </div>
      </td>
    </tr>
  );
}

export function ListView({ tasks, onUpdateTask, onSelectTask, onReorderTasks }: ListViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const projectId = tasks[0]?.projectId;
  const { tags: availableTags } = useTags(projectId);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorderTasks) return;

      const activeTask = tasks.find((t) => t.id === active.id);
      const overTask = tasks.find((t) => t.id === over.id);
      if (!activeTask || !overTask) return;
      if (activeTask.parentTaskId !== overTask.parentTaskId) return;

      const siblings = tasks
        .filter((t) => t.parentTaskId === activeTask.parentTaskId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const oldIndex = siblings.findIndex((t) => t.id === active.id);
      const newIndex = siblings.findIndex((t) => t.id === over.id);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(siblings, oldIndex, newIndex);
      onReorderTasks(reordered.map((t, i) => ({ id: t.id, sortOrder: i })));
    },
    [tasks, onReorderTasks]
  );

  const toggleCollapse = useCallback((taskId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  // Filtra prima, poi costruisci albero
  const filtered = useMemo(() => {
    let result = [...tasks];
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }
    if (priorityFilter !== "all") {
      result = result.filter((t) => t.priority === priorityFilter);
    }
    if (tagFilter.length > 0) {
      result = result.filter((t) => {
        const taskTags = parseTags(t.tags);
        return tagFilter.every((ft) => taskTags.includes(ft));
      });
    }
    return result;
  }, [tasks, statusFilter, priorityFilter, tagFilter]);

  const treeNodes = useMemo(() => buildTaskTree(filtered), [filtered]);
  const visibleNodes = useMemo(
    () => filterVisibleNodes(treeNodes, collapsedIds),
    [treeNodes, collapsedIds]
  );

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey]
  );

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors"
      onClick={() => toggleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={cn("h-3 w-3", sortKey === field && "text-primary")} />
      </span>
    </th>
  );

  return (
    <div className="flex flex-col h-full border border-border rounded-md overflow-hidden">
      {/* Filtri */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-3 py-2">
        <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v); }}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="todo">Todo</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="done">Done</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(v) => { if (v) setPriorityFilter(v); }}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Priorità" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le priorità</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        <TagFilter
          availableTags={availableTags}
          selectedTags={tagFilter}
          onTagsChange={setTagFilter}
        />

        <span className="ml-auto text-xs text-muted-foreground font-mono">
          {visibleNodes.length} task
        </span>
      </div>

      {/* Tabella */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-background border-b border-border">
              <tr>
                <th className="w-8" />
                <SortHeader label="Titolo" field="title" />
                <SortHeader label="Stato" field="status" />
                <SortHeader label="Priorità" field="priority" />
                <SortHeader label="Inizio" field="startDate" />
                <SortHeader label="Fine" field="endDate" />
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Durata
                </th>
                <SortHeader label="Progresso" field="progress" />
              </tr>
            </thead>
            <SortableContext
              items={visibleNodes.map((n) => n.task.id)}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {visibleNodes.map((node) => (
                  <SortableListRow
                    key={node.task.id}
                    node={node}
                    collapsedIds={collapsedIds}
                    onSelectTask={onSelectTask}
                    onUpdateTask={onUpdateTask}
                    onToggleCollapse={toggleCollapse}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>

          {visibleNodes.length === 0 && (
            <div className="text-center text-muted-foreground py-12 text-sm">
              Nessun task trovato
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeId && (() => {
            const node = visibleNodes.find((n) => n.task.id === activeId);
            if (!node) return null;
            const { task, depth } = node;
            return (
              <table className="w-full">
                <tbody>
                  <tr className="bg-background border border-border shadow-lg rounded">
                    <td className="w-8 px-1">
                      <GripVertical className="h-3.5 w-3.5 text-foreground" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 20}px` }}>
                        <span
                          className="h-3 w-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: STATUS_COLORS[task.status ?? "todo"] ?? "#71717A" }}
                        />
                        <span className={cn("text-sm truncate", depth > 0 && "text-xs")}>
                          {task.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">{statusLabel(task.status)}</td>
                    <td className="px-3 py-2 text-[11px] text-muted-foreground">{priorityLabel(task.priority)}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{task.startDate ?? "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{task.endDate ?? "—"}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground" />
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{task.progress ?? 0}%</td>
                  </tr>
                </tbody>
              </table>
            );
          })()}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
