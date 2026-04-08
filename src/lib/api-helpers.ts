/* api-helpers.ts — Helper per API routes. Wrapper try/catch e response standard. */
import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  try {
    const body: unknown = await request.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(", ");
      return { error: errorResponse(message) };
    }
    return { data: result.data };
  } catch {
    return { error: errorResponse("Body JSON non valido") };
  }
}
