/* use-time-off.ts — Hook per CRUD time-off (ferie, permessi, malattia). */
"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { TimeOff } from "@/db/schema";

interface TimeOffResponse {
  data: TimeOff[];
}

const KEY = "/api/time-off";

async function createTimeOff(
  url: string,
  { arg }: { arg: { startDate: string; endDate: string; type: string; hoursPerDay?: number | null; note?: string } }
) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error("Errore creazione time off");
  return res.json() as Promise<{ data: TimeOff }>;
}

async function deleteTimeOff(
  _url: string,
  { arg }: { arg: { id: string } }
) {
  const res = await fetch(`/api/time-off/${arg.id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Errore cancellazione time off");
  return res.json();
}

export function useTimeOff() {
  const { data, error, isLoading, mutate } = useSWR<TimeOffResponse>(KEY);

  const { trigger: triggerCreate } = useSWRMutation(KEY, createTimeOff);
  const { trigger: triggerDelete } = useSWRMutation(KEY, deleteTimeOff);

  return {
    timeOff: data?.data ?? [],
    error,
    isLoading,
    mutate,
    createTimeOff: triggerCreate,
    deleteTimeOff: triggerDelete,
  };
}
