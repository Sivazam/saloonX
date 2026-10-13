import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { createFirebaseUser, deleteFirebaseUser, friendlyAuthMessage } from "@/lib/firebase-rest"
import { round2, toTenantDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const DAYS_30 = 30 * 86400000

async function buildTenantDTOs() {
  const since = new Date(Date.now() - DAYS_30)
  const tenants = await db.tenant.findMany({
    orderBy: { name: "asc" },
    include: { branches: { orderBy: { name: "asc" }, include: { tenant: { select: { id: true, name: true } } } } },
  })
  const [users, txns] = await Promise.all([
    db.user.findMany({
      where: { tenantId: { not: null }, active: true, role: { in: ["ADMIN", "STAFF"] } },
      select: { tenantId: true, branches: { select: { branchId: true } } },
    }),
    db.transaction.findMany({
      where: { createdAt: { gte: since }, status: "COMPLETED" },
      select: { branchId: true, total: true },
    }),
  ])

  const userCountByTenant = new Map<string, number>()
  const usersByBranch = new Map<string, number>()
  for (const u of users) {
    if (u.tenantId) userCountByTenant.set(u.tenantId, (userCountByTenant.get(u.tenantId) ?? 0) + 1)
    for (const b of u.branches) {
      usersByBranch.set(b.branchId, (usersByBranch.get(b.branchId) ?? 0) + 1)
    }
  }
  const revenueByBranch = new Map<string, { revenue: number; bills: number }>()
  for (const t of txns) {
    const cur = revenueByBranch.get(t.branchId) ?? { revenue: 0, bills: 0 }
    cur.revenue += t.total
    cur.bills += 1
    revenueByBranch.set(t.branchId, cur)
  }

  return tenants.map((t) => {
    const branchStats: Record<string, { userCount: number; revenue30d: number; bills30d: number }> = {}
    for (const b of t.branches) {
      const r = revenueByBranch.get(b.id) ?? { revenue: 0, bills: 0 }
      branchStats[b.id] = { userCount: usersByBranch.get(b.id) ?? 0, revenue30d: r.revenue, bills30d: r.bills }
    }
    return toTenantDTO(t, {
      userCount: userCountByTenant.get(t.id) ?? 0,
      revenue30d: t.branches.reduce((s, b) => s + (branchStats[b.id]?.revenue30d ?? 0), 0),
      bills30d: t.branches.reduce((s, b) => s + (branchStats[b.id]?.bills30d ?? 0), 0),
      branchStats,
    })
  })
}

/** GET (SUPER_ADMIN): every franchise with 30-day stats + branch summaries. */
export async function GET() {
  const auth = await requireApiUser(["SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const tenants = await buildTenantDTOs()

  const since = new Date(Date.now() - DAYS_30)
  const [platformTxns, activeBranches, staffCount, newCustomers, pendingBranchRows] = await Promise.all([
    db.transaction.aggregate({
      where: { createdAt: { gte: since }, status: "COMPLETED", branch: { approved: true } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.branch.count({ where: { active: true, approved: true } }),
    db.user.count({ where: { role: { in: ["ADMIN", "STAFF"] }, active: true } }),
    db.customer.count({ where: { createdAt: { gte: since } } }),
    db.branch.findMany({
      where: { approved: false, active: true },
      orderBy: { createdAt: "desc" },
      include: { tenant: { select: { name: true } } },
    }),
  ])

  return NextResponse.json({
    tenants,
    platform: {
      revenue30d: round2(platformTxns._sum.total ?? 0),
      bills30d: platformTxns._count._all,
      activeTenants: tenants.filter((t) => t.active).length,
      activeBranches,
      staffCount,
      newCustomers30d: newCustomers,
      pendingBranches: pendingBranchRows.map((b) => ({
        id: b.id,
        tenantName: b.tenant.name,
        name: b.name,
        city: b.city,
        billPrefix: b.billPrefix,
        createdAt: b.createdAt.toISOString(),
      })),
    },
  })
}

const createSchema = z.object({
  name: z.string().trim().min(2, "Franchise name is too short").max(60),
  logo: z.string().startsWith("data:image/").max(400_000).optional().nullable(),
  firstBranch: z.object({
    name: z.string().trim().min(2, "Branch name is too short").max(60),
    city: z.string().trim().min(2, "City is too short").max(40),
    address: z.string().trim().max(160).optional().nullable(),
    phone: z.string().trim().max(20).optional().nullable(),
    upiId: z.string().trim().max(80).optional().nullable(),
    billPrefix: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{1,5}$/, "Bill prefix must be 1–5 letters/digits")
      .transform((s) => s.toUpperCase()),
  }),
  admin: z.object({
    name: z.string().trim().min(2, "Admin name is too short").max(60),
    email: z.string().trim().toLowerCase().email("Enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters").max(72),
  }),
})

/**
 * POST (SUPER_ADMIN): onboard a whole franchise — tenant + first branch +
 * franchise admin with access to that branch — in one atomic call.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser(["SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { name, logo, firstBranch, admin } = parsed.data

  const exists = await db.tenant.findFirst({ where: { name } })
  if (exists) {
    return NextResponse.json({ error: "A franchise with this name already exists" }, { status: 409 })
  }
  const prefixTaken = await db.branch.findFirst({ where: { billPrefix: firstBranch.billPrefix } })
  if (prefixTaken) {
    return NextResponse.json({ error: `Bill prefix ${firstBranch.billPrefix} is already used by another branch` }, { status: 409 })
  }

  // Provision the franchise admin's Firebase login FIRST — a Google rejection
  // (duplicate email, weak password) must leave nothing behind.
  let firebase
  try {
    firebase = await createFirebaseUser(admin.email, admin.password, admin.name)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  let created
  try {
    created = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name, logo: logo ?? null } })
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: firstBranch.name,
          city: firstBranch.city,
          address: firstBranch.address ?? null,
          phone: firstBranch.phone ?? null,
          upiId: firstBranch.upiId ?? null,
          billPrefix: firstBranch.billPrefix,
          // Branches created by the platform super admin are live immediately.
          approved: true,
          approvedAt: new Date(),
        },
      })
      const user = await tx.user.create({
        data: {
          name: admin.name,
          email: admin.email,
          firebaseUid: firebase.uid,
          role: "ADMIN",
          tenantId: tenant.id,
          branches: { create: { branchId: branch.id } },
        },
      })
      // Welcome note for the new franchise — the admin sees it in the bell on
      // their very first login (a friendly guided start instead of silence).
      await tx.announcement.create({
        data: {
          tenantId: tenant.id,
          kind: "WELCOME",
          title: `Welcome to SaloonX, ${name}! ✂️`,
          body: `${branch.name} is live and ready to bill. Next steps: add your services under Menu & Prices, invite staff under Staff, and set your UPI ID in Settings so QR payments work. This bell will keep you posted on everything the platform does for your chain.`,
        },
      })
      return { tenant, branch, user }
    })
  } catch (e) {
    // Roll back the Firebase account so the email stays usable.
    await deleteFirebaseUser(firebase.idToken)
    const msg = (e as { code?: string }).code === "P2002" ? "This email already has a SaloonX account" : (e as Error).message
    return NextResponse.json({ error: friendlyAuthMessage(msg) }, { status: 409 })
  }

  return NextResponse.json(
    {
      tenantId: created.tenant.id,
      branchId: created.branch.id,
      adminUserId: created.user.id,
      adminEmail: created.user.email,
    },
    { status: 201 },
  )
}
