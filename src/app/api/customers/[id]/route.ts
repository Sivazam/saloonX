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
 * PUT /api/customers/[id] — ADMIN only. Edit a customer's name and birthday.
 * Birthday is a recurring "MM-DD" (null clears it) — powers the reminder list.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const { id } = await params
  const customer = await db.customer.findUnique({ where: { id }, select: { tenantId: true } })
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })
  if (auth.user.role !== "SUPER_ADMIN" && customer.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this customer" }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: unknown; birthday?: unknown; wishSent?: unknown }
    | null
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const data: { name?: string | null; birthday?: string | null; lastWishAt?: Date } = {}

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (name.length > 60) return NextResponse.json({ error: "Name is too long" }, { status: 400 })
    data.name = name || null
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
