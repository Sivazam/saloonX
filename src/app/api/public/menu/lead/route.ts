import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit"
import type { MenuLeadResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9-]{2,80}$/, "Invalid menu link"),
  mobile: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit mobile number"),
  name: z.string().trim().min(1, "Please tell us your name").max(60).optional(),
})

/** Unambiguous coupon alphabet (no 0/O, 1/I/L) — shown at the counter. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function newCode(): string {
  let code = ""
  for (let i = 0; i < 6; i++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return code
}

/**
 * POST /api/public/menu/lead — a guest registers from the QR menu to claim the
 * first-visit offer. Idempotent: an existing unredeemed lead for the same
 * customer + branch returns the SAME code ("already"). The lead also creates
 * (or enriches) the Customer record, so the salon recognises the mobile the
 * moment the guest walks in.
 */
export async function POST(request: Request) {
  // Per-IP flood guard (the per-mobile guard below is self-limiting, but an
  // attacker rotating mobiles would otherwise create unbounded rows).
  const rl = rateLimit(`lead:${clientIp(request)}`, 10, 60 * 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { slug, mobile, name } = parsed.data

  const branch = await db.branch.findUnique({ where: { menuSlug: slug } })
  if (!branch || !branch.approved || !branch.active || branch.menuOfferPct <= 0) {
    return NextResponse.json({ error: "This offer is not available right now" }, { status: 404 })
  }

  // Light abuse guard: at most 3 fresh claims per mobile per branch per day.
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)
  const todaysLeads = await db.menuLead.count({
    where: { branchId: branch.id, mobile, createdAt: { gte: dayStart } },
  })
  if (todaysLeads >= 3) {
    return NextResponse.json(
      { error: "Too many requests today — please try again tomorrow or just walk in" },
      { status: 429 },
    )
  }

  // Register the customer (franchise-wide by mobile) without inflating visits.
  // A provided name only fills a blank — never overwrites what the salon knows.
  const existingCustomer = await db.customer.findUnique({
    where: { tenantId_mobile: { tenantId: branch.tenantId, mobile } },
  })
  const customer = existingCustomer
    ? await db.customer.update({
        where: { id: existingCustomer.id },
        data: { ...(name && !existingCustomer.name ? { name } : {}) },
      })
    : await db.customer.create({
        data: { tenantId: branch.tenantId, mobile, name: name ?? null },
      })

  const existing = await db.menuLead.findFirst({
    where: { customerId: customer.id, branchId: branch.id, redeemedAt: null },
    orderBy: { createdAt: "desc" },
  })
  if (existing) {
    const res: MenuLeadResponse = {
      code: existing.code,
      pct: existing.pct,
      name: customer.name,
      already: true,
    }
    return NextResponse.json(res)
  }

  // Retry a couple of times in the (unlikely) event of a code collision.
  const createLead = () =>
    db.menuLead.create({
      data: {
        code: newCode(),
        tenantId: branch.tenantId,
        branchId: branch.id,
        customerId: customer.id,
        mobile,
        name: name ?? null,
        pct: branch.menuOfferPct,
      },
    })

  let lead: Awaited<ReturnType<typeof createLead>> | null = null
  for (let attempt = 0; attempt < 3 && !lead; attempt++) {
    lead = await createLead().catch(() => null)
  }
  if (!lead) {
    return NextResponse.json({ error: "Could not generate your code — please try again" }, { status: 500 })
  }

  const res: MenuLeadResponse = { code: lead.code, pct: lead.pct, name: customer.name, already: false }
  return NextResponse.json(res)
}
