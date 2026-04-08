/* use-suggestions.ts — Hook per caricare suggerimenti di un progetto con SWR. */
"use client";

import useSWR from "swr";
import type { Suggestion } from "@/lib/suggestions-engine";

interface SuggestionsResponse {
  data: Suggestion[];
}

export function useSuggestions(projectId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<SuggestionsResponse>(
    projectId ? `/api/projects/${projectId}/suggestions` : null,
    { refreshInterval: 60000 } // Refresh ogni minuto
  );

  return {
    suggestions: data?.data ?? [],
    error,
    isLoading,
    mutate,
  };
}
