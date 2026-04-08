/* time-off-manager.tsx — Dialog per gestire ferie, permessi e malattia.
   CRUD completo con lista e form di creazione. */
"use client";

import { useState } from "react";
import type { TimeOff } from "@/db/schema";
import { useTimeOff } from "@/hooks/use-time-off";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ferie: { label: "Ferie", color: "bg-pm-accent" },
  permesso: { label: "Permesso", color: "bg-warning" },
  malattia: { label: "Malattia", color: "bg-critical" },
  altro: { label: "Altro", color: "bg-muted-foreground" },
};

export function TimeOffManager() {
  const { timeOff, createTimeOff, deleteTimeOff, mutate } = useTimeOff();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]!
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]!
  );
  const [type, setType] = useState<string>("ferie");
  const [hoursPerDay, setHoursPerDay] = useState<string>("");
  const [note, setNote] = useState("");

  function resetForm() {
    setStartDate(new Date().toISOString().split("T")[0]!);
    setEndDate(new Date().toISOString().split("T")[0]!);
    setType("ferie");
    setHoursPerDay("");
    setNote("");
    setAdding(false);
  }

  async function handleCreate() {
    try {
      await createTimeOff({
        startDate,
        endDate,
        type,
        hoursPerDay: hoursPerDay ? Number(hoursPerDay) : null,
        note: note || undefined,
      });
      await mutate();
      resetForm();
      toast.success("Assenza aggiunta");
    } catch {
      toast.error("Errore nella creazione");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteTimeOff({ id });
      await mutate();
      toast.success("Assenza rimossa");
    } catch {
      toast.error("Errore nella cancellazione");
    }
  }

  // Separa passate e future
  const today = new Date().toISOString().split("T")[0]!;
  const upcoming = timeOff.filter((t) => t.endDate >= today);
  const past = timeOff.filter((t) => t.endDate < today);

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger
        render={
          <button className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors w-full text-left">
            <CalendarOff className="h-4 w-4" />
            Ferie / Permessi
            {upcoming.length > 0 && (
              <span className="ml-auto text-[10px] bg-pm-accent/20 text-pm-accent px-1.5 py-0.5 rounded-full font-mono">
                {upcoming.length}
              </span>
            )}
          </button>
        }
      />
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-muted-foreground" />
            Ferie e Permessi
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
          {/* Form aggiunta */}
          {adding ? (
            <div className="space-y-3 rounded-md border border-border bg-card p-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Da</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">A</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={type} onValueChange={(v) => { if (v) setType(v); }}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ferie">Ferie</SelectItem>
                      <SelectItem value="permesso">Permesso</SelectItem>
                      <SelectItem value="malattia">Malattia</SelectItem>
                      <SelectItem value="altro">Altro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ore/giorno (vuoto = giornata intera)</Label>
                  <Input
                    type="number"
                    value={hoursPerDay}
                    onChange={(e) => setHoursPerDay(e.target.value)}
                    className="h-8 text-xs"
                    placeholder="8 = tutto il giorno"
                    min={0.5}
                    max={8}
                    step={0.5}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Note</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Es: Vacanza estiva"
                />
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleCreate}>
                  Salva
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={resetForm}>
                  Annulla
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3 w-3" />
              Aggiungi assenza
            </Button>
          )}

          {/* Lista assenze future */}
          {upcoming.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Prossime
              </p>
              {upcoming.map((entry) => (
                <TimeOffRow key={entry.id} entry={entry} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* Lista assenze passate */}
          {past.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Passate
              </p>
              {past.map((entry) => (
                <TimeOffRow key={entry.id} entry={entry} onDelete={handleDelete} isPast />
              ))}
            </div>
          )}

          {timeOff.length === 0 && !adding && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Nessuna assenza registrata
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TimeOffRow({
  entry,
  onDelete,
  isPast,
}: {
  entry: TimeOff;
  onDelete: (id: string) => void;
  isPast?: boolean;
}) {
  const typeInfo = TYPE_LABELS[entry.type] ?? TYPE_LABELS.altro!;
  const isFullDay = !entry.hoursPerDay || parseFloat(entry.hoursPerDay) >= 8;
  const sameDay = entry.startDate === entry.endDate;

  return (
    <div className={cn(
      "flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2",
      isPast && "opacity-50"
    )}>
      <span className={cn("h-2 w-2 rounded-full shrink-0", typeInfo.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{typeInfo.label}</span>
          {!isFullDay && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {entry.hoursPerDay}h/g
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground font-mono">
          {sameDay ? entry.startDate : `${entry.startDate} - ${entry.endDate}`}
        </p>
        {entry.note && (
          <p className="text-[10px] text-muted-foreground truncate">{entry.note}</p>
        )}
      </div>
      <button
        className="text-muted-foreground hover:text-critical shrink-0"
        onClick={() => onDelete(entry.id)}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}
