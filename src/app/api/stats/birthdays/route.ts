import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { round2 } from "@/lib/serialize"
import type {
  BirthdayCampaignMonth,
  BirthdayCampaignResponse,
  MissedBirthdayDTO,
} from "@/lib/types"

export const dynamic = "force-dynamic"

/**
 * GET /api/stats/birthdays?months=6 — ADMIN.
 * Birthday-campaign funnel for the franchise: how many known birthdays
 * happened, how many were wished on WhatsApp (tracked lastWishAt), how many
 * turned into a salon visit within 14 days, and the revenue those visits won.
 *
 * lastWishAt tracks only the MOST RECENT wish per customer — historical
 * analysis approximates with "wish falls within ±14d of a birthday
 * occurrence". The UI labels this clearly.
 */

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** All occurrences of a recurring "MM-DD" birthday inside [from, to]. */
function birthdayOccurrences(mmdd: string, from: Date, to: Date): Date[] {
  const [mm, dd] = mmdd.split("-").map(Number)
  if (!mm || !dd) return []
  const out: Date[] = []
  for (let year = from.getFullYear() - 1; year <= to.getFullYear() + 1; year++) {
    const occ = new Date(year, mm - 1, dd)
    if (occ >= from && occ <= to) out.push(occ)
  }
  return out
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) {
    return NextResponse.json({
      months: 0, windowFrom: new Date().toISOString(), windowTo: new Date().toISOString(),
      monthly: [], totals: { eligible: 0, wished: 0, visits: 0, conversionPct: 0, revenue: 0, avgTicket: 0 },
      missed: [],
    } satisfies BirthdayCampaignResponse)
  }

  const params = new URL(request.url).searchParams
  const months = Math.min(12, Math.max(1, Number(params.get("months") ?? 6) || 6))

  const now = new Date()
  const windowTo = now
  const windowFrom = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1, 0, 0, 0, 0)

  // Customers with a known birthday + their full transaction history
  // (small per-franchise book — one query each is fine).
  const customers = await db.customer.findMany({
    where: { tenantId, birthday: { not: null } },
    include: {
      transactions: {
        where: { status: "COMPLETED" },
        select: { total: true, createdAt: true },
      },
      branchVisits: { orderBy: { visitedAt: "desc" }, select: { branchName: true }, take: 1 },
    },
  })

  // Calendar month buckets, zero-filled from the window start.
  const monthlyMap = new Map<string, BirthdayCampaignMonth>()
  const cursor = new Date(windowFrom)
  while (cursor <= windowTo) {
    const ym = ymKey(cursor)
    monthlyMap.set(ym, { ym, label: MONTH_LABELS[cursor.getMonth()], eligible: 0, wished: 0, visits: 0, revenue: 0 })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  const VISIT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000 // win-back window after the birthday
  const WISH_LEEWAY_BEFORE_MS = 14 * 24 * 60 * 60 * 1000 // early wishes count
  const WISH_LEEWAY_AFTER_MS = 10 * 24 * 60 * 60 * 1000 // late wishes count too

  let totEligible = 0
  let totWished = 0
  let totVisits = 0
  let totRevenue = 0
  const missed: MissedBirthdayDTO[] = []

  for (const c of customers) {
    if (!c.birthday) continue
    const lastWish = c.lastWishAt ? c.lastWishAt.getTime() : null

    for (const occ of birthdayOccurrences(c.birthday, windowFrom, windowTo)) {
      const ym = monthlyMap.get(ymKey(occ))
      if (!ym) continue
      totEligible += 1
      ym.eligible += 1

      // A wish counts when the tracked lastWishAt lands near THIS occurrence.
      const wished =
        lastWish !== null &&
        lastWish >= occ.getTime() - WISH_LEEWAY_BEFORE_MS &&
        lastWish <= occ.getTime() + WISH_LEEWAY_AFTER_MS
      if (wished) {
        totWished += 1
        ym.wished += 1
      }

      // Visit won = a completed bill within 14 days AFTER the birthday.
      const winning = c.transactions.filter((t) => {
        const at = t.createdAt.getTime()
        return at >= occ.getTime() && at <= occ.getTime() + VISIT_WINDOW_MS
      })
      if (winning.length > 0) {
        totVisits += 1
        ym.visits += 1
        const rev = round2(winning.reduce((s, t) => s + t.total, 0))
        totRevenue = round2(totRevenue + rev)
        ym.revenue = round2(ym.revenue + rev)
      } else if (!wished) {
        // Birthday passed, nobody wished, nobody came → missed opportunity.
        missed.push({
          id: c.id,
          name: c.name,
          mobile: c.mobile,
          birthday: c.birthday,
          occurredYm: ymKey(occ),
          wished: false,
          totalSpend: c.totalSpend,
          lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
          homeBranchName: c.branchVisits[0]?.branchName ?? null,
        })
      }
    }
  }

  const response: BirthdayCampaignResponse = {
    months,
    windowFrom: windowFrom.toISOString(),
    windowTo: windowTo.toISOString(),
    monthly: [...monthlyMap.values()],
    totals: {
      eligible: totEligible,
      wished: totWished,
      visits: totVisits,
      conversionPct: totWished > 0 ? Math.round((totVisits / totWished) * 100) : 0,
      revenue: totRevenue,
      avgTicket: totVisits > 0 ? round2(totRevenue / totVisits) : 0,
    },
    // Highest-lifetime-spend first — those are the wins worth chasing.
    missed: missed.sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 6),
  }
  return NextResponse.json(response)
}
