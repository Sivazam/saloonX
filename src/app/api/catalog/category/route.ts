import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

function tenantGuard(role: string, recordTenantId: string, userTenantId: string | null) {
  return role === "SUPER_ADMIN" || recordTenantId === userTenantId
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50),
  sortOrder: z.number().int().min(0).max(999).optional(),
})

export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  // Categories belong to a franchise. ADMIN: own franchise. SUPER_ADMIN: ?tenantId=.
  const params = new URL(request.url).searchParams
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  const tenantId = auth.user.role === "SUPER_ADMIN" ? params.get("tenantId") : auth.user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "Choose a franchise for this category" }, { status: 400 })
  }
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return NextResponse.json({ error: "Franchise not found" }, { status: 404 })

  const category = await db.category.create({
    data: { name: parsed.data.name, sortOrder: parsed.data.sortOrder ?? 0, tenantId },
  })
  return NextResponse.json({ category: { id: category.id, name: category.name, sortOrder: category.sortOrder } })
}

export async function PUT(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const parsed = z
    .object({
      id: z.string().min(1),
      name: z.string().trim().min(1, "Name is required").max(50).optional(),
      sortOrder: z.number().int().min(0).max(999).optional(),
    })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  const { id, name, sortOrder } = parsed.data
  const existing = await db.category.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 })
  if (!tenantGuard(auth.user.role, existing.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this franchise" }, { status: 403 })
  }

  const category = await db.category.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    },
  })
  return NextResponse.json({ category: { id: category.id, name: category.name, sortOrder: category.sortOrder } })
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const existing = await db.category.findUnique({
    where: { id },
    include: { _count: { select: { services: true } } },
  })
  if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 })
  if (!tenantGuard(auth.user.role, existing.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this franchise" }, { status: 403 })
  }
  if (existing._count.services > 0) {
    return NextResponse.json(
      { error: "Category has services — move or delete them first" },
      { status: 409 },
    )
  }

  await db.category.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
