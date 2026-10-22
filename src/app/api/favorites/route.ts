import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/** Cap on the quick-row — more than this and it stops being "quick". */
const MAX_FAVORITES = 12
/** Window for the "most loved here" fallback (default list before a user
 *  personalises): what the salon actually bills, recently. */
const MOST_USED_WINDOW_DAYS = 180

/**
 * GET: the current user's favorite services for the billing quick row.
 *
 * `personalized: false` (no saved rows yet) → the tenant-wide most-used
 * services, computed from completed bills — a sensible starting point every
 * staff member sees until they curate their own list.
 * `personalized: true` → exactly the user's saved list (order = save order).
 */
export async function GET() {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response
  const user = auth.user

  // SUPER_ADMIN (no tenant) never bills — an empty quick row is correct.
  if (!user.tenantId) {
    return NextResponse.json({ favorites: [], personalized: false })
  }

  const saved = await db.serviceFavorite.findMany({
    where: { userId: user.id, service: { tenantId: user.tenantId, active: true } },
    orderBy: { createdAt: "asc" },
    select: { serviceId: true },
  })

  if (saved.length > 0) {
    return NextResponse.json({
      favorites: saved.map((f) => f.serviceId),
      personalized: true,
    })
  }

  // Default: most-billed services of the last ~6 months (completed bills only,
  // active services only). Aggregated in JS — SQLite groupBy can't filter on
  // the parent transaction, and this window is a few thousand rows at most.
  const since = new Date(Date.now() - MOST_USED_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const items = await db.transactionItem.findMany({
    where: {
      serviceId: { not: null },
      service: { tenantId: user.tenantId, active: true },
      transaction: { tenantId: user.tenantId, status: "COMPLETED", createdAt: { gte: since } },
    },
    select: { serviceId: true, qty: true },
  })

  const counts = new Map<string, number>()
  for (const it of items) {
    if (!it.serviceId) continue
    counts.set(it.serviceId, (counts.get(it.serviceId) ?? 0) + it.qty)
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([serviceId]) => serviceId)

  return NextResponse.json({ favorites: top, personalized: false })
}

const putSchema = z.object({
  serviceIds: z.array(z.string().min(1)).max(MAX_FAVORITES),
})

/**
 * PUT: replace the user's favorite list (set semantics — the exact list
 * submitted becomes the list). Services must belong to the user's tenant;
 * unknown/deactivated ids are rejected so the quick row can never go stale.
 */
export async function PUT(request: Request) {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response
  const user = auth.user

  if (!user.tenantId) {
    return NextResponse.json({ error: "Favorites belong to salon users" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Choose at most ${MAX_FAVORITES} services` },
      { status: 400 },
    )
  }

  const ids = [...new Set(parsed.data.serviceIds)]
  if (ids.length > 0) {
    const valid = await db.service.count({
      where: { id: { in: ids }, tenantId: user.tenantId, active: true },
    })
    if (valid !== ids.length) {
      return NextResponse.json({ error: "Some services are not available" }, { status: 400 })
    }
  }

  await db.$transaction([
    db.serviceFavorite.deleteMany({ where: { userId: user.id } }),
    ...(ids.length > 0
      ? [db.serviceFavorite.createMany({ data: ids.map((serviceId) => ({ userId: user.id, serviceId })) })]
      : []),
  ])

  return NextResponse.json({ favorites: ids, personalized: true })
}
