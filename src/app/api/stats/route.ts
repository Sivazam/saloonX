import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { adminBranchScope, requireApiUser } from "@/lib/auth"
import { dateKey, dayEnd, dayStart, round2 } from "@/lib/serialize"
import type { BranchSummaryStat } from "@/lib/types"

export const dynamic = "force-dynamic"

const MAX_DAYS = 90

/** Clamp the requested range: no future dates, no decade-wide full-ledger
 *  scans — `from` is pulled up to now − 366d, `to` is pushed back to now + 1d. */
const RANGE_FLOOR_MS = 366 * 86_400_000
const clampRange = (from: Date, to: Date): { from: Date; to: Date } => {
  const minFrom = new Date(Date.now() - RANGE_FLOOR_MS)
  const maxTo = new Date(Date.now() + 86_400_000)
  return {
    from: from < minFrom ? new Date(minFrom) : from,
    to: to > maxTo ? new Date(maxTo) : to,
  }
}

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
      byMethod: { CASH: { amount: 0, count: 0 }, UPI: { amount: 0, count: 0 }, CARD: { amount: 0, count: 0 }, SPLIT: { amount: 0, count: 0 } },
      byBranch: [], daily: [], topServices: [], topStaff: [],
      newCustomers: 0, returningBills: 0,
      previous: { totalRevenue: 0, totalBills: 0, avgBill: 0, newCustomers: 0 },
      discounts: { totalAmount: 0, billsWithDiscount: 0, avgPct: 0, leakagePct: 0 },
      customerDepth: { unique: 0, repeatRate: 0, avgRevenuePerCustomer: 0, repeatCustomers: 0 },
      topCustomers: [],
      expenses: { total: 0, count: 0, byCategory: {} },
    })
  }
  const branchFilter = { branchId: { in: branchIds } }

  // Default: last 7 days including today.
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 6)
  const { from, to } = clampRange(
    dayStart(fromParam ?? defaultFrom) ?? defaultFrom,
    dayEnd(toParam ?? new Date()) ?? new Date(),
  )

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

  // ── Prior-equal-length window for period-over-period deltas on KPI cards.
  //    E.g. if range = 7 days (Oct 12–18), prior = the 7 days before (Oct 5–11).
  //    This is the single highest-impact analytics: "Revenue ↑12% vs last week".
  const rangeMs = to.getTime() - from.getTime()
  const prevTo = new Date(from.getTime() - 1) // exclusive boundary = day before `from`
  const prevFrom = new Date(prevTo.getTime() - rangeMs)
  const prevTxns = await db.transaction.findMany({
    where: { createdAt: { gte: prevFrom, lte: prevTo }, status: "COMPLETED", ...branchFilter },
    select: { id: true, customerId: true, total: true, createdAt: true, discountAmount: true },
  })
  const previous = {
    totalRevenue: round2(prevTxns.reduce((s, t) => s + t.total, 0)),
    totalBills: prevTxns.length,
    avgBill: prevTxns.length > 0 ? round2(prevTxns.reduce((s, t) => s + t.total, 0) / prevTxns.length) : 0,
    newCustomers: 0,
  }
  // New-customers-in-prior-window: a customer whose FIRST ever visit fell in [prevFrom, prevTo].
  const prevFirstBillAt = new Map<string, Date>()
  for (const t of allTxns) {
    if (t.customerId && !prevFirstBillAt.has(t.customerId)) {
      prevFirstBillAt.set(t.customerId, t.createdAt)
    }
  }
  for (const t of prevTxns) {
    if (t.customerId) {
      const first = prevFirstBillAt.get(t.customerId)
      if (first && first >= prevFrom && first <= prevTo) previous.newCustomers += 1
    }
  }

  // ── Discount analytics — how much revenue is the salon giving away?
  //    Discount leakage = total discount / (subtotal) — what % of gross got waived.
  let discountTotal = 0
  let discountBills = 0
  let grossSubtotal = 0
  for (const t of rangeTxns) {
    if (t.discountAmount > 0) {
      discountTotal = round2(discountTotal + t.discountAmount)
      discountBills += 1
    }
    grossSubtotal = round2(grossSubtotal + t.subtotal)
  }

  // ── Customer depth — unique customers, repeat rate, ARPU, top spenders.
  const customerSpend = new Map<string, { id: string; name: string | null; mobile: string | null; bills: number; spend: number }>()
  for (const t of rangeTxns) {
    if (!t.customerId) continue
    const cur = customerSpend.get(t.customerId) ?? {
      id: t.customerId,
      name: t.customerName,
      mobile: t.customerMobile,
      bills: 0,
      spend: 0,
    }
    cur.bills += 1
    cur.spend = round2(cur.spend + t.total)
    customerSpend.set(t.customerId, cur)
  }
  const uniqueCustomers = customerSpend.size
  const repeatCustomers = [...customerSpend.values()].filter((c) => c.bills > 1).length
  const topCustomers = [...customerSpend.values()]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)
    .map((c) => ({
      name: c.name ?? (c.mobile ? `••••${c.mobile.slice(-4)}` : "Walk-in"),
      bills: c.bills,
      spend: c.spend,
    }))

  // Headline numbers + payment split + per-branch split.
  // SPLIT = a bill settled part-cash / part-UPI / part-card (grouped by the
  // stored paymentMethod string so future methods appear naturally).
  const byMethod: Record<string, { amount: number; count: number }> = {
    CASH: { amount: 0, count: 0 },
    UPI: { amount: 0, count: 0 },
    CARD: { amount: 0, count: 0 },
    SPLIT: { amount: 0, count: 0 },
  }
  const byBranchMap = new Map<string, BranchSummaryStat>()
  let totalRevenue = 0
  const dailyMap = new Map<string, { revenue: number; bills: number }>()
  const serviceMap = new Map<string, { count: number; revenue: number }>()
  const staffMap = new Map<string, { revenue: number; bills: number; base: number }>()

  for (const t of rangeTxns) {
    totalRevenue += t.total
    const m = byMethod[t.paymentMethod]
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

    const staff = staffMap.get(t.staffId) ?? { revenue: 0, bills: 0, base: 0 }
    staff.revenue = round2(staff.revenue + t.total)
    staff.bills += 1
    // Commission base is PRE-GST and PRE-TIP: what the staff actually sold
    // (services minus line discounts) before tax is layered on. `total`
    // includes GST, so commission must never be derived from `revenue`.
    staff.base = round2(staff.base + t.subtotal - t.discountAmount)
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
        // Pre-GST, pre-tip base — see the accumulation loop above.
        commission: round2((v.base * pct) / 100),
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
    // Period-over-period comparison (prior equal-length window) — drives the
    // "↑12% vs last week" delta badges on the KPI cards.
    previous,
    // Discount analytics — how much the salon is giving away in discounts.
    discounts: {
      totalAmount: discountTotal,
      billsWithDiscount: discountBills,
      avgPct: discountBills > 0 ? round2((discountBills / totalBills) * 100) : 0,
      // Leakage = what % of gross subtotal was waived by discounts.
      leakagePct: grossSubtotal > 0 ? round2((discountTotal / grossSubtotal) * 100) : 0,
    },
    // Customer depth — unique + repeat rate + ARPU + top spenders in the range.
    customerDepth: {
      unique: uniqueCustomers,
      repeatCustomers,
      repeatRate: uniqueCustomers > 0 ? round2((repeatCustomers / uniqueCustomers) * 100) : 0,
      avgRevenuePerCustomer: uniqueCustomers > 0 ? round2(totalRevenue / uniqueCustomers) : 0,
    },
    topCustomers,
    expenses: {
      total: expensesTotal,
      count: expenseRows.length,
      byCategory: expensesByCategory,
    },
  })
}
