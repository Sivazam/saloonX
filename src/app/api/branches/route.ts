import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { uniqueMenuSlug } from "@/lib/slug"
import { dateKey, round2, toBranchAdminDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * GET: branch list with 30-day stats.
 * - ADMIN: branches of THEIR franchise (the whole chain — this powers the
 *   Branches management view).
 * - SUPER_ADMIN: branches of any one franchise via ?tenantId=….
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response
  const user = auth.user

  const requestedTenant = new URL(request.url).searchParams.get("tenantId")
  let tenantId: string | null = null
  if (user.role === "SUPER_ADMIN") {
    tenantId = requestedTenant
    if (!tenantId) return NextResponse.json({ branches: [] })
  } else {
    tenantId = user.tenantId
  }
  if (!tenantId) return NextResponse.json({ branches: [] })

  const since = new Date(Date.now() - 30 * 86400000)
  const [branches, txnRows, userBranches] = await Promise.all([
    db.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      include: { tenant: { select: { id: true, name: true } } },
    }),
    db.transaction.findMany({
      where: { branch: { tenantId }, createdAt: { gte: since }, status: "COMPLETED" },
      select: { branchId: true, total: true },
    }),
    db.userBranch.findMany({
      where: { branch: { tenantId }, user: { active: true } },
      select: { branchId: true },
    }),
  ])

  const revenueByBranch = new Map<string, { revenue: number; bills: number }>()
  for (const t of txnRows) {
    const cur = revenueByBranch.get(t.branchId) ?? { revenue: 0, bills: 0 }
    cur.revenue += t.total
    cur.bills += 1
    revenueByBranch.set(t.branchId, cur)
  }
  const usersByBranch = new Map<string, number>()
  for (const ub of userBranches) {
    usersByBranch.set(ub.branchId, (usersByBranch.get(ub.branchId) ?? 0) + 1)
  }

  return NextResponse.json({
    branches: branches.map((b) => {
      const r = revenueByBranch.get(b.id) ?? { revenue: 0, bills: 0 }
      return toBranchAdminDTO(b, {
        userCount: usersByBranch.get(b.id) ?? 0,
        revenue30d: round2(r.revenue),
        bills30d: r.bills,
      })
    }),
  })
}

const PREFIX_RE = /^[A-Za-z0-9]{1,5}$/

const createSchema = z.object({
  tenantId: z.string().optional(), // SUPER_ADMIN may target any franchise
  name: z.string().trim().min(2, "Branch name is too short").max(60),
  city: z.string().trim().min(2, "City is required").max(40),
  address: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  upiId: z.string().trim().max(80).optional().nullable(),
  ownerMobile: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Owner WhatsApp must be 10 digits")
    .optional()
    .nullable(),
  billPrefix: z
    .string()
    .trim()
    .regex(PREFIX_RE, "Bill prefix must be 1–5 letters/digits")
    .transform((s) => s.toUpperCase()),
  gstEnabled: z.boolean().optional(),
  adminUserIds: z.array(z.string()).optional(), // existing franchise staff to grant access
})

/**
 * POST: open a new branch. ADMIN: always inside their franchise.
 * SUPER_ADMIN: inside ?tenantId (must be passed).
 * Bill numbers are per-branch (PREFIX-0001) and the prefix must be unique.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response
  const user = auth.user

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const data = parsed.data

  const tenantId = user.role === "SUPER_ADMIN" ? data.tenantId : user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "Choose a franchise for this branch" }, { status: 400 })
  }
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant || (user.role === "ADMIN" && tenantId !== user.tenantId)) {
    return NextResponse.json({ error: "No access to this franchise" }, { status: 403 })
  }

  const prefixTaken = await db.branch.findFirst({ where: { billPrefix: data.billPrefix } })
  if (prefixTaken) {
    return NextResponse.json({ error: `Bill prefix ${data.billPrefix} is already used — pick another` }, { status: 409 })
  }

  // Validate adminUserIds belong to this tenant when provided.
  const assignIds = data.adminUserIds ?? []
  if (assignIds.length > 0) {
    const assignable = await db.user.count({
      where: { id: { in: assignIds }, tenantId, active: true, role: { in: ["ADMIN", "STAFF"] } },
    })
    if (assignable !== assignIds.length) {
      return NextResponse.json({ error: "Some selected staff don't belong to this franchise" }, { status: 400 })
    }
  }

  // Branches opened by franchise admins await super-admin approval; the
  // platform creates branches already approved.
  const approved = auth.user.role === "SUPER_ADMIN"

  const branch = await db.branch.create({
    data: {
      tenantId,
      name: data.name,
      city: data.city,
      address: data.address ?? null,
      phone: data.phone ?? null,
      upiId: data.upiId ?? null,
      ownerMobile: data.ownerMobile ?? null,
      billPrefix: data.billPrefix,
      gstEnabled: data.gstEnabled ?? false,
      gstPct: data.gstEnabled ? 18 : 0,
      // Public QR-menu link (?menu=<slug>) — unique across the platform.
      menuSlug: await uniqueMenuSlug(tenant.name, data.name, data.city),
      approved,
      approvedAt: approved ? new Date() : null,
    },
  })

  if (assignIds.length > 0) {
    for (const uid of assignIds) {
      await db.userBranch
        .create({ data: { userId: uid, branchId: branch.id } })
        .catch(() => {}) // already assigned — skip
    }
  }

  return NextResponse.json(
    {
      branch: {
        id: branch.id,
        name: branch.name,
        city: branch.city,
        billPrefix: branch.billPrefix,
        approved: branch.approved,
      },
    },
    { status: 201 },
  )
}
