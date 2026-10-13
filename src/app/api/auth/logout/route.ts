import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { SESSION_COOKIE } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => {})
  }
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
  return response
}
