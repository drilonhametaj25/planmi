/* gantt-dependency-lines.tsx — Frecce SVG per dipendenze tra task nel Gantt. Colorate per tipo. */
"use client";

import { memo, useMemo } from "react";
import type { Dependency } from "@/db/schema";
import type { RowLayout } from "@/lib/gantt/layout";

interface GanttDependencyLinesProps {
  dependencies: Dependency[];
  layouts: Map<string, RowLayout>;
  criticalTaskIds?: Set<string>;
}

const TYPE_COLORS: Record<string, string> = {
  FS: "#3B82F6",
  SS: "#22C55E",
  FF: "#F59E0B",
  SF: "#EF4444",
};

function computePath(
  pred: RowLayout,
  succ: RowLayout,
  depType: string
): string {
  const predMidY = pred.y + pred.height / 2;
  const succMidY = succ.y + succ.height / 2;

  let startX: number;
  let endX: number;

  switch (depType) {
    case "SS":
      startX = pred.x;
      endX = succ.x;
      break;
    case "FF":
      startX = pred.x + pred.width;
      endX = succ.x + succ.width;
      break;
    case "SF":
      startX = pred.x;
      endX = succ.x + succ.width;
      break;
    case "FS":
    default:
      startX = pred.x + pred.width;
      endX = succ.x;
      break;
  }

  const midX = startX + (endX - startX) / 2;

  // Right-angle routing
  if (Math.abs(endX - startX) < 20) {
    // Direct vertical connection
    return `M ${startX} ${predMidY} L ${startX} ${succMidY - (succMidY > predMidY ? 6 : -6)} L ${endX} ${succMidY}`;
  }

  return `M ${startX} ${predMidY} L ${midX} ${predMidY} L ${midX} ${succMidY} L ${endX} ${succMidY}`;
}

function GanttDependencyLinesInner({
  dependencies,
  layouts,
  criticalTaskIds,
}: GanttDependencyLinesProps) {
  const paths = useMemo(() => {
    return dependencies
      .map((dep) => {
        const pred = layouts.get(dep.predecessorId);
        const succ = layouts.get(dep.successorId);
        if (!pred || !succ) return null;

        const depType = dep.dependencyType ?? "FS";
        const isCritical =
          criticalTaskIds?.has(dep.predecessorId) &&
          criticalTaskIds?.has(dep.successorId);
        const color = isCritical ? "#EF4444" : (TYPE_COLORS[depType] ?? "#3B82F6");

        return {
          id: dep.id,
          d: computePath(pred, succ, depType),
          color,
          endX: depType === "FS" || depType === "SF" ? succ.x : succ.x + succ.width,
          endY: succ.y + succ.height / 2,
        };
      })
      .filter(Boolean) as {
        id: string;
        d: string;
        color: string;
        endX: number;
        endY: number;
      }[];
  }, [dependencies, layouts, criticalTaskIds]);

  return (
    <g>
      {/* Arrow marker definition */}
      <defs>
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <marker
            key={type}
            id={`arrow-${type}`}
            markerWidth="8"
            markerHeight="6"
            refX="7"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 8 3, 0 6" fill={color} />
          </marker>
        ))}
        <marker
          id="arrow-critical"
          markerWidth="8"
          markerHeight="6"
          refX="7"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 8 3, 0 6" fill="#EF4444" />
        </marker>
      </defs>

      {paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          stroke={path.color}
          strokeWidth={1.5}
          fill="none"
          opacity={0.6}
          markerEnd={`url(#arrow-${path.color === "#EF4444" ? "critical" : "FS"})`}
        />
      ))}
    </g>
  );
}

export const GanttDependencyLines = memo(GanttDependencyLinesInner);
