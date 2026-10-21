import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { dayStart, dayEnd, round2 } from "@/lib/serialize"
import type { PaymentMethod, ShiftReportResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/staff/shift?staffId=&date=YYYY-MM-DD
 *
 * A single staff member's day at the salon — the numbers they hand over when
 * their shift ends. ADMIN may request any staff member of their franchise;
 * STAFF always gets their own shift (staffId is ignored for them).
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN", "STAFF"])
  if (!auth.user) return auth.response

  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ error: "No franchise context" }, { status: 400 })

  const url = new URL(request.url)
  const requestedStaff = url.searchParams.get("staffId") ?? auth.user.id
  const staffId = auth.user.role === "STAFF" ? auth.user.id : requestedStaff
  const dateParam = url.searchParams.get("date")
  const date = dateParam && DATE_RE.test(dateParam) ? dateParam : localDateKey(new Date())

  const start = dayStart(date)
  const end = dayEnd(date)
  if (!start || !end) return NextResponse.json({ error: "Invalid date" }, { status: 400 })

  // The staff member must belong to the caller's franchise.
  const staff = await db.user.findFirst({
    where: { id: staffId, tenantId, active: true },
    include: { branches: { include: { branch: { select: { name: true, active: true, approved: true } } } } },
  })
  if (!staff) return NextResponse.json({ error: "Staff member not found" }, { status: 404 })

  // A staff-day is naturally bounded — NO take limit (a silent 200-bill cap
  // would make cash handover short by every bill past it on a festival day).
  const txns = await db.transaction.findMany({
    where: {
      staffId,
      tenantId,
      status: "COMPLETED",
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      billNo: true,
      createdAt: true,
      branchName: true,
      customerName: true,
      customerMobile: true,
      subtotal: true,
      discountAmount: true,
      tipAmount: true,
      total: true,
      paymentMethod: true,
      items: { select: { qty: true } },
    },
  })

  // Payment slices of the day's bills — day-scoped, so the IN list is bounded.
  // SPLIT bills contribute their CASH/UPI/CARD slices here individually, which
  // is exactly what the cash-drawer and method mix need.
  const paymentRows = txns.length
    ? await db.transactionPayment.findMany({
        where: { transactionId: { in: txns.map((t) => t.id) } },
        select: { method: true, amount: true },
      })
    : []

  const byPayment: ShiftReportResponse["summary"]["byPayment"] = {
    CASH: { count: 0, amount: 0 },
    UPI: { count: 0, amount: 0 },
    CARD: { count: 0, amount: 0 },
  }
  for (const p of paymentRows) {
    const split = byPayment[p.method as PaymentMethod]
    if (!split) continue
    split.count += 1
    split.amount = round2(split.amount + p.amount)
  }

  let revenue = 0
  let discounts = 0
  // Commission base: pre-GST, pre-tip revenue (Σ subtotal − discount) — tips
  // belong to the staff, GST belongs to the government; neither is the salon's
  // revenue to pay commission on.
  let commissionBase = 0
  for (const t of txns) {
    revenue += t.total
    discounts += t.discountAmount
    commissionBase += round2(t.subtotal - t.discountAmount)
  }
  commissionBase = round2(commissionBase)

  const commission = round2((commissionBase * staff.commissionPct) / 100)

  const response: ShiftReportResponse = {
    date,
    staff: {
      id: staff.id,
      name: staff.name,
      role: staff.role as ShiftReportResponse["staff"]["role"],
      commissionPct: staff.commissionPct,
      branchNames: staff.branches
        .filter((ub) => ub.branch.active && ub.branch.approved)
        .map((ub) => ub.branch.name),
    },
    summary: {
      bills: txns.length,
      revenue: round2(revenue),
      discounts: round2(discounts),
      avgBill: txns.length > 0 ? round2(revenue / txns.length) : 0,
      commissionBase,
      commission,
      byPayment,
      // What the staff hands over: every CASH slice (split bills included).
      // Tips are inside the bill totals already, so a cash tip paid out of the
      // till is covered by its bill's cash slice.
      cashCollected: byPayment.CASH.amount,
      firstBillAt: txns.length > 0 ? txns[0].createdAt.toISOString() : null,
      lastBillAt: txns.length > 0 ? txns[txns.length - 1].createdAt.toISOString() : null,
    },
    bills: txns.map((t) => ({
      id: t.id,
      billNo: t.billNo,
      createdAt: t.createdAt.toISOString(),
      branchName: t.branchName,
      customerName: t.customerName,
      customerMobile: t.customerMobile,
      items: t.items.reduce((s, i) => s + i.qty, 0),
      discountAmount: round2(t.discountAmount),
      tipAmount: round2(t.tipAmount),
      total: round2(t.total),
      paymentMethod: t.paymentMethod as ShiftReportResponse["bills"][number]["paymentMethod"],
    })),
    generatedAt: new Date().toISOString(),
  }

  return NextResponse.json(response)
}

/** Local YYYY-MM-DD (the server runs in the salon's timezone). */
function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
