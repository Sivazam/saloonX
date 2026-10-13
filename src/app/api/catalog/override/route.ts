import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const upsertSchema = z.object({
  serviceId: z.string().min(1),
  branchId: z.string().min(1),
  price: z.number().min(0.5).max(100000).optional().nullable(),
  active: z.boolean().optional().nullable(),
})

/** Returns null when allowed, else a `{ error, status }` pair. */
async function guard(serviceId: string, branchId: string, role: string, tenantId: string | null) {
  const [service, branch] = await Promise.all([
    db.service.findUnique({ where: { id: serviceId }, select: { tenantId: true } }),
    db.branch.findUnique({ where: { id: branchId }, select: { tenantId: true } }),
  ])
  if (!service || !branch) {
    return { error: "Service or branch not found", status: 404 } as const
  }
  if (service.tenantId !== branch.tenantId) {
    return { error: "Service and branch belong to different franchises", status: 400 } as const
  }
  if (role !== "SUPER_ADMIN" && service.tenantId !== tenantId) {
    return { error: "No access to this franchise", status: 403 } as const
  }
  return null
}

/** POST (ADMIN): create/update a branch override. Pass only what changes —
 *  e.g. { serviceId, branchId, price: 180 } keeps availability untouched. */
export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const parsed = upsertSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { serviceId, branchId, price, active } = parsed.data
  if (price === undefined && active === undefined) {
    return NextResponse.json({ error: "Nothing to override — pass price or active" }, { status: 400 })
  }

  const deny = await guard(serviceId, branchId, auth.user.role, auth.user.tenantId)
  if (deny) return NextResponse.json({ error: deny.error }, { status: deny.status })

  const existing = await db.serviceOverride.findUnique({
    where: { serviceId_branchId: { serviceId, branchId } },
  })

  const override = await db.serviceOverride.upsert({
    where: { serviceId_branchId: { serviceId, branchId } },
    create: { serviceId, branchId, price: price ?? null, active: active ?? null },
    update: {
      ...(price !== undefined ? { price } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  })

  // All fields null = identical to inheriting → drop the row to keep data tidy.
  if (override.price === null && override.active === null && existing) {
    await db.serviceOverride.delete({ where: { id: override.id } })
    return NextResponse.json({ override: null, cleared: true })
  }

  return NextResponse.json({ override: { branchId, price: override.price, active: override.active } })
}

/** DELETE (ADMIN): remove the override — this branch inherits the franchise price again. */
export async function DELETE(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const serviceId = params.get("serviceId") ?? ""
  const branchId = params.get("branchId") ?? ""
  if (!serviceId || !branchId) {
    return NextResponse.json({ error: "serviceId and branchId are required" }, { status: 400 })
  }

  const deny = await guard(serviceId, branchId, auth.user.role, auth.user.tenantId)
  if (deny) return NextResponse.json({ error: deny.error }, { status: deny.status })

  await db.serviceOverride.deleteMany({ where: { serviceId, branchId } })
  return NextResponse.json({ ok: true })
}
