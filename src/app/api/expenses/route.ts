import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { adminBranchScope, requireApiUser } from "@/lib/auth"
import { dayEnd, dayStart, round2, toExpenseDTO } from "@/lib/serialize"
import type { BranchRef, BranchSummaryStat, ExpenseCategory } from "@/lib/types"

export const dynamic = "force-dynamic"

/** GET (ADMIN): expenses across the franchise (or one ?branchId=), newest first.
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` — filter by the day the expense occurred.
 * `?category=RENT|…` — narrow to one category.
 * `?limit=1..1000` — page size (default 100; exports use 1000).
 * The summary covers the WHOLE filter (not just the loaded page). */
export async function GET(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const params = new URL(request.url).searchParams
  const branchIdParam = params.get("branchId") ?? ""
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1)
  const limit = Math.min(1000, Math.max(1, Number(params.get("limit") ?? 100) || 100))
  const category = params.get("category") ?? ""

  const scope = await adminBranchScope(auth.user, branchIdParam || null)
  if (scope.error) return NextResponse.json({ error: scope.error }, { status: 403 })
  const branchIds = scope.branchIds ?? []
  if (branchIds.length === 0) {
    return NextResponse.json({ data: [], total: 0, branches: [], summary: { total: 0, byCategory: {}, byBranch: [] } })
  }
  const branchFilter = { branchId: { in: branchIds } }

  // Date range on the expense's own day (owner may log past expenses).
  const fromParam = params.get("from")
  const toParam = params.get("to")
  const from = fromParam ? dayStart(fromParam) : null
  const to = toParam ? dayEnd(toParam) : null
  const dateFilter =
    from || to
      ? {
          AND: [
            ...(from ? [{ date: { gte: from } }] : []),
            ...(to ? [{ date: { lte: to } }] : []),
          ],
        }
      : {}

  const validCategory = ["RENT", "SUPPLIES", "SALARY", "UTILITY", "MARKETING", "MAINTENANCE", "OTHER"]
  const categoryFilter =
    category && validCategory.includes(category.toUpperCase())
      ? { category: category.toUpperCase() }
      : {}

  // One shared predicate drives data rows, the count AND the summary so the
  // three always agree no matter which chips are active.
  const where = { ...branchFilter, ...dateFilter, ...categoryFilter }

  const [rows, total, branchRows] = await Promise.all([
    db.expense.findMany({
      where,
      include: { branch: { select: { name: true } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.expense.count({ where }),
    db.branch.findMany({
      where: { id: { in: branchIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, city: true },
    }),
  ])

  const summaryRows = await db.expense.findMany({
    where,
    include: { branch: { select: { name: true } } },
  })
  const byCategory: Partial<Record<ExpenseCategory, { amount: number; count: number }>> = {}
  const byBranchMap = new Map<string, BranchSummaryStat>()
  let totalAmount = 0
  for (const e of summaryRows) {
    totalAmount = round2(totalAmount + e.amount)
    const c = (byCategory[e.category as ExpenseCategory] ??= { amount: 0, count: 0 })
    c.amount = round2(c.amount + e.amount)
    c.count += 1
    const b = byBranchMap.get(e.branchId) ?? { branchId: e.branchId, name: e.branch.name, revenue: 0, bills: 0 }
    b.revenue = round2(b.revenue + e.amount)
    b.bills += 1
    byBranchMap.set(e.branchId, b)
  }

  const branches: BranchRef[] = branchRows
  return NextResponse.json({
    data: rows.map(toExpenseDTO),
    total,
    branches,
    summary: {
      total: totalAmount,
      byCategory,
      byBranch: [...byBranchMap.values()].sort((a, b) => b.revenue - a.revenue),
    },
  })
}

const createSchema = z.object({
  category: z.enum(["RENT", "SUPPLIES", "SALARY", "UTILITY", "MARKETING", "MAINTENANCE", "OTHER"]),
  description: z.string().trim().max(200).optional().nullable(),
  amount: z.number().min(0.5, "Amount must be at least ₹0.50").max(10_000_000),
  /** YYYY-MM-DD the expense occurred (defaults to today). */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  /** Branch the expense belongs to — defaults to the admin's current branch. */
  branchId: z.string().optional(),
})

/** POST (ADMIN): log an expense at a branch of their franchise. */
export async function POST(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const d = parsed.data

  // Resolve the target branch: param ?? any branch of the franchise (fallback first).
  let branchId = d.branchId
  if (!branchId) {
    const current = await db.session.findFirst({
      where: { userId: auth.user.id, branchId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { branchId: true },
    })
    branchId = current?.branchId ?? undefined
  }
  if (!branchId) {
    const first = await db.branch.findFirst({
      where: { tenantId: auth.user.tenantId ?? undefined, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })
    branchId = first?.id
  }
  if (!branchId) return NextResponse.json({ error: "No branch to log this expense against" }, { status: 400 })

  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { tenantId: true } })
  if (!branch || branch.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this branch" }, { status: 403 })
  }

  const expense = await db.expense.create({
    data: {
      branchId,
      category: d.category,
      description: d.description ?? null,
      amount: round2(d.amount),
      date: d.date ? new Date(`${d.date}T12:00:00`) : new Date(),
      createdByName: auth.user.name,
    },
    include: { branch: { select: { name: true } } },
  })

  return NextResponse.json({ expense: toExpenseDTO(expense) }, { status: 201 })
}

const updateSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["RENT", "SUPPLIES", "SALARY", "UTILITY", "MARKETING", "MAINTENANCE", "OTHER"]).optional(),
  description: z.string().trim().max(200).optional().nullable(),
  amount: z.number().min(0.5, "Amount must be at least ₹0.50").max(10_000_000).optional(),
  /** YYYY-MM-DD the expense occurred. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
  /** Move the expense to another branch of the admin's franchise. */
  branchId: z.string().optional(),
})

/** PUT (ADMIN): edit an expense they logged (own franchise only). */
export async function PUT(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const d = parsed.data

  const existing = await db.expense.findUnique({ where: { id: d.id }, select: { branchId: true } })
  if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  const existingBranch = await db.branch.findUnique({
    where: { id: existing.branchId },
    select: { tenantId: true },
  })
  if (!existingBranch || existingBranch.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this expense" }, { status: 403 })
  }

  let branchId: string | undefined
  if (d.branchId !== undefined && d.branchId !== existing.branchId) {
    const target = await db.branch.findUnique({ where: { id: d.branchId }, select: { tenantId: true } })
    if (!target || target.tenantId !== auth.user.tenantId) {
      return NextResponse.json({ error: "No access to that branch" }, { status: 403 })
    }
    branchId = d.branchId
  }

  const expense = await db.expense.update({
    where: { id: d.id },
    data: {
      ...(d.category !== undefined ? { category: d.category } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.amount !== undefined ? { amount: round2(d.amount) } : {}),
      ...(d.date !== undefined ? { date: new Date(`${d.date}T12:00:00`) } : {}),
      ...(branchId !== undefined ? { branchId } : {}),
    },
    include: { branch: { select: { name: true } } },
  })

  return NextResponse.json({ expense: toExpenseDTO(expense) })
}

/** DELETE (ADMIN): remove an expense they logged (own franchise only). */
export async function DELETE(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const existing = await db.expense.findUnique({ where: { id }, select: { branchId: true } })
  if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 })
  const branch = await db.branch.findUnique({ where: { id: existing.branchId }, select: { tenantId: true } })
  if (!branch || branch.tenantId !== auth.user.tenantId) {
    return NextResponse.json({ error: "No access to this expense" }, { status: 403 })
  }

  await db.expense.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
