/* use-emergency-insert.ts — Hook per inserimento emergenza con preview/apply. */
"use client";

import { useState, useCallback } from "react";
import type { ShiftEntry } from "@/lib/shifting-engine";

interface EmergencyParams {
  title: string;
  taskType?: string;
  estimatedHours?: number;
  insertDate: string;
  parentTaskId?: string | null;
  description?: string;
  notes?: string;
  priority?: string;
}

interface EmergencyPreview {
  emergencyTask: {
    title: string;
    startDate: string;
    endDate: string;
    priority: string;
    estimatedHours: number;
  };
  shifts: ShiftEntry[];
  stats: { tasksShifted: number };
}

export function useEmergencyInsert(projectId: string) {
  const [preview, setPreview] = useState<EmergencyPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPreview = useCallback(
    async (params: EmergencyParams) => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/emergency-insert?preview=true`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          }
        );
        if (!res.ok) throw new Error("Errore preview");
        const json = await res.json();
        setPreview(json.data);
        return json.data as EmergencyPreview;
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  const apply = useCallback(
    async (params: EmergencyParams) => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/emergency-insert`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          }
        );
        if (!res.ok) throw new Error("Errore applicazione");
        const json = await res.json();
        setPreview(null);
        return json.data;
      } finally {
        setIsLoading(false);
      }
    },
    [projectId]
  );

  const reset = useCallback(() => setPreview(null), []);

  return { preview, isLoading, fetchPreview, apply, reset };
}
