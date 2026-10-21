'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost } from '@/lib/api-client'
import { readLocalCache, writeLocalCache } from '@/lib/local-cache'
import {
  enqueueBill,
  newRequestId,
  type QueuedBill,
} from '@/lib/offline-queue'
import { round2 } from '@/lib/serialize'
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
import { ServiceSelectStep } from './steps/service-select-step'
import {
  CustomerStep,
  type CustomerContinueInfo,
  type LoyaltyDecision,
} from './steps/customer-step'
import { PaymentStep } from './steps/payment-step'
import { SuccessStep } from './steps/success-step'
import { Button } from '@/components/ui/button'
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
  // expectedTotal drift check never fires on healthy data.
  const subtotal = round2(cart.reduce((s, c) => s + c.price * c.qty, 0))
  const discountAmount =
    discountFlat > 0
      ? round2(Math.min(discountFlat, subtotal))
      : round2((subtotal * discountPct) / 100)
  const gstPct = branchProfile?.gstEnabled ? branchProfile.gstPct : 0
  const gstAmount = round2(((subtotal - discountAmount) * gstPct) / 100)
  const tip = round2(tipAmount)
  const expectedTotal = round2(subtotal - discountAmount + gstAmount + tip)

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

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6 [@media(max-height:740px)]:pt-3!">
      <div className="mx-auto max-w-4xl">
        {/* Step indicator pills + language toggle */}
        {effStep < 4 && (
          <div className="flex items-center justify-between gap-2">
            <nav aria-label="Billing steps" className="flex items-center gap-1.5 sm:gap-2">
              {stepLabels.map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3
              const active = effStep === n
              const complete = effStep > n
              const clickable = complete && effStep !== 4 && !submitting
              return (
                <div key={label} className="flex items-center gap-1.5 sm:gap-2">
                  {i > 0 && (
                    <span
                      className={`h-px w-4 sm:w-6 ${complete ? 'bg-primary/60' : 'bg-border'}`}
                      aria-hidden="true"
                    />
                  )}
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && go(n)}
                    aria-current={active ? 'step' : undefined}
                    className={`relative flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors sm:px-4 [@media(max-height:740px)]:h-9 [@media(max-height:740px)]:px-2.5 ${
                      active
                        ? 'border-primary text-primary-foreground'
                        : complete
                          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                          : 'text-muted-foreground'
                    } ${clickable ? 'cursor-pointer' : ''}`}
                  >
                    {active && (
                      <motion.span
                        layoutId="billing-active-step"
                        className="absolute inset-0 rounded-full bg-primary shadow-sm"
                        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                        initial={false}
                      />
                    )}
                    <span
                      className={`relative z-10 flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                        active
                          ? 'bg-primary-foreground/20'
                          : complete
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                      }`}
                    >
                      {complete ? <Check className="size-4" /> : n}
                    </span>
                    <span className="relative z-10 hidden sm:inline">{label}</span>
                  </button>
                </div>
              )
            })}
            </nav>
            <LangToggle />
          </div>
        )}

        {/* Steps */}
        <div className="mt-4 lg:mt-6 [@media(max-height:740px)]:mt-2">
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
                  onContinue={() => go(2)}
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
      </div>

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
