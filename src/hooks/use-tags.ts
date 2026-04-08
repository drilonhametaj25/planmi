/* use-tags.ts — Hook per caricare tag unici per autocomplete. */
"use client";

import useSWR from "swr";

interface TagsResponse {
  data: string[];
}

export function useTags(projectId?: string) {
  const params = projectId ? `?projectId=${projectId}` : "";
  const { data, error, isLoading, mutate } = useSWR<TagsResponse>(
    `/api/tags${params}`
  );

  return {
    tags: data?.data ?? [],
    error,
    isLoading,
    mutate,
  };
}
