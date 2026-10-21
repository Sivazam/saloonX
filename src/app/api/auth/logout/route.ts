import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { SESSION_COOKIE } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    // Tokens are stored hashed (see lib/auth.ts) — hash before deleting.
    const tokenHash = createHash("sha256").update(token).digest("hex")
    await db.session.deleteMany({ where: { token: tokenHash } }).catch(() => {})
  }
  const response = NextResponse.json({ ok: true })
  // Mirror the login cookie flags exactly — a mismatched SameSite/Secure on
  // the delete would leave a stranded cookie on the client (Safari is strict).
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIES === "1",
    path: "/",
    maxAge: 0,
  })
  return response
}
