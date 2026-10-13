import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/**
 * Public: every ACTIVE franchise + its ACTIVE branches, for the POS login
 * branch picker. Grouped by tenant with logos. Also exposes the platform
 * super-admin tile (id + name only) for the developer login path.
 */
export async function GET() {
  const tenants = await db.tenant.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      logo: true,
      branches: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, city: true },
      },
    },
  })
  const superAdmin = await db.user.findFirst({
    where: { role: "SUPER_ADMIN", active: true },
    select: { id: true, name: true },
  })

  return NextResponse.json({
    tenants: tenants.filter((t) => t.branches.length > 0),
    superAdmin,
  })
}
