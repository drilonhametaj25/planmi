/* task-tree.ts — Utility per costruire albero task/sottotask. Ordina i task in struttura gerarchica flat con livello di indentazione. */
import type { Task } from "@/db/schema";

export interface TaskTreeNode {
  task: Task;
  depth: number;
  hasChildren: boolean;
  isLastChild: boolean;
}

/**
 * Converte una lista flat di task in una lista ordinata ad albero.
 * I parent vengono prima, seguiti dai loro figli indentati.
 * Mantiene l'ordine sortOrder dentro ogni livello.
 */
export function buildTaskTree(tasks: Task[]): TaskTreeNode[] {
  const result: TaskTreeNode[] = [];
  const childrenMap = new Map<string, Task[]>();
  const topLevel: Task[] = [];

  // Raggruppa figli per parent
  for (const task of tasks) {
    if (task.parentTaskId) {
      const siblings = childrenMap.get(task.parentTaskId) ?? [];
      siblings.push(task);
      childrenMap.set(task.parentTaskId, siblings);
    } else {
      topLevel.push(task);
    }
  }

  // Ordina ogni gruppo per sortOrder, poi createdAt per stabilità
  const stableSort = (a: Task, b: Task) => {
    const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    // Sort secondario per createdAt (stabilità quando sortOrder è uguale)
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  };
  topLevel.sort(stableSort);
  for (const [, children] of childrenMap) {
    children.sort(stableSort);
  }

  // Costruisci la lista flat ricorsiva
  function addNode(task: Task, depth: number, isLast: boolean) {
    const children = childrenMap.get(task.id) ?? [];
    result.push({
      task,
      depth,
      hasChildren: children.length > 0,
      isLastChild: isLast,
    });
    children.forEach((child, i) => {
      addNode(child, depth + 1, i === children.length - 1);
    });
  }

  topLevel.forEach((task, i) => {
    addNode(task, 0, i === topLevel.length - 1);
  });

  return result;
}

/**
 * Restituisce solo i task visibili in base allo stato collapsed.
 * Se un parent è collapsed, i suoi figli non appaiono.
 */
export function filterVisibleNodes(
  nodes: TaskTreeNode[],
  collapsedIds: Set<string>
): TaskTreeNode[] {
  const result: TaskTreeNode[] = [];
  const hiddenParents = new Set<string>();

  for (const node of nodes) {
    // Se un antenato è collapsed, nascondi questo nodo
    if (node.task.parentTaskId && hiddenParents.has(node.task.parentTaskId)) {
      // Propaga il nascondimento ai figli
      if (node.hasChildren) {
        hiddenParents.add(node.task.id);
      }
      continue;
    }

    result.push(node);

    // Se questo nodo è collapsed e ha figli, nascondi i figli
    if (collapsedIds.has(node.task.id) && node.hasChildren) {
      hiddenParents.add(node.task.id);
    }
  }

  return result;
}
