import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { toTransactionDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/** GET (ADMIN): one transaction of the ADMIN's own franchise. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const { id } = await params
  const transaction = await db.transaction.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!transaction) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 })
  }
  if (auth.user.role !== "SUPER_ADMIN" && transaction.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this bill" }, { status: 403 })
  }

  return NextResponse.json({ transaction: toTransactionDTO(transaction, auth.user.tenantName ?? "") })
}
