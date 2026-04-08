/* optimize-preview-dialog.tsx — Dialog di preview per l'ottimizzazione.
   Mostra tutti i cambiamenti raggruppati per padre, con date vecchie → nuove.
   Bottone Conferma per applicare, Annulla per chiudere. */
"use client";

import { useState } from "react";
import type { TaskChange, OptimizeProjectResult } from "@/lib/workload-optimizer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Zap, ArrowRight, AlertTriangle, ChevronDown, ChevronRight, Calendar } from "lucide-react";
import { formatDateStr } from "@/lib/gantt/timeline";

interface OptimizePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: OptimizeProjectResult | null;
  isLoading: boolean;
  onConfirm: () => Promise<void>;
  title?: string;
  startFrom?: string;
  onStartFromChange?: (date: string) => void;
}

export function OptimizePreviewDialog({
  open,
  onOpenChange,
  preview,
  isLoading,
  onConfirm,
  title = "Ottimizzazione progetto",
  startFrom,
  onStartFromChange,
}: OptimizePreviewDialogProps) {
  const [applying, setApplying] = useState(false);

  if (!preview && !isLoading) return null;

  // Raggruppa cambiamenti per padre
  const grouped = new Map<string | null, TaskChange[]>();
  for (const change of preview?.changes ?? []) {
    const key = change.parentTaskId;
    const list = grouped.get(key) ?? [];
    list.push(change);
    grouped.set(key, list);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-pm-accent" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Data di partenza */}
        {onStartFromChange && (
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Label className="text-xs text-muted-foreground shrink-0">Partenza da:</Label>
            <Input
              type="date"
              value={startFrom ?? ""}
              onChange={(e) => onStartFromChange(e.target.value)}
              className="h-7 text-xs flex-1"
            />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="h-4 w-4 border-2 border-pm-accent border-t-transparent rounded-full animate-spin" />
              Analisi in corso...
            </div>
          </div>
        ) : preview ? (
          <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatBadge label="Task modificati" value={preview.stats.totalTasksChanged} />
              <StatBadge label="Padri" value={preview.stats.parentTasksChanged} />
              <StatBadge label="Sottotask" value={preview.stats.subtasksChanged} />
            </div>

            {preview.changes.length === 0 ? (
              <div className="rounded-md border border-border bg-card p-6 text-center text-muted-foreground text-sm">
                Nessun cambiamento necessario. Le tempistiche sono già ottimali.
              </div>
            ) : (
              <>
                {/* Warnings */}
                {preview.warnings.length > 0 && (
                  <div className="rounded-md border border-warning/30 bg-warning/5 p-3 space-y-1">
                    {preview.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-warning flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* Cambiamenti raggruppati */}
                <div className="space-y-2">
                  {[...grouped.entries()].map(([parentId, changes]) => (
                    <ChangeGroup
                      key={parentId ?? "__standalone"}
                      parentId={parentId}
                      changes={changes}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex gap-2 pt-4 border-t border-border shrink-0">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Annulla
          </Button>
          <Button
            className="flex-1 gap-1.5"
            onClick={async () => {
              setApplying(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setApplying(false);
              }
            }}
            disabled={applying || !preview || preview.changes.length === 0}
          >
            <Zap className="h-3.5 w-3.5" />
            {applying ? "Applicazione..." : `Applica ${preview?.changes.length ?? 0} modifiche`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-2 text-center">
      <p className="text-lg font-bold font-mono">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function ChangeGroup({
  parentId,
  changes,
}: {
  parentId: string | null;
  changes: TaskChange[];
}) {
  const [expanded, setExpanded] = useState(true);

  // Separa il cambio del padre dai sottotask
  const parentChange = parentId ? changes.find((c) => c.taskId === parentId) : null;
  const childChanges = changes.filter((c) => c.taskId !== parentId);
  const groupTitle = parentChange?.taskTitle ?? (parentId ? "Task padre" : "Task indipendenti");

  return (
    <div className="rounded-md border border-border bg-card">
      <button
        className="flex items-center gap-2 w-full p-2.5 text-left text-xs hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium flex-1 truncate">{groupTitle}</span>
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
          {changes.length} modifiche
        </span>
      </button>

      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-border/50 pt-2">
          {/* Parent change */}
          {parentChange && (
            <ChangeRow change={parentChange} isParent />
          )}

          {/* Child changes */}
          {childChanges.map((change) => (
            <ChangeRow key={change.taskId} change={change} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChangeRow({ change, isParent }: { change: TaskChange; isParent?: boolean }) {
  const startChanged = change.oldStartDate !== change.newStartDate;
  const endChanged = change.oldEndDate !== change.newEndDate;

  return (
    <div className={cn(
      "flex items-center gap-2 text-xs",
      isParent && "font-medium"
    )}>
      <span className={cn(
        "truncate flex-1",
        isParent ? "text-foreground" : "text-muted-foreground pl-3"
      )}>
        {isParent ? "📁" : "·"} {change.taskTitle}
      </span>
      <div className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
        <span className={cn(startChanged && "line-through text-muted-foreground/60")}>
          {formatDateStr(change.oldStartDate)}
        </span>
        {startChanged && (
          <>
            <ArrowRight className="h-2.5 w-2.5 text-pm-accent" />
            <span className="text-pm-accent">{formatDateStr(change.newStartDate)}</span>
          </>
        )}
        <span className="text-muted-foreground/40 mx-0.5">|</span>
        <span className={cn(endChanged && "line-through text-muted-foreground/60")}>
          {formatDateStr(change.oldEndDate)}
        </span>
        {endChanged && (
          <>
            <ArrowRight className="h-2.5 w-2.5 text-pm-accent" />
            <span className="text-pm-accent">{formatDateStr(change.newEndDate)}</span>
          </>
        )}
      </div>
    </div>
  );
}
