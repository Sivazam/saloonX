import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Public: user tiles for the POS PIN login, scoped to one branch
 * (?branchId=…). Returns every ACTIVE user who can operate that branch
 * (assigned staff + the franchise admins with access). ADMINs listed first.
 * Super admin never appears in a branch roster — they log in via the
 * platform path and don't bill.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const branchId = params.get("branchId") ?? ""

  const branch = branchId
    ? await db.branch.findUnique({ where: { id: branchId }, select: { id: true, active: true } })
    : null
  if (branchId && (!branch || !branch.active)) {
    return NextResponse.json({ users: [] })
  }

  const users = branch
    ? await db.user.findMany({
        where: {
          active: true,
          role: { in: ["ADMIN", "STAFF"] },
          branches: { some: { branchId: branch.id } },
        },
        select: { id: true, name: true, role: true },
        orderBy: [{ role: "desc" }, { name: "asc" }],
      })
    : // No branch context (e.g. platform super-admin login path).
      await db.user.findMany({
        where: { active: true, role: "SUPER_ADMIN" },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      })

  return NextResponse.json({ users })
}
