/* dependency-graph.ts — Utilities pure per grafi di dipendenze. Cycle detection, topological sort. Zero side effects. */

export interface GraphEdge {
  predecessorId: string;
  successorId: string;
}

/** Costruisce lista di adiacenza predecessore → successori */
export function buildAdjacencyList(
  edges: GraphEdge[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adj.get(edge.predecessorId) ?? [];
    list.push(edge.successorId);
    adj.set(edge.predecessorId, list);
  }
  return adj;
}

/** Costruisce lista di adiacenza inversa: successore → predecessori */
export function buildReverseAdjacencyList(
  edges: GraphEdge[]
): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    const list = adj.get(edge.successorId) ?? [];
    list.push(edge.predecessorId);
    adj.set(edge.successorId, list);
  }
  return adj;
}

/** Raccoglie tutti i nodi dal grafo */
export function collectNodes(edges: GraphEdge[]): Set<string> {
  const nodes = new Set<string>();
  for (const edge of edges) {
    nodes.add(edge.predecessorId);
    nodes.add(edge.successorId);
  }
  return nodes;
}

/**
 * Rileva cicli nel grafo. Ritorna null se nessun ciclo, altrimenti il percorso del ciclo.
 */
export function detectCycle(
  adj: Map<string, string[]>,
  nodes: Set<string>
): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;

  const color = new Map<string, number>();
  const parent = new Map<string, string>();

  for (const node of nodes) {
    color.set(node, WHITE);
  }

  for (const node of nodes) {
    if (color.get(node) === WHITE) {
      const cycle = dfs(node, adj, color, parent);
      if (cycle) return cycle;
    }
  }

  return null;
}

function dfs(
  node: string,
  adj: Map<string, string[]>,
  color: Map<string, number>,
  parent: Map<string, string>
): string[] | null {
  const GRAY = 1;
  const BLACK = 2;

  color.set(node, GRAY);

  for (const neighbor of adj.get(node) ?? []) {
    if (color.get(neighbor) === GRAY) {
      // Trovato ciclo — ricostruisci percorso
      const cycle = [neighbor, node];
      let cur = node;
      while (cur !== neighbor) {
        const p = parent.get(cur);
        if (!p) break;
        cycle.push(p);
        cur = p;
      }
      return cycle.reverse();
    }
    if (color.get(neighbor) === 0) {
      // WHITE
      parent.set(neighbor, node);
      const cycle = dfs(neighbor, adj, color, parent);
      if (cycle) return cycle;
    }
  }

  color.set(node, BLACK);
  return null;
}

/**
 * Topological sort (Kahn's algorithm). Ritorna array ordinato o null se esiste un ciclo.
 */
export function topologicalSort(
  adj: Map<string, string[]>,
  nodes: Set<string>
): string[] | null {
  const inDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node, 0);
  }

  for (const [, neighbors] of adj) {
    for (const n of neighbors) {
      inDegree.set(n, (inDegree.get(n) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return sorted.length === nodes.size ? sorted : null;
}

/**
 * Controlla se aggiungere un arco from→to creerebbe un ciclo.
 * DFS da `to` cercando di raggiungere `from`.
 */
export function wouldCreateCycle(
  adj: Map<string, string[]>,
  from: string,
  to: string
): boolean {
  // Se aggiungiamo from→to, un ciclo esiste se to può già raggiungere from
  const visited = new Set<string>();
  const stack = [to];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbor of adj.get(current) ?? []) {
      stack.push(neighbor);
    }
  }

  return false;
}
