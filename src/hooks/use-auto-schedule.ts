/* use-auto-schedule.ts — Hook per richiedere suggerimento date ottimali dal server. */
"use client";

import { useState, useCallback, useRef } from "react";
import type { AutoScheduleResult, PredecessorDep } from "@/lib/types";

interface AutoScheduleParams {
  taskType: string | null;
  estimatedHours: number | null;
  parentTaskId: string | null;
  milestoneId: string | null;
  predecessorDeps: PredecessorDep[];
}

export function useAutoSchedule(projectId: string) {
  const [suggestion, setSuggestion] = useState<AutoScheduleResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(
    (params: AutoScheduleParams) => {
      // Cancella richiesta precedente
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();

      // Mostra loading subito (non aspettare il debounce)
      setIsLoading(true);

      // Debounce 300ms
      timerRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;

        try {
          const res = await fetch(
            `/api/projects/${projectId}/auto-schedule`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(params),
              signal: controller.signal,
            }
          );
          if (!res.ok) throw new Error("Errore auto-schedule");
          const json = (await res.json()) as { data: AutoScheduleResult };
          if (!controller.signal.aborted) {
            setSuggestion(json.data);
          }
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          console.error("Auto-schedule error:", e);
          if (!controller.signal.aborted) {
            setSuggestion(null);
          }
        } finally {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        }
      }, 300);
    },
    [projectId]
  );

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (abortRef.current) abortRef.current.abort();
    setSuggestion(null);
    setIsLoading(false);
  }, []);

  return { suggestion, isLoading, trigger, reset };
}
