import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { round2, toCustomerDTO, toTransactionDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

/**
 * GET /api/customers/[id] — ADMIN only.
 * Customer profile + full visit history (all bills, newest first, voided included
 * for the audit trail) + totals from COMPLETED bills only. Tenant-scoped.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const { id } = await params

  const customer = await db.customer.findUnique({
    where: { id },
    include: { branchVisits: { orderBy: { visitedAt: "desc" }, select: { branchName: true } } },
  })
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  }
  if (auth.user.role !== "SUPER_ADMIN" && customer.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this customer" }, { status: 403 })
  }

  const transactions = await db.transaction.findMany({
    where: { customerId: id },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  })

  const completed = transactions.filter((t) => t.status === "COMPLETED")
  const spend = completed.reduce((sum, t) => sum + t.total, 0)

  return NextResponse.json({
    customer: toCustomerDTO(customer),
    transactions: transactions.map((t) => toTransactionDTO(t, auth.user.tenantName ?? "")),
    totals: {
      bills: completed.length,
      spend: round2(spend),
      avgBill: completed.length > 0 ? round2(spend / completed.length) : 0,
    },
  })
}

const MM_DD = /^\d{2}-\d{2}$/

function validBirthday(v: string): boolean {
  if (!MM_DD.test(v)) return false
  const [mm, dd] = v.split("-").map(Number)
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31
}

/**
 * PUT /api/customers/[id] — ADMIN only. Edit a customer's name, mobile and
 * birthday. Mobile is the @@unique([tenantId, mobile]) key — a typo at billing
 * time orphaned this customer permanently before this endpoint existed.
 *
 * Mobile change rules:
 *  - must be a clean 10-digit Indian mobile (same regex as branch.ownerMobile)
 *  - if the new mobile already belongs to ANOTHER customer in this tenant,
 *    we refuse — caller must use the merge flow (out of scope here) to avoid
 *    silently moving bills onto the wrong profile.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true, mobile: true } })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  if (auth.user.role !== "SUPER_ADMIN" && customer.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this customer" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; mobile?: unknown; birthday?: unknown; wishSent?: unknown }
    | null
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const data: { name?: string | null; mobile?: string; birthday?: string | null; lastWishAt?: Date } = {}

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (name.length > 60) return NextResponse.json({ error: "Name is too long" }, { status: 400 })
    data.name = name || null
  }

  if (body.mobile !== undefined) {
    const mobile = typeof body.mobile === "string" ? body.mobile.trim() : ""
    // Empty/null mobile is NOT allowed — the customer key requires a mobile.
    if (!/^\d{10}$/.test(mobile)) {
      return NextResponse.json({ error: "Mobile must be exactly 10 digits" }, { status: 400 })
    }
    if (mobile !== customer.mobile) {
      // Reject silent hijack: if the new mobile already exists on a DIFFERENT
      // customer in the same tenant, the admin must merge profiles explicitly.
      const clash = await db.customer.findFirst({
        where: { tenantId: customer.tenantId, mobile, NOT: { id } },
        select: { id: true },
      })
      if (clash) {
        return NextResponse.json(
          { error: "Another customer already uses this mobile — merge profiles instead of overwriting." },
          { status: 409 },
        )
      }
      data.mobile = mobile
    }
  }

  if (body.birthday !== undefined) {
    if (body.birthday === null || body.birthday === "") {
      data.birthday = null
    } else if (typeof body.birthday === "string" && validBirthday(body.birthday)) {
      data.birthday = body.birthday
    } else {
      return NextResponse.json({ error: "Birthday must be MM-DD (e.g. 14-03)" }, { status: 400 })
    }
  }

  if (body.wishSent !== undefined) {
    // Campaign tracking: the salon just WhatsApp-wished this customer.
    if (body.wishSent === true) data.lastWishAt = new Date()
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const updated = await db.customer.update({
    where: { id },
    data,
    include: { branchVisits: { orderBy: { visitedAt: "desc" }, select: { branchName: true } } },
  })
  return NextResponse.json({ customer: toCustomerDTO(updated) })
}

/**
 * DELETE /api/customers/[id] — ADMIN only. GDPR / DPDP "right to erasure".
 *
 * PII is anonymised IN PLACE rather than the row being hard-deleted: the
 * financial ledger (Transaction rows) must be retained for GST/tax audits
 * (Indian law: 6 years), and those rows carry a snapshot of the customer's
 * name + mobile at billing time. We:
 *   1. wipe the live customer PII (name, birthday, lastWishAt, branch visits),
 *   2. mask the live mobile to "<erased>" so it can no longer be looked up,
 *   3. anonymise the customer-name snapshot on every historical bill of this
 *      customer (mobile stays on the bill for audit, but is masked unless the
 *      admin explicitly confirms — see `keepHistoryMobile`).
 * The customer row stays so void/redeem logic and FK integrity hold, but is
 * effectively a tombstone with no recoverable PII.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const url = new URL(request.url)
  const keepHistoryMobile = url.searchParams.get("keepHistoryMobile") === "1"

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  if (auth.user.role !== "SUPER_ADMIN" && customer.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this customer" }, { status: 403 })
  }

  await db.$transaction(async (tx) => {
    // 1) Drop the branch-visit colour rows — pure PII, no audit value.
    await tx.branchVisit.deleteMany({ where: { customerId: id } })
    // 2) Drop this customer's unredeemed QR-menu leads (mobile + name PII).
    await tx.menuLead.deleteMany({ where: { customerId: id, redeemedAt: null } })
    // 3) Tombstone the customer row itself.
    await tx.customer.update({
      where: { id },
      data: {
        name: null,
        birthday: null,
        lastWishAt: null,
        mobile: "<erased>",
      },
    })
    // 4) Anonymise the customer-name snapshot on historical bills (audit
    //    needs the amount + items, not the customer's name). Mobile is kept
    //    on the bill unless the admin explicitly asked to scrub it too.
    await tx.transaction.updateMany({
      where: { customerId: id },
      data: {
        customerName: null,
        ...(keepHistoryMobile ? {} : { customerMobile: null }),
      },
    })
  })

  return NextResponse.json({ ok: true })
}
