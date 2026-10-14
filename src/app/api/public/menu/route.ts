import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { PublicMenuCategoryDTO, PublicMenuResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

/** Category → icon key for the public menu (keyword rules; new custom
 *  categories fall back to "sparkles"). Rendered by menu/icons.tsx. */
export function iconForCategory(name: string): string {
  const n = name.toLowerCase()
  if (/(beard|shav|mustache)/.test(n)) return "mustache"
  if (/(cut|styling|trim)/.test(n)) return "scissors"
  if (/(style|blow|dry|studio)/.test(n)) return "dryer"
  if (/(color|colour)/.test(n)) return "palette"
  if (/(facial|skin|face|cleanup|glow|detan|de-tan)/.test(n)) return "lotus"
  if (/(massage|spa|ritual|aroma|champi|therapy|wellness)/.test(n)) return "flower"
  if (/(package|combo|deal)/.test(n)) return "crown"
  if (/(groom)/.test(n)) return "comb"
  if (/(nail)/.test(n)) return "polish"
  if (/(makeup|bridal|party)/.test(n)) return "lipstick"
  if (/(kid|child)/.test(n)) return "kid"
  return "sparkles"
}

/**
 * GET /api/public/menu?slug=<menuSlug> — the UNAUTHENTICATED endpoint behind the
 * QR code guests scan at the salon. Returns only public data (no UPI ids, no
 * staff info): branch identity, the branch-resolved service menu, popularity
 * flags from real bills, and the first-visit signup offer.
 */
export async function GET(request: Request) {
  const slug = (new URL(request.url).searchParams.get("slug") ?? "").trim().toLowerCase()
  if (!slug || !/^[a-z0-9-]{2,80}$/.test(slug)) {
    return NextResponse.json({ error: "Invalid menu link" }, { status: 400 })
  }

  const branch = await db.branch.findUnique({
    where: { menuSlug: slug },
    include: { tenant: { select: { id: true, name: true, logo: true } } },
  })
  if (!branch || !branch.approved || !branch.active) {
    return NextResponse.json({ error: "This menu link is not available" }, { status: 404 })
  }

  const [categories, overrides, popularRows, customers, bills] = await Promise.all([
    db.category.findMany({
      where: { tenantId: branch.tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        services: {
          where: { active: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    db.serviceOverride.findMany({
      where: { branchId: branch.id },
      select: { serviceId: true, price: true, active: true },
    }),
    db.transactionItem.findMany({
      where: {
        transaction: {
          branchId: branch.id,
          status: "COMPLETED",
          createdAt: { gte: new Date(Date.now() - 90 * 86400000) },
        },
      },
      select: { serviceName: true, qty: true },
    }),
    db.customer.count({ where: { tenantId: branch.tenantId } }),
    db.transaction.count({
      where: { branchId: branch.id, status: "COMPLETED" },
    }),
  ])

  // Top-6 most-billed services at THIS branch in the last 90 days.
  const counts = new Map<string, number>()
  for (const it of popularRows) counts.set(it.serviceName, (counts.get(it.serviceName) ?? 0) + it.qty)
  const popularNames = new Set(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name),
  )

  const overrideByService = new Map(overrides.map((o) => [o.serviceId, o]))
  const menuCategories: PublicMenuCategoryDTO[] = []
  for (const cat of categories) {
    // Effective availability at THIS branch: override.active ?? service.active.
    const services = cat.services
      .filter((s) => overrideByService.get(s.id)?.active ?? true)
      .map((s) => {
        const ov = overrideByService.get(s.id)
        const price = ov?.price ?? s.price
        const differs = ov?.price !== undefined && ov.price !== s.price
        return {
          id: s.id,
          name: s.name,
          price,
          mrp: differs ? s.price : null,
          durationMin: s.durationMin,
          popular: popularNames.has(s.name),
        }
      })
    if (services.length === 0) continue
    menuCategories.push({ id: cat.id, name: cat.name, icon: iconForCategory(cat.name), services })
  }

  const locality = branch.name.includes("—") ? branch.name.split("—").pop()!.trim() : branch.name
  const serviceCount = menuCategories.reduce((a, c) => a + c.services.length, 0)

  const payload: PublicMenuResponse = {
    branch: {
      name: branch.name,
      city: branch.city,
      address: branch.address,
      phone: branch.phone,
      logo: branch.logo ?? branch.tenant.logo,
      tagline:
        branch.menuTagline ??
        `${serviceCount}+ services in ${locality || branch.city || "your neighbourhood"} · walk-ins welcome`,
    },
    tenant: { name: branch.tenant.name, logo: branch.tenant.logo },
    offer: branch.menuOfferPct > 0 ? { pct: branch.menuOfferPct } : null,
    categories: menuCategories,
    stats: { customers, bills },
    slug,
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  })
}
