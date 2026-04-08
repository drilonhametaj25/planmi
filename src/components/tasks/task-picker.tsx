/* task-picker.tsx — Picker task con ricerca e vista ad albero per selezione dipendenze.
   Usa cmdk (Command) per ricerca fuzzy, buildTaskTree per gerarchia. */
"use client";

import { useState, useMemo } from "react";
import type { Task } from "@/db/schema";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  todo: "#71717A",
  in_progress: "#3B82F6",
  in_review: "#8B5CF6",
  done: "#22C55E",
  blocked: "#EF4444",
};

interface TaskTreeNode {
  task: Task;
  depth: number;
  hasChildren: boolean;
  childIds: Set<string>;
}

function buildPickerTree(tasks: Task[]): TaskTreeNode[] {
  const result: TaskTreeNode[] = [];
  const childrenMap = new Map<string, Task[]>();
  const topLevel: Task[] = [];

  for (const task of tasks) {
    if (task.parentTaskId) {
      const siblings = childrenMap.get(task.parentTaskId) ?? [];
      siblings.push(task);
      childrenMap.set(task.parentTaskId, siblings);
    } else {
      topLevel.push(task);
    }
  }

  topLevel.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const [, children] of childrenMap) {
    children.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  function collectChildIds(taskId: string): Set<string> {
    const ids = new Set<string>();
    const children = childrenMap.get(taskId) ?? [];
    for (const child of children) {
      ids.add(child.id);
      for (const id of collectChildIds(child.id)) ids.add(id);
    }
    return ids;
  }

  function addNode(task: Task, depth: number) {
    const children = childrenMap.get(task.id) ?? [];
    result.push({
      task,
      depth,
      hasChildren: children.length > 0,
      childIds: collectChildIds(task.id),
    });
    children.forEach((child) => addNode(child, depth + 1));
  }

  topLevel.forEach((task) => addNode(task, 0));
  return result;
}

interface TaskPickerProps {
  tasks: Task[];
  excludeIds?: Set<string>;
  onSelect: (taskId: string) => void;
  placeholder?: string;
}

export function TaskPicker({
  tasks,
  excludeIds,
  onSelect,
  placeholder = "Cerca task...",
}: TaskPickerProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const treeNodes = useMemo(() => buildPickerTree(tasks), [tasks]);

  const visibleNodes = useMemo(() => {
    return treeNodes.filter((node) => {
      // Exclude filtered IDs
      if (excludeIds?.has(node.task.id)) return false;
      // Check if any ancestor is collapsed
      for (const other of treeNodes) {
        if (
          other.hasChildren &&
          collapsedIds.has(other.task.id) &&
          other.childIds.has(node.task.id)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [treeNodes, collapsedIds, excludeIds]);

  const toggleCollapse = (taskId: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  return (
    <Command className="rounded-md border border-border bg-background" shouldFilter={true}>
      <CommandInput placeholder={placeholder} />
      <CommandList className="max-h-48">
        <CommandEmpty>Nessun task trovato</CommandEmpty>
        <CommandGroup>
          {visibleNodes.map((node) => {
            const { task, depth, hasChildren } = node;
            const color = STATUS_COLORS[task.status ?? "todo"] ?? "#71717A";
            const isCollapsed = collapsedIds.has(task.id);

            return (
              <CommandItem
                key={task.id}
                value={`${task.title} ${task.id}`}
                onSelect={() => onSelect(task.id)}
                className="py-1.5"
              >
                <div
                  className="flex items-center gap-1.5 w-full min-w-0"
                  style={{ paddingLeft: `${depth * 16}px` }}
                >
                  {/* Collapse toggle */}
                  {hasChildren ? (
                    <button
                      className="h-4 w-4 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleCollapse(task.id);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}

                  {/* Status dot */}
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />

                  {/* Title */}
                  <span
                    className={cn(
                      "text-xs truncate flex-1",
                      depth > 0 && "text-[11px]",
                      task.status === "done" && "line-through text-muted-foreground"
                    )}
                  >
                    {task.title}
                  </span>

                  {/* Dates */}
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-auto">
                    {task.startDate.slice(5)} → {task.endDate.slice(5)}
                  </span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
