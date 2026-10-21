import { NextResponse } from "next/server"
import { Prisma, type Service, type ServiceOverride } from "@prisma/client"
import { z } from "zod"
import { db } from "@/lib/db"
import { adminBranchScope, requireApiBranch, requireApiUser } from "@/lib/auth"
import { dayEnd, dayStart, round2, toBranchProfileDTO, toTransactionDTO } from "@/lib/serialize"
import { rateLimit, tooManyRequests } from "@/lib/rate-limit"
import type {
  BranchRef,
  BranchSummaryStat,
  PaymentMethod,
  PaymentMethodOrSplit,
} from "@/lib/types"

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

const paymentSliceSchema = z.object({
  method: z.enum(["CASH", "UPI", "CARD"]),
  amount: z.number().min(0.01).max(1000000),
})

const createSchema = z
  .object({
    items: z
      .array(z.union([serviceItemSchema, customItemSchema]))
      .min(1, "Add at least one service")
      .max(100, "Too many items on one bill"),
    customerMobile: z.string().regex(/^\d{10}$/, "Mobile must be 10 digits").optional().nullable(),
    customerName: z.string().trim().max(60).optional().nullable(),
    discountPct: z.number().min(0).max(100).optional(),
    /** Flat-₹ discount — mutually exclusive with discountPct > 0. */
    discountFlat: z.number().min(0).max(1000000).optional(),
    /** Staff-collected tip, added after GST. */
    tipAmount: z.number().min(0).max(10000).optional(),
    /** Single-method settlement (legacy / fastest path). */
    paymentMethod: z.enum(["CASH", "UPI", "CARD"]).optional(),
    /** Split settlement — one row per method, must sum to the total (±₹0.05). */
    payments: z.array(paymentSliceSchema).min(1).max(3).optional(),
    note: z.string().trim().max(200).optional().nullable(),
    /** Offline-queue idempotency key — a retried sync returns the original bill. */
    clientRequestId: z.string().trim().min(8).max(80).optional(),
    /** True local time the payment was taken (offline bills sync later). */
    clientCreatedAt: z.string().datetime().optional(),
    /** What produced the discount — gates QR-menu offer redemption. */
    discountSource: z.enum(["NONE", "LOYALTY", "MENU", "MANUAL"]).optional(),
    /** Online drift check: the total the client showed when staff confirmed.
     *  NEVER sent by the offline queue (an unattended sync cannot answer a 409). */
    expectedTotal: z.number().min(0).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.discountFlat ?? 0) > 0 && (v.discountPct ?? 0) > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["discountFlat"],
        message: "Choose either a percentage or a flat ₹ discount",
      })
    }
    const hasMethod = v.paymentMethod !== undefined
    const hasPayments = v.payments !== undefined
    if (hasMethod === hasPayments) {
      ctx.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Provide either a payment method or a split payment breakdown",
      })
      return
    }
    if (v.payments) {
      const methods = new Set(v.payments.map((p) => p.method))
      if (methods.size !== v.payments.length) {
        ctx.addIssue({
          code: "custom",
          path: ["payments"],
          message: "Each payment method can appear only once in a split payment",
        })
      }
    }
  })

type CreateInput = z.infer<typeof createSchema>

/** Resolved payment slices + the denormalized method label stored on the bill. */
interface ResolvedPayments {
  storedMethod: PaymentMethodOrSplit
  slices: { method: PaymentMethod; amount: number }[]
}

/** Replay an already-synced bill — shared by the pre-check and the P2002 catch.
 *  Tenant-scoped: a replay lookup can never surface another franchise's bill. */
async function findReplay(clientRequestId: string, tenantId: string) {
  return db.transaction.findFirst({
    where: { clientRequestId, tenantId },
    include: { items: true, payments: true },
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

/** Extract the P2002 unique-constraint target as a flat string ("billNo",
 *  "clientRequestId", …) for branch-free error handling. */
function p2002Target(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = err.meta?.target
    if (Array.isArray(target)) return target.join(",")
    return String(target ?? "")
  }
  return ""
}

export async function POST(request: Request) {
  const auth = await requireApiBranch()
  if (!auth.user) return auth.response
  const { user, branch } = auth

  // Bill-spam guard — keyed per-USER, AFTER auth: a stuck device behind the
  // salon's shared NAT must not lock out the whole counter (old key was IP).
  const rl = rateLimit(`bill:${user.id}`, 240, 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)

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
  // bill into the future. The verbatim parsed value is still stored on
  // clientCreatedAt so out-of-window discrepancies stay auditable.
  let createdAt: Date | undefined
  let clientCreatedAtVerbatim: Date | null = null
  if (input.clientCreatedAt) {
    const parsedAt = new Date(input.clientCreatedAt)
    if (!Number.isNaN(parsedAt.getTime())) {
      clientCreatedAtVerbatim = parsedAt
      const now = Date.now()
      if (parsedAt.getTime() <= now && parsedAt.getTime() > now - 7 * 86_400_000) {
        createdAt = parsedAt
      }
    }
  }

  let result: Awaited<ReturnType<typeof runBillTransaction>>
  try {
    result = await runBillTransaction(input, user, branch, createdAt, clientCreatedAtVerbatim)
  } catch (err) {
    const target = p2002Target(err)
    if (target) {
      // Two concurrent syncs of the same offline bill: the unique constraint
      // on clientRequestId makes the loser throw — return the winner's bill so
      // the retry succeeds as a replay instead of surfacing an HTTP 500.
      if (target.includes("clientRequestId") && input.clientRequestId) {
        const existing = await findReplay(input.clientRequestId, branch.tenantId)
        if (existing) return replayResponse(existing)
        return NextResponse.json(
          { error: "A bill with this number already exists — please retry" },
          { status: 409 },
        )
      }
      if (target.includes("billNo")) {
        // Per-branch bill-number race: one fresh retry with a re-read counter.
        try {
          result = await runBillTransaction(input, user, branch, createdAt, clientCreatedAtVerbatim)
        } catch (retryErr) {
          if (p2002Target(retryErr).includes("clientRequestId") && input.clientRequestId) {
            const existing = await findReplay(input.clientRequestId, branch.tenantId)
            if (existing) return replayResponse(existing)
          }
          console.error("[transactions:POST] bill failed after billNo retry:", retryErr)
          return NextResponse.json({ error: "Could not save the bill — please retry" }, { status: 500 })
        }
      } else {
        console.error("[transactions:POST] unexpected unique constraint:", err)
        return NextResponse.json({ error: "Could not save the bill — please retry" }, { status: 500 })
      }
    } else {
      console.error("[transactions:POST] bill failed:", err)
      return NextResponse.json({ error: "Could not save the bill — please retry" }, { status: 500 })
    }
  }

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  if ("drift" in result) {
    return NextResponse.json(
      {
        error: `Prices or tax settings changed — the total is now ₹${result.recomputedTotal}. Please go back and re-confirm.`,
        recomputedTotal: result.recomputedTotal,
      },
      { status: 409 },
    )
  }

  return NextResponse.json({
    transaction: toTransactionDTO(result.transaction, branch.tenant.name),
    branch: result.branch ? toBranchProfileDTO(result.branch) : null,
  })
}

/** Dry pass — validate the menu + compute every rupee BEFORE any write.
 *  Shared by the write path so validation (service availability, payment
 *  arithmetic, online drift) always precedes database mutations. */
async function computeBill(
  input: CreateInput,
  branch: { id: string; tenantId: string; gstEnabled: boolean; gstPct: number },
): Promise<
  | { error: string }
  | {
      subtotal: number
      discountAmount: number
      gstPct: number
      gstAmount: number
      tip: number
      total: number
      byId: Map<string, Service>
      overrideByService: Map<string, ServiceOverride>
    }
> {
  const { items, discountPct = 0 } = input

  // Split into menu services vs custom-amount items.
  const serviceItems = items.filter((i): i is z.infer<typeof serviceItemSchema> => "serviceId" in i)

  // All referenced services must exist in THIS franchise and be EFFECTIVELY
  // active at this branch (override ?? franchise default).
  const serviceIds = [...new Set(serviceItems.map((i) => i.serviceId))]
  const services = serviceIds.length
    ? await db.service.findMany({
        where: { id: { in: serviceIds }, tenantId: branch.tenantId },
      })
    : []
  const byId = new Map(services.map((s) => [s.id, s]))
  const overrideRows = serviceIds.length
    ? await db.serviceOverride.findMany({
        where: { serviceId: { in: serviceIds }, branchId: branch.id },
      })
    : []
  const overrideByService = new Map(overrideRows.map((o) => [o.serviceId, o]))

  for (const id of serviceIds) {
    const svc = byId.get(id)
    const ov = overrideByService.get(id)
    const active = ov?.active ?? svc?.active ?? false
    if (!svc || !active) {
      return { error: "One of the services is unavailable at this branch — refresh the menu" }
    }
  }

  // Effective branch prices (override ?? franchise default) + custom prices.
  const subtotal = round2(
    items.reduce((sum, it) => {
      if ("serviceId" in it) {
        const svc = byId.get(it.serviceId)
        const ov = overrideByService.get(it.serviceId)
        return sum + (ov?.price ?? svc?.price ?? 0) * it.qty
      }
      return sum + it.price * it.qty
    }, 0),
  )

  // Flat-₹ wins when present; clamped at the subtotal so a fat-fingered
  // discount can never flip the bill negative.
  const discountFlat = input.discountFlat ?? 0
  const discountAmount =
    discountFlat > 0 ? round2(Math.min(discountFlat, subtotal)) : round2((subtotal * discountPct) / 100)

  const gstPct = branch.gstEnabled ? branch.gstPct : 0
  const gstAmount = round2(((subtotal - discountAmount) * gstPct) / 100)
  const tip = round2(input.tipAmount ?? 0)
  const total = round2(subtotal - discountAmount + gstAmount + tip)

  return { subtotal, discountAmount, gstPct, gstAmount, tip, total, byId, overrideByService }
}

/** Validate + normalize the payment breakdown against the computed total. */
function resolvePayments(input: CreateInput, total: number): { error: string } | { value: ResolvedPayments } {
  if (input.payments) {
    const sum = round2(input.payments.reduce((s, p) => s + p.amount, 0))
    if (Math.abs(sum - total) > 0.05) {
      return { error: "Split payment amounts must add up to the bill total" }
    }
    // Force the LAST slice to absorb sub-paisa drift so the books are exact:
    // Σ slices === total, always.
    const others = input.payments.slice(0, -1)
    const last = input.payments[input.payments.length - 1]
    const lastAmount = round2(total - others.reduce((s, p) => s + p.amount, 0))
    if (lastAmount < 0.01) {
      return { error: "Split payment amounts must add up to the bill total" }
    }
    const slices = [
      ...others.map((p) => ({ method: p.method, amount: round2(p.amount) })),
      { method: last.method, amount: lastAmount },
    ]
    return {
      value: {
        storedMethod: slices.length === 1 ? slices[0].method : "SPLIT",
        slices,
      },
    }
  }
  // Legacy single-method path — the whole (ex-tip) total settled one way.
  if (input.paymentMethod) {
    return { value: { storedMethod: input.paymentMethod, slices: [{ method: input.paymentMethod, amount: total }] } }
  }
  return { error: "Provide either a payment method or a split payment breakdown" }
}

async function runBillTransaction(
  input: CreateInput,
  user: { id: string; name: string },
  branch: { id: string; name: string; tenantId: string; gstEnabled: boolean; gstPct: number },
  createdAt: Date | undefined,
  clientCreatedAtVerbatim: Date | null,
) {
  // ── Dry pass: validate + compute money BEFORE touching the database. ──────
  const computed = await computeBill(input, branch)
  if ("error" in computed) return { error: computed.error }

  const { subtotal, discountAmount, gstPct, gstAmount, tip, total, byId, overrideByService } = computed

  // Online drift check — menu prices or tax settings changed while the staff
  // was on the payment screen. Only requests that CARRY an expectedTotal can
  // ever hit this (the offline queue never sends one), and it must fire
  // before any write so a drifted bill is never half-created.
  if (input.expectedTotal != null && Math.abs(input.expectedTotal - total) > 0.05) {
    return { drift: true, recomputedTotal: total } as const
  }

  const payments = resolvePayments(input, total)
  if ("error" in payments) return { error: payments.error }

  const { items, customerMobile, customerName, discountPct = 0, note, clientRequestId } = input
  const storedMethod = payments.value.storedMethod

  // ── Write phase. ───────────────────────────────────────────────────────────
  return db.$transaction(async (tx) => {
    // Per-branch bill numbers: PREFIX-0001 with an atomic counter on the branch.
    const bumped = await tx.branch.update({
      where: { id: branch.id },
      data: { billCounter: { increment: 1 } },
      select: { billCounter: true, billPrefix: true },
    })
    const billNo = `${bumped.billPrefix}-${String(bumped.billCounter).padStart(4, "0")}`

    // The bill's true local timestamp — clamped clientCreatedAt for offline
    // bills, else now. Customer aggregates (lastVisitAt, BranchVisit.visitedAt)
    // must reflect WHEN the customer actually came in, not sync-time.
    const billTime = createdAt ?? new Date()

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
          lastVisitAt: billTime,
        },
        update: {
          visits: { increment: 1 },
          totalSpend: { increment: total },
          lastVisitAt: billTime,
          ...(customerName ? { name: customerName } : {}),
        },
      })
      // Track which branches this customer has visited (profile colour).
      await tx.branchVisit.upsert({
        where: { customerId_branchId: { customerId: customer.id, branchId: branch.id } },
        create: { customerId: customer.id, branchId: branch.id, branchName: branch.name, visitedAt: billTime },
        update: { visitedAt: billTime },
      })
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
        ...(input.discountFlat && input.discountFlat > 0 ? { discountFlat: input.discountFlat } : {}),
        gstPct,
        gstAmount,
        tipAmount: tip,
        total,
        paymentMethod: storedMethod,
        note: note || null,
        status: "COMPLETED",
        clientRequestId: clientRequestId ?? null,
        // Verbatim device timestamp (auditable even when out of clamp window);
        // createdAt itself stays clamped/now.
        clientCreatedAt: clientCreatedAtVerbatim,
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
        payments: {
          create: payments.value.slices.map((p) => ({
            method: p.method,
            amount: p.amount,
            branchId: branch.id,
            tenantId: branch.tenantId,
            createdAt: billTime,
          })),
        },
      },
      include: { items: true, payments: true },
    })

    // The QR-menu signup offer is honoured only when the staff explicitly
    // applied THE MENU offer (discountSource === "MENU") — a loyalty or manual
    // discount must never burn a one-time coupon. Redemption is FRANCHISE-wide
    // (matching the tenant-wide lookup): a lead claimed at branch A is
    // redeemed by the first discounted bill at ANY branch of the chain.
    if ((input.discountSource ?? "NONE") === "MENU" && discountAmount > 0 && customer) {
      const lead = await tx.menuLead.findFirst({
        where: { customerId: customer.id, tenantId: branch.tenantId, redeemedAt: null },
        orderBy: { createdAt: "desc" },
      })
      if (lead) {
        await tx.menuLead.update({
          where: { id: lead.id },
          data: { redeemedAt: billTime, redeemedByTransactionId: transaction.id },
        })
      }
    }

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
          SPLIT: { amount: 0, count: 0 },
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

  const [rows, total, branchRows, revenueAgg, byBranchAgg, byMethodAgg] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { items: true, payments: true },
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
    // Summary across the entire filtered set (not just the current page) —
    // aggregated in SQL; VOIDED bills never count towards revenue.
    db.transaction.aggregate({
      where: { ...where, status: "COMPLETED" },
      _sum: { total: true },
      _count: true,
    }),
    db.transaction.groupBy({
      by: ["branchId"],
      where: { ...where, status: "COMPLETED" },
      _sum: { total: true },
      _count: true,
    }),
    db.transaction.groupBy({
      by: ["paymentMethod"],
      where: { ...where, status: "COMPLETED" },
      _sum: { total: true },
      _count: true,
    }),
  ])

  const revenue = revenueAgg._sum.total ?? 0
  const count = revenueAgg._count

  const byMethod: Record<PaymentMethodOrSplit, { amount: number; count: number }> = {
    CASH: { amount: 0, count: 0 },
    UPI: { amount: 0, count: 0 },
    CARD: { amount: 0, count: 0 },
    SPLIT: { amount: 0, count: 0 },
  }
  for (const g of byMethodAgg) {
    const bucket = byMethod[g.paymentMethod as PaymentMethodOrSplit]
    if (bucket) {
      bucket.amount = round2(g._sum.total ?? 0)
      bucket.count = g._count
    }
  }

  const branchNameById = new Map(branchRows.map((b) => [b.id, b.name]))
  const byBranch: BranchSummaryStat[] = byBranchAgg
    .map((g) => ({
      branchId: g.branchId,
      name: branchNameById.get(g.branchId) ?? "—",
      revenue: round2(g._sum.total ?? 0),
      bills: g._count,
    }))
    .sort((a, b) => b.revenue - a.revenue)
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
