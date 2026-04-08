/* gantt-milestone.tsx — Diamante milestone nel Gantt SVG. */
"use client";

import { memo } from "react";
import type { Milestone } from "@/db/schema";
import type { TimelineConfig } from "@/lib/gantt/timeline";
import { dateToX, parseDate } from "@/lib/gantt/timeline";

interface GanttMilestoneProps {
  milestone: Milestone;
  config: TimelineConfig;
  totalRows: number;
}

function GanttMilestoneInner({ milestone, config, totalRows }: GanttMilestoneProps) {
  const x = dateToX(parseDate(milestone.date), config);
  const size = 8;
  const y = config.headerHeight + totalRows * config.rowHeight + 20;
  const color = milestone.isCompleted ? "#22C55E" : "#F59E0B";

  return (
    <g>
      {/* Linea verticale sottile */}
      <line
        x1={x}
        y1={config.headerHeight}
        x2={x}
        y2={y + size}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="4 4"
        opacity={0.3}
      />
      {/* Diamante */}
      <polygon
        points={`${x},${y - size} ${x + size},${y} ${x},${y + size} ${x - size},${y}`}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
      {/* Label */}
      <text
        x={x + size + 4}
        y={y}
        dominantBaseline="central"
        className="text-[10px] fill-foreground-muted"
      >
        {milestone.title}
      </text>
    </g>
  );
}

export const GanttMilestone = memo(GanttMilestoneInner);
