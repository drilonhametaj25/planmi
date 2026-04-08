/* use-tasks.ts — Hook per CRUD task con SWR. Optimistic updates per Gantt/Board/List. */
"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { Task, NewTask, Dependency } from "@/lib/types";
import type { TaskLinkRow } from "@/db/schema";

interface TasksResponse {
  data: {
    tasks: Task[];
    dependencies: Dependency[];
    taskLinks?: TaskLinkRow[];
  };
}

function tasksKey(projectId: string | undefined) {
  return projectId ? `/api/projects/${projectId}/tasks` : null;
}

async function createTask(
  url: string,
  { arg }: { arg: Partial<NewTask> }
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error("Errore creazione task");
  return res.json() as Promise<{ data: Task }>;
}

async function updateTask(
  _url: string,
  { arg }: { arg: { id: string; data: Partial<Task> } }
) {
  const res = await fetch(`/api/tasks/${arg.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg.data),
  });
  if (!res.ok) throw new Error("Errore aggiornamento task");
  return res.json() as Promise<{ data: Task }>;
}

async function deleteTask(
  _url: string,
  { arg }: { arg: { id: string } }
) {
  const res = await fetch(`/api/tasks/${arg.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Errore cancellazione task");
  return res.json();
}

async function moveTask(
  _url: string,
  { arg }: { arg: { id: string; newStartDate: string; newEndDate: string } }
) {
  const res = await fetch(`/api/tasks/${arg.id}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      newStartDate: arg.newStartDate,
      newEndDate: arg.newEndDate,
    }),
  });
  if (!res.ok) throw new Error("Errore spostamento task");
  return res.json();
}

async function reorderTasks(
  _url: string,
  { arg }: { arg: { updates: { id: string; sortOrder: number }[] } }
) {
  const res = await fetch("/api/tasks/reorder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error("Errore riordinamento task");
  return res.json();
}

async function createTaskLink(
  _url: string,
  { arg }: { arg: { sourceTaskId: string; targetTaskId: string; linkType: string; notes?: string } }
) {
  const res = await fetch("/api/task-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error("Errore creazione collegamento");
  return res.json();
}

async function deleteTaskLink(
  _url: string,
  { arg }: { arg: { id: string } }
) {
  const res = await fetch(`/api/task-links/${arg.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Errore cancellazione collegamento");
  return res.json();
}

async function continueTask(
  _url: string,
  { arg }: { arg: { id: string; targetParentTaskId: string; title?: string } }
) {
  const res = await fetch(`/api/tasks/${arg.id}/continue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetParentTaskId: arg.targetParentTaskId, title: arg.title }),
  });
  if (!res.ok) throw new Error("Errore continuazione task");
  return res.json() as Promise<{ data: { task: Task } }>;
}

export function useProjectTasks(projectId: string | undefined) {
  const key = tasksKey(projectId);
  const { data, error, isLoading, mutate } = useSWR<TasksResponse>(key);

  const { trigger: triggerCreate, isMutating: isCreating } = useSWRMutation(
    key,
    createTask
  );

  const { trigger: triggerUpdate } = useSWRMutation(key, updateTask);
  const { trigger: triggerDelete } = useSWRMutation(key, deleteTask);
  const { trigger: triggerMove } = useSWRMutation(key, moveTask);
  const { trigger: triggerReorder } = useSWRMutation(key, reorderTasks);
  const { trigger: triggerCreateLink } = useSWRMutation(key, createTaskLink);
  const { trigger: triggerDeleteLink } = useSWRMutation(key, deleteTaskLink);
  const { trigger: triggerContinue } = useSWRMutation(key, continueTask);

  return {
    tasks: data?.data?.tasks ?? [],
    dependencies: data?.data?.dependencies ?? [],
    taskLinks: data?.data?.taskLinks ?? [],
    error,
    isLoading,
    mutate,
    createTask: triggerCreate,
    isCreating,
    updateTask: triggerUpdate,
    deleteTask: triggerDelete,
    moveTask: triggerMove,
    reorderTasks: triggerReorder,
    createTaskLink: triggerCreateLink,
    deleteTaskLink: triggerDeleteLink,
    continueTask: triggerContinue,
  };
}
