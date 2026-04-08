/* use-dependencies.ts — Hook per creare/rimuovere dipendenze tra task. */
"use client";

import { useSWRConfig } from "swr";
import { useCallback, useState } from "react";
import type { Dependency, NewDependency } from "@/lib/types";

export function useDependencies(projectId: string | undefined) {
  const { mutate } = useSWRConfig();
  const [isCreating, setIsCreating] = useState(false);

  const tasksKey = projectId ? `/api/projects/${projectId}/tasks` : null;

  const createDependency = useCallback(
    async (data: Omit<NewDependency, "id" | "createdAt">) => {
      setIsCreating(true);
      try {
        const res = await fetch("/api/dependencies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Errore creazione dipendenza");
        }
        const result = (await res.json()) as { data: Dependency };
        if (tasksKey) await mutate(tasksKey);
        return result.data;
      } finally {
        setIsCreating(false);
      }
    },
    [tasksKey, mutate]
  );

  const deleteDependency = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/dependencies/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Errore cancellazione dipendenza");
      if (tasksKey) await mutate(tasksKey);
    },
    [tasksKey, mutate]
  );

  return { createDependency, deleteDependency, isCreating };
}
