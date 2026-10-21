import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { round2, toCustomerDTO } from "@/lib/serialize"
import type { Customer } from "@prisma/client"

export const dynamic = "force-dynamic"

type MergedTo = Customer & { branchVisits: { branchName: string }[] }

type MergeOutcome =
  | { ok: true; customer: MergedTo }
  | { ok: false; status: number; error: string }

/**
 * POST /api/customers/merge — ADMIN only. Absorb one customer profile into
 * another. The canonical case: a customer signed up on the QR menu with a
 * mistyped mobile, then got billed under BOTH numbers — merge the typo
 * profile (`fromId`) INTO the real one (`toId`) so the book, loyalty and
 * history are whole again.
 *
 * What moves (all inside ONE transaction — a half-merged book must never be
 * observable):
 *  - transactions and menu leads are re-parented onto `to` (with the bill's
 *    customer mobile/name snapshot rewritten to the keeper, so ledger search
 *    by the keeper's mobile finds the absorbed bills too),
 *  - branch visits fold onto (toId, branchId) — on clash the later visitedAt
 *    wins (max of the two),
 *  - aggregate counters sum onto `to` (visits, totalSpend, lastVisitAt = max,
 *    name/birthday filled from `from` when `to` lacks them),
 *  - `from` becomes a tombstone: name/birthday/lastWishAt nulled, mobile
 *    masked to `<merged:…>` (must stay unique per tenant — same pattern as
 *    the erasure flow in customers/[id] DELETE), counters zeroed.
 *
 * Returns the updated `to` customer DTO. Irreversible by design.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response
  const tenantId = auth.user.tenantId
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant context" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { fromId?: unknown; toId?: unknown }
    | null
  const fromId = typeof body?.fromId === "string" ? body.fromId.trim() : ""
  const toId = typeof body?.toId === "string" ? body.toId.trim() : ""
  if (!fromId || !toId) {
    return NextResponse.json({ error: "Both fromId and toId are required" }, { status: 400 })
  }
  if (fromId === toId) {
    return NextResponse.json({ error: "Pick two different customers to merge" }, { status: 400 })
  }

  const result = await db.$transaction(async (tx): Promise<MergeOutcome> => {
    const [from, to] = await Promise.all([
      tx.customer.findUnique({ where: { id: fromId } }),
      tx.customer.findUnique({ where: { id: toId } }),
    ])
    if (!from || !to) return { ok: false, status: 404, error: "Customer not found" }
    if (from.tenantId !== tenantId || to.tenantId !== tenantId) {
      return { ok: false, status: 403, error: "No access to this customer" }
    }
    // The keeper must be a live profile — merging INTO a retired (merged or
    // erased) tombstone would strand the combined history on a dead row.
    if (to.mobile.startsWith("<")) {
      return {
        ok: false,
        status: 400,
        error: "The customer to keep is a retired (merged/erased) profile — merge into the live customer instead",
      }
    }

    // 1) Fold branch visits: unique per (customerId, branchId) — on clash keep
    //    one row with the later visitedAt, otherwise re-parent the row.
    const fromVisits = await tx.branchVisit.findMany({ where: { customerId: fromId } })
    for (const fv of fromVisits) {
      const clash = await tx.branchVisit.findUnique({
        where: { customerId_branchId: { customerId: toId, branchId: fv.branchId } },
      })
      if (clash) {
        if (fv.visitedAt > clash.visitedAt) {
          await tx.branchVisit.update({ where: { id: clash.id }, data: { visitedAt: fv.visitedAt } })
        }
        await tx.branchVisit.delete({ where: { id: fv.id } })
      } else {
        await tx.branchVisit.update({ where: { id: fv.id }, data: { customerId: toId } })
      }
    }

    // 2) Sum the aggregates + fill sparse profile fields onto the keeper.
    const lastVisitAt =
      from.lastVisitAt && to.lastVisitAt
        ? from.lastVisitAt > to.lastVisitAt
          ? from.lastVisitAt
          : to.lastVisitAt
        : (from.lastVisitAt ?? to.lastVisitAt)
    const merged = await tx.customer.update({
      where: { id: toId },
      data: {
        visits: from.visits + to.visits,
        totalSpend: round2(from.totalSpend + to.totalSpend),
        lastVisitAt,
        name: to.name ?? from.name,
        birthday: to.birthday ?? from.birthday,
      },
      include: { branchVisits: { orderBy: { visitedAt: "desc" }, select: { branchName: true }, take: 3 } },
    })

    // 3) Re-parent the bills and QR-menu leads onto the keeper. The bills'
    //    customer snapshots are rewritten to the keeper's identity so ledger
    //    search (customerMobile/customerName) finds the whole history.
    await tx.transaction.updateMany({
      where: { customerId: fromId },
      data: { customerId: toId, customerMobile: merged.mobile, customerName: merged.name },
    })
    await tx.menuLead.updateMany({ where: { customerId: fromId }, data: { customerId: toId } })

    // 4) Tombstone the absorbed profile. The masked mobile must stay unique
    //    per tenant (`@@unique([tenantId, mobile])`) — the id suffix is what
    //    keeps it so. Counters are zeroed: they now live on the keeper and a
    //    tombstone must never double-count in tenant-wide aggregates.
    await tx.customer.update({
      where: { id: fromId },
      data: {
        name: null,
        birthday: null,
        lastWishAt: null,
        visits: 0,
        totalSpend: 0,
        lastVisitAt: null,
        mobile: `<merged:${fromId.slice(-12)}>`,
      },
    })

    return { ok: true, customer: merged }
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ customer: toCustomerDTO(result.customer) })
}
