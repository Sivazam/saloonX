import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { adminBranchScope, requireApiUser } from "@/lib/auth"
import { round2 } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/**
 * GET (ADMIN): the last N calendar months (2–12, default 6) of
 * revenue vs expenses vs profit — the dashboard "Profit trend" chart.
 * `?branchId=` narrows to one branch of the franchise.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const months = Math.min(12, Math.max(2, Number(params.get("months") ?? 6) || 6))
  const branchIdParam = params.get("branchId") ?? ""

  const scope = await adminBranchScope(auth.user, branchIdParam || null)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })
  const branchIds = scope.branchIds ?? []
  if (branchIds.length === 0) return NextResponse.json({ months: [] })
  const branchFilter = { branchId: { in: branchIds } }

  // First day of the (N-1)th previous month — e.g. 6 months = this month + 5 back.
  const now = new Date()
  const firstMonth = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

  // Group key "YYYY-MM" per calendar month (salon's local timezone).
  const ymKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

  const [txns, expenses] = await Promise.all([
    db.transaction.findMany({
      where: { createdAt: { gte: firstMonth }, status: "COMPLETED", ...branchFilter },
      select: { total: true, createdAt: true },
    }),
    db.expense.findMany({
      where: { date: { gte: firstMonth }, ...branchFilter },
      select: { amount: true, date: true },
    }),
  ])

  type Month = { ym: string; label: string; year: number; revenue: number; expenses: number; profit: number; bills: number }
  const map = new Map<string, Month>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    map.set(ymKey(d), {
      ym: ymKey(d),
      label: `${MONTH_LABELS[d.getMonth()]}${d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ""}`,
      year: d.getFullYear(),
      revenue: 0,
      expenses: 0,
      profit: 0,
      bills: 0,
    })
  }

  for (const t of txns) {
    const m = map.get(ymKey(t.createdAt))
    if (m) {
      m.revenue = round2(m.revenue + t.total)
      m.bills += 1
    }
  }
  for (const e of expenses) {
    const m = map.get(ymKey(e.date))
    if (m) m.expenses = round2(m.expenses + e.amount)
  }
  for (const m of map.values()) m.profit = round2(m.revenue - m.expenses)

  return NextResponse.json({ months: [...map.values()] })
}
