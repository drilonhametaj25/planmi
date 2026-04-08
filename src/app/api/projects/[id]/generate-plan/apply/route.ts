/* route.ts — POST /api/projects/[id]/generate-plan/apply
   Applica il piano: crea dipendenze accettate + aggiorna date task. */
import { db } from "@/db";
import { tasks, dependencies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse } from "@/lib/api-helpers";
import { recalculateParentBounds } from "@/lib/parent-bounds";
import { wouldCreateCycle, buildAdjacencyList } from "@/lib/dependency-graph";
import { z } from "zod";

const applyPlanSchema = z.object({
  changes: z.array(
    z.object({
      taskId: z.string().uuid(),
      newStartDate: z.string(),
      newEndDate: z.string(),
    })
  ),
  acceptedDeps: z.array(
    z.object({
      predecessorId: z.string().uuid(),
      successorId: z.string().uuid(),
      dependencyType: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
      lagDays: z.number().int().default(0),
    })
  ),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    await params; // consume params

    const body = await request.json();
    const parsed = applyPlanSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
      return errorResponse(msg);
    }

    const { changes, acceptedDeps } = parsed.data;

    // 1. Crea dipendenze accettate (con validazione cicli)
    if (acceptedDeps.length > 0) {
      const existingDeps = await db.select().from(dependencies);
      const edges = existingDeps.map((d) => ({
        predecessorId: d.predecessorId,
        successorId: d.successorId,
      }));

      for (const dep of acceptedDeps) {
        // Aggiungi le dipendenze già create in questo batch per cycle check
        const adj = buildAdjacencyList([
          ...edges,
          ...acceptedDeps
            .filter((d) => d !== dep)
            .map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId })),
        ]);

        if (!wouldCreateCycle(adj, dep.predecessorId, dep.successorId)) {
          try {
            await db.insert(dependencies).values({
              predecessorId: dep.predecessorId,
              successorId: dep.successorId,
              dependencyType: dep.dependencyType,
              lagDays: dep.lagDays,
            });
            edges.push({
              predecessorId: dep.predecessorId,
              successorId: dep.successorId,
            });
          } catch {
            // Ignora duplicati (constraint unique)
          }
        }
      }
    }

    // 2. Applica cambiamenti date
    const affectedParentIds = new Set<string>();
    for (const change of changes) {
      const [updated] = await db
        .update(tasks)
        .set({
          startDate: change.newStartDate,
          endDate: change.newEndDate,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, change.taskId))
        .returning();

      if (updated?.parentTaskId) {
        affectedParentIds.add(updated.parentTaskId);
      }
    }

    // 3. Ricalcola parent bounds
    for (const pid of affectedParentIds) {
      await recalculateParentBounds(pid);
    }

    return successResponse({
      applied: true,
      depsCreated: acceptedDeps.length,
      tasksUpdated: changes.length,
    });
  } catch (e) {
    console.error("POST /api/projects/[id]/generate-plan/apply error:", e);
    return errorResponse("Errore nell'applicazione del piano", 500);
  }
}
