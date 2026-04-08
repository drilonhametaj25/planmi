/* route.ts — GET/POST /api/projects/[id]/milestones. Lista e creazione milestones. */
import { db } from "@/db";
import { milestones } from "@/db/schema";
import { eq } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { createMilestoneSchema } from "@/lib/validators";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const projectMilestones = await db
      .select()
      .from(milestones)
      .where(eq(milestones.projectId, id))
      .orderBy(milestones.date);

    return successResponse(projectMilestones);
  } catch (e) {
    console.error("GET /api/projects/[id]/milestones error:", e);
    return errorResponse("Errore nel caricamento milestones", 500);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const parsed = await parseBody(request, createMilestoneSchema);
    if (parsed.error) return parsed.error;

    const [milestone] = await db
      .insert(milestones)
      .values({ ...parsed.data, projectId: id })
      .returning();

    return successResponse(milestone, 201);
  } catch (e) {
    console.error("POST /api/projects/[id]/milestones error:", e);
    return errorResponse("Errore nella creazione milestone", 500);
  }
}
