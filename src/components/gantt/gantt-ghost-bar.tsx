/* gantt-ghost-bar.tsx — Barra fantasma semitrasparente che mostra la posizione futura di un task durante lo shift preview. */
"use client";

import { memo } from "react";
import type { ShiftEntry } from "@/lib/shifting-engine";
import type { TimelineConfig } from "@/lib/gantt/timeline";
import { dateToX, daysBetween, parseDate, formatShortDate } from "@/lib/gantt/timeline";

interface GanttGhostBarProps {
  shift: ShiftEntry;
  config: TimelineConfig;
  rowIndex: number;
}

function GanttGhostBarInner({ shift, config, rowIndex }: GanttGhostBarProps) {
  const start = parseDate(shift.newStartDate);
  const end = parseDate(shift.newEndDate);
  const x = dateToX(start, config);
  const width = (daysBetween(start, end) + 1) * config.dayWidth;
  const y = config.headerHeight + rowIndex * config.rowHeight + 6;
  const height = config.rowHeight - 12;

  return (
    <g opacity={0.4}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        ry={3}
        fill="#3B82F6"
        strokeDasharray="4 2"
        stroke="#3B82F6"
        strokeWidth={1.5}
      />
      <text
        x={x + width / 2}
        y={y + height / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="text-[9px] fill-foreground"
      >
        {formatShortDate(start)} → {formatShortDate(end)}
      </text>
    </g>
  );
}

export const GanttGhostBar = memo(GanttGhostBarInner);
