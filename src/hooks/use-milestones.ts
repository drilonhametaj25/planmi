/* use-milestones.ts — Hook per CRUD milestones di un progetto. */
"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { Milestone, NewMilestone } from "@/lib/types";

interface MilestonesResponse {
  data: Milestone[];
}

function milestonesKey(projectId: string | undefined) {
  return projectId ? `/api/projects/${projectId}/milestones` : null;
}

async function createMilestone(
  url: string,
  { arg }: { arg: Omit<NewMilestone, "id" | "projectId" | "createdAt"> }
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error("Errore creazione milestone");
  return res.json() as Promise<{ data: Milestone }>;
}

async function updateMilestone(
  _url: string,
  { arg }: { arg: { id: string; data: Partial<Milestone> } }
) {
  const res = await fetch(`/api/milestones/${arg.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg.data),
  });
  if (!res.ok) throw new Error("Errore aggiornamento milestone");
  return res.json() as Promise<{ data: Milestone }>;
}

async function deleteMilestone(
  _url: string,
  { arg }: { arg: { id: string } }
) {
  const res = await fetch(`/api/milestones/${arg.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Errore cancellazione milestone");
  return res.json();
}

export function useMilestones(projectId: string | undefined) {
  const key = milestonesKey(projectId);
  const { data, error, isLoading, mutate } = useSWR<MilestonesResponse>(key);

  const { trigger: triggerCreate } = useSWRMutation(key, createMilestone);
  const { trigger: triggerUpdate } = useSWRMutation(key, updateMilestone);
  const { trigger: triggerDelete } = useSWRMutation(key, deleteMilestone);

  return {
    milestones: data?.data ?? [],
    error,
    isLoading,
    mutate,
    createMilestone: triggerCreate,
    updateMilestone: triggerUpdate,
    deleteMilestone: triggerDelete,
  };
}
