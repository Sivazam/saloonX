import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { toFranchiseServiceDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/** ADMIN may only touch their own franchise's catalog. */
function tenantGuard(role: string, recordTenantId: string, userTenantId: string | null) {
  return role === "SUPER_ADMIN" || recordTenantId === userTenantId
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  price: z.number().min(0, "Price cannot be negative"),
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
  categoryId: z.string().min(1),
})

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(80).optional(),
  price: z.number().min(0, "Price cannot be negative").optional(),
  durationMin: z.number().int().min(1).max(600).nullable().optional(),
  categoryId: z.string().min(1).optional(),
  active: z.boolean().optional(),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  const category = await db.category.findUnique({ where: { id: parsed.data.categoryId } })
  if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 })
  if (!tenantGuard(auth.user.role, category.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this franchise" }, { status: 403 })
  }

  const { durationMin, ...rest } = parsed.data
  const service = await db.service.create({
    data: { ...rest, durationMin: durationMin ?? null, tenantId: category.tenantId },
    include: { overrides: true },
  })
  return NextResponse.json({ service: toFranchiseServiceDTO(service) })
}

export async function PUT(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  const { id, ...fields } = parsed.data
  const existing = await db.service.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Service not found" }, { status: 404 })
  if (!tenantGuard(auth.user.role, existing.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this franchise" }, { status: 403 })
  }

  if (fields.categoryId && fields.categoryId !== existing.categoryId) {
    const category = await db.category.findUnique({ where: { id: fields.categoryId } })
    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 })
    if (!tenantGuard(auth.user.role, category.tenantId, auth.user.tenantId)) {
      return NextResponse.json({ error: "Category belongs to another franchise" }, { status: 403 })
    }
  }

  const service = await db.service.update({
    where: { id },
    data: fields,
    include: { overrides: true },
  })
  return NextResponse.json({ service: toFranchiseServiceDTO(service) })
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const existing = await db.service.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Service not found" }, { status: 404 })
  if (!tenantGuard(auth.user.role, existing.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this franchise" }, { status: 403 })
  }
  if (existing._count.items > 0) {
    return NextResponse.json(
      { error: "Service is used in past bills — deactivate it instead" },
      { status: 409 },
    )
  }

  await db.service.delete({ where: { id } }) // overrides cascade
  return NextResponse.json({ ok: true })
}
