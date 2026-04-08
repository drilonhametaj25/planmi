/* route.ts — POST /api/dependencies. Crea dipendenza tra task con check cicli via DFS. */
import { db } from "@/db";
import { dependencies } from "@/db/schema";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { createDependencySchema } from "@/lib/validators";

/**
 * Controlla se aggiungere un arco from→to creerebbe un ciclo nel grafo delle dipendenze.
 * DFS partendo da `to`, cercando se si raggiunge `from`.
 */
function wouldCreateCycle(
  existingDeps: { predecessorId: string; successorId: string }[],
  from: string,
  to: string
): boolean {
  const adj = new Map<string, string[]>();
  for (const dep of existingDeps) {
    const list = adj.get(dep.predecessorId) ?? [];
    list.push(dep.successorId);
    adj.set(dep.predecessorId, list);
  }

  // Aggiungi l'arco proposto
  const toList = adj.get(from) ?? [];
  toList.push(to);
  adj.set(from, toList);

  // DFS da `to` per vedere se raggiungiamo `from`
  const visited = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === from) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = adj.get(current) ?? [];
    for (const n of neighbors) {
      stack.push(n);
    }
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, createDependencySchema);
    if (parsed.error) return parsed.error;

    const { predecessorId, successorId } = parsed.data;

    if (predecessorId === successorId) {
      return errorResponse("Un task non può dipendere da se stesso");
    }

    // Carica dipendenze esistenti e controlla cicli
    const existing = await db.select().from(dependencies);
    if (wouldCreateCycle(existing, predecessorId, successorId)) {
      return errorResponse("Questa dipendenza creerebbe un ciclo");
    }

    const [dep] = await db
      .insert(dependencies)
      .values(parsed.data)
      .returning();

    return successResponse(dep, 201);
  } catch (e) {
    const message = String(e);
    if (message.includes("unique")) {
      return errorResponse("Questa dipendenza esiste già");
    }
    console.error("POST /api/dependencies error:", e);
    return errorResponse("Errore nella creazione dipendenza", 500);
  }
}
