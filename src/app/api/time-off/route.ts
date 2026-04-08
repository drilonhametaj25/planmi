/* route.ts — GET /api/time-off (list), POST /api/time-off (create). */
import { db } from "@/db";
import { timeOff } from "@/db/schema";
import { asc } from "drizzle-orm";
import { successResponse, errorResponse, parseBody } from "@/lib/api-helpers";
import { createTimeOffSchema } from "@/lib/validators";

export async function GET() {
  try {
    const entries = await db
      .select()
      .from(timeOff)
      .orderBy(asc(timeOff.startDate));
    return successResponse(entries);
  } catch (e) {
    console.error("GET /api/time-off error:", e);
    return errorResponse("Errore nel caricamento", 500);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseBody(request, createTimeOffSchema);
    if (parsed.error) return parsed.error;

    const [entry] = await db
      .insert(timeOff)
      .values({
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        type: parsed.data.type,
        hoursPerDay: parsed.data.hoursPerDay?.toString() ?? null,
        note: parsed.data.note ?? null,
      })
      .returning();

    return successResponse(entry, 201);
  } catch (e) {
    console.error("POST /api/time-off error:", e);
    return errorResponse("Errore nella creazione", 500);
  }
}
