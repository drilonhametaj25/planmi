/* middleware.ts — Auth gate per PlanMi. Controlla il cookie planmi_token su tutte le route tranne /login e risorse statiche. */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth per login page, API auth, e risorse statiche
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("planmi_token")?.value;
  const secret = process.env.PLANMI_SECRET;

  if (!secret) {
    console.error("PLANMI_SECRET non configurato");
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Token è semplicemente la password hashata con un salt fisso
  // In produzione si potrebbe usare HMAC, ma per singolo utente basta questo
  if (!token || token !== secret) {
    // Se è una API route, ritorna 401 invece di redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match tutte le route tranne _next/static, _next/image, favicon
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
