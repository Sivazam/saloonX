// Server-side DTO mappers + tiny date helpers shared by API routes.
import type {
  Branch,
  Category,
  Customer,
  Expense,
  Prisma,
  Service,
  ServiceOverride,
  Tenant,
  Transaction,
  TransactionItem,
  TransactionPayment,
  User,
} from "@prisma/client"
import type {
  BranchAdminDTO,
  BranchProfileDTO,
  CategoryDTO,
  CustomerDTO,
  ExpenseCategory,
  ExpenseDTO,
  FranchiseCategoryDTO,
  FranchiseServiceDTO,
  PaymentMethod,
  PaymentMethodOrSplit,
  PaymentSlice,
  Role,
  ServiceDTO,
  ServiceOverrideDTO,
  StaffDTO,
  TenantDTO,
  TransactionDTO,
  TransactionItemDTO,
} from "@/lib/types"

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Local-timezone start of day for a YYYY-MM-DD string (or Date). Returns null when unparseable. */
export function dayStart(input: string | Date): Date | null {
  const d = typeof input === "string" ? parseDateKey(input) : new Date(input)
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  return Number.isNaN(start.getTime()) ? null : start
}

/** Local-timezone end of day (inclusive) for a YYYY-MM-DD string (or Date). Returns null when unparseable. */
export function dayEnd(input: string | Date): Date | null {
  const start = dayStart(input)
  if (!start) return null
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  end.setMilliseconds(-1)
  return end
}

function parseDateKey(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim())
  if (!m) return new Date(NaN)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** YYYY-MM-DD key for a Date in local time. */
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

// ─── Catalog (branch-effective view for billing) ─────────────────────────────

export function toServiceDTO(s: Service, override?: ServiceOverride | null): ServiceDTO {
  return {
    id: s.id,
    name: s.name,
    price: override?.price != null ? override.price : s.price,
    durationMin: s.durationMin,
    active: override?.active != null ? override.active : s.active,
    categoryId: s.categoryId,
  }
}

type CategoryWithServices = Category & {
  services: (Service & { overrides?: ServiceOverride[] })[]
}

export function toCategoryDTO(c: CategoryWithServices, branchId?: string | null): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    services: [...c.services]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) =>
        toServiceDTO(
          s,
          branchId ? s.overrides?.find((o) => o.branchId === branchId) ?? null : null,
        ),
      ),
  }
}

// ─── Franchise menu (admin Menu & Prices view) ───────────────────────────────

type FranchiseService = Service & { overrides: ServiceOverride[] }

export function toFranchiseServiceDTO(s: FranchiseService): FranchiseServiceDTO {
  const overrides: ServiceOverrideDTO[] = s.overrides.map((o) => ({
    branchId: o.branchId,
    price: o.price,
    active: o.active,
  }))
  return {
    id: s.id,
    name: s.name,
    price: s.price,
    durationMin: s.durationMin,
    active: s.active,
    categoryId: s.categoryId,
    overrides,
  }
}

export function toFranchiseCategoryDTO(c: Category & { services: FranchiseService[] }): FranchiseCategoryDTO {
  return {
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    services: [...c.services].sort((a, b) => a.name.localeCompare(b.name)).map(toFranchiseServiceDTO),
  }
}

// ─── Branches & tenants ──────────────────────────────────────────────────────

type BranchWithTenant = Branch & { tenant: { id: string; name: string } }

type BranchTenantLite = { id: string; name: string; logo: string | null }

export function toBranchProfileDTO(b: Branch & { tenant: BranchTenantLite }): BranchProfileDTO {
  return {
    id: b.id,
    tenantId: b.tenantId,
    tenantName: b.tenant.name,
    tenantLogo: b.tenant.logo,
    name: b.name,
    city: b.city,
    address: b.address,
    phone: b.phone,
    logo: b.logo,
    upiId: b.upiId,
    upiQrImage: b.upiQrImage,
    ownerMobile: b.ownerMobile,
    billPrefix: b.billPrefix,
    gstEnabled: b.gstEnabled,
    gstPct: b.gstPct,
    gstin: b.gstin,
    loyaltyEnabled: b.loyaltyEnabled,
    loyaltyVisits: b.loyaltyVisits,
    loyaltyDiscountPct: b.loyaltyDiscountPct,
    receiptFooter: b.receiptFooter,
    menuSlug: b.menuSlug,
    menuOfferPct: b.menuOfferPct,
    menuTagline: b.menuTagline,
    active: b.active,
    approved: b.approved,
  }
}

export function toBranchAdminDTO(
  b: BranchWithTenant,
  stats: { userCount: number; revenue30d: number; bills30d: number },
): BranchAdminDTO {
  return {
    id: b.id,
    tenantId: b.tenantId,
    tenantName: b.tenant.name,
    name: b.name,
    city: b.city,
    address: b.address,
    phone: b.phone,
    logo: b.logo,
    upiId: b.upiId,
    gstEnabled: b.gstEnabled,
    billPrefix: b.billPrefix,
    active: b.active,
    approved: b.approved,
    menuSlug: b.menuSlug,
    menuOfferPct: b.menuOfferPct,
    menuTagline: b.menuTagline,
    userCount: stats.userCount,
    revenue30d: round2(stats.revenue30d),
    bills30d: stats.bills30d,
    createdAt: b.createdAt.toISOString(),
  }
}

export function toTenantDTO(
  t: Tenant & { branches: BranchWithTenant[] },
  stats: {
    userCount: number
    revenue30d: number
    bills30d: number
    branchStats: Record<string, { userCount: number; revenue30d: number; bills30d: number }>
  },
): TenantDTO {
  return {
    id: t.id,
    name: t.name,
    logo: t.logo,
    active: t.active,
    createdAt: t.createdAt.toISOString(),
    branchCount: t.branches.length,
    activeBranchCount: t.branches.filter((b) => b.active).length,
    cityCount: new Set(t.branches.map((b) => b.city).filter(Boolean)).size,
    userCount: stats.userCount,
    revenue30d: round2(stats.revenue30d),
    bills30d: stats.bills30d,
    branches: t.branches.map((b) => toBranchAdminDTO(b, stats.branchStats[b.id] ?? { userCount: 0, revenue30d: 0, bills30d: 0 })),
  }
}

// ─── Customers / transactions / expenses / staff ─────────────────────────────

export function toCustomerDTO(
  c: Customer & { branchVisits?: { branchName: string }[] },
): CustomerDTO {
  const dto: CustomerDTO = {
    id: c.id,
    mobile: c.mobile,
    name: c.name,
    birthday: c.birthday,
    visits: c.visits,
    totalSpend: round2(c.totalSpend),
    lastVisitAt: c.lastVisitAt ? c.lastVisitAt.toISOString() : null,
  }
  if (c.branchVisits) {
    dto.homeBranchName = c.branchVisits[0]?.branchName ?? null
    dto.branchCount = c.branchVisits.length
  }
  return dto
}

export function toTransactionItemDTO(i: TransactionItem): TransactionItemDTO {
  return { id: i.id, serviceId: i.serviceId, serviceName: i.serviceName, price: i.price, qty: i.qty }
}

type TransactionWithItems = Transaction & {
  items: TransactionItem[]
  /** Included by every caller since billing v1.1; the optional keeps older
   *  call sites (if any slip through) compiling while the fallback below
   *  synthesizes a single-payment view from the denormalized columns. */
  payments?: TransactionPayment[]
}

export function toTransactionDTO(t: TransactionWithItems, tenantName = ""): TransactionDTO {
  // Payment slices: from the rows when present; otherwise synthesize from the
  // denormalized columns (legacy edge — a bill created before/without rows).
  let payments: PaymentSlice[]
  if (t.payments && t.payments.length > 0) {
    payments = t.payments.map((p) => ({ method: p.method as PaymentMethod, amount: round2(p.amount) }))
  } else {
    payments = [
      {
        method: (t.paymentMethod === "SPLIT" ? "CASH" : t.paymentMethod) as PaymentMethod,
        amount: round2(t.total - t.tipAmount),
      },
    ]
  }
  return {
    id: t.id,
    billNo: t.billNo,
    branchId: t.branchId,
    branchName: t.branchName,
    tenantName,
    customerId: t.customerId,
    customerMobile: t.customerMobile,
    customerName: t.customerName,
    staffId: t.staffId,
    staffName: t.staffName,
    subtotal: t.subtotal,
    discountPct: t.discountPct,
    discountAmount: t.discountAmount,
    discountFlat: t.discountFlat,
    gstPct: t.gstPct,
    gstAmount: t.gstAmount,
    tipAmount: t.tipAmount,
    total: t.total,
    paymentMethod: t.paymentMethod as PaymentMethodOrSplit,
    payments,
    note: t.note,
    status: t.status,
    voidedAt: t.voidedAt ? t.voidedAt.toISOString() : null,
    voidReason: t.voidReason,
    createdAt: t.createdAt.toISOString(),
    items: t.items.map(toTransactionItemDTO),
  }
}

export function toExpenseDTO(
  e: Expense & { branch?: { name: string } | null },
): ExpenseDTO {
  return {
    id: e.id,
    branchId: e.branchId,
    branchName: e.branch?.name ?? "—",
    category: e.category as ExpenseCategory,
    description: e.description,
    amount: e.amount,
    date: e.date.toISOString(),
    createdByName: e.createdByName,
    createdAt: e.createdAt.toISOString(),
  }
}

type UserWithBranches = User & { branches: { branch: { id: string; name: string } }[] }

export function toStaffDTO(
  u: Pick<User, "id" | "name" | "email" | "role" | "active" | "commissionPct"> & {
    branches?: { branch: { id: string; name: string } }[]
  },
  billsToday = 0,
  revenueToday = 0,
): StaffDTO {
  const branchIds = u.branches?.map((b) => b.branch.id) ?? []
  const branchNames = u.branches?.map((b) => b.branch.name) ?? []
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as Role,
    active: u.active,
    commissionPct: u.commissionPct,
    billsToday,
    revenueToday: round2(revenueToday),
    branchIds,
    branchNames,
  }
}

export type { UserWithBranches }
export type TransactionWithItemsType = Prisma.TransactionGetPayload<{ include: { items: true } }>
