import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { toCustomerDTO } from "@/lib/serialize"
import type { BirthdayCustomerDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

/** Days until the next occurrence of a recurring "MM-DD" birthday (0 = today). */
export function daysUntilBirthday(mmdd: string, today = new Date()): number {
  const [mm, dd] = mmdd.split("-").map(Number)
  // Build this year's occurrence; if it already passed, use next year's.
  let next = new Date(today.getFullYear(), mm - 1, dd)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (next < startOfToday) next = new Date(today.getFullYear() + 1, mm - 1, dd)
  return Math.round((next.getTime() - startOfToday.getTime()) / 86_400_000)
}

/**
 * GET /api/customers — ADMIN only.
 * `?search=&page=&limit=` → paged customer book.
 * `?birthdaysWithin=7`    → upcoming-birthday list (sorted by soonest).
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ customers: [], total: 0 })

  const params = new URL(request.url).searchParams

  /* ── Birthday reminder list ── */
  const birthdaysWithin = params.get("birthdaysWithin")
  if (birthdaysWithin !== null) {
    const days = Math.min(60, Math.max(1, Number(birthdaysWithin) || 7))
    const rows = await db.customer.findMany({
      where: { tenantId, birthday: { not: null } },
      include: { branchVisits: { orderBy: { visitedAt: "desc" }, select: { branchName: true }, take: 1 } },
    })
    const upcoming: BirthdayCustomerDTO[] = rows
      .filter((c) => c.birthday && daysUntilBirthday(c.birthday) <= days)
      .map((c) => ({
        id: c.id,
        name: c.name,
        mobile: c.mobile,
        birthday: c.birthday,
        daysUntil: daysUntilBirthday(c.birthday!),
        homeBranchName: c.branchVisits[0]?.branchName ?? null,
        lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
        lastWishAt: c.lastWishAt ? c.lastWishAt.toISOString() : null,
      }))
      .sort((a, b) => a.daysUntil - b.daysUntil)
    return NextResponse.json({ customers: upcoming })
  }

  /* ── Regular paged book ── */
  const search = (params.get("search") ?? "").trim()
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1)
  const limit = Math.min(200, Math.max(1, Number(params.get("limit") ?? 50) || 50))

  const where = {
    tenantId,
    ...(search ? { OR: [{ mobile: { contains: search } }, { name: { contains: search } }] } : {}),
  }

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: [{ lastVisitAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { branchVisits: { select: { branchName: true }, take: 3, orderBy: { visitedAt: "desc" } } },
    }),
    db.customer.count({ where }),
  ])

  return NextResponse.json({ customers: customers.map(toCustomerDTO), total })
}
