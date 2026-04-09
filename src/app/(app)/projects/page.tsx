/* page.tsx — Lista progetti con dialog per creazione/modifica e soft delete. */
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
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProjectWithStats } from "@/lib/types";

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

const CATEGORIES = [
  { value: "freelance", label: "Freelance" },
  { value: "saas", label: "SaaS" },
  { value: "gestionale", label: "Gestionale" },
  { value: "side_project", label: "Side Project" },
  { value: "altro", label: "Altro" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

export default function ProjectsPage() {
  const { projects, isLoading, createProject, updateProject, deleteProject, mutate } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<CategoryValue>("freelance");
  const [color, setColor] = useState("#3B82F6");
  const [creating, setCreating] = useState(false);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editProject, setEditProject] = useState<ProjectWithStats | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState<CategoryValue>("freelance");
  const [editColor, setEditColor] = useState("#3B82F6");
  const [saving, setSaving] = useState(false);

  // Delete confirm dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectWithStats | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        category,
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

  function openEdit(project: ProjectWithStats) {
    setEditProject(project);
    setEditName(project.name);
    setEditDescription(project.description ?? "");
    setEditCategory((project.category as CategoryValue) ?? "freelance");
    setEditColor(project.color ?? "#3B82F6");
    setEditOpen(true);
  }

  async function handleEdit() {
    if (!editProject || !editName.trim()) return;
    setSaving(true);
    try {
      await updateProject({
        id: editProject.id,
        data: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          category: editCategory,
          color: editColor,
        },
      });
      await mutate();
      setEditOpen(false);
      setEditProject(null);
      toast.success("Progetto aggiornato");
    } catch {
      toast.error("Errore nell'aggiornamento");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteConfirm(project: ProjectWithStats) {
    setDeleteTarget(project);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProject({ id: deleteTarget.id });
      await mutate();
      setDeleteOpen(false);
      setDeleteTarget(null);
      toast.success("Progetto eliminato");
    } catch {
      toast.error("Errore nell'eliminazione");
    } finally {
      setDeleting(false);
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
                <Select value={category} onValueChange={(v) => { if (v) setCategory(v as CategoryValue); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
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
            <div
              key={project.id}
              className="relative rounded-md border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <Link
                href={`/projects/${project.id}`}
                className="block p-4 space-y-3"
              >
                <div className="flex items-center gap-2 pr-8">
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
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

              {/* Dropdown menu per modifica/elimina */}
              <div className="absolute top-3 right-3">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors">
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" side="bottom">
                    <DropdownMenuItem onClick={() => openEdit(project)}>
                      <Pencil className="h-4 w-4" />
                      Modifica
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => openDeleteConfirm(project)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Elimina
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialog modifica progetto */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Progetto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descrizione</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Breve descrizione..."
              />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={editCategory} onValueChange={(v) => { if (v) setEditCategory(v as CategoryValue); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
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
                      editColor === c
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                    onClick={() => setEditColor(c)}
                  />
                ))}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handleEdit}
              disabled={!editName.trim() || saving}
            >
              {saving ? "Salvataggio..." : "Salva Modifiche"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog conferma eliminazione */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina Progetto</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare il progetto{" "}
              <strong>{deleteTarget?.name}</strong>? Il progetto non sarà più
              visibile ma i dati verranno conservati.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Eliminazione..." : "Elimina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
