'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost } from '@/lib/api-client'
import { readLocalCache, writeLocalCache } from '@/lib/local-cache'
import {
  enqueueBill,
  newRequestId,
  type QueuedBill,
} from '@/lib/offline-queue'
import { round2 } from '@/lib/serialize'
import { formatINR } from '@/lib/format'
import type {
  BranchProfileDTO,
  CatalogResponse,
  CustomerDTO,
  LookupResponse,
  PaymentMethod,
  PaymentSlice,
  TransactionDTO,
} from '@/lib/types'
import { useAppStore, useT } from '@/store/use-app-store'
import { useKeypad } from './use-keypad'
import { TicketPanel, type TicketCustomer } from './ticket-panel'
import { ServiceSelectStep } from './steps/service-select-step'
import {
  CustomerStep,
  type CustomerContinueInfo,
  type LoyaltyDecision,
} from './steps/customer-step'
import { PaymentStep } from './steps/payment-step'
import { SuccessStep } from './steps/success-step'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { LangToggle } from '@/components/shell/lang-toggle'

type Step = 1 | 2 | 3 | 4

type DiscountSource = 'NONE' | 'LOYALTY' | 'MENU' | 'MANUAL'

/** Offline-cold-start cache window for the catalog / branch profile. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const slideVariants = {
  enter: (dir: number) => ({ x: 40 * dir, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: -40 * dir, opacity: 0 }),
}

export default function BillingFlow() {
  const cart = useAppStore((s) => s.cart)
  const clearCart = useAppStore((s) => s.clearCart)
  const setLastBill = useAppStore((s) => s.setLastBill)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const user = useAppStore((s) => s.user)
  const L = useT()
  const stepLabels = [L.stepServices, L.stepCustomer, L.stepPayment]

  // ── Flow state ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(1)
  const [dir, setDir] = useState(1)
  /** Mobile: bottom-sheet ticket, opened from the fixed cart bar. */
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false)
  // Clearing the bill inside the sheet leaves nothing to show — close it.
  useEffect(() => {
    if (cart.length === 0) setCartDrawerOpen(false)
  }, [cart.length])
  // ADMINs get the mobile bottom nav (fixed, z-40) — the cart bar must
  // hover above it so the Continue CTA is never covered.
  const hasMobileNav = user?.role === 'ADMIN'

  const [fetchedMobile, setFetchedMobile] = useState<string | null>(null)
  const [customer, setCustomer] = useState<CustomerDTO | null>(null)
  const [recommendation, setRecommendation] =
    useState<LookupResponse['recommendation']>(null)
  const [lastVisit, setLastVisit] = useState<LookupResponse['lastVisit']>(null)
  const [menuOffer, setMenuOffer] = useState<LookupResponse['menuOffer']>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const inflight = useRef(false)

  const [walkIn, setWalkIn] = useState(false)
  const [name, setName] = useState('')
  const [discountPct, setDiscountPct] = useState(0)
  /** Flat-₹ discount — mutually exclusive with discountPct (0 = none). */
  const [discountFlat, setDiscountFlat] = useState(0)
  /** Staff-collected tip, added after GST. */
  const [tipAmount, setTipAmount] = useState(0)
  /** What produced the active discount — gates QR-menu offer redemption. */
  const [discountSource, setDiscountSource] = useState<DiscountSource>('NONE')
  /** Split payment slices once confirmed (null until split mode is used). */
  const [splitPayments, setSplitPayments] = useState<PaymentSlice[] | null>(null)
  const [loyaltyDecision, setLoyaltyDecision] = useState<LoyaltyDecision>('none')
  const [note, setNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [bill, setBill] = useState<TransactionDTO | null>(null)
  const [billBranch, setBillBranch] = useState<BranchProfileDTO | null>(null)

  // Switching branches must not carry the previous branch's discount,
  // loyalty decision, note or step position into the new bill context.
  const branchId = currentBranch?.id ?? null
  const prevBranchId = useRef(branchId)
  useEffect(() => {
    if (prevBranchId.current !== null && branchId !== prevBranchId.current) {
      resetCustomerState()
      setStep(1)
      setDir(1)
    }
    prevBranchId.current = branchId
  }, [branchId])

  // ── Shared keypad (mobile number persists across steps) ──────────────────
  const runLookup = useCallback(async (mobile: string) => {
    if (mobile.length !== 10 || inflight.current) return
    inflight.current = true
    setLookupLoading(true)
    setLookupError(null)
    try {
      const res = await apiGet<LookupResponse>(`/api/customers/lookup?mobile=${mobile}`)
      setCustomer(res.customer)
      setRecommendation(res.recommendation)
      setLastVisit(res.lastVisit)
      setMenuOffer(res.menuOffer)
      setFetchedMobile(mobile)
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      inflight.current = false
      setLookupLoading(false)
    }
  }, [])

  const handleFull = useCallback(
    (digits: string) => {
      void runLookup(digits) // auto-lookup the moment 10 digits are entered
    },
    [runLookup],
  )

  const keypad = useKeypad(10, handleFull)

  // ── Data (with offline cold-start cache) ─────────────────────────────────
  // Catalog + branch profile are branch-scoped — they refetch when the
  // header branch switcher invalidates queries. The last successful response
  // per branch is mirrored to localStorage so billing step 1 (and the payment
  // settings) survive a reload with no network.
  const catalogQuery = useQuery({
    queryKey: ['catalog', currentBranch?.id],
    queryFn: () => apiGet<CatalogResponse>('/api/catalog'),
    initialData: () =>
      (branchId ? readLocalCache<CatalogResponse>(`sx-catalog-${branchId}`, CACHE_TTL_MS) : null) ?? undefined,
  })
  const branchQuery = useQuery({
    queryKey: ['branch', currentBranch?.id],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>('/api/branch'),
    initialData: () =>
      (branchId ? readLocalCache<{ branch: BranchProfileDTO }>(`sx-branch-${branchId}`, CACHE_TTL_MS) : null) ?? undefined,
  })

  useEffect(() => {
    if (catalogQuery.data && branchId) writeLocalCache(`sx-catalog-${branchId}`, catalogQuery.data)
  }, [catalogQuery.data, branchId])
  useEffect(() => {
    if (branchQuery.data && branchId) writeLocalCache(`sx-branch-${branchId}`, branchQuery.data)
  }, [branchQuery.data, branchId])

  // Fetch failed but the cached copy is on screen — a quiet amber notice, not
  // a blocking error (the staff can still bill from the saved menu).
  const usingSavedMenu = catalogQuery.isError && catalogQuery.data != null

  // Empty cart can't proceed past services (derived, no effects).
  const effStep: Step =
    step === 4 ? 4 : cart.length === 0 && step > 1 ? 1 : step

  const go = (n: Step) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }

  // ── Customer step handlers ───────────────────────────────────────────────
  const handleWalkInChange = (v: boolean) => {
    setWalkIn(v)
    if (v) setLookupError(null)
  }

  const handleLoyaltyDecision = (d: LoyaltyDecision) => {
    setLoyaltyDecision(d)
    setDiscountPct(d === 'applied' && recommendation ? recommendation.discountPct : 0)
    setDiscountFlat(0)
    setDiscountSource(d === 'applied' ? 'LOYALTY' : 'NONE')
  }

  /** QR-menu signup offer — same single-discount slot as loyalty, amber banner. */
  const handleApplyMenuOffer = () => {
    if (!menuOffer) return
    setLoyaltyDecision('applied')
    setDiscountPct(menuOffer.pct)
    setDiscountFlat(0)
    setDiscountSource('MENU')
  }

  /** Manual discount from the payment screen — % OR flat ₹, never both. */
  const handleManualDiscount = (v: { pct?: number; flat?: number }) => {
    if (v.flat != null && v.flat > 0) {
      setDiscountFlat(v.flat)
      setDiscountPct(0)
      setDiscountSource('MANUAL')
    } else {
      const pct = v.pct ?? 0
      setDiscountPct(pct)
      setDiscountFlat(0)
      setDiscountSource(pct > 0 ? 'MANUAL' : 'NONE')
    }
  }

  const handleCustomerContinue = (info: CustomerContinueInfo) => {
    setWalkIn(info.walkIn)
    if (info.walkIn) {
      setDiscountPct(0)
      setDiscountFlat(0)
      setDiscountSource('NONE')
    }
    go(3)
  }

  /** Lookup failed on a server/network error (NOT a plain "not found") — the
   *  staff can still bill: the mobile lands on the bill, loyalty is skipped. */
  const handleContinueAnyway = () => {
    if (keypad.digits.length !== 10) return
    setFetchedMobile(keypad.digits)
    setLookupError(null)
  }

  // ── Payment → POST /api/transactions (or offline queue) ──────────────────
  const [pendingQueueBill, setPendingQueueBill] = useState<QueuedBill | null>(null)

  const branchProfile = branchQuery.data?.branch

  // Money math mirrors the server exactly (round2 at each step) so the
  // expectedTotal drift check never fires on healthy data. Every derived
  // figure is finite-guarded: a POS must never show ₹NaN, whatever upstream
  // state (cached branch profile with a missing gstPct, poisoned cart) does.
  const safe = (n: number) => (Number.isFinite(n) ? n : 0)
  const subtotal = safe(round2(cart.reduce((s, c) => s + c.price * c.qty, 0)))
  const totalQty = cart.reduce((a, c) => a + c.qty, 0)
  const discountAmount = safe(
    discountFlat > 0
      ? round2(Math.min(discountFlat, subtotal))
      : round2((subtotal * discountPct) / 100),
  )
  const gstPct = branchProfile?.gstEnabled
    ? safe(Number(branchProfile.gstPct))
    : 0
  const gstAmount = safe(round2(((subtotal - discountAmount) * gstPct) / 100))
  const tip = safe(round2(tipAmount))
  const expectedTotal = safe(round2(subtotal - discountAmount + gstAmount + tip))

  /** Payload shared by the online POST and the offline queue. The offline
   *  copy intentionally omits expectedTotal (an unattended sync cannot answer
   *  a 409 drift prompt). */
  const buildPayload = (
    clientRequestId: string,
    clientCreatedAt: Date,
    method: PaymentMethod | null,
    payments?: PaymentSlice[],
  ): Record<string, unknown> => {
    const body: Record<string, unknown> = {
      items: cart.map((c) =>
        c.custom
          ? { name: c.name, price: c.price, qty: c.qty }
          : { serviceId: c.serviceId, qty: c.qty },
      ),
      discountPct: discountFlat > 0 ? 0 : discountPct,
      ...(discountFlat > 0 ? { discountFlat } : {}),
      ...(tip > 0 ? { tipAmount: tip } : {}),
      ...(discountSource !== 'NONE' ? { discountSource } : {}),
      ...(payments && payments.length > 0 ? { payments } : {}),
      ...(!payments || payments.length === 0 ? { paymentMethod: method ?? 'CASH' } : {}),
      clientRequestId,
      clientCreatedAt: clientCreatedAt.toISOString(),
    }
    if (note.trim()) body.note = note.trim()
    if (!walkIn && keypad.digits.length === 10 && fetchedMobile === keypad.digits) {
      body.customerMobile = keypad.digits
      const customerName = (name.trim() || customer?.name || '').trim()
      if (customerName) body.customerName = customerName
    }
    return body
  }

  /** Network-level failure → the bill still gets saved: enqueue it locally
   *  and show the success screen with an "offline — will sync" banner.
   *
   *  CRITICAL: this MUST accept a clientRequestId/clientCreatedAt generated
   *  BEFORE the online POST attempt — if the server actually saved the bill
   *  but the network response was lost, the offline queue reuses the SAME
   *  idempotency key so the server's P2002 catch replays the winner instead
   *  of creating a duplicate bill. (Earlier code generated a fresh key here,
   *  which double-billed every time the network died mid-save.)
   *
   *  CRITICAL #2: enqueueBill is AWAITED. IndexedDB can be unavailable (iOS
   *  private mode, quota) — a fire-and-forget enqueue used to show the success
   *  screen for a bill that was never stored anywhere. On failure we now keep
   *  the payment step mounted, toast, and let the staff retry. */
  const saveOffline = async (
    method: PaymentMethod | null,
    clientRequestId: string,
    clientCreatedAt: Date,
    payments?: PaymentSlice[],
  ): Promise<boolean> => {
    const body = buildPayload(clientRequestId, clientCreatedAt, method, payments)
    const previewPayments: PaymentSlice[] =
      payments && payments.length > 0
        ? payments
        : [{ method: method ?? 'CASH', amount: round2(expectedTotal) }]
    const previewMethod: PaymentSlice['method'] | 'SPLIT' =
      previewPayments.length > 1 ? 'SPLIT' : previewPayments[0].method

    const queuedBill: QueuedBill = {
      clientRequestId,
      payload: body as unknown as QueuedBill['payload'],
      display: {
        total: expectedTotal,
        itemCount: cart.reduce((s, c) => s + c.qty, 0),
        itemSummary:
          cart.length === 1
            ? `${cart[0].name}${cart[0].qty > 1 ? ` ×${cart[0].qty}` : ''}`
            : `${cart[0].name} +${cart.length - 1} more`,
        branchName: currentBranch?.name ?? '',
        createdAt: clientCreatedAt.toISOString(),
        tipAmount: tip,
        discountFlat: discountFlat > 0 ? discountFlat : undefined,
        payments: previewPayments,
      },
      attempts: 0,
      lastError: null,
      queuedAt: clientCreatedAt.toISOString(),
    }

    try {
      await enqueueBill(queuedBill)
    } catch {
      // Storage unavailable — do NOT clear the cart, do NOT advance: the
      // payment step stays mounted so the staff can retry (or re-bill once
      // storage/network returns). The paper receipt is the fallback record.
      toast.error(L.offlineSaveFailed, {
        description: L.offlineSaveFailedHint,
        duration: 10000,
      })
      return false
    }

    // Local preview so the staff can hand over a receipt right away.
    const preview: TransactionDTO = {
      id: clientRequestId,
      billNo: `OFFLINE-${clientRequestId.slice(0, 4).toUpperCase()}`,
      branchId: currentBranch?.id ?? '',
      branchName: currentBranch?.name ?? '',
      tenantName: branchProfile?.tenantName ?? '',
      customerId: null,
      customerMobile: (body.customerMobile as string) ?? null,
      customerName: (body.customerName as string) ?? null,
      staffId: user?.id ?? '',
      staffName: user?.name ?? '',
      subtotal,
      discountPct: discountFlat > 0 ? 0 : discountPct,
      discountAmount,
      discountFlat: discountFlat > 0 ? discountFlat : null,
      gstPct,
      gstAmount,
      tipAmount: tip,
      total: expectedTotal,
      paymentMethod: previewMethod,
      payments: previewPayments,
      note: note.trim() || null,
      status: 'PENDING_SYNC',
      voidedAt: null,
      voidReason: null,
      createdAt: clientCreatedAt.toISOString(),
      items: cart.map((c, i) => ({
        id: `local-${i}`,
        serviceId: c.custom ? null : c.serviceId,
        serviceName: c.name,
        price: c.price,
        qty: c.qty,
      })),
    }
    setLastBill(preview)
    setBill(preview)
    setBillBranch(branchProfile ?? null)
    setPendingQueueBill(queuedBill)
    clearCart()
    setDir(1)
    setStep(4)
    toast.warning(L.savedOffline, {
      description: L.savedOfflineHint,
      duration: 6000,
    })
    return true
  }

  const confirmPayment = async (method: PaymentMethod | null, payments?: PaymentSlice[]) => {
    if (submitting || cart.length === 0) return
    if (payments && payments.length > 0) setSplitPayments(payments)
    else if (splitPayments) setSplitPayments(null) // fell back to a single method
    // No internet → don't even try: queue and succeed locally.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSubmitting(true)
      try {
        await saveOffline(method, newRequestId(), new Date(), payments)
      } finally {
        setSubmitting(false)
      }
      return
    }
    setSubmitting(true)
    // Generate the idempotency key + true local time BEFORE the request so a
    // network failure mid-save (TypeError / offline) reuses the SAME key when
    // falling back to the offline queue — the server's replay guard then
    // returns the original bill instead of double-billing.
    const clientRequestId = newRequestId()
    const clientCreatedAt = new Date()
    try {
      const body: Record<string, unknown> = {
        ...buildPayload(clientRequestId, clientCreatedAt, method, payments),
        // Online-only: lets the server 409 if prices/tax changed under us.
        expectedTotal,
      }
      const res = await apiPost<{ transaction: TransactionDTO; branch: BranchProfileDTO | null }>(
        '/api/transactions',
        body,
      )
      setLastBill(res.transaction)
      setBill(res.transaction)
      setBillBranch(res.branch ?? branchProfile ?? null)
      setPendingQueueBill(null)
      clearCart()
      setDir(1)
      setStep(4)
    } catch (e) {
      // Connection died mid-request (network-level failure, not a server
      // rejection) → fall back to the offline queue so the bill isn't lost.
      // Every browser surfaces fetch failures as TypeError (Safari: "Load
      // failed"), so treat ANY TypeError — or being offline now — as a
      // network failure rather than matching fragile message strings.
      const offlineNow = typeof navigator !== 'undefined' && !navigator.onLine
      if (offlineNow || e instanceof TypeError) {
        await saveOffline(method, clientRequestId, clientCreatedAt, payments)
        return
      }
      // Server rejection (validation / drift 409 / rate limit) — surface the
      // message; the payment step stays mounted for a retry.
      toast.error(e instanceof Error ? e.message : L.couldNotSave)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success → new bill ───────────────────────────────────────────────────
  const resetCustomerState = () => {
    keypad.clear()
    setFetchedMobile(null)
    setCustomer(null)
    setRecommendation(null)
    setLastVisit(null)
    setLookupError(null)
    setWalkIn(false)
    setName('')
    setDiscountPct(0)
    setDiscountFlat(0)
    setTipAmount(0)
    setDiscountSource('NONE')
    setSplitPayments(null)
    setLoyaltyDecision('none')
    setNote('')
  }

  const handleNewBill = () => {
    resetCustomerState()
    setDir(-1)
    setStep(1)
    toast.success(L.readyForNext)
  }

  // ── Ticket panel (desktop aside) — the live bill being built ──────────
  const ticketDiscountLabel =
    discountFlat > 0
      ? formatINR(discountFlat)
      : discountPct > 0
        ? `${Math.round(discountPct)}%`
        : null

  const customerResolved =
    !walkIn &&
    keypad.digits.length === 10 &&
    fetchedMobile === keypad.digits &&
    !lookupLoading &&
    !lookupError
  const ticketContinueDisabled = effStep === 2 && !(walkIn || customerResolved)

  const ticketCustomer: TicketCustomer | null =
    effStep === 1
      ? null
      : walkIn
        ? { name: L.walkInDisplay, sub: L.wontCountLoyalty, initials: '', walkIn: true }
        : customer
          ? {
              name: customer.name || customer.mobile,
              sub: `${customer.visits} ${
                customer.visits === 1 ? L.visitWord : L.visitsWord
              } · ${formatINR(customer.totalSpend)}`,
              initials:
                (customer.name ?? '')
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join('')
                  .toUpperCase() || customer.mobile.slice(-2),
            }
          : customerResolved
            ? {
                name: name.trim() || keypad.digits,
                sub: L.newCustomerShort,
                initials: keypad.digits.slice(-2),
              }
            : null

  /** Mobile cart bar is mounted — pin extra scroll room under the step
   *  content so the last control is never covered. The bar is now FIXED and
   *  present on EVERY step (1–3) while the bill has items — the cashier can
   *  always see the running total and open the ticket without scrolling. */
  const cartBarVisible = cart.length > 0 && effStep < 4

  return (
    <div
      className={`p-4 lg:p-6 lg:pb-6 [@media(max-height:740px)]:pt-3! ${
        cartBarVisible
          ? hasMobileNav
            ? 'pb-[calc(10.75rem+env(safe-area-inset-bottom))]'
            : 'pb-[calc(7rem+env(safe-area-inset-bottom))]'
          : 'pb-24'
      }`}
    >
      <div className="mx-auto max-w-6xl">
        {/* Step header — compact inline stepper + language toggle */}
        {effStep < 4 && (
          <div className="flex items-center justify-between gap-2">
            <nav aria-label="Billing steps" className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
              {stepLabels.map((label, i) => {
                const n = (i + 1) as 1 | 2 | 3
                const active = effStep === n
                const complete = effStep > n
                const clickable = complete && !submitting
                return (
                  <div key={label} className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                    {i > 0 && (
                      <span
                        className={`h-px w-4 sm:w-7 ${complete ? 'bg-primary/50' : 'bg-border'}`}
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => clickable && go(n)}
                      aria-current={active ? 'step' : undefined}
                      className={`flex items-center gap-2 rounded-lg py-1 pr-1 transition-opacity ${
                        clickable ? 'cursor-pointer hover:opacity-75' : 'cursor-default'
                      }`}
                    >
                      <span
                        className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors ${
                          active
                            ? 'bg-foreground text-background shadow-sm'
                            : complete
                              ? 'bg-primary/15 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {complete ? <Check className="size-3.5" /> : n}
                      </span>
                      <span
                        className={`hidden truncate text-sm sm:inline ${
                          active
                            ? 'font-bold'
                            : complete
                              ? 'font-semibold text-foreground/75'
                              : 'font-medium text-muted-foreground'
                        }`}
                      >
                        {label}
                      </span>
                    </button>
                  </div>
                )
              })}
            </nav>
            <LangToggle />
          </div>
        )}

        {/* Two-pane POS workspace: step content + live ticket (desktop).
            No items-start — the aside must STRETCH to the tall catalog column,
            otherwise its sticky child has no room to stick and scrolls away. */}
        <div
          className={`mt-3 lg:mt-5 [@media(max-height:740px)]:mt-2 ${
            effStep < 4 ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-6' : ''
          }`}
        >
          <div className="min-w-0">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            {effStep === 1 && (
              <motion.div
                key="step-1"
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <ServiceSelectStep
                  categories={catalogQuery.data?.categories ?? []}
                  loading={catalogQuery.isLoading}
                  error={
                    usingSavedMenu
                      ? null // cached menu is usable — show the badge, not the error
                      : catalogQuery.error instanceof Error
                        ? catalogQuery.error.message
                        : catalogQuery.isError
                          ? 'Something went wrong'
                          : null
                  }
                  savedMenu={usingSavedMenu}
                  onRetry={() => void catalogQuery.refetch()}
                />
              </motion.div>
            )}

            {effStep === 2 && (
              <motion.div
                key="step-2"
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <CustomerStep
                  keypad={keypad}
                  cart={cart}
                  customer={customer}
                  recommendation={recommendation}
                  lastVisit={lastVisit}
                  fetchedMobile={fetchedMobile}
                  lookupLoading={lookupLoading}
                  lookupError={lookupError}
                  walkIn={walkIn}
                  onWalkInChange={handleWalkInChange}
                  name={name}
                  onNameChange={setName}
                  discountPct={discountPct}
                  loyaltyDecision={loyaltyDecision}
                  onLoyaltyDecision={handleLoyaltyDecision}
                  menuOffer={menuOffer}
                  onApplyMenuOffer={handleApplyMenuOffer}
                  onContinueAnyway={handleContinueAnyway}
                  onLookup={() => {
                    if (keypad.digits.length !== 10) {
                      toast.error(L.enterFullMobile)
                      return
                    }
                    void runLookup(keypad.digits)
                  }}
                  onBack={() => go(1)}
                  onContinue={handleCustomerContinue}
                />
              </motion.div>
            )}

            {effStep === 3 && branchQuery.data?.branch && (
              <motion.div
                key="step-3"
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <PaymentStep
                  cart={cart}
                  branch={branchQuery.data.branch}
                  discountPct={discountPct}
                  discountFlat={discountFlat}
                  onDiscountChange={handleManualDiscount}
                  tipAmount={tipAmount}
                  onTipChange={setTipAmount}
                  note={note}
                  onNoteChange={setNote}
                  submitting={submitting}
                  onConfirm={(m) => void confirmPayment(m)}
                  onConfirmSplit={(payments) => void confirmPayment(null, payments)}
                />
              </motion.div>
            )}

            {effStep === 3 && !branchQuery.data?.branch && (
              <motion.div
                key="step-3-loading"
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                {branchQuery.isError ? (
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
                    <p className="font-semibold">{L.loadingSettingsFailed}</p>
                    <Button variant="outline" onClick={() => void branchQuery.refetch()}>
                      {L.tryAgain}
                    </Button>
                  </div>
                ) : (
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <p className="font-semibold">{L.loadingSettings}</p>
                  </div>
                )}
              </motion.div>
            )}

            {effStep === 4 && bill && billBranch && (
              <motion.div
                key="step-4"
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <SuccessStep
                  transaction={bill}
                  branch={billBranch}
                  pendingSync={Boolean(pendingQueueBill)}
                  onNewBill={handleNewBill}
                />
              </motion.div>
            )}
          </AnimatePresence>
          </div>

          {/* Live ticket — stays in view across services → customer → payment */}
          {effStep < 4 && (
            <aside className="hidden lg:block" aria-label={L.currentBill}>
              <div className="sticky top-20">
                <TicketPanel
                  step={effStep === 3 ? 3 : effStep === 2 ? 2 : 1}
                  subtotal={subtotal}
                  discountAmount={discountAmount}
                  discountLabel={ticketDiscountLabel}
                  gstPct={gstPct}
                  gstAmount={gstAmount}
                  tip={tip}
                  customer={ticketCustomer}
                  continueDisabled={ticketContinueDisabled}
                  submitting={submitting}
                  onContinue={
                    effStep === 1
                      ? () => go(2)
                      : () =>
                          handleCustomerContinue({
                            mobile: keypad.digits,
                            name: name.trim(),
                            customer,
                            walkIn,
                          })
                  }
                />
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* ── Mobile: fixed cart bar ──────────────────────────────────────────
          Viewport-PINNED (fixed — never sticky) the moment the bill has items,
          and it stays pinned across ALL steps (services → customer → payment)
          so the cashier always sees the running total and can open the ticket
          without scrolling, whatever the step or scroll position. Rendered
          OUTSIDE the animated step wrappers so no transform can re-anchor it;
          the left half opens the ticket sheet. The CTA advances on steps 1–2
          (gated on step 2 until the customer is resolved); on step 3 the
          payment methods own the action, so the bar is summary-only. */}
      <AnimatePresence>
        {cartBarVisible && (
          <motion.div
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={`fixed inset-x-0 z-40 px-4 lg:hidden ${
              hasMobileNav
                ? 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))]'
                : 'bottom-[calc(1rem+env(safe-area-inset-bottom))]'
            }`}
          >
            <div className="pointer-events-none mx-auto flex w-full max-w-xl items-center gap-2 rounded-2xl border bg-card p-2.5 pl-2 lift">
              <button
                type="button"
                onClick={() => setCartDrawerOpen(true)}
                aria-label={L.yourBill}
                className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                <span className="tnum flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-sm font-bold text-background">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={totalQty}
                      initial={{ opacity: 0, scale: 0.6, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.6, y: 6 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="tnum"
                    >
                      {totalQty}
                    </motion.span>
                  </AnimatePresence>
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  {/* The money is the hero line — it can never truncate. Shows
                      the FULL live bill (discount + GST + tip applied). */}
                  <span className="tnum block text-base font-bold tracking-tight">
                    {formatINR(expectedTotal)}
                  </span>
                  <span className="mt-0.5 flex items-center gap-0.5 text-xs font-medium text-muted-foreground">
                    <span className="tnum">{totalQty}</span>{' '}
                    {totalQty === 1 ? L.item : L.items}
                    <ChevronUp className="size-3.5 shrink-0" aria-hidden />
                  </span>
                </span>
              </button>
              {effStep < 3 && (
                <Button
                  size="lg"
                  className="pointer-events-auto h-12 shrink-0 px-5 text-base font-bold sm:px-6"
                  disabled={effStep === 2 && ticketContinueDisabled}
                  onClick={() =>
                    effStep === 1
                      ? go(2)
                      : handleCustomerContinue({
                          mobile: keypad.digits,
                          name: name.trim(),
                          customer,
                          walkIn,
                        })
                  }
                >
                  {effStep === 1 ? L.continue : L.continueToPayment}
                  <ArrowRight className="size-4.5" />
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile: the full ticket in a bottom sheet — opened from the cart bar.
          Receives the COMPLETE money state (discount + GST + tip) so its total
          always equals the payment screen's, plus a step-aware CTA. */}
      <Drawer open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}>
        <DrawerContent>
          <DrawerTitle className="sr-only">{L.yourBill}</DrawerTitle>
          <div className="p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <TicketPanel
              step={effStep === 3 ? 3 : effStep === 2 ? 2 : 1}
              subtotal={subtotal}
              discountAmount={discountAmount}
              discountLabel={ticketDiscountLabel}
              gstPct={gstPct}
              gstAmount={gstAmount}
              tip={tip}
              customer={ticketCustomer}
              continueDisabled={ticketContinueDisabled}
              submitting={submitting}
              fillViewport={false}
              onContinue={() => {
                setCartDrawerOpen(false)
                if (effStep === 1) go(2)
                else
                  handleCustomerContinue({
                    mobile: keypad.digits,
                    name: name.trim(),
                    customer,
                    walkIn,
                  })
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* Saving overlay */}
      <AnimatePresence>
        {submitting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm"
            role="alert"
            aria-live="assertive"
          >
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-10 py-8 shadow-xl">
              <Loader2 className="size-9 animate-spin text-primary" />
              <p className="text-lg font-semibold">{L.savingBill}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
