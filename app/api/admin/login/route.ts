/**
 * POST /api/admin/login  { password }
 * Sets the signed session cookie when the password matches APP_PASSWORD.
 *
 * DELETE /api/admin/login  -> logout (clears cookie)
 *
 * Auth primitives live in lib/auth.ts (shared with the Slab Pricer app).
 */

import { NextResponse } from "next/server";
import {
  buildSessionCookieValue,
  checkPassword,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let password = "";
  try {
    ({ password } = await req.json());
  } catch {
    /* ignore */
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, buildSessionCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
