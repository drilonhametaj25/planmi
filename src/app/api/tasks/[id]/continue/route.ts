/* route.ts — POST /api/tasks/[id]/continue — Crea un task di continuazione sotto un altro parent con link automatico. */
import { db } from "@/db";
import { tasks, taskLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { recalculateParentBounds } from "@/lib/parent-bounds";
import { z } from "zod";

const continueSchema = z.object({
  targetParentTaskId: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, continueSchema);
    if (parsed.error) return parsed.error;

    const { targetParentTaskId, title: customTitle } = parsed.data;

    // Carica il task sorgente
    const [source] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!source) {
      return errorResponse("Task sorgente non trovato", 404);
    }

    // Verifica che il parent target esista
    const [targetParent] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, targetParentTaskId));
    if (!targetParent) {
      return errorResponse("Task padre target non trovato", 404);
    }

    // Crea il task di continuazione con le stesse proprietà del sorgente
    const newTitle = customTitle || `${source.title} (continua)`;
    const [newTask] = await db
      .insert(tasks)
      .values({
        projectId: targetParent.projectId,
        parentTaskId: targetParentTaskId,
        title: newTitle,
        taskType: source.taskType,
        priority: source.priority,
        estimatedHours: source.estimatedHours,
        executionMode: source.executionMode,
        startDate: targetParent.startDate,
        endDate: targetParent.endDate,
        status: "todo",
        progress: 0,
        tags: source.tags,
      })
      .returning();

    if (!newTask) {
      return errorResponse("Errore nella creazione del task", 500);
    }

    // Crea link bidirezionale: source → continues_in → newTask
    await db.insert(taskLinks).values({
      sourceTaskId: id,
      targetTaskId: newTask.id,
      linkType: "continues_in",
    });
    await db.insert(taskLinks).values({
      sourceTaskId: newTask.id,
      targetTaskId: id,
      linkType: "continued_from",
    });

    // Ricalcola bounds del parent target
    await recalculateParentBounds(targetParentTaskId);

    return successResponse({ task: newTask }, 201);
  } catch (e) {
    console.error("POST /api/tasks/[id]/continue error:", e);
    return errorResponse("Errore nella continuazione del task", 500);
  }
}
