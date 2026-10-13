import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { toFranchiseCategoryDTO } from "@/lib/serialize"
import type { FranchiseMenuResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

/**
 * GET (ADMIN): the FRANCHISE menu — franchise-default prices plus every
 * branch override, for the "Menu & Prices" manager. Branch overrides are
 * applied/removed via /api/catalog/override.
 */
export async function GET() {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) return NextResponse.json({ error: "No franchise context" }, { status: 400 })

  const [tenant, branches, categories] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, logo: true } }),
    db.branch.findMany({
      where: { tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true },
    }),
    db.category.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { services: { include: { overrides: true }, orderBy: { name: "asc" } } },
    }),
  ])

  const body: FranchiseMenuResponse = {
    tenant: tenant ? { id: tenant.id, name: tenant.name, logo: tenant.logo } : { id: tenantId, name: "", logo: null },
    branches,
    categories: categories.map(toFranchiseCategoryDTO),
  }
  return NextResponse.json(body)
}
