import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { adminBranchScope, requireApiUser } from "@/lib/auth"
import { dayEnd, dayStart, round2 } from "@/lib/serialize"

export const dynamic = "force-dynamic"

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

/**
 * GET /api/stats/hours?from&to&branchId — business-hours heat analysis.
 * Buckets COMPLETED bills by weekday (Mon=0…Sun=6) × hour-of-day so the
 * dashboard can answer "when should I roster more staff?"
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const branchIdParam = params.get("branchId") ?? ""

  const scope = await adminBranchScope(auth.user, branchIdParam || null)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })
  const branchIds = scope.branchIds ?? []
  if (branchIds.length === 0) {
    return NextResponse.json({ cells: [], dowTotals: [], hourTotals: [], peak: null, totalBills: 0, totalRevenue: 0 })
  }

  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 29)
  const { from, to } = clampRange(
    dayStart(params.get("from") ?? defaultFrom) ?? defaultFrom,
    dayEnd(params.get("to") ?? new Date()) ?? new Date(),
  )

  const rows = await db.transaction.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: "COMPLETED",
      branchId: { in: branchIds },
    },
    select: { createdAt: true, total: true },
  })

  // Weekday × hour grid. Hours run 8:00–22:00 local (salon day); anything
  // outside clamps into the edge buckets so no bill is ever dropped.
  const HOUR_MIN = 8
  const HOUR_MAX = 21 // inclusive bucket start 21:00 (21:00–21:59)
  const hours: number[] = []
  for (let h = HOUR_MIN; h <= HOUR_MAX; h++) hours.push(h)

  type Cell = { dow: number; hour: number; bills: number; revenue: number }
  const grid = new Map<string, Cell>()
  for (let dow = 0; dow < 7; dow++) {
    for (const h of hours) grid.set(`${dow}-${h}`, { dow, hour: h, bills: 0, revenue: 0 })
  }
  const dowTotals = Array.from({ length: 7 }, (_, dow) => ({ dow, bills: 0, revenue: 0 }))
  const hourTotals = hours.map((h) => ({ hour: h, bills: 0, revenue: 0 }))

  let totalBills = 0
  let totalRevenue = 0
  let peak: Cell | null = null

  for (const t of rows) {
    const d = new Date(t.createdAt)
    const jsDow = d.getDay() // Sun=0
    const dow = jsDow === 0 ? 6 : jsDow - 1 // Mon=0…Sun=6
    const hour = Math.min(HOUR_MAX, Math.max(HOUR_MIN, d.getHours()))
    const cell = grid.get(`${dow}-${hour}`)!
    cell.bills += 1
    cell.revenue = round2(cell.revenue + t.total)
    dowTotals[dow].bills += 1
    dowTotals[dow].revenue = round2(dowTotals[dow].revenue + t.total)
    hourTotals[hour - HOUR_MIN].bills += 1
    hourTotals[hour - HOUR_MIN].revenue = round2(hourTotals[hour - HOUR_MIN].revenue + t.total)
    totalBills += 1
    totalRevenue = round2(totalRevenue + t.total)
    if (!peak || cell.bills > peak.bills) peak = cell
  }

  return NextResponse.json({
    cells: [...grid.values()],
    dowTotals,
    hourTotals,
    peak,
    totalBills,
    totalRevenue,
  })
}
