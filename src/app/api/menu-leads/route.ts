import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export interface MenuLeadRowDTO {
  id: string
  code: string
  name: string | null
  mobile: string
  pct: number
  branchName: string
  createdAt: string
  redeemedAt: string | null
}

/**
 * GET /api/menu-leads (ADMIN) — QR-menu signup performance for the franchise:
 * claim/redemption totals plus the 20 most recent guests who registered.
 */
export async function GET() {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ error: "No franchise context" }, { status: 403 })

  const where = { tenantId }
  const [total, redeemed, recent] = await Promise.all([
    db.menuLead.count({ where }),
    db.menuLead.count({ where: { ...where, redeemedAt: { not: null } } }),
    db.menuLead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { branch: { select: { name: true } } },
    }),
  ])

  const rows: MenuLeadRowDTO[] = recent.map((l) => ({
    id: l.id,
    code: l.code,
    name: l.name,
    mobile: l.mobile,
    pct: l.pct,
    branchName: l.branch.name,
    createdAt: l.createdAt.toISOString(),
    redeemedAt: l.redeemedAt ? l.redeemedAt.toISOString() : null,
  }))

  return NextResponse.json({
    totals: { claims: total, redeemed },
    recent: rows,
  })
}
