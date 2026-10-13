import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const bodySchema = z.object({ branchId: z.string().min(1) })

/** POST: switch the current session's branch context (ADMIN/STAFF with access). */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }
  if (user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "Super admin has no branch context" }, { status: 403 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a branch first" }, { status: 400 })
  }

  const { branchId } = parsed.data
  if (!user.branches.some((b) => b.id === branchId)) {
    return NextResponse.json({ error: "No access to this branch" }, { status: 403 })
  }
  const branch = await db.branch.findUnique({
    where: { id: branchId },
    select: { active: true, tenant: { select: { active: true } } },
  })
  if (!branch || !branch.active || !branch.tenant.active) {
    return NextResponse.json({ error: "Branch unavailable" }, { status: 403 })
  }

  // Point every live session of this user at the new branch (one POS context).
  await db.session.updateMany({ where: { userId: user.id }, data: { branchId } })

  const next = await db.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true, city: true },
  })
  return NextResponse.json({ currentBranch: next })
}
