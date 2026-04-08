/* gantt-tooltip.tsx — Tooltip che appare sull'hover delle barre task nel Gantt. Portale HTML. */
"use client";

import { memo } from "react";
import type { Task } from "@/db/schema";
import { formatShortDate, parseDate, daysBetween } from "@/lib/gantt/timeline";

interface GanttTooltipProps {
  task: Task | null;
  position: { x: number; y: number } | null;
}

function GanttTooltipInner({ task, position }: GanttTooltipProps) {
  if (!task || !position) return null;

  const start = parseDate(task.startDate);
  const end = parseDate(task.endDate);
  const duration = daysBetween(start, end) + 1;

  return (
    <div
      className="fixed z-50 rounded-md border border-border bg-popover px-3 py-2 shadow-lg pointer-events-none"
      style={{
        left: position.x + 12,
        top: position.y - 10,
      }}
    >
      <p className="text-sm font-medium text-popover-foreground">{task.title}</p>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground font-mono">
        <p>
          {formatShortDate(start)} → {formatShortDate(end)} ({duration}g)
          {task.estimatedHours && ` · ${parseFloat(task.estimatedHours)}h stimate`}
        </p>
        <p>
          Progresso: {task.progress ?? 0}% · Stato: {task.status}
          {task.executionMode === "supplier" && " · Fornitore"}
        </p>
        {task.priority && <p>Priorità: {task.priority}</p>}
      </div>
    </div>
  );
}

export const GanttTooltip = memo(GanttTooltipInner);
