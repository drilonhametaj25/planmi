/* board-card.tsx — Card task nella board Kanban. Draggabile, mostra priorità, date, progresso. */
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { formatShortDate, parseDate } from "@/lib/gantt/timeline";

interface BoardCardProps {
  task: Task;
  onSelect: (taskId: string) => void;
}

const PRIORITY_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
};

export function BoardCard({ task, onSelect }: BoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="rounded-md border border-border bg-card p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors"
      onClick={() => onSelect(task.id)}
    >
      <p className="text-sm font-medium leading-tight">{task.title}</p>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant={PRIORITY_VARIANTS[task.priority ?? "medium"] ?? "secondary"} className="text-[10px] px-1.5 py-0">
          {task.priority}
        </Badge>
        {task.taskType && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {task.taskType}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
        <span>
          {task.startDate && task.endDate
            ? `${formatShortDate(parseDate(task.startDate))} → ${formatShortDate(parseDate(task.endDate))}`
            : <span className="italic text-warning/60">Da schedulare</span>
          }
        </span>
        <span>{task.progress ?? 0}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${task.progress ?? 0}%` }}
        />
      </div>
    </div>
  );
}
