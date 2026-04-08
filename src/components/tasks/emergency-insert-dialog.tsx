/* emergency-insert-dialog.tsx — Dialog per inserimento task emergenza con preview degli shift. */
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { useEmergencyInsert } from "@/hooks/use-emergency-insert";
import { toast } from "sonner";
import type { ShiftEntry } from "@/lib/shifting-engine";
import { formatDateStr, formatDateStrFull } from "@/lib/gantt/timeline";

interface EmergencyInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onApplied: () => Promise<unknown>;
}

export function EmergencyInsertDialog({
  open,
  onOpenChange,
  projectId,
  onApplied,
}: EmergencyInsertDialogProps) {
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState("altro");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [insertDate, setInsertDate] = useState(
    () => new Date().toISOString().split("T")[0]!
  );
  const [description, setDescription] = useState("");
  const [applying, setApplying] = useState(false);

  const { preview, isLoading, fetchPreview, apply, reset } =
    useEmergencyInsert(projectId);

  function resetForm() {
    setTitle("");
    setTaskType("altro");
    setEstimatedHours("");
    setInsertDate(new Date().toISOString().split("T")[0]!);
    setDescription("");
    reset();
  }

  async function handlePreview() {
    if (!title.trim()) return;
    await fetchPreview({
      title: title.trim(),
      taskType,
      estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
      insertDate,
      description: description.trim() || undefined,
      priority: "critical",
    });
  }

  async function handleApply() {
    if (!title.trim()) return;
    setApplying(true);
    try {
      await apply({
        title: title.trim(),
        taskType,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        insertDate,
        description: description.trim() || undefined,
        priority: "critical",
      });
      await onApplied();
      toast.success("Emergenza inserita e task traslati");
      resetForm();
      onOpenChange(false);
    } catch {
      toast.error("Errore nell'inserimento");
    } finally {
      setApplying(false);
    }
  }

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
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Inserimento emergenza
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Form */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Titolo *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Es: Hotfix critico client X"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={taskType} onValueChange={(v) => { if (v) setTaskType(v); }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bug_fix">Bug Fix</SelectItem>
                    <SelectItem value="feature">Feature</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="devops">DevOps</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ore stimate</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="8"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Data inserimento</Label>
              <Input
                type="date"
                value={insertDate}
                onChange={(e) => setInsertDate(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrizione</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opzionale..."
              />
            </div>
          </div>

          {/* Preview button */}
          {!preview && (
            <Button
              onClick={handlePreview}
              disabled={!title.trim() || isLoading}
              className="w-full"
              variant="destructive"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <AlertTriangle className="h-4 w-4 mr-2" />
              )}
              Calcola impatto
            </Button>
          )}

          {/* Preview results */}
          {preview && (
            <div className="space-y-3">
              {/* Emergency task card */}
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  {preview.emergencyTask.title}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatDateStrFull(preview.emergencyTask.startDate)} → {formatDateStrFull(preview.emergencyTask.endDate)}
                  {" · "}{preview.emergencyTask.estimatedHours}h
                </div>
              </div>

              {/* Stats */}
              <div className="text-sm text-muted-foreground">
                {preview.stats.tasksShifted === 0 ? (
                  "Nessun task da traslare"
                ) : (
                  <span>
                    <span className="font-medium text-foreground">
                      {preview.stats.tasksShifted}
                    </span>{" "}
                    task verranno traslati
                  </span>
                )}
              </div>

              {/* Shift list */}
              {preview.shifts.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {preview.shifts.map((shift: ShiftEntry) => (
                    <ShiftRow key={shift.taskId} shift={shift} />
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    reset();
                  }}
                  className="flex-1"
                >
                  Modifica
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleApply}
                  disabled={applying}
                  className="flex-1"
                >
                  {applying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Conferma inserimento
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShiftRow({ shift }: { shift: ShiftEntry }) {
  return (
    <div className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-muted/50">
      <span className="flex-1 truncate text-muted-foreground">{shift.taskId.slice(0, 8)}...</span>
      <span className="line-through text-muted-foreground">
        {formatDateStr(shift.oldStartDate)}
      </span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />
      <span className="font-medium">
        {formatDateStr(shift.newStartDate)}
      </span>
    </div>
  );
}
