import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { adminBranchScope, requireApiBranch, requireApiUser } from "@/lib/auth"
import { dayEnd, dayStart, round2, toBranchProfileDTO, toTransactionDTO } from "@/lib/serialize"
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit"
import type { BranchRef, BranchSummaryStat, PaymentMethod } from "@/lib/types"

export const dynamic = "force-dynamic"

const serviceItemSchema = z.object({
  serviceId: z.string().min(1),
  qty: z.number().int().min(1).max(50),
})

// Ad-hoc item billed at a custom price (product sale, negotiated rate, …).
// serviceId is null; name + price are snapshotted on the bill like service prices.
const customItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  price: z.number().min(0.5).max(100000),
  qty: z.number().int().min(1).max(50),
})

const createSchema = z.object({
  items: z
    .array(z.union([serviceItemSchema, customItemSchema]))
    .min(1, "Add at least one service")
    .max(100, "Too many items on one bill"),
  customerMobile: z.string().regex(/^\d{10}$/, "Mobile must be 10 digits").optional().nullable(),
  customerName: z.string().trim().max(60).optional().nullable(),
  discountPct: z.number().min(0).max(100).optional(),
  paymentMethod: z.enum(["CASH", "UPI", "CARD"]),
  note: z.string().trim().max(200).optional().nullable(),
  /** Offline-queue idempotency key — a retried sync returns the original bill. */
  clientRequestId: z.string().trim().min(8).max(80).optional(),
  /** True local time the payment was taken (offline bills sync later). */
  clientCreatedAt: z.string().datetime().optional(),
})

type CreateInput = z.infer<typeof createSchema>

/** Replay an already-synced bill — shared by the pre-check and the P2002 catch.
 *  Tenant-scoped: a replay lookup can never surface another franchise's bill. */
async function findReplay(clientRequestId: string, tenantId: string) {
  return db.transaction.findFirst({
    where: { clientRequestId, tenantId },
    include: { items: true },
  })
}

async function replayResponse(existing: NonNullable<Awaited<ReturnType<typeof findReplay>>>) {
  const existingBranch = await db.branch.findUnique({
    where: { id: existing.branchId },
    include: { tenant: true },
  })
  return NextResponse.json({
    transaction: toTransactionDTO(existing, existingBranch?.tenant.name ?? ""),
    branch: existingBranch ? toBranchProfileDTO(existingBranch) : null,
    duplicate: true,
  })
}

export async function POST(request: Request) {
  // Bill-spam guard: a busy counter bursts far below this; abuse does not.
  const rl = rateLimit(`bill:${clientIp(request)}`, 240, 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)

  const auth = await requireApiBranch()
  if (!auth.user) return auth.response
  const { user, branch } = auth

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const input = parsed.data

  // Idempotency: a queued offline bill that already synced must return the
  // SAME transaction instead of double-billing (e.g. response lost mid-sync).
  if (input.clientRequestId) {
    const existing = await findReplay(input.clientRequestId, branch.tenantId)
    if (existing) return replayResponse(existing)
  }

  // Offline bills keep their true local payment time — clamped so a buggy or
  // tampered device can neither backdate revenue into history nor pre-date a
  // bill into the future.
  let createdAt: Date | undefined
  if (input.clientCreatedAt) {
    const parsedAt = new Date(input.clientCreatedAt)
    const now = Date.now()
    if (!Number.isNaN(parsedAt.getTime()) && parsedAt.getTime() <= now && parsedAt.getTime() > now - 7 * 86_400_000) {
      createdAt = parsedAt
    }
  }

  let result: Awaited<ReturnType<typeof runBillTransaction>>
  try {
    result = await runBillTransaction(input, user, branch, createdAt)
  } catch (err) {
    // Two concurrent syncs of the same offline bill: the unique constraint on
    // clientRequestId makes the loser throw — return the winner's bill so the
    // retry succeeds as a replay instead of surfacing an HTTP 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && input.clientRequestId) {
      const existing = await findReplay(input.clientRequestId, branch.tenantId)
      if (existing) return replayResponse(existing)
      return NextResponse.json(
        { error: "A bill with this number already exists — please retry" },
        { status: 409 },
      )
    }
    console.error("[transactions:POST] bill failed:", err)
    return NextResponse.json({ error: "Could not save the bill — please retry" }, { status: 500 })
  }

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    transaction: toTransactionDTO(result.transaction, branch.tenant.name),
    branch: result.branch ? toBranchProfileDTO(result.branch) : null,
  })
}

async function runBillTransaction(
  input: CreateInput,
  user: { id: string; name: string },
  branch: { id: string; name: string; tenantId: string; gstEnabled: boolean; gstPct: number },
  createdAt: Date | undefined,
) {
  const { items, customerMobile, customerName, discountPct = 0, paymentMethod, note, clientRequestId } = input

  return db.$transaction(async (tx) => {
    // Split into menu services vs custom-amount items.
    const serviceItems = items.filter((i): i is z.infer<typeof serviceItemSchema> => "serviceId" in i)

    // All referenced services must exist in THIS franchise and be EFFECTIVELY
    // active at this branch (override ?? franchise default).
    const serviceIds = [...new Set(serviceItems.map((i) => i.serviceId))]
    const services = serviceIds.length
      ? await tx.service.findMany({
          where: { id: { in: serviceIds }, tenantId: branch.tenantId },
        })
      : []
    const byId = new Map(services.map((s) => [s.id, s]))
    const overrideRows = serviceIds.length
      ? await tx.serviceOverride.findMany({
          where: { serviceId: { in: serviceIds }, branchId: branch.id },
        })
      : []
    const overrideByService = new Map(overrideRows.map((o) => [o.serviceId, o]))

    for (const id of serviceIds) {
      const svc = byId.get(id)
      const ov = overrideByService.get(id)
      const active = ov?.active ?? svc?.active ?? false
      if (!svc || !active) {
        return { error: "One of the services is unavailable at this branch — refresh the menu" as const }
      }
    }

    // Effective branch prices (override ?? franchise default) + custom prices.
    const subtotal = round2(
      items.reduce((sum, it) => {
        if ("serviceId" in it) {
          const svc = byId.get(it.serviceId)
          const ov = overrideByService.get(it.serviceId)
          return sum + ((ov?.price ?? svc?.price ?? 0) * it.qty)
        }
        return sum + it.price * it.qty
      }, 0),
    )
    const discountAmount = round2((subtotal * discountPct) / 100)

    const gstPct = branch.gstEnabled ? branch.gstPct : 0
    const gstAmount = round2(((subtotal - discountAmount) * gstPct) / 100)
    const total = round2(subtotal - discountAmount + gstAmount)

    // Per-branch bill numbers: PREFIX-0001 with an atomic counter on the branch.
    const bumped = await tx.branch.update({
      where: { id: branch.id },
      data: { billCounter: { increment: 1 } },
      select: { billCounter: true, billPrefix: true },
    })
    const billNo = `${bumped.billPrefix}-${String(bumped.billCounter).padStart(4, "0")}`

    // Customers are franchise-wide — recognised at any branch of the chain.
    let customer: { id: string; mobile: string; name: string | null } | null = null
    if (customerMobile) {
      customer = await tx.customer.upsert({
        where: { tenantId_mobile: { tenantId: branch.tenantId, mobile: customerMobile } },
        create: {
          tenantId: branch.tenantId,
          mobile: customerMobile,
          name: customerName || null,
          visits: 1,
          totalSpend: total,
          lastVisitAt: new Date(),
        },
        update: {
          visits: { increment: 1 },
          totalSpend: { increment: total },
          lastVisitAt: new Date(),
          ...(customerName ? { name: customerName } : {}),
        },
      })
      // Track which branches this customer has visited (profile colour).
      await tx.branchVisit.upsert({
        where: { customerId_branchId: { customerId: customer.id, branchId: branch.id } },
        create: { customerId: customer.id, branchId: branch.id, branchName: branch.name, visitedAt: new Date() },
        update: {},
      })

      // Any discounted bill redeems the customer's QR-menu signup offer —
      // the guest showed their code, the salon honoured it.
      if (discountPct > 0) {
        await tx.menuLead.updateMany({
          where: { customerId: customer.id, redeemedAt: null },
          data: { redeemedAt: new Date() },
        })
      }
    }

    const transaction = await tx.transaction.create({
      data: {
        billNo,
        tenantId: branch.tenantId,
        branchId: branch.id,
        branchName: branch.name,
        customerId: customer?.id ?? null,
        customerMobile: customer?.mobile ?? null,
        customerName: customer?.name ?? customerName ?? null,
        staffId: user.id,
        staffName: user.name,
        subtotal,
        discountPct,
        discountAmount,
        gstPct,
        gstAmount,
        total,
        paymentMethod,
        note: note || null,
        status: "COMPLETED",
        clientRequestId: clientRequestId ?? null,
        clientCreatedAt: createdAt ?? null,
        ...(createdAt ? { createdAt } : {}),
        items: {
          create: items.map((it) =>
            "serviceId" in it
              ? {
                  serviceId: it.serviceId,
                  serviceName: byId.get(it.serviceId)!.name,
                  price: overrideByService.get(it.serviceId)?.price ?? byId.get(it.serviceId)!.price,
                  qty: it.qty,
                }
              : {
                  serviceId: null,
                  serviceName: it.name,
                  price: it.price,
                  qty: it.qty,
                },
          ),
        },
      },
      include: { items: true },
    })

    const freshBranch = await tx.branch.findUnique({
      where: { id: branch.id },
      include: { tenant: true },
    })

    return { transaction, branch: freshBranch }
  })
}

export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const from = dayStart(params.get("from") ?? new Date(Date.now() - 29 * 86400000))
  const to = dayEnd(params.get("to") ?? new Date())
  const method = params.get("method") ?? ""
  const staffId = params.get("staffId") ?? ""
  const search = (params.get("search") ?? "").trim()
  const branchIdParam = params.get("branchId") ?? ""
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1)
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25) || 25))

  // Franchise admins report across ALL their branches by default; ?branchId=
  // narrows to one. The scope is validated against the user's own franchise.
  const scope = await adminBranchScope(auth.user, branchIdParam || null)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })
  const branchIds = scope.branchIds ?? []

  // An empty scope (franchise paused / no approved branches) must return NO
  // data — an unfiltered where would leak every tenant's bills platform-wide.
  if (branchIds.length === 0) {
    return NextResponse.json({
      data: [],
      total: 0,
      branches: [],
      summary: {
        revenue: 0,
        count: 0,
        avgBill: 0,
        byMethod: {
          CASH: { amount: 0, count: 0 },
          UPI: { amount: 0, count: 0 },
          CARD: { amount: 0, count: 0 },
        },
        byBranch: [],
      },
    })
  }

  const where = {
    branchId: { in: branchIds },
    ...(from || to
      ? {
          AND: [
            ...(from ? [{ createdAt: { gte: from } }] : []),
            ...(to ? [{ createdAt: { lte: to } }] : []),
          ],
        }
      : {}),
    ...(method === "CASH" || method === "UPI" || method === "CARD" ? { paymentMethod: method } : {}),
    ...(staffId ? { staffId } : {}),
    ...(search
      ? {
          OR: [
            { billNo: { contains: search } },
            { customerMobile: { contains: search } },
            { customerName: { contains: search } },
          ],
        }
      : {}),
  }

  const [rows, total, branchRows] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.transaction.count({ where }),
    db.branch.findMany({
      where: { id: { in: branchIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true },
    }),
  ])

  // Summary across the entire filtered set (not just the current page).
  // VOIDED bills stay visible in the ledger but never count towards revenue.
  const summaryRows = await db.transaction.findMany({
    where: { ...where, status: "COMPLETED" },
    select: { paymentMethod: true, total: true, branchId: true, branchName: true },
  })
  const byMethod = {
    CASH: { amount: 0, count: 0 },
    UPI: { amount: 0, count: 0 },
    CARD: { amount: 0, count: 0 },
  }
  const byBranchMap = new Map<string, BranchSummaryStat>()
  let revenue = 0
  for (const r of summaryRows) {
    revenue += r.total
    const m = byMethod[r.paymentMethod as PaymentMethod]
    if (m) {
      m.amount = round2(m.amount + r.total)
      m.count += 1
    }
    const b = byBranchMap.get(r.branchId) ?? { branchId: r.branchId, name: r.branchName, revenue: 0, bills: 0 }
    b.revenue = round2(b.revenue + r.total)
    b.bills += 1
    byBranchMap.set(r.branchId, b)
  }
  const count = summaryRows.length

  const byBranch = [...byBranchMap.values()].sort((a, b) => b.revenue - a.revenue)
  const branches: BranchRef[] = branchRows

  return NextResponse.json({
    data: rows.map((t) => toTransactionDTO(t, auth.user.tenantName ?? "")),
    total,
    branches,
    summary: {
      revenue: round2(revenue),
      count,
      avgBill: count > 0 ? round2(revenue / count) : 0,
      byMethod,
      byBranch,
    },
  })
}
