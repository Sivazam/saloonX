import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { adminBranchScope, requireApiUser } from "@/lib/auth"
import { dateKey, dayEnd, dayStart, round2 } from "@/lib/serialize"
import type { BranchSummaryStat } from "@/lib/types"

export const dynamic = "force-dynamic"

const MAX_DAYS = 90

export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const fromParam = params.get("from")
  const toParam = params.get("to")
  const branchIdParam = params.get("branchId") ?? ""

  // Franchise admins see the WHOLE chain by default; ?branchId= narrows.
  const scope = await adminBranchScope(auth.user, branchIdParam || null)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })
  const branchIds = scope.branchIds ?? []
  if (branchIds.length === 0) {
    return NextResponse.json({
      totalRevenue: 0, totalBills: 0, avgBill: 0,
      byMethod: { CASH: { amount: 0, count: 0 }, UPI: { amount: 0, count: 0 }, CARD: { amount: 0, count: 0 } },
      byBranch: [], daily: [], topServices: [], topStaff: [],
      newCustomers: 0, returningBills: 0,
      expenses: { total: 0, count: 0, byCategory: {} },
    })
  }
  const branchFilter = { branchId: { in: branchIds } }

  // Default: last 7 days including today.
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 6)
  const from = dayStart(fromParam ?? defaultFrom) ?? defaultFrom
  const to = dayEnd(toParam ?? new Date()) ?? new Date()

  // Only COMPLETED bills count towards revenue/stats. VOIDED bills are excluded.
  const rangeTxns = await db.transaction.findMany({
    where: { createdAt: { gte: from, lte: to }, status: "COMPLETED", ...branchFilter },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  })
  // Minimal all-time fields for first-visit / returning classification (completed only).
  const allTxns = await db.transaction.findMany({
    where: { status: "COMPLETED", ...branchFilter },
    select: { id: true, customerId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  // Headline numbers + payment split + per-branch split.
  const byMethod = {
    CASH: { amount: 0, count: 0 },
    UPI: { amount: 0, count: 0 },
    CARD: { amount: 0, count: 0 },
  }
  const byBranchMap = new Map<string, BranchSummaryStat>()
  let totalRevenue = 0
  const dailyMap = new Map<string, { revenue: number; bills: number }>()
  const serviceMap = new Map<string, { count: number; revenue: number }>()
  const staffMap = new Map<string, { revenue: number; bills: number }>()

  for (const t of rangeTxns) {
    totalRevenue += t.total
    const m = byMethod[t.paymentMethod as keyof typeof byMethod]
    if (m) {
      m.amount = round2(m.amount + t.total)
      m.count += 1
    }

    const b = byBranchMap.get(t.branchId) ?? { branchId: t.branchId, name: t.branchName, revenue: 0, bills: 0 }
    b.revenue = round2(b.revenue + t.total)
    b.bills += 1
    byBranchMap.set(t.branchId, b)

    const key = dateKey(t.createdAt)
    const day = dailyMap.get(key) ?? { revenue: 0, bills: 0 }
    day.revenue = round2(day.revenue + t.total)
    day.bills += 1
    dailyMap.set(key, day)

    const staff = staffMap.get(t.staffId) ?? { revenue: 0, bills: 0 }
    staff.revenue = round2(staff.revenue + t.total)
    staff.bills += 1
    staffMap.set(t.staffId, staff)

    for (const item of t.items) {
      const svc = serviceMap.get(item.serviceName) ?? { count: 0, revenue: 0 }
      svc.count += item.qty
      svc.revenue = round2(svc.revenue + item.price * item.qty)
      serviceMap.set(item.serviceName, svc)
    }
  }

  // Fill zero days across the range (capped to the most recent MAX_DAYS days).
  const daily: { date: string; revenue: number; bills: number }[] = []
  const dailyStart = new Date(to)
  dailyStart.setDate(dailyStart.getDate() - (MAX_DAYS - 1))
  const cursor = from > dailyStart ? new Date(from) : dailyStart
  while (cursor <= to) {
    const key = dateKey(cursor)
    const d = dailyMap.get(key)
    daily.push({ date: key, revenue: d?.revenue ?? 0, bills: d?.bills ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  // First-ever bill per customer (all time) → new vs returning classification.
  const firstBillAt = new Map<string, Date>()
  for (const t of allTxns) {
    if (t.customerId && !firstBillAt.has(t.customerId)) {
      firstBillAt.set(t.customerId, t.createdAt)
    }
  }
  let newCustomers = 0
  let returningBills = 0
  for (const t of rangeTxns) {
    if (!t.customerId) continue
    const first = firstBillAt.get(t.customerId)
    if (first && first >= from && first <= to && first.getTime() === t.createdAt.getTime()) {
      newCustomers += 1
    } else {
      returningBills += 1
    }
  }

  const topServices = [...serviceMap.entries()]
    .map(([name, v]) => ({ name, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)

  // Staff performance + commission (per current commissionPct of each user).
  const staffUsers = await db.user.findMany({
    where: { id: { in: [...staffMap.keys()] } },
    select: { id: true, name: true, commissionPct: true },
  })
  const staffNameById = new Map(staffUsers.map((u) => [u.id, u]))
  const topStaff = [...staffMap.entries()]
    .map(([userId, v]) => {
      const u = staffNameById.get(userId)
      const pct = u?.commissionPct ?? 0
      return {
        userId,
        name: u?.name ?? "Unknown",
        commissionPct: pct,
        revenue: v.revenue,
        bills: v.bills,
        commission: round2((v.revenue * pct) / 100),
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  const totalBills = rangeTxns.length

  // Expenses in range → P&L on the dashboard (same branch scope).
  const expenseRows = await db.expense.findMany({
    where: { date: { gte: from, lte: to }, ...branchFilter },
    select: { category: true, amount: true },
  })
  const expensesByCategory: Record<string, { amount: number; count: number }> = {}
  let expensesTotal = 0
  for (const e of expenseRows) {
    expensesTotal = round2(expensesTotal + e.amount)
    const c = (expensesByCategory[e.category] ??= { amount: 0, count: 0 })
    c.amount = round2(c.amount + e.amount)
    c.count += 1
  }

  return NextResponse.json({
    totalRevenue: round2(totalRevenue),
    totalBills,
    avgBill: totalBills > 0 ? round2(totalRevenue / totalBills) : 0,
    byMethod,
    byBranch: [...byBranchMap.values()].sort((a, b) => b.revenue - a.revenue),
    daily,
    topServices,
    topStaff,
    newCustomers,
    returningBills,
    expenses: {
      total: expensesTotal,
      count: expenseRows.length,
      byCategory: expensesByCategory,
    },
  })
}
