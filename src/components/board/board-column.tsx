/* board-column.tsx — Colonna Kanban. Droppable area con header, count badge, e lista card. */
"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Task } from "@/db/schema";
import { BoardCard } from "./board-card";
import { cn } from "@/lib/utils";

interface BoardColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  color: string;
  onSelectTask: (taskId: string) => void;
}

export function BoardColumn({
  id,
  title,
  tasks,
  color,
  onSelectTask,
}: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-border bg-background-elevated/50 w-64 shrink-0",
        isOver && "ring-2 ring-primary/30"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium">{title}</span>
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          {tasks.length}
        </span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 space-y-2 p-2 overflow-y-auto min-h-[100px]"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <BoardCard key={task.id} task={task} onSelect={onSelectTask} />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8">
            Nessun task
          </div>
        )}
      </div>
    </div>
  );
}
