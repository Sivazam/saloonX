import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { createFirebaseUser, deleteFirebaseUser, friendlyAuthMessage } from "@/lib/firebase-rest"
import { toStaffDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/** Franchise admins manage THEIR OWN staff only (tenant-scoped everywhere). */
async function staffWithTodayStats(tenantId: string) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  const [users, todays] = await Promise.all([
    db.user.findMany({
      where: { tenantId, role: { in: ["ADMIN", "STAFF"] } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        commissionPct: true,
        branches: { select: { branch: { select: { id: true, name: true } } } },
      },
      orderBy: [{ role: "desc" }, { name: "asc" }],
    }),
    db.transaction.groupBy({
      by: ["staffId"],
      where: {
        createdAt: { gte: startOfToday },
        status: "COMPLETED",
        branch: { tenantId },
      },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ])

  const statsById = new Map(
    todays.map((g) => [g.staffId, { count: g._count._all, sum: g._sum.total ?? 0 }]),
  )
  return users.map((u) => {
    const s = statsById.get(u.id)
    return toStaffDTO(u, s?.count ?? 0, Math.round((s?.sum ?? 0) * 100) / 100)
  })
}

export async function GET() {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ users: [] })

  return NextResponse.json({ users: await staffWithTodayStats(tenantId) })
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
  role: z.enum(["ADMIN", "STAFF"]),
  commissionPct: z.number().min(0, "Commission must be 0 or more").max(100, "Commission cannot exceed 100").optional(),
  /** Branches this user may operate. ADMINs often get several; STAFF usually one. */
  branchIds: z.array(z.string().min(1)).min(1, "Assign at least one branch"),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ error: "No franchise context" }, { status: 400 })

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { name, email, password, role, branchIds } = parsed.data

  // All branches must belong to the admin's franchise (and be live branches).
  const branchCount = await db.branch.count({
    where: { id: { in: branchIds }, tenantId, active: true, approved: true },
  })
  if (branchCount !== new Set(branchIds).size) {
    return NextResponse.json({ error: "Some branches don't belong to your franchise (or aren't live yet)" }, { status: 400 })
  }

  // Local email must be unique too.
  const taken = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (taken) {
    return NextResponse.json({ error: "This email already has a SaloonX account" }, { status: 409 })
  }

  // Create the Firebase login FIRST — if Google rejects it (e.g. weak
  // password, duplicate), no local row is left behind.
  let firebase
  try {
    firebase = await createFirebaseUser(email, password, name)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const { commissionPct } = parsed.data
  try {
    const user = await db.user.create({
      data: {
        name,
        email,
        firebaseUid: firebase.uid,
        role,
        tenantId,
        ...(commissionPct !== undefined ? { commissionPct } : {}),
        branches: { create: branchIds.map((id) => ({ branchId: id })) },
      },
      select: {
        id: true, name: true, email: true, role: true, active: true, commissionPct: true,
        branches: { select: { branch: { select: { id: true, name: true } } } },
      },
    })
    return NextResponse.json({ user: toStaffDTO(user) }, { status: 201 })
  } catch (e) {
    // Roll back the Firebase account so the email stays usable.
    await deleteFirebaseUser(firebase.idToken)
    const msg = (e as { code?: string }).code === "P2002" ? "This email already has a SaloonX account" : (e as Error).message
    return NextResponse.json({ error: friendlyAuthMessage(msg) }, { status: 409 })
  }
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(60).optional(),
  role: z.enum(["ADMIN", "STAFF"]).optional(),
  active: z.boolean().optional(),
  commissionPct: z.number().min(0, "Commission must be 0 or more").max(100, "Commission cannot exceed 100").optional(),
  /** Replace the user's branch assignments (optional — omit to keep as-is). */
  branchIds: z.array(z.string().min(1)).optional(),
})

export async function PUT(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ error: "No franchise context" }, { status: 400 })

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  const { id, branchIds, ...fields } = parsed.data
  const existing = await db.user.findUnique({
    where: { id },
    include: { branches: { select: { branchId: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Staff not found" }, { status: 404 })
  if (existing.tenantId !== tenantId || existing.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No access to this staff member" }, { status: 403 })
  }

  if (branchIds !== undefined && branchIds.length > 0) {
    const branchCount = await db.branch.count({
      where: { id: { in: branchIds }, tenantId, active: true, approved: true },
    })
    if (branchCount !== new Set(branchIds).size) {
      return NextResponse.json({ error: "Some branches don't belong to your franchise (or aren't live yet)" }, { status: 400 })
    }
  }

  const losingAdmin =
    existing.role === "ADMIN" && existing.active &&
    ((fields.role !== undefined && fields.role !== "ADMIN") || fields.active === false)

  if (losingAdmin) {
    const otherActiveAdmins = await db.user.count({
      where: { role: "ADMIN", active: true, tenantId, id: { not: id } },
    })
    if (otherActiveAdmins === 0) {
      return NextResponse.json(
        { error: "Cannot demote or deactivate the last active admin" },
        { status: 409 },
      )
    }
  }

  const user = await db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...(fields.name !== undefined ? { name: fields.name } : {}),
        ...(fields.role !== undefined ? { role: fields.role } : {}),
        ...(fields.active !== undefined ? { active: fields.active } : {}),
        ...(fields.commissionPct !== undefined ? { commissionPct: fields.commissionPct } : {}),
      },
      select: {
        id: true, name: true, email: true, role: true, active: true, commissionPct: true,
        branches: { select: { branch: { select: { id: true, name: true } } } },
      },
    })

    // Replace branch assignments when provided.
    if (branchIds !== undefined && branchIds.length > 0) {
      await tx.userBranch.deleteMany({ where: { userId: id } })
      await tx.userBranch.createMany({
        data: branchIds.map((bid) => ({ userId: id, branchId: bid })),
      })
    }

    return tx.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, active: true, commissionPct: true,
        branches: { select: { branch: { select: { id: true, name: true } } } },
      },
    })
  })

  if (!user) return NextResponse.json({ error: "Staff not found" }, { status: 404 })

  // Deactivated staff lose their sessions immediately.
  if (fields.active === false) {
    await db.session.deleteMany({ where: { userId: id } })
  }

  return NextResponse.json({ user: toStaffDTO(user) })
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ error: "No franchise context" }, { status: 400 })

  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const existing = await db.user.findUnique({
    where: { id },
    include: { _count: { select: { transactions: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Staff not found" }, { status: 404 })
  if (existing.tenantId !== tenantId || existing.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No access to this staff member" }, { status: 403 })
  }

  if (existing._count.transactions > 0) {
    return NextResponse.json(
      { error: "Deactivate instead — this staff has past bills" },
      { status: 409 },
    )
  }

  if (existing.role === "ADMIN" && existing.active) {
    const otherActiveAdmins = await db.user.count({
      where: { role: "ADMIN", active: true, tenantId, id: { not: id } },
    })
    if (otherActiveAdmins === 0) {
      return NextResponse.json({ error: "Cannot delete the last active admin" }, { status: 409 })
    }
  }

  await db.user.delete({ where: { id } }) // sessions cascade
  return NextResponse.json({ ok: true })
}
