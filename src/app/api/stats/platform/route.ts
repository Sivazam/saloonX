import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { round2 } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const DAY_MS = 86_400_000

/**
 * GET /api/stats/platform — cross-franchise comparison report for the
 * platform console: rolling 30-day revenue vs the previous 30 days,
 * per-branch efficiency and a 6-month trend per franchise.
 */
export async function GET() {
  const auth = await requireApiUser(["SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const now = Date.now()
  const since6mo = new Date(now - 190 * DAY_MS) // covers 6 full calendar months

  const [tenants, txns] = await Promise.all([
    db.tenant.findMany({
      orderBy: { name: "asc" },
      include: { branches: { select: { id: true, active: true, approved: true } } },
    }),
    db.transaction.findMany({
      where: { createdAt: { gte: since6mo }, status: "COMPLETED" },
      select: { tenantId: true, total: true, createdAt: true },
    }),
  ])

  // Month buckets (YYYY-MM) for the 6-month sparklines, oldest first.
  const monthKeys: { ym: string; label: string }[] = []
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 5)
  for (let i = 0; i < 6; i++) {
    monthKeys.push({
      ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-IN", { month: "short" }),
    })
    d.setMonth(d.getMonth() + 1)
  }

  type Acc = {
    revenue30d: number
    revenuePrev30d: number
    bills30d: number
    monthly: Map<string, number>
  }
  const acc = new Map<string, Acc>()

  for (const t of txns) {
    const a = acc.get(t.tenantId) ?? { revenue30d: 0, revenuePrev30d: 0, bills30d: 0, monthly: new Map() }
    const ts = t.createdAt.getTime()
    if (ts >= now - 30 * DAY_MS) {
      a.revenue30d = round2(a.revenue30d + t.total)
      a.bills30d += 1
    } else if (ts >= now - 60 * DAY_MS) {
      a.revenuePrev30d = round2(a.revenuePrev30d + t.total)
    }
    const ym = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, "0")}`
    if (monthKeys.some((m) => m.ym === ym)) {
      a.monthly.set(ym, round2((a.monthly.get(ym) ?? 0) + t.total))
    }
    acc.set(t.tenantId, a)
  }

  const growth = (cur: number, prev: number) =>
    prev > 0 ? round2(((cur - prev) / prev) * 100) : null

  const activeBranches = (tenantId: string) =>
    tenants.find((t) => t.id === tenantId)?.branches.filter((b) => b.active && b.approved).length ?? 0

  const franchises = tenants.map((t) => {
    const a = acc.get(t.id) ?? { revenue30d: 0, revenuePrev30d: 0, bills30d: 0, monthly: new Map() }
    const branchCount = activeBranches(t.id)
    return {
      tenantId: t.id,
      name: t.name,
      logo: t.logo,
      active: t.active,
      branchCount,
      revenue30d: a.revenue30d,
      revenuePrev30d: a.revenuePrev30d,
      growthPct: growth(a.revenue30d, a.revenuePrev30d),
      bills30d: a.bills30d,
      avgBill30d: a.bills30d > 0 ? round2(a.revenue30d / a.bills30d) : 0,
      revenuePerBranch: branchCount > 0 ? round2(a.revenue30d / branchCount) : 0,
      monthly: monthKeys.map((m) => ({ ym: m.ym, label: m.label, revenue: a.monthly.get(m.ym) ?? 0 })),
    }
  })

  const revenue30d = round2(franchises.reduce((s, f) => s + f.revenue30d, 0))
  const revenuePrev30d = round2(franchises.reduce((s, f) => s + f.revenuePrev30d, 0))

  return NextResponse.json({
    franchises: franchises.sort((a, b) => b.revenue30d - a.revenue30d),
    platform: {
      revenue30d,
      revenuePrev30d,
      growthPct: growth(revenue30d, revenuePrev30d),
    },
    generatedAt: new Date().toISOString(),
  })
}
