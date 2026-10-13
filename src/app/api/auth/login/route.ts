import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { SESSION_COOKIE, createSession, verifyPin } from "@/lib/auth"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be 4 digits"),
  /** Branch context for ADMIN/STAFF sessions. Null for SUPER_ADMIN. */
  branchId: z.string().min(1).optional().nullable(),
})

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a 4-digit PIN" }, { status: 400 })
  }

  const { userId, pin, branchId } = parsed.data
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { branches: { select: { branchId: true } } },
  })
  if (!user || !user.active || !verifyPin(pin, user.pinHash)) {
    return NextResponse.json({ error: "Wrong PIN" }, { status: 401 })
  }

  // Resolve the branch context this session is bound to.
  let sessionBranchId: string | null = null
  if (user.role === "SUPER_ADMIN") {
    sessionBranchId = null // platform level — no branch
  } else {
    if (!branchId) {
      return NextResponse.json({ error: "Choose a branch first" }, { status: 400 })
    }
    const hasAccess = user.branches.some((b) => b.branchId === branchId)
    const branch = hasAccess
      ? await db.branch.findUnique({ where: { id: branchId }, select: { active: true } })
      : null
    if (!branch || !branch.active) {
      return NextResponse.json({ error: "No access to this branch" }, { status: 403 })
    }
    sessionBranchId = branchId
  }

  const { token, expiresAt } = await createSession(user.id, sessionBranchId)

  const response = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      tenantId: user.tenantId,
      branchId: sessionBranchId,
    },
  })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  })
  return response
}
