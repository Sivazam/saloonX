import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { toTransactionDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const voidSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(200).optional().nullable(),
})

/**
 * PUT /api/transactions/void — ADMIN only.
 * Marks a bill VOIDED with an audit trail (who/when/why) and reverses the
 * customer aggregates (visits / totalSpend / lastVisitAt) that the bill created.
 * Tenant-isolated: an admin can only ever void bills of their own franchise.
 */
export async function PUT(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const user = auth.user

  if (!user.tenantId) {
    return NextResponse.json({ error: "No franchise on this account" }, { status: 403 })
  }

  const parsed = voidSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }
  const { id, reason } = parsed.data

  const result = await db.$transaction(async (tx) => {
    const txn = await tx.transaction.findUnique({ where: { id } })
    if (!txn) {
      return { error: "Bill not found", status: 404 as const }
    }
    // Tenant isolation — the bill MUST belong to the admin's own franchise.
    if (txn.tenantId !== user.tenantId) {
      return { error: "Not authorized", status: 403 as const }
    }
    if (txn.status === "VOIDED") {
      return { error: "This bill is already voided", status: 409 as const }
    }

    // Race-safe transition: only a still-COMPLETED bill can be voided, so two
    // overlapping voids can never double-reverse the customer aggregates.
    const updated = await tx.transaction.updateMany({
      where: { id, status: "COMPLETED" },
      data: {
        status: "VOIDED",
        voidedAt: new Date(),
        voidedByUserId: user.id,
        voidReason: reason || null,
      },
    })
    if (updated.count === 0) {
      return { error: "This bill is already voided", status: 409 as const }
    }

    // Reverse customer aggregates so loyalty totals stay truthful.
    if (txn.customerId) {
      const remaining = await tx.transaction.findFirst({
        where: { customerId: txn.customerId, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
      await tx.customer.update({
        where: { id: txn.customerId },
        data: {
          visits: { decrement: 1 },
          totalSpend: { decrement: txn.total },
          lastVisitAt: remaining?.createdAt ?? null,
        },
      })
    }

    const fresh = await tx.transaction.findUniqueOrThrow({ where: { id }, include: { items: true } })
    return { transaction: fresh }
  })

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ transaction: toTransactionDTO(result.transaction) })
}
