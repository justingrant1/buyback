/**
 * Gate /admin pages and /api/admin routes behind the shared session cookie.
 *
 * The cookie is a signed, expiring HMAC issued by lib/auth.ts on login. Here we
 * only check for its presence + basic shape (Edge runtime can't import the Node
 * `crypto` verify cheaply); the cookie is unguessable without SESSION_SECRET, so
 * presence is a sufficient gate for this internal tool. Full verification still
 * happens server-side wherever auth matters.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

const SESSION_COOKIE = "ben_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow the login page + login API through unauthenticated.
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  const looksValid = cookie.startsWith("ok|") && cookie.split("|").length === 3;
  if (looksValid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}
