/* global-search.tsx — Command palette per ricerca globale. Si apre con Ctrl+K. */
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { FileText, StickyNote, Tag, Type } from "lucide-react";
import { useGlobalSearch } from "@/hooks/use-search";
import { parseTags } from "@/lib/tags";

const FIELD_ICONS: Record<string, React.ReactNode> = {
  title: <Type className="h-3.5 w-3.5 text-muted-foreground" />,
  description: <FileText className="h-3.5 w-3.5 text-muted-foreground" />,
  notes: <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />,
  tags: <Tag className="h-3.5 w-3.5 text-muted-foreground" />,
};

const FIELD_LABELS: Record<string, string> = {
  title: "Titolo",
  description: "Descrizione",
  notes: "Note",
  tags: "Tag",
};

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const { results, isLoading } = useGlobalSearch(query);
  const router = useRouter();

  const handleSelect = useCallback(
    (projectId: string, taskId: string) => {
      onOpenChange(false);
      setQuery("");
      router.push(`/projects/${projectId}?task=${taskId}`);
    },
    [onOpenChange, router]
  );

  // Raggruppa risultati per progetto
  const grouped = new Map<string, typeof results>();
  for (const r of results) {
    const key = r.projectName || "Senza progetto";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
      title="Ricerca globale"
      description="Cerca nei task per titolo, descrizione, note o tag"
    >
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Cerca task, note, tag..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.length < 2 && (
            <CommandEmpty>Digita almeno 2 caratteri per cercare</CommandEmpty>
          )}
          {query.length >= 2 && !isLoading && results.length === 0 && (
            <CommandEmpty>Nessun risultato per &quot;{query}&quot;</CommandEmpty>
          )}
          {isLoading && query.length >= 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Ricerca in corso...
            </div>
          )}

          {[...grouped.entries()].map(([projectName, items], groupIdx) => (
            <div key={projectName}>
              {groupIdx > 0 && <CommandSeparator />}
              <CommandGroup heading={projectName}>
                {items.map((r) => {
                  const taskTags = parseTags(r.task.tags);
                  return (
                    <CommandItem
                      key={r.task.id}
                      value={r.task.id}
                      onSelect={() =>
                        handleSelect(r.task.projectId, r.task.id)
                      }
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">
                            {highlightMatch(r.task.title, query)}
                          </span>
                        </div>
                        {r.matchedField !== "title" && (
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            {FIELD_ICONS[r.matchedField]}
                            <span className="text-[10px] font-medium uppercase tracking-wider">
                              {FIELD_LABELS[r.matchedField]}
                            </span>
                            <span className="truncate">
                              {highlightMatch(r.matchSnippet, query)}
                            </span>
                          </div>
                        )}
                        {taskTags.length > 0 && (
                          <div className="flex gap-1 mt-0.5">
                            {taskTags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex h-4 px-1.5 rounded bg-primary/15 text-primary text-[10px] font-medium"
                              >
                                {tag}
                              </span>
                            ))}
                            {taskTags.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{taskTags.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/** Evidenzia il testo matchato con <mark>. */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
