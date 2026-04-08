/* gantt-sidebar.tsx — Pannello sinistro Gantt. Albero task/sottotask con collapse gestito dal parent per sincronizzare con il body SVG. Drag & drop per riordinare. */
"use client";

import { memo, useMemo, useState, useCallback } from "react";
import type { Task } from "@/db/schema";
import { cn } from "@/lib/utils";
import { buildTaskTree, filterVisibleNodes } from "@/lib/task-tree";
import { ChevronRight, ChevronDown, Check, GripVertical, Link2, CalendarOff } from "lucide-react";
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

interface GanttSidebarProps {
  tasks: Task[];
  rowHeight: number;
  headerHeight: number;
  scrollTop: number;
  selectedTaskId: string | null;
  collapsedIds: Set<string>;
  onSelectTask: (taskId: string) => void;
  onToggleCollapse: (taskId: string) => void;
  onToggleComplete: (taskId: string, done: boolean) => void;
  onReorderTasks?: (updates: { id: string; sortOrder: number }[]) => void;
}

const STATUS_COLORS: Record<string, string> = {
  todo: "#71717A",
  in_progress: "#3B82F6",
  in_review: "#8B5CF6",
  done: "#22C55E",
  blocked: "#EF4444",
};

interface SortableRowProps {
  task: Task;
  depth: number;
  hasChildren: boolean;
  rowHeight: number;
  isSelected: boolean;
  isCollapsed: boolean;
  onSelectTask: (taskId: string) => void;
  onToggleCollapse: (taskId: string) => void;
  onToggleComplete: (taskId: string, done: boolean) => void;
  isOverlay?: boolean;
}

function SortableSidebarRow({
  task,
  depth,
  hasChildren,
  rowHeight,
  isSelected,
  isCollapsed,
  onSelectTask,
  onToggleCollapse,
  onToggleComplete,
  isOverlay,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const isDone = task.status === "done";
  const color = STATUS_COLORS[task.status ?? "todo"] ?? "#71717A";

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: rowHeight,
    paddingLeft: `${12 + depth * 20}px`,
    ...(isDragging && { opacity: 0.4 }),
    ...(isOverlay && { opacity: 1, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", borderRadius: 4 }),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "group flex items-center gap-1 pr-3 text-sm cursor-pointer border-b border-border-subtle hover:bg-background-elevated transition-colors bg-background",
        isSelected && "bg-primary/5"
      )}
      onClick={() => onSelectTask(task.id)}
    >
      <button
        className="h-5 w-4 flex items-center justify-center shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground cursor-grab active:cursor-grabbing transition-colors touch-none"
        {...listeners}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" />
      </button>

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
          onToggleComplete(task.id, !isDone);
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
          "truncate text-foreground",
          isDone && "line-through text-muted-foreground",
          depth > 0 && "text-xs"
        )}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/x-task-id", task.id);
          e.dataTransfer.setData("text/plain", task.title);
          e.dataTransfer.effectAllowed = "link";
          e.stopPropagation();
        }}
      >
        {task.title}
      </span>

      {task.executionMode === "supplier" && (
        <span className="text-[9px] bg-warning/20 text-warning px-1 rounded font-medium shrink-0">
          F
        </span>
      )}

      {/* Badge "da schedulare" per task senza date */}
      {(!task.startDate || !task.endDate) && (
        <CalendarOff className="h-3 w-3 shrink-0 text-warning/60" />
      )}

      {/* Icona link visibile al hover — indica che si può trascinare per creare dipendenza */}
      <Link2 className="h-3 w-3 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground/40 ml-auto" />

      {task.estimatedHours && (
        <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0">
          {parseFloat(task.estimatedHours)}h
        </span>
      )}
      {!isDone && (task.progress ?? 0) > 0 && (
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {task.progress}%
        </span>
      )}
    </div>
  );
}

function GanttSidebarInner({
  tasks,
  rowHeight,
  headerHeight,
  scrollTop,
  selectedTaskId,
  collapsedIds,
  onSelectTask,
  onToggleCollapse,
  onToggleComplete,
  onReorderTasks,
}: GanttSidebarProps) {
  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const visibleNodes = useMemo(
    () => filterVisibleNodes(tree, collapsedIds),
    [tree, collapsedIds]
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeNode = activeId
    ? visibleNodes.find((n) => n.task.id === activeId)
    : null;

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

  const sortableIds = useMemo(
    () => visibleNodes.map((n) => n.task.id),
    [visibleNodes]
  );

  return (
    <div className="flex flex-col border-r border-border bg-background w-64 shrink-0">
      <div
        className="flex items-center px-3 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider"
        style={{ height: headerHeight }}
      >
        Task
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex-1 overflow-hidden">
            <div style={{ transform: `translateY(-${scrollTop}px)` }}>
              {visibleNodes.map((node) => (
                <SortableSidebarRow
                  key={node.task.id}
                  task={node.task}
                  depth={node.depth}
                  hasChildren={node.hasChildren}
                  rowHeight={rowHeight}
                  isSelected={node.task.id === selectedTaskId}
                  isCollapsed={collapsedIds.has(node.task.id)}
                  onSelectTask={onSelectTask}
                  onToggleCollapse={onToggleCollapse}
                  onToggleComplete={onToggleComplete}
                />
              ))}
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeNode && (
            <SortableSidebarRow
              task={activeNode.task}
              depth={activeNode.depth}
              hasChildren={activeNode.hasChildren}
              rowHeight={rowHeight}
              isSelected={false}
              isCollapsed={false}
              onSelectTask={() => {}}
              onToggleCollapse={() => {}}
              onToggleComplete={() => {}}
              isOverlay
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export const GanttSidebar = memo(GanttSidebarInner);
