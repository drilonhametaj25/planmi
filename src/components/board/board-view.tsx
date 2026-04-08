/* board-view.tsx — Vista Kanban completa. Colonne per stato, drag & drop tra colonne. */
"use client";

import { useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { Task } from "@/db/schema";
import { BoardColumn } from "./board-column";

interface BoardViewProps {
  tasks: Task[];
  onUpdateTask: (taskId: string, data: Record<string, unknown>) => void;
  onSelectTask: (taskId: string) => void;
}

const COLUMNS = [
  { id: "todo", title: "Todo", color: "#71717A" },
  { id: "in_progress", title: "In Progress", color: "#3B82F6" },
  { id: "in_review", title: "In Review", color: "#8B5CF6" },
  { id: "done", title: "Done", color: "#22C55E" },
  { id: "blocked", title: "Blocked", color: "#EF4444" },
] as const;

export function BoardView({ tasks, onUpdateTask, onSelectTask }: BoardViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const overId = over.id as string;

      // Se droppa su una colonna, cambia stato
      const targetColumn = COLUMNS.find((c) => c.id === overId);
      if (targetColumn) {
        onUpdateTask(taskId, { status: targetColumn.id });
        return;
      }

      // Se droppa su un altro task, trova la colonna del task target
      const targetTask = tasks.find((t) => t.id === overId);
      if (targetTask) {
        onUpdateTask(taskId, { status: targetTask.status });
      }
    },
    [tasks, onUpdateTask]
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 h-full">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column.id}
            id={column.id}
            title={column.title}
            color={column.color}
            tasks={tasks.filter((t) => (t.status ?? "todo") === column.id)}
            onSelectTask={onSelectTask}
          />
        ))}
      </div>
      <DragOverlay />
    </DndContext>
  );
}
