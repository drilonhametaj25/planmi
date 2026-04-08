/* use-search.ts — Hook per ricerca globale full-text con debounce. */
"use client";

import useSWR from "swr";
import { useState, useEffect, useRef } from "react";
import type { Task } from "@/db/schema";

export interface SearchResult {
  task: Task;
  matchedField: string;
  matchSnippet: string;
  projectName: string;
}

interface SearchResponse {
  data: SearchResult[];
}

export function useGlobalSearch(
  query: string,
  options?: { projectId?: string; tags?: string[] }
) {
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const params = new URLSearchParams();
  if (debouncedQuery) params.set("q", debouncedQuery);
  if (options?.projectId) params.set("projectId", options.projectId);
  if (options?.tags?.length) params.set("tags", options.tags.join(","));

  const hasQuery = debouncedQuery.length >= 2 || (options?.tags?.length ?? 0) > 0;
  const key = hasQuery ? `/api/search?${params.toString()}` : null;

  const { data, error, isLoading } = useSWR<SearchResponse>(key, {
    revalidateOnFocus: false,
    dedupingInterval: 500,
  });

  return {
    results: data?.data ?? [],
    error,
    isLoading: isLoading && hasQuery,
  };
}
