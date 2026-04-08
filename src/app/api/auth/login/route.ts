/* route.ts — POST /api/auth/login. Verifica password contro PLANMI_SECRET e setta cookie httpOnly. */
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { password?: string };
    const { password } = body;
    const secret = process.env.PLANMI_SECRET;

    if (!secret) {
      return NextResponse.json(
        { error: "Server non configurato" },
        { status: 500 }
      );
    }

    if (!password || password !== secret) {
      return NextResponse.json(
        { error: "Password errata" },
        { status: 401 }
      );
    }

    const response = NextResponse.json({ success: true });
    response.cookies.set("planmi_token", secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 giorni
    });

    return response;
  } catch {
    return NextResponse.json(
      { error: "Richiesta non valida" },
      { status: 400 }
    );
  }
}
