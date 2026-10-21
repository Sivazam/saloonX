// Shared DTO contracts — shapes mirror the JSON responses of /api/** exactly.
// Multi-tenant hierarchy: SUPER_ADMIN → Tenant (franchise) → Branch → ADMIN/STAFF.

export type Role = "SUPER_ADMIN" | "ADMIN" | "STAFF"

export type PaymentMethod = "CASH" | "UPI" | "CARD"

/** A bill settled in more than one way — the granular split lives in
 *  TransactionDTO.payments (one row per method). */
export type PaymentMethodOrSplit = PaymentMethod | "SPLIT"

/** One slice of a split payment (or the single payment of a normal bill). */
export interface PaymentSlice {
  method: PaymentMethod
  amount: number
}

export interface AppUser {
  id: string
  name: string
  email: string
  role: Role
  tenantId: string | null // null for SUPER_ADMIN
  tenantName: string | null
  tenantLogo: string | null
  /** Server-persisted UI language ("en" | "hi") — follows the user across devices. */
  lang: "en" | "hi" | null
}

/** Minimal branch reference used all over the UI. */
export interface BranchRef {
  id: string
  name: string
  city: string | null
}

export interface BranchProfileDTO {
  id: string
  tenantId: string
  tenantName: string
  tenantLogo: string | null
  name: string
  city: string | null
  address: string | null
  phone: string | null
  logo: string | null // per-branch logo override (data URL) — falls back to tenant logo in UI
  upiId: string | null
  upiQrImage: string | null
  ownerMobile: string | null
  billPrefix: string
  gstEnabled: boolean
  gstPct: number
  /** Branch GSTIN — printed on receipts when GST is enabled (null = not registered). */
  gstin: string | null
  loyaltyEnabled: boolean
  loyaltyVisits: number
  loyaltyDiscountPct: number
  receiptFooter: string | null
  /** Public QR-menu URL slug — `/?menu=<slug>` opens this branch's customer menu. */
  menuSlug: string | null
  /** First-visit discount advertised on the QR menu (0 = registration CTA hidden). */
  menuOfferPct: number
  /** Optional hero tagline shown on the QR menu. */
  menuTagline: string | null
  active: boolean
  /** Live for billing only when approved && active. */
  approved: boolean
}

/** Branch card for the admin Branches view / super admin tenant detail. */
export interface BranchAdminDTO {
  id: string
  tenantId: string
  tenantName: string
  name: string
  city: string | null
  address: string | null
  phone: string | null
  logo: string | null
  upiId: string | null
  gstEnabled: boolean
  billPrefix: string
  active: boolean
  approved: boolean
  menuSlug: string | null
  menuOfferPct: number
  menuTagline: string | null
  userCount: number
  revenue30d: number
  bills30d: number
  createdAt: string
}

export interface TenantDTO {
  id: string
  name: string
  logo: string | null
  active: boolean
  createdAt: string
  branchCount: number
  activeBranchCount: number
  cityCount: number
  userCount: number
  revenue30d: number
  bills30d: number
  branches: BranchAdminDTO[]
}

export interface TenantsResponse {
  tenants: TenantDTO[]
  platform: {
    revenue30d: number
    bills30d: number
    activeTenants: number
    activeBranches: number
    staffCount: number
    newCustomers30d: number
    /** Branches awaiting super-admin approval. */
    pendingBranches: { id: string; tenantName: string; name: string; city: string | null; billPrefix: string; createdAt: string }[]
  }
}

/** GET /api/auth/me response. */
export interface MeResponse {
  user: AppUser
  branches: BranchRef[] // branches this user can operate (empty for SUPER_ADMIN)
  currentBranch: BranchRef | null
}

export interface ServiceDTO {
  id: string
  name: string
  price: number // EFFECTIVE price at the queried branch (override ?? franchise)
  durationMin: number | null
  active: boolean // effective availability at the branch
  categoryId: string
}

export interface CategoryDTO {
  id: string
  name: string
  sortOrder: number
  services: ServiceDTO[]
}

export interface CatalogResponse {
  branchId: string
  categories: CategoryDTO[]
}

/** Per-branch deviation for one service. price/active null = inherit franchise value. */
export interface ServiceOverrideDTO {
  branchId: string
  price: number | null
  active: boolean | null
}

/** Franchise-default service + its branch overrides (admin Menu & Prices view). */
export interface FranchiseServiceDTO {
  id: string
  name: string
  price: number // franchise default
  durationMin: number | null
  active: boolean // franchise default
  categoryId: string
  overrides: ServiceOverrideDTO[]
}

export interface FranchiseCategoryDTO {
  id: string
  name: string
  sortOrder: number
  services: FranchiseServiceDTO[]
}

export interface FranchiseMenuResponse {
  tenant: { id: string; name: string; logo: string | null }
  branches: BranchRef[]
  categories: FranchiseCategoryDTO[]
}

export interface CustomerDTO {
  id: string
  mobile: string
  name: string | null
  /** Recurring birthday "MM-DD" (null = unknown). */
  birthday: string | null
  visits: number
  totalSpend: number
  lastVisitAt: string | null
  homeBranchName?: string | null
  branchCount?: number
}

export interface LastVisitDTO {
  billNo: string
  date: string
  services: string[] // e.g. ["Haircut (Men)", "Beard Trim & Shape x2"]
  total: number
  paymentMethod: PaymentMethodOrSplit
  branchName: string | null
}

export interface LookupResponse {
  customer: CustomerDTO | null
  recommendation: {
    eligible: boolean
    discountPct: number
    visits: number
  } | null
  lastVisit: LastVisitDTO | null
  /** Unredeemed QR-menu signup offer for this customer, if any. */
  menuOffer: { pct: number; code: string } | null
}

/* ── Public QR menu (no auth) ──────────────────────────────────────────── */

export interface PublicMenuServiceDTO {
  id: string
  name: string
  price: number
  /** Franchise default price — when it differs from price, the menu shows a
   *  strikethrough MRP (branch offer). */
  mrp: number | null
  durationMin: number | null
  popular: boolean
}

export interface PublicMenuCategoryDTO {
  id: string
  name: string
  /** Icon key resolved from the category name (see menu icon map). */
  icon: string
  services: PublicMenuServiceDTO[]
}

export interface PublicMenuResponse {
  branch: {
    name: string
    city: string | null
    address: string | null
    phone: string | null
    logo: string | null
    tagline: string
  }
  tenant: { name: string; logo: string | null }
  offer: { pct: number } | null
  categories: PublicMenuCategoryDTO[]
  stats: { services: number }
  slug: string
}

export interface MenuLeadResponse {
  code: string
  pct: number
  name: string | null
  already: boolean
}

/** One QR-menu signup row (admin Menu signups panel). */
export interface MenuLeadRowDTO {
  id: string
  code: string
  name: string | null
  mobile: string
  pct: number
  branchName: string
  createdAt: string
  redeemedAt: string | null
}

export interface MenuLeadsStatsResponse {
  totals: { claims: number; redeemed: number }
  recent: MenuLeadRowDTO[]
}

export interface TransactionItemDTO {
  id: string
  serviceId: string | null
  serviceName: string
  price: number
  qty: number
}

export interface TransactionDTO {
  id: string
  billNo: string
  branchId: string
  branchName: string
  tenantName: string
  customerId: string | null
  customerMobile: string | null
  customerName: string | null
  staffId: string
  staffName: string
  subtotal: number
  discountPct: number
  discountAmount: number
  /** Flat-₹ discount actually applied (null = percentage or none). */
  discountFlat: number | null
  gstPct: number
  gstAmount: number
  /** Staff-collected tip — included in total, added after GST. */
  tipAmount: number
  total: number
  paymentMethod: PaymentMethodOrSplit
  /** Granular payment slices — always ≥ 1; > 1 only on SPLIT bills. */
  payments: PaymentSlice[]
  note: string | null
  status: string // "COMPLETED" | "VOIDED"
  voidedAt: string | null
  voidReason: string | null
  createdAt: string
  items: TransactionItemDTO[]
}

export interface MethodSummary {
  amount: number
  count: number
}

export interface BranchSummaryStat {
  branchId: string
  name: string
  revenue: number
  bills: number
}

export interface TransactionsResponse {
  data: TransactionDTO[]
  total: number
  branches: BranchRef[] // branches the filters were applied across
  summary: {
    revenue: number
    count: number
    avgBill: number
    byMethod: Record<PaymentMethodOrSplit, MethodSummary>
    byBranch: BranchSummaryStat[]
  }
}

export interface StatsResponse {
  totalRevenue: number
  totalBills: number
  avgBill: number
  byMethod: Record<PaymentMethod, MethodSummary>
  byBranch: BranchSummaryStat[]
  daily: { date: string; revenue: number; bills: number }[]
  topServices: { name: string; count: number; revenue: number }[]
  topStaff: {
    userId: string
    name: string
    commissionPct: number
    revenue: number
    bills: number
    commission: number
  }[]
  newCustomers: number
  returningBills: number
  /** Prior equal-length window — drives the "↑12% vs last week" delta badges. */
  previous: {
    totalRevenue: number
    totalBills: number
    avgBill: number
    newCustomers: number
  }
  /** Discount analytics — how much the salon is giving away. */
  discounts: {
    totalAmount: number
    billsWithDiscount: number
    /** % of bills in range that carried a discount. */
    avgPct: number
    /** % of gross subtotal that was waived (true revenue leakage). */
    leakagePct: number
  }
  /** Customer depth — retention, ARPU, top spenders in the range. */
  customerDepth: {
    unique: number
    repeatCustomers: number
    /** % of unique customers who visited more than once in range. */
    repeatRate: number
    avgRevenuePerCustomer: number
  }
  topCustomers: { name: string; bills: number; spend: number }[]
  expenses: {
    total: number
    count: number
    byCategory: Partial<Record<ExpenseCategory, { amount: number; count: number }>>
  }
}

export interface CustomerHistoryResponse {
  customer: CustomerDTO
  transactions: TransactionDTO[]
  totals: {
    bills: number
    spend: number
    avgBill: number
  }
}

/** POST /api/customers/merge — `from` absorbed into `to`; the keeper comes
 *  back with summed visits/spend and the combined visit history. */
export interface MergeCustomerResponse {
  customer: CustomerDTO
}

export type ExpenseCategory =
  | "RENT"
  | "SUPPLIES"
  | "SALARY"
  | "UTILITY"
  | "MARKETING"
  | "MAINTENANCE"
  | "OTHER"

export interface ExpenseDTO {
  id: string
  branchId: string
  branchName: string
  category: ExpenseCategory
  description: string | null
  amount: number
  date: string
  createdByName: string
  createdAt: string
}

export interface ExpensesResponse {
  data: ExpenseDTO[]
  total: number
  branches: BranchRef[]
  summary: {
    total: number
    byCategory: Partial<Record<ExpenseCategory, { amount: number; count: number }>>
    byBranch: BranchSummaryStat[]
  }
}

export interface StaffDTO {
  id: string
  name: string
  email: string
  role: Role
  active: boolean
  commissionPct: number
  billsToday: number
  revenueToday: number
  branchIds: string[]
  branchNames: string[]
}

export interface TransactionsQuery {
  from?: string
  to?: string
  method?: string
  staffId?: string
  search?: string
  branchId?: string // omit = all accessible branches
  page?: number
  limit?: number
}

/* ── Shift handover report ─────────────────────────────────────────────── */

export interface ShiftBillDTO {
  id: string
  billNo: string
  createdAt: string
  branchName: string
  customerName: string | null
  customerMobile: string | null
  items: number
  discountAmount: number
  tipAmount: number
  total: number
  paymentMethod: PaymentMethodOrSplit
}

export interface ShiftPaymentSplit {
  count: number
  amount: number
}

// ── Announcements (bell menu) ────────────────────────────────────────────

export type AnnouncementKind =
  | "BRANCH_APPROVED"
  | "BRANCH_DECLINED"
  | "BRANCH_PAUSED"
  | "WELCOME"
  | "INFO"

export interface AnnouncementDTO {
  id: string
  kind: AnnouncementKind
  title: string
  body: string
  createdAt: string
  /** True when the signed-in user has no read receipt yet (drives the badge). */
  unread: boolean
}

export interface AnnouncementsResponse {
  announcements: AnnouncementDTO[]
  unread: number
}

export interface ShiftReportResponse {
  date: string // YYYY-MM-DD (local day)
  staff: {
    id: string
    name: string
    role: Role
    commissionPct: number
    branchNames: string[]
  }
  summary: {
    bills: number
    revenue: number // sum of bill totals (after discount, incl. GST + tips)
    discounts: number
    avgBill: number
    /** Pre-GST, pre-tip revenue the commission is computed on (Σ subtotal − discount). */
    commissionBase: number
    commission: number // commissionBase × commissionPct
    byPayment: Record<PaymentMethod, ShiftPaymentSplit>
    cashCollected: number // Σ CASH payment slices — what the staff hands over
    firstBillAt: string | null
    lastBillAt: string | null
  }
  bills: ShiftBillDTO[]
  generatedAt: string
}

/* ── Customer birthdays ────────────────────────────────────────────────── */

export interface BirthdayCustomerDTO {
  id: string
  name: string | null
  mobile: string
  /** "MM-DD" — the recurring birthday (year unknown/irrelevant). */
  birthday: string | null
  /** Days until the next occurrence (0 = today). */
  daysUntil: number
  homeBranchName: string | null
  lastVisitAt: string | null
  /** When the salon last WhatsApp-wished them (campaign tracking). */
  lastWishAt: string | null
}

/* ── Monthly P&L trend (dashboard profit chart) ────────────────────────── */

export interface MonthlyStatDTO {
  /** "YYYY-MM" */
  ym: string
  /** "Oct" (Jan includes the 2-digit year: "Jan 27") */
  label: string
  year: number
  revenue: number
  expenses: number
  profit: number
  bills: number
}

export interface MonthlyStatsResponse {
  months: MonthlyStatDTO[]
}

/* ── Business-hours heatmap (dashboard staffing card) ──────────────────── */

export interface HoursCell {
  dow: number // 0 = Monday … 6 = Sunday
  hour: number // bucket start hour (8…21)
  bills: number
  revenue: number
}

export interface HoursStatsResponse {
  cells: HoursCell[]
  dowTotals: { dow: number; bills: number; revenue: number }[]
  hourTotals: { hour: number; bills: number; revenue: number }[]
  peak: HoursCell | null
  totalBills: number
  totalRevenue: number
}

/* ── Platform cross-franchise comparison (super-admin console) ─────────── */

export interface FranchiseComparisonDTO {
  tenantId: string
  name: string
  logo: string | null
  active: boolean
  branchCount: number
  revenue30d: number
  revenuePrev30d: number
  /** MoM % change; null when there is no baseline (prev = ₹0). */
  growthPct: number | null
  bills30d: number
  avgBill30d: number
  revenuePerBranch: number
  monthly: { ym: string; label: string; revenue: number }[]
}

export interface PlatformComparisonResponse {
  franchises: FranchiseComparisonDTO[]
  platform: {
    revenue30d: number
    revenuePrev30d: number
    growthPct: number | null
  }
  generatedAt: string
}

/* ── Birthday campaign analytics (dashboard marketing card) ────────────── */

/** One calendar month of birthday-campaign funnel. */
export interface BirthdayCampaignMonth {
  ym: string // "2026-10"
  label: string // "Oct"
  /** Customers whose birthday fell in this month (known DOB only). */
  eligible: number
  /** Of those, how many received a WhatsApp wish (tracked lastWishAt). */
  wished: number
  /** Of the wished, how many came back within 14 days of the birthday. */
  visits: number
  /** Revenue from those winning visits. */
  revenue: number
}

/** A birthday that passed without converting — the actionable follow-up list. */
export interface MissedBirthdayDTO {
  id: string
  name: string | null
  mobile: string
  birthday: string | null // "MM-DD"
  /** Month in which this birthday occurred ("2026-09"). */
  occurredYm: string
  wished: boolean
  /** Lifetime spend — helps prioritise who to win back. */
  totalSpend: number
  lastVisitAt: string | null
  homeBranchName: string | null
}

export interface BirthdayCampaignResponse {
  months: number
  windowFrom: string
  windowTo: string
  monthly: BirthdayCampaignMonth[]
  totals: {
    eligible: number
    wished: number
    visits: number
    conversionPct: number // wished → visit
    revenue: number
    avgTicket: number
  }
  missed: MissedBirthdayDTO[]
}

/* ── In-franchise branch comparison (dashboard league table) ───────────── */

export interface BranchCompareDTO {
  branchId: string
  name: string
  city: string | null
  prefix: string | null
  revenue: number
  prevRevenue: number
  /** % vs the prior equal-length window; null when no baseline. */
  growthPct: number | null
  bills: number
  avgBill: number
  expenses: number
  profit: number
  newCustomers: number
  staffCount: number
  /** Share of franchise revenue, 0–100. */
  sharePct: number
}

export interface BranchCompareResponse {
  from: string
  to: string
  rangeDays: number
  branches: BranchCompareDTO[]
  franchise: {
    revenue: number
    expenses: number
    profit: number
    bills: number
  }
}
