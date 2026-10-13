import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { dayEnd, dayStart, round2 } from "@/lib/serialize"
import type { BranchCompareDTO, BranchCompareResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

/**
 * GET /api/stats/branches-compare?from=&to= — ADMIN.
 * League table ACROSS the whole franchise (branch scope chips are ignored —
 * a comparison needs every branch). Revenue, expenses, profit, new
 * customers, head-count and growth vs the prior equal-length window.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) {
    return NextResponse.json(
      { from: "", to: "", rangeDays: 0, branches: [], franchise: { revenue: 0, expenses: 0, profit: 0, bills: 0 } },
      { status: 200 },
    )
  }

  const params = new URL(request.url).searchParams

  // Default: last 7 days including today (dashboard default range).
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 6)
  const from = dayStart(params.get("from") ?? defaultFrom) ?? defaultFrom
  const to = dayEnd(params.get("to") ?? new Date()) ?? new Date()
  const rangeDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000))

  // Prior equal-length window for growth.
  const prevTo = new Date(from)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - (rangeDays - 1))

  const branches = await db.branch.findMany({
    where: { tenantId, approved: true, active: true },
    select: { id: true, name: true, city: true, billPrefix: true },
    orderBy: { createdAt: "asc" },
  })
  if (branches.length === 0) {
    return NextResponse.json({
      from: from.toISOString(),
      to: to.toISOString(),
      rangeDays,
      branches: [],
      franchise: { revenue: 0, expenses: 0, profit: 0, bills: 0 },
    } satisfies BranchCompareResponse)
  }
  const branchIds = branches.map((b) => b.id)

  const [curTxns, prevTxns, expenseRows, staffLinks] = await Promise.all([
    db.transaction.findMany({
      where: { createdAt: { gte: from, lte: to }, status: "COMPLETED", branchId: { in: branchIds } },
      select: { branchId: true, customerId: true, total: true, createdAt: true },
    }),
    db.transaction.findMany({
      where: { createdAt: { gte: prevFrom, lte: prevTo }, status: "COMPLETED", branchId: { in: branchIds } },
      select: { branchId: true, total: true },
    }),
    db.expense.findMany({
      where: { date: { gte: from, lte: to }, branchId: { in: branchIds } },
      select: { branchId: true, amount: true },
    }),
    db.userBranch.findMany({ where: { branchId: { in: branchIds } }, select: { branchId: true } }),
  ])

  // First-ever bill per customer across the franchise (for "new at branch").
  const firstBillAt = new Map<string, Date>()
  const allScoped = await db.transaction.findMany({
    where: { status: "COMPLETED", tenantId },
    select: { customerId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  for (const t of allScoped) {
    if (t.customerId && !firstBillAt.has(t.customerId)) firstBillAt.set(t.customerId, t.createdAt)
  }

  const acc = new Map<string, { dto: BranchCompareDTO; newIds: Set<string> }>()
  for (const b of branches) {
    acc.set(b.id, {
      dto: {
        branchId: b.id,
        name: b.name,
        city: b.city,
        prefix: b.billPrefix,
        revenue: 0,
        prevRevenue: 0,
        growthPct: null,
        bills: 0,
        avgBill: 0,
        expenses: 0,
        profit: 0,
        newCustomers: 0,
        staffCount: 0,
        sharePct: 0,
      },
      newIds: new Set(),
    })
  }

  for (const t of curTxns) {
    const row = acc.get(t.branchId)
    if (!row) continue
    row.dto.revenue = round2(row.dto.revenue + t.total)
    row.dto.bills += 1
    if (t.customerId) {
      const first = firstBillAt.get(t.customerId)
      if (first && first.getTime() === t.createdAt.getTime()) row.newIds.add(t.customerId)
    }
  }
  for (const t of prevTxns) {
    const row = acc.get(t.branchId)
    if (row) row.dto.prevRevenue = round2(row.dto.prevRevenue + t.total)
  }
  for (const e of expenseRows) {
    const row = acc.get(e.branchId)
    if (row) row.dto.expenses = round2(row.dto.expenses + e.amount)
  }
  for (const l of staffLinks) {
    const row = acc.get(l.branchId)
    if (row) row.dto.staffCount += 1
  }

  const list = [...acc.values()].map((row) => row.dto)
  let franchiseRevenue = 0
  let franchiseExpenses = 0
  let franchiseBills = 0
  for (const row of list) {
    row.avgBill = row.bills > 0 ? round2(row.revenue / row.bills) : 0
    row.profit = round2(row.revenue - row.expenses)
    row.newCustomers = acc.get(row.branchId)?.newIds.size ?? 0
    row.growthPct =
      row.prevRevenue > 0 ? Math.round(((row.revenue - row.prevRevenue) / row.prevRevenue) * 100) : null
    franchiseRevenue = round2(franchiseRevenue + row.revenue)
    franchiseExpenses = round2(franchiseExpenses + row.expenses)
    franchiseBills += row.bills
  }
  for (const row of list) {
    row.sharePct = franchiseRevenue > 0 ? Math.round((row.revenue / franchiseRevenue) * 100) : 0
  }

  const response: BranchCompareResponse = {
    from: from.toISOString(),
    to: to.toISOString(),
    rangeDays,
    branches: list.sort((a, b) => b.revenue - a.revenue),
    franchise: {
      revenue: franchiseRevenue,
      expenses: franchiseExpenses,
      profit: round2(franchiseRevenue - franchiseExpenses),
      bills: franchiseBills,
    },
  }
  return NextResponse.json(response)
}
