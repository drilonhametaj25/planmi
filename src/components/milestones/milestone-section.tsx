/* milestone-section.tsx — Sezione milestones nella pagina progetto. Crea, toggle completamento, elimina. */
"use client";

import { useState } from "react";
import type { Milestone } from "@/db/schema";
import { Diamond, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatShortDate, parseDate } from "@/lib/gantt/timeline";
import { toast } from "sonner";

interface MilestoneSectionProps {
  milestones: Milestone[];
  onCreateMilestone: (data: { title: string; date: string; description?: string }) => Promise<unknown>;
  onUpdateMilestone: (data: { id: string; data: Partial<Milestone> }) => Promise<unknown>;
  onDeleteMilestone: (data: { id: string }) => Promise<unknown>;
  onMutate: () => Promise<unknown>;
}

export function MilestoneSection({
  milestones,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onMutate,
}: MilestoneSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0]!;
  });
  const [description, setDescription] = useState("");

  async function handleCreate() {
    if (!title.trim() || !date) return;
    try {
      await onCreateMilestone({
        title: title.trim(),
        date,
        description: description.trim() || undefined,
      });
      await onMutate();
      setTitle("");
      setDescription("");
      setShowForm(false);
      toast.success("Milestone creata");
    } catch {
      toast.error("Errore creazione milestone");
    }
  }

  async function handleToggleComplete(milestone: Milestone) {
    try {
      await onUpdateMilestone({
        id: milestone.id,
        data: { isCompleted: !milestone.isCompleted },
      });
      await onMutate();
    } catch {
      toast.error("Errore aggiornamento milestone");
    }
  }

  async function handleDelete(id: string) {
    try {
      await onDeleteMilestone({ id });
      await onMutate();
      toast.success("Milestone rimossa");
    } catch {
      toast.error("Errore rimozione milestone");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Diamond className="h-4 w-4 text-warning" />
          <span className="text-sm font-medium">Milestones</span>
          <span className="text-xs text-muted-foreground font-mono">
            {milestones.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Nuova
        </Button>
      </div>

      {/* Form creazione */}
      {showForm && (
        <div className="rounded-md border border-border bg-card p-3 space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Titolo</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Es: Release v1.0"
              className="h-8 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setShowForm(false);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrizione</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Opzionale"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleCreate}
              disabled={!title.trim() || !date}
            >
              Crea
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowForm(false)}
            >
              Annulla
            </Button>
          </div>
        </div>
      )}

      {/* Lista milestones */}
      {milestones.length === 0 && !showForm && (
        <p className="text-xs text-muted-foreground italic">Nessuna milestone</p>
      )}

      <div className="space-y-1">
        {milestones.map((m) => {
          const d = parseDate(m.date);
          const isPast = d < new Date();
          return (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 group"
            >
              <button
                onClick={() => handleToggleComplete(m)}
                className={cn(
                  "h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors",
                  m.isCompleted
                    ? "bg-success border-success"
                    : "border-muted-foreground hover:border-foreground"
                )}
              >
                {m.isCompleted && <Check className="h-3 w-3 text-white" />}
              </button>

              <Diamond
                className={cn(
                  "h-3 w-3 shrink-0",
                  m.isCompleted ? "text-success" : isPast ? "text-critical" : "text-warning"
                )}
              />

              <span
                className={cn(
                  "text-xs flex-1 truncate",
                  m.isCompleted && "line-through text-muted-foreground"
                )}
              >
                {m.title}
              </span>

              <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                {formatShortDate(d)}
              </span>

              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={() => handleDelete(m.id)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
