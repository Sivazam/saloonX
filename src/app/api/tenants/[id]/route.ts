import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Franchise name is too short").max(60).optional(),
  logo: z.string().startsWith("data:image/").max(400_000).optional().nullable(),
  active: z.boolean().optional(),
})

/** PUT (SUPER_ADMIN): rename / re-logo / pause a franchise. */
export async function PUT(request: Request) {
  const auth = await requireApiUser(["SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const { id, name, logo, active } = parsed.data

  const existing = await db.tenant.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Franchise not found" }, { status: 404 })

  // Pausing a franchise freezes logins at its branches (session check rejects
  // inactive tenant/branch) — no cascade deletes, data is preserved.
  const tenant = await db.tenant.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(logo !== undefined ? { logo } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  })

  if (active === false) {
    // Drop live sessions for this franchise's staff so the pause takes effect.
    const users = await db.user.findMany({ where: { tenantId: id }, select: { id: true } })
    await db.session.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } })
  }

  return NextResponse.json({ tenant: { id: tenant.id, name: tenant.name, logo: tenant.logo, active: tenant.active } })
}
