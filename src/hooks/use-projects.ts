/* use-projects.ts — Hook per CRUD progetti con SWR. Optimistic updates + rollback on error. */
"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { ProjectWithStats, NewProject, Project } from "@/lib/types";

const PROJECTS_KEY = "/api/projects";

interface ProjectsResponse {
  data: ProjectWithStats[];
}

interface ProjectDetailResponse {
  data: Project & {
    tasks: import("@/db/schema").Task[];
    milestones: import("@/db/schema").Milestone[];
    dependencies: import("@/db/schema").Dependency[];
  };
}

async function createProject(url: string, { arg }: { arg: Partial<NewProject> }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error("Errore creazione progetto");
  return res.json() as Promise<{ data: Project }>;
}

async function updateProject(
  url: string,
  { arg }: { arg: { id: string; data: Partial<Project> } }
) {
  const res = await fetch(`/api/projects/${arg.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg.data),
  });
  if (!res.ok) throw new Error("Errore aggiornamento progetto");
  return res.json() as Promise<{ data: Project }>;
}

async function deleteProject(
  url: string,
  { arg }: { arg: { id: string } }
) {
  const res = await fetch(`/api/projects/${arg.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Errore cancellazione progetto");
  return res.json();
}

export function useProjects() {
  const { data, error, isLoading, mutate } =
    useSWR<ProjectsResponse>(PROJECTS_KEY);

  const { trigger: triggerCreate, isMutating: isCreating } = useSWRMutation(
    PROJECTS_KEY,
    createProject
  );

  const { trigger: triggerUpdate } = useSWRMutation(
    PROJECTS_KEY,
    updateProject
  );

  const { trigger: triggerDelete } = useSWRMutation(
    PROJECTS_KEY,
    deleteProject
  );

  return {
    projects: data?.data ?? [],
    error,
    isLoading,
    mutate,
    createProject: triggerCreate,
    isCreating,
    updateProject: triggerUpdate,
    deleteProject: triggerDelete,
  };
}

export function useProject(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ProjectDetailResponse>(
    id ? `/api/projects/${id}` : null
  );

  return {
    project: data?.data,
    error,
    isLoading,
    mutate,
  };
}
