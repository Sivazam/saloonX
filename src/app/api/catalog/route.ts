import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiBranch } from "@/lib/auth"
import { toCategoryDTO } from "@/lib/serialize"
import type { CatalogResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

/**
 * GET: the catalog AS IT APPLIES at the current branch — franchise menu with
 * per-branch price/availability overrides already applied. Billing consumes
 * this directly; the payload includes INACTIVE services so the admin views
 * can show them (billing filters on `active`).
 */
export async function GET() {
  const auth = await requireApiBranch()
  if (!auth.user) return auth.response

  const categories = await db.category.findMany({
    where: { tenantId: auth.branch.tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      services: {
        include: { overrides: { where: { branchId: auth.branch.id } } },
      },
    },
  })

  const body: CatalogResponse = {
    branchId: auth.branch.id,
    categories: categories.map((c) => toCategoryDTO(c, auth.branch.id)),
  }
  return NextResponse.json(body)
}
