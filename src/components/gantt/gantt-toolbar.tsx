/* gantt-toolbar.tsx — Barra strumenti Gantt: zoom, oggi, filtri, toggle dipendenze/milestones. */
"use client";

import { memo } from "react";
import { ZoomIn, ZoomOut, CalendarDays, GitBranch, Diamond } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ZoomLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

interface GanttToolbarProps {
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  onScrollToToday: () => void;
  showDependencies: boolean;
  onToggleDependencies: () => void;
  showMilestones: boolean;
  onToggleMilestones: () => void;
}

const ZOOM_LEVELS: ZoomLevel[] = ["hour", "day", "week", "month"];
const ZOOM_LABELS: Record<ZoomLevel, string> = {
  hour: "Ore",
  day: "Giorno",
  week: "Settimana",
  month: "Mese",
};

function GanttToolbarInner({
  zoom,
  onZoomChange,
  onScrollToToday,
  showDependencies,
  onToggleDependencies,
  showMilestones,
  onToggleMilestones,
}: GanttToolbarProps) {
  const zoomIndex = ZOOM_LEVELS.indexOf(zoom);

  return (
    <div className="flex items-center gap-2 border-b border-border bg-background px-3 py-1.5">
      {/* Zoom */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={zoomIndex === 0}
          onClick={() => {
            const prev = ZOOM_LEVELS[zoomIndex - 1];
            if (prev) onZoomChange(prev);
          }}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-16 text-center font-mono">
          {ZOOM_LABELS[zoom]}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          onClick={() => {
            const next = ZOOM_LEVELS[zoomIndex + 1];
            if (next) onZoomChange(next);
          }}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Oggi */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        onClick={onScrollToToday}
      >
        <CalendarDays className="h-3.5 w-3.5 mr-1" />
        Oggi
      </Button>

      <div className="h-4 w-px bg-border" />

      {/* Toggle */}
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 text-xs", showDependencies && "bg-primary/10 text-primary")}
        onClick={onToggleDependencies}
      >
        <GitBranch className="h-3.5 w-3.5 mr-1" />
        Dipendenze
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 text-xs", showMilestones && "bg-primary/10 text-primary")}
        onClick={onToggleMilestones}
      >
        <Diamond className="h-3.5 w-3.5 mr-1" />
        Milestones
      </Button>
    </div>
  );
}

export const GanttToolbar = memo(GanttToolbarInner);
