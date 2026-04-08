/* page.tsx — Lista progetti con dialog per creazione nuovo progetto. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useProjects } from "@/hooks/use-projects";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const COLORS = [
  "#3B82F6",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

export default function ProjectsPage() {
  const { projects, isLoading, createProject, mutate } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("freelance");
  const [color, setColor] = useState("#3B82F6");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category as "freelance" | "saas" | "gestionale" | "side_project" | "altro",
        color,
      });
      await mutate();
      setOpen(false);
      setName("");
      setDescription("");
      toast.success("Progetto creato");
    } catch {
      toast.error("Errore nella creazione");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progetti</h1>
          <p className="text-muted-foreground">
            Gestisci i tuoi progetti
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Progetto
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo Progetto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Es: EdiliziaMi v2"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Descrizione</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Breve descrizione..."
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={(v) => { if (v) setCategory(v); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freelance">Freelance</SelectItem>
                    <SelectItem value="saas">SaaS</SelectItem>
                    <SelectItem value="gestionale">Gestionale</SelectItem>
                    <SelectItem value="side_project">Side Project</SelectItem>
                    <SelectItem value="altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Colore</Label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className={`h-7 w-7 rounded-full border-2 transition-transform ${
                        color === c
                          ? "border-foreground scale-110"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
              <Button
                className="w-full"
                onClick={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating ? "Creazione..." : "Crea Progetto"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-md bg-muted animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            Nessun progetto ancora. Clicca &quot;Nuovo Progetto&quot; per iniziare!
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="rounded-md border border-border bg-card p-4 hover:border-primary/30 transition-colors space-y-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: project.color ?? "#3B82F6" }}
                />
                <h3 className="font-medium truncate">{project.name}</h3>
              </div>

              {project.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-mono">
                  {project.completedTasks}/{project.totalTasks} task
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-16 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    {project.progress}%
                  </span>
                </div>
              </div>

              {project.overdueTasks > 0 && (
                <p className="text-[10px] text-critical font-mono">
                  {project.overdueTasks} task in ritardo
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
