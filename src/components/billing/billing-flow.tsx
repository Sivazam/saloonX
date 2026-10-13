'use client'

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPost } from '@/lib/api-client'
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
import { LangToggle } from '@/components/shell/lang-toggle'

type Step = 1 | 2 | 3 | 4

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
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const inflight = useRef(false)

  const [walkIn, setWalkIn] = useState(false)
  const [name, setName] = useState('')
  const [discountPct, setDiscountPct] = useState(0)
  const [loyaltyDecision, setLoyaltyDecision] = useState<LoyaltyDecision>('none')
  const [note, setNote] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [bill, setBill] = useState<TransactionDTO | null>(null)
  const [billBranch, setBillBranch] = useState<BranchProfileDTO | null>(null)

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

  // ── Data ─────────────────────────────────────────────────────────────────
  // Catalog + branch profile are branch-scoped — they refetch when the
  // header branch switcher invalidates queries.
  const catalogQuery = useQuery({
    queryKey: ['catalog', currentBranch?.id],
    queryFn: () => apiGet<CatalogResponse>('/api/catalog'),
  })
  const branchQuery = useQuery({
    queryKey: ['branch', currentBranch?.id],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>('/api/branch'),
  })

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
  }

  const handleCustomerContinue = (info: CustomerContinueInfo) => {
    setWalkIn(info.walkIn)
    if (info.walkIn) {
      setDiscountPct(0)
    }
    go(3)
  }

  // ── Payment → POST /api/transactions (or offline queue) ──────────────────
  const [pendingQueueBill, setPendingQueueBill] = useState<QueuedBill | null>(null)

  /** Network-level failure → the bill still gets saved: enqueue it locally
   *  and show the success screen with an "offline — will sync" banner. */
  const saveOffline = (method: PaymentMethod) => {
    const branchProfile = branchQuery.data?.branch
    const now = new Date()
    const items = cart.map((c) =>
      c.custom
        ? { name: c.name, price: c.price, qty: c.qty }
        : { serviceId: c.serviceId!, qty: c.qty },
    )
    const subtotal = round2(cart.reduce((s, c) => s + c.price * c.qty, 0))
    const discountAmount = round2((subtotal * discountPct) / 100)
    const gstPct = branchProfile?.gstEnabled ? branchProfile.gstPct : 0
    const gstAmount = round2(((subtotal - discountAmount) * gstPct) / 100)
    const total = round2(subtotal - discountAmount + gstAmount)

    const clientRequestId = newRequestId()
    const body: Record<string, unknown> = {
      items,
      discountPct,
      paymentMethod: method,
      clientRequestId,
      clientCreatedAt: now.toISOString(),
    }
    if (note.trim()) body.note = note.trim()
    if (!walkIn && keypad.digits.length === 10 && fetchedMobile === keypad.digits) {
      body.customerMobile = keypad.digits
      const customerName = (name.trim() || customer?.name || '').trim()
      if (customerName) body.customerName = customerName
    }

    const bill: QueuedBill = {
      clientRequestId,
      payload: body as QueuedBill['payload'],
      display: {
        total,
        itemCount: cart.reduce((s, c) => s + c.qty, 0),
        itemSummary:
          cart.length === 1
            ? `${cart[0].name}${cart[0].qty > 1 ? ` ×${cart[0].qty}` : ''}`
            : `${cart[0].name} +${cart.length - 1} more`,
        branchName: currentBranch?.name ?? '',
        createdAt: now.toISOString(),
      },
      attempts: 0,
      lastError: null,
      queuedAt: now.toISOString(),
    }
    void enqueueBill(bill)

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
      discountPct,
      discountAmount,
      gstPct,
      gstAmount,
      total,
      paymentMethod: method,
      note: note.trim() || null,
      status: 'PENDING_SYNC',
      voidedAt: null,
      voidReason: null,
      createdAt: now.toISOString(),
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
    setPendingQueueBill(bill)
    clearCart()
    setDir(1)
    setStep(4)
    toast.warning(L.savedOffline, {
      description: L.savedOfflineHint,
      duration: 6000,
    })
  }

  const confirmPayment = async (method: PaymentMethod) => {
    if (submitting || cart.length === 0) return
    // No internet → don't even try: queue and succeed locally.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      saveOffline(method)
      return
    }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        items: cart.map((c) =>
          c.custom
            ? { name: c.name, price: c.price, qty: c.qty }
            : { serviceId: c.serviceId, qty: c.qty },
        ),
        discountPct,
        paymentMethod: method,
      }
      if (note.trim()) body.note = note.trim()
      if (!walkIn && keypad.digits.length === 10 && fetchedMobile === keypad.digits) {
        body.customerMobile = keypad.digits
        const customerName = (name.trim() || customer?.name || '').trim()
        if (customerName) body.customerName = customerName
      }
      const res = await apiPost<{ transaction: TransactionDTO; branch: BranchProfileDTO | null }>(
        '/api/transactions',
        body,
      )
      setLastBill(res.transaction)
      setBill(res.transaction)
      setBillBranch(res.branch ?? branchQuery.data?.branch ?? null)
      setPendingQueueBill(null)
      clearCart()
      setDir(1)
      setStep(4)
    } catch (e) {
      // Connection died mid-request (network-level failure, not a server
      // rejection) → fall back to the offline queue so the bill isn't lost.
      if (e instanceof TypeError && /fetch|network/i.test(e.message)) {
        saveOffline(method)
        return
      }
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
                    className={`flex h-11 items-center gap-2 rounded-full border px-3 text-sm font-semibold transition-colors sm:px-4 [@media(max-height:740px)]:h-9 [@media(max-height:740px)]:px-2.5 ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : complete
                          ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                          : 'text-muted-foreground'
                    } ${clickable ? 'cursor-pointer' : ''}`}
                  >
                    <span
                      className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                        active
                          ? 'bg-primary-foreground/20'
                          : complete
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                      }`}
                    >
                      {complete ? <Check className="size-4" /> : n}
                    </span>
                    <span className="hidden sm:inline">{label}</span>
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
                    catalogQuery.error instanceof Error
                      ? catalogQuery.error.message
                      : catalogQuery.isError
                        ? 'Something went wrong'
                        : null
                  }
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
                  onDiscountChange={setDiscountPct}
                  note={note}
                  onNoteChange={setNote}
                  submitting={submitting}
                  onConfirm={(m) => void confirmPayment(m)}
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
                <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="font-semibold">{L.loadingSettings}</p>
                </div>
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
