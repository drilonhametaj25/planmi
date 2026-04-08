/* schedule-suggestion-banner.tsx — Banner riutilizzabile che mostra il suggerimento di date ottimali dall'auto-scheduler. */
"use client";

import { useState } from "react";
import type { Task } from "@/db/schema";
import type { AutoScheduleResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScheduleSuggestionBannerProps {
  suggestion: AutoScheduleResult | null;
  isLoading: boolean;
  currentStartDate: string;
  currentEndDate: string;
  onAccept: (startDate: string, endDate: string) => void;
  tasks: Task[];
}

export function ScheduleSuggestionBanner({
  suggestion,
  isLoading,
  currentStartDate,
  currentEndDate,
  onAccept,
  tasks,
}: ScheduleSuggestionBannerProps) {
  const [showShifts, setShowShifts] = useState(false);

  if (isLoading) {
    return (
      <div className="rounded-md border border-border bg-background-elevated px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-pm-accent" />
        Calcolo date ottimali...
      </div>
    );
  }

  if (!suggestion) return null;

  const datesMatch =
    suggestion.suggestedStartDate === currentStartDate &&
    suggestion.suggestedEndDate === currentEndDate;

  const hasWarnings = suggestion.warnings.length > 0;
  const hasShifts = suggestion.shifts.length > 0;
  const hasCriticalWarning = suggestion.warnings.some(
    (w) => w.severity === "critical"
  );

  // Risolvi nomi task per gli shift
  const taskNameMap = new Map<string, string>();
  for (const t of tasks) taskNameMap.set(t.id, t.title);

  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 space-y-2",
        hasCriticalWarning
          ? "border-critical/30 bg-critical/5"
          : hasWarnings
            ? "border-warning/30 bg-warning/5"
            : "border-pm-accent/30 bg-pm-accent/5"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              hasCriticalWarning
                ? "text-critical"
                : hasWarnings
                  ? "text-warning"
                  : "text-pm-accent"
            )}
          />
          <span className="text-xs font-medium truncate">
            Suggerimento:{" "}
            <span className="font-mono">
              {suggestion.suggestedStartDate}
            </span>
            {" → "}
            <span className="font-mono">
              {suggestion.suggestedEndDate}
            </span>
            <span className="text-muted-foreground ml-1">
              ({suggestion.durationDays}g)
            </span>
          </span>
        </div>

        {!datesMatch && (
          <Button
            size="sm"
            variant="default"
            className="h-6 text-[11px] shrink-0"
            onClick={() =>
              onAccept(
                suggestion.suggestedStartDate,
                suggestion.suggestedEndDate
              )
            }
          >
            Usa date suggerite
          </Button>
        )}
        {datesMatch && (
          <span className="text-[11px] text-success font-medium shrink-0">
            Date già ottimali
          </span>
        )}
      </div>

      {/* Constraints */}
      {suggestion.constraints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestion.constraints.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-background border border-border text-muted-foreground"
            >
              {c.description}
            </span>
          ))}
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="space-y-1">
          {suggestion.warnings.map((w, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-1.5 text-[11px]",
                w.severity === "critical"
                  ? "text-critical"
                  : "text-warning"
              )}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {w.description}
            </div>
          ))}
        </div>
      )}

      {/* Shifts preview */}
      {hasShifts && (
        <div>
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowShifts(!showShifts)}
          >
            {showShifts ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {suggestion.shifts.length} task verrebbero spostati
          </button>

          {showShifts && (
            <div className="mt-1 space-y-0.5 pl-4">
              {suggestion.shifts.map((s) => (
                <div
                  key={s.taskId}
                  className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground"
                >
                  <span className="truncate max-w-[120px]">
                    {taskNameMap.get(s.taskId) ?? s.taskId.slice(0, 8)}
                  </span>
                  <span>{s.oldStartDate}</span>
                  <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                  <span>{s.newStartDate}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
