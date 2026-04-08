/* gantt-task-bar.tsx — Singola barra task nel Gantt SVG. Mostra progresso, colore per stato, label. */
"use client";

import { memo, useState, useCallback } from "react";
import type { Task } from "@/db/schema";
import type { RowLayout } from "@/lib/gantt/layout";

interface GanttTaskBarProps {
  task: Task;
  layout: RowLayout;
  isSelected: boolean;
  isDragging: boolean;
  dragOffsetX: number;
  onSelect: (taskId: string) => void;
  onPointerDown: (e: React.PointerEvent, taskId: string, type: "move" | "resize-left" | "resize-right") => void;
  onHover: (task: Task | null, rect: DOMRect | null) => void;
}

const STATUS_COLORS: Record<string, { bg: string; fill: string }> = {
  todo: { bg: "#27272A", fill: "#3B82F6" },
  in_progress: { bg: "#1E3A5F", fill: "#3B82F6" },
  in_review: { bg: "#2D1B69", fill: "#8B5CF6" },
  done: { bg: "#14532D", fill: "#22C55E" },
  blocked: { bg: "#451A1A", fill: "#EF4444" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#EF4444",
  high: "#F59E0B",
  medium: "#3B82F6",
  low: "#71717A",
};

function GanttTaskBarInner({
  task,
  layout,
  isSelected,
  isDragging,
  dragOffsetX,
  onSelect,
  onPointerDown,
  onHover,
}: GanttTaskBarProps) {
  const [isHovered, setIsHovered] = useState(false);
  const isSupplier = task.executionMode === "supplier";
  const colors = STATUS_COLORS[task.status ?? "todo"] ?? STATUS_COLORS.todo!;
  const priorityColor = PRIORITY_COLORS[task.priority ?? "medium"] ?? PRIORITY_COLORS.medium!;
  const progress = task.progress ?? 0;
  const progressWidth = (layout.width * progress) / 100;

  const x = layout.x + (isDragging ? dragOffsetX : 0);

  const handlePointerEnter = useCallback(
    (e: React.PointerEvent) => {
      setIsHovered(true);
      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
      onHover(task, rect);
    },
    [task, onHover]
  );

  const handlePointerLeave = useCallback(() => {
    setIsHovered(false);
    onHover(null, null);
  }, [onHover]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(task.id);
    },
    [task.id, onSelect]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const handleZone = 8;

      if (relX <= handleZone) {
        onPointerDown(e, task.id, "resize-left");
      } else if (relX >= rect.width - handleZone) {
        onPointerDown(e, task.id, "resize-right");
      } else {
        onPointerDown(e, task.id, "move");
      }
    },
    [task.id, onPointerDown]
  );

  const hours = task.estimatedHours ? parseFloat(task.estimatedHours) : 0;
  const showLabel = layout.width > 60;
  const showHours = hours > 0 && layout.width > 30;

  return (
    <g
      className="cursor-pointer"
      style={{ opacity: isDragging ? 0.8 : 1 }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
    >
      {/* Pattern tratteggiato per task fornitore */}
      {isSupplier && (
        <defs>
          <pattern
            id={`supplier-hatch-${task.id}`}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill={colors.bg} />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#F59E0B" strokeWidth={1.5} opacity={0.3} />
          </pattern>
        </defs>
      )}

      {/* Barra sfondo */}
      <rect
        x={x}
        y={layout.y}
        width={layout.width}
        height={layout.height}
        rx={3}
        ry={3}
        fill={isSupplier ? `url(#supplier-hatch-${task.id})` : colors.bg}
        stroke={isSelected ? "#3B82F6" : isHovered ? "#52525B" : isSupplier ? "#F59E0B40" : "transparent"}
        strokeWidth={isSelected ? 2 : 1}
      />

      {/* Barra progresso */}
      {progress > 0 && (
        <rect
          x={x}
          y={layout.y}
          width={Math.min(progressWidth, layout.width)}
          height={layout.height}
          rx={3}
          ry={3}
          fill={colors.fill}
          opacity={0.3}
        />
      )}

      {/* Indicatore priorità (bordo sinistro) */}
      <rect
        x={x}
        y={layout.y}
        width={3}
        height={layout.height}
        rx={1.5}
        fill={priorityColor}
      />

      {/* Supplier badge */}
      {isSupplier && layout.width > 20 && (
        <text
          x={x + layout.width - 14}
          y={layout.y + 10}
          className="text-[8px] fill-warning pointer-events-none font-bold"
        >
          F
        </text>
      )}

      {/* Label + ore */}
      {showLabel && (
        <text
          x={x + 10}
          y={layout.y + layout.height / 2}
          dominantBaseline="central"
          className="text-[11px] fill-foreground pointer-events-none"
        >
          {task.title.length > Math.floor((layout.width - (showHours ? 30 : 0)) / 7)
            ? task.title.slice(0, Math.floor((layout.width - (showHours ? 30 : 0)) / 7) - 2) + "…"
            : task.title}
        </text>
      )}
      {/* Badge ore stimate */}
      {showHours && (
        <text
          x={x + layout.width - 6}
          y={layout.y + layout.height / 2}
          dominantBaseline="central"
          textAnchor="end"
          className="text-[9px] fill-foreground-muted pointer-events-none"
          opacity={0.6}
        >
          {hours}h
        </text>
      )}

      {/* Handle resize zone sinistra (invisibile) */}
      <rect
        x={x}
        y={layout.y}
        width={8}
        height={layout.height}
        fill="transparent"
        className="cursor-col-resize"
      />

      {/* Handle resize zone destra (invisibile) */}
      <rect
        x={x + layout.width - 8}
        y={layout.y}
        width={8}
        height={layout.height}
        fill="transparent"
        className="cursor-col-resize"
      />
    </g>
  );
}

export const GanttTaskBar = memo(GanttTaskBarInner);
