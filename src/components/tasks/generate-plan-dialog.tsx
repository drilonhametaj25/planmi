/* generate-plan-dialog.tsx — Dialog per generazione automatica del piano: suggerisce dipendenze + ottimizza date. */
"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wand2, ArrowRight, Check, Loader2, AlertTriangle, GitBranch } from "lucide-react";
import { toast } from "sonner";
import type { PlanGeneratorResult, SuggestedDependency } from "@/lib/plan-generator";
import type { TaskChange } from "@/lib/workload-optimizer";

interface GeneratePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onApplied: () => Promise<unknown>;
}

export function GeneratePlanDialog({
  open,
  onOpenChange,
  projectId,
  onApplied,
}: GeneratePlanDialogProps) {
  const [startFrom, setStartFrom] = useState(
    () => new Date().toISOString().split("T")[0]!
  );
  const [suggestDeps, setSuggestDeps] = useState(true);
  const [preview, setPreview] = useState<PlanGeneratorResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [acceptedDepIds, setAcceptedDepIds] = useState<Set<number>>(new Set());

  const resetForm = useCallback(() => {
    setPreview(null);
    setAcceptedDepIds(new Set());
  }, []);

  async function handleGenerate() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startFrom, suggestDependencies: suggestDeps }),
      });
      if (!res.ok) throw new Error("Errore generazione");
      const json = await res.json();
      const result = json.data as PlanGeneratorResult;
      setPreview(result);
      // Accetta tutte le dipendenze per default
      setAcceptedDepIds(new Set(result.suggestedDeps.map((_, i) => i)));
    } catch {
      toast.error("Errore nella generazione del piano");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setApplying(true);
    try {
      const acceptedDeps = preview.suggestedDeps.filter((_, i) =>
        acceptedDepIds.has(i)
      );
      const res = await fetch(
        `/api/projects/${projectId}/generate-plan/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changes: preview.changes.map((c) => ({
              taskId: c.taskId,
              newStartDate: c.newStartDate,
              newEndDate: c.newEndDate,
            })),
            acceptedDeps: acceptedDeps.map((d) => ({
              predecessorId: d.predecessorId,
              successorId: d.successorId,
              dependencyType: d.dependencyType,
              lagDays: d.lagDays,
            })),
          }),
        }
      );
      if (!res.ok) throw new Error("Errore applicazione");
      await onApplied();
      toast.success("Piano applicato con successo");
      resetForm();
      onOpenChange(false);
    } catch {
      toast.error("Errore nell'applicazione del piano");
    } finally {
      setApplying(false);
    }
  }

  function toggleDep(index: number) {
    setAcceptedDepIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const formatDate = (d: string) => d.slice(5);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetForm();
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-pm-accent" />
            Genera Piano Automatico
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!preview ? (
            /* Phase 1: Config */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Data di partenza</Label>
                <Input
                  type="date"
                  value={startFrom}
                  onChange={(e) => setStartFrom(e.target.value)}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={suggestDeps}
                  onChange={(e) => setSuggestDeps(e.target.checked)}
                  className="rounded"
                />
                Suggerisci dipendenze automatiche (basate sul tipo task)
              </label>

              <Button
                onClick={handleGenerate}
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Wand2 className="h-4 w-4 mr-2" />
                )}
                Genera piano
              </Button>
            </div>
          ) : (
            /* Phase 2: Preview */
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded-md bg-muted p-2">
                  <div className="text-lg font-bold">{preview.stats.totalTasksChanged}</div>
                  <div className="text-[10px] text-muted-foreground">Task modificati</div>
                </div>
                <div className="rounded-md bg-muted p-2">
                  <div className="text-lg font-bold">{preview.suggestedDeps.length}</div>
                  <div className="text-[10px] text-muted-foreground">Dipendenze suggerite</div>
                </div>
              </div>

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div className="space-y-1">
                  {preview.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-amber-400">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {/* Suggested dependencies */}
              {preview.suggestedDeps.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    Dipendenze suggerite
                  </span>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {preview.suggestedDeps.map((dep: SuggestedDependency, i: number) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleDep(i)}
                        className="w-full text-left flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                            acceptedDepIds.has(i)
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-border"
                          }`}
                        >
                          {acceptedDepIds.has(i) && <Check className="h-2.5 w-2.5" />}
                        </span>
                        <span className="truncate">{dep.predecessorTitle}</span>
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{dep.successorTitle}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                          {dep.reason.split("(")[1]?.replace(")", "") ?? ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Date changes */}
              {preview.changes.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Modifiche date ({preview.changes.length})
                  </span>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {preview.changes.map((c: TaskChange) => (
                      <div
                        key={c.taskId}
                        className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-muted/50"
                      >
                        <span className="flex-1 truncate">{c.taskTitle}</span>
                        <span className="line-through text-muted-foreground">
                          {formatDate(c.oldStartDate)}
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">
                          {formatDate(c.newStartDate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.changes.length === 0 && preview.suggestedDeps.length === 0 && (
                <div className="text-center text-sm text-muted-foreground py-4">
                  Nessuna modifica necessaria. Il piano attuale e' gia' ottimale.
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={resetForm}
                  className="flex-1"
                >
                  Modifica parametri
                </Button>
                <Button
                  onClick={handleApply}
                  disabled={applying || (preview.changes.length === 0 && acceptedDepIds.size === 0)}
                  className="flex-1"
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Applica piano
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
