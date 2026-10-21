'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import QRCode from 'qrcode'
import {
  AlertTriangle,
  Banknote,
  Check,
  CreditCard,
  HandCoins,
  Pencil,
  Plus,
  QrCode,
  Split,
  StickyNote,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatINR } from '@/lib/format'
import { round2 } from '@/lib/serialize'
import type { BranchProfileDTO, PaymentMethod, PaymentSlice } from '@/lib/types'
import type { CartItem } from '@/store/use-app-store'
import { useT } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'

/** Discount change: pick ONE shape — a percentage OR a flat ₹ amount. */
export type DiscountChange = { pct: number } | { flat: number }

interface PaymentStepProps {
  cart: CartItem[]
  branch: BranchProfileDTO
  discountPct: number
  /** Flat-₹ discount (0 = none) — mutually exclusive with discountPct. */
  discountFlat: number
  onDiscountChange: (v: DiscountChange) => void
  /** Staff-collected tip (₹) — added AFTER GST into the total. */
  tipAmount: number
  onTipChange: (v: number) => void
  note: string
  onNoteChange: (v: string) => void
  submitting: boolean
  /** Fastest path: a single payment method (unchanged UX). */
  onConfirm: (method: PaymentMethod) => void
  /** Split path: ≥ 1 payment slices that sum to the total exactly. */
  onConfirmSplit: (payments: PaymentSlice[]) => void
}

const METHODS: { method: PaymentMethod; labelKey: 'cash' | 'upi' | 'card' }[] = [
  { method: 'CASH', labelKey: 'cash' },
  { method: 'UPI', labelKey: 'upi' },
  { method: 'CARD', labelKey: 'card' },
]

export function PaymentStep({
  cart,
  branch,
  discountPct,
  discountFlat,
  onDiscountChange,
  tipAmount,
  onTipChange,
  note,
  onNoteChange,
  submitting,
  onConfirm,
  onConfirmSplit,
}: PaymentStepProps) {
  const L = useT()
  const [dialog, setDialog] = useState<PaymentMethod | 'SPLIT' | null>(null)
  const [tendered, setTendered] = useState<number | null>(null)
  const [customText, setCustomText] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)

  // ── Discount popover state ──────────────────────────────────────────────
  const [discOpen, setDiscOpen] = useState(false)
  const [discMode, setDiscMode] = useState<'pct' | 'flat'>('pct')
  const [flatText, setFlatText] = useState('')

  // ── Tip state ───────────────────────────────────────────────────────────
  const [tipPanelOpen, setTipPanelOpen] = useState(false)
  const [tipCustom, setTipCustom] = useState(false)
  const [customTipText, setCustomTipText] = useState('')

  // ── Split dialog state ──────────────────────────────────────────────────
  const [splitAmt, setSplitAmt] = useState<Record<PaymentMethod, string>>({ CASH: '', UPI: '', CARD: '' })
  const [splitTendered, setSplitTendered] = useState<number | null>(null)

  // QR cache entry keyed by the full UPI URI — setState only happens in the
  // async callbacks, never synchronously in the effect body.
  const [qr, setQr] = useState<{ key: string; url: string | null; failed: boolean } | null>(null)
  const [qrAttempt, setQrAttempt] = useState(0)
  const qrFor = useRef<string | null>(null)

  const subtotal = round2(cart.reduce((a, c) => a + c.price * c.qty, 0))
  const discountAmount =
    discountFlat > 0
      ? round2(Math.min(discountFlat, subtotal))
      : round2((subtotal * discountPct) / 100)
  const gstAmount = branch.gstEnabled
    ? round2(((subtotal - discountAmount) * branch.gstPct) / 100)
    : 0
  const tip = round2(tipAmount)
  const total = round2(subtotal - discountAmount + gstAmount + tip)

  const upiUri = branch.upiId
    ? `upi://pay?pa=${encodeURIComponent(branch.upiId)}&pn=${encodeURIComponent(
        branch.name,
      )}&am=${total.toFixed(2)}&cu=INR`
    : null
  const qrCurrent = qr !== null && qr.key === upiUri ? qr : null
  // Loading only while there is no resolved state yet — a failure state must
  // reach the UI (previously a failed QR kept the skeleton up forever).
  const qrLoading = upiUri !== null && qrCurrent === null
  const qrFailed = qrCurrent?.failed === true

  const retryQr = () => {
    if (!upiUri) return
    qrFor.current = null
    setQr(null) // clears the failed state → skeleton while regenerating
    setQrAttempt((n) => n + 1) // re-triggers the generation effect
  }

  const openDialog = (method: PaymentMethod | 'SPLIT') => {
    if (submitting) return
    setTendered(null)
    setCustomText('')
    if (method === 'SPLIT') {
      setSplitAmt({ CASH: '', UPI: '', CARD: '' })
      setSplitTendered(null)
    }
    setDialog(method)
  }

  // Auto-generate a UPI QR from the branch's UPI ID + this bill's amount.
  // qrAttempt is a manual-retry trigger (bumped by retryQr).
  useEffect(() => {
    if (dialog !== 'UPI' || branch.upiQrImage || !upiUri) return
    if (qrFor.current === upiUri) return // already generated or generating
    let cancelled = false
    qrFor.current = upiUri
    QRCode.toDataURL(upiUri, {
      width: 512,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((url) => {
        if (cancelled) return
        setQr({ key: upiUri, url, failed: false })
      })
      .catch(() => {
        if (cancelled) return
        setQr({ key: upiUri, url: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [dialog, branch.upiQrImage, upiUri, qrAttempt])

  const change = tendered !== null ? round2(tendered - total) : null

  // Quick-tender chips adapt to the bill: the next round numbers above the
  // total plus common Indian notes that cover it (₹2000 is being withdrawn —
  // only suggested when nothing smaller covers the bill).
  const quickTenders = (() => {
    const options = new Set<number>()
    for (const step of [10, 50, 100, 200, 500]) {
      const v = Math.ceil(total / step) * step
      if (v > total) options.add(v)
      if (options.size >= 2) break
    }
    for (const note of [100, 200, 500, 1000, 2000]) {
      if (note >= total) options.add(note)
    }
    return [...options].sort((a, b) => a - b).slice(0, 4)
  })()

  // ── Discount popover handlers ───────────────────────────────────────────

  const openDiscountPopover = (open: boolean) => {
    if (open) {
      // Start in the mode of whatever discount is currently active.
      setDiscMode(discountFlat > 0 ? 'flat' : 'pct')
      setFlatText(discountFlat > 0 ? String(discountFlat) : '')
    }
    setDiscOpen(open)
  }

  /** Standard % chips + a dynamic chip for a non-standard active pct (loyalty 7%…). */
  const pctChips = (() => {
    const base = [0, 5, 10, 15, 20]
    const activeNonStandard =
      discountFlat === 0 && discountPct > 0 && !base.includes(discountPct) ? Math.round(discountPct) : null
    return activeNonStandard !== null ? [...base, activeNonStandard] : base
  })()

  const flatValue = Number(flatText)
  const flatInvalid = flatText !== '' && (!Number.isFinite(flatValue) || flatValue <= 0 || flatValue > subtotal)

  const applyFlat = (text: string) => {
    // Keep the raw text (staff sees exactly what they typed)…
    setFlatText(text)
    // …but only commit a sane amount: 0 < v ≤ subtotal.
    const v = Number(text)
    if (text === '' || !Number.isFinite(v) || v <= 0) {
      onDiscountChange({ flat: 0 }) // cleared → no discount
      return
    }
    if (v > subtotal) return // shown as an inline hint; nothing committed
    onDiscountChange({ flat: round2(v) })
  }

  // ── Tip handlers ────────────────────────────────────────────────────────

  const addTip = (amount: number) => {
    onTipChange(round2(tip + amount))
  }

  const removeTip = () => {
    onTipChange(0)
    setCustomTipText('')
    setTipCustom(false)
    setTipPanelOpen(false)
    toast.info(L.tipRemoved)
  }

  const applyCustomTip = () => {
    const v = Number(customTipText)
    if (!Number.isFinite(v) || v <= 0) return
    onTipChange(round2(v))
    setCustomTipText('')
    setTipCustom(false)
  }

  // ── Split payment math ──────────────────────────────────────────────────

  const splitNums = METHODS.map(({ method }) => {
    const v = Number(splitAmt[method])
    return { method, amount: splitAmt[method] !== '' && Number.isFinite(v) ? round2(v) : 0 }
  })
  const allocated = round2(splitNums.reduce((s, p) => s + p.amount, 0))
  const remaining = round2(total - allocated)
  const splitComplete = allocated > 0 && remaining === 0
  const splitOver = remaining < 0

  const splitPayments = splitNums.filter((p) => p.amount > 0)

  const splitCash = splitNums.find((p) => p.method === 'CASH')?.amount ?? 0
  const splitCashTenders = (() => {
    if (splitCash <= 0) return []
    const options = new Set<number>()
    for (const step of [10, 50, 100, 200, 500]) {
      const v = Math.ceil(splitCash / step) * step
      if (v > splitCash) options.add(v)
      if (options.size >= 2) break
    }
    for (const note of [100, 200, 500, 1000, 2000]) {
      if (note >= splitCash) options.add(note)
    }
    return [...options].sort((a, b) => a - b).slice(0, 4)
  })()
  const splitChange = splitTendered !== null ? round2(splitTendered - splitCash) : null

  const confirmSplit = () => {
    if (!splitComplete || submitting) return
    onConfirmSplit(splitPayments)
  }

  const methodCard =
    'flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border-2 bg-card shadow-sm transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 sm:h-32 [@media(max-height:740px)]:h-22'

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-bold sm:text-2xl [@media(max-height:740px)]:text-lg">{L.payment}</h1>

      {/* Summary card */}
      <div className="hairline mt-4 rounded-xl bg-card p-4 [@media(max-height:740px)]:mt-2">
        <ul className="space-y-2">
          {cart.map((item) => (
            <li key={item.serviceId} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {item.name} <span className="font-semibold text-foreground">x{item.qty}</span>
              </span>
              <span className="tnum shrink-0 font-semibold">
                {formatINR(item.price * item.qty)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-2 border-t border-dashed pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{L.subtotal}</span>
            <span className="tnum font-semibold text-foreground">
              {formatINR(subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              {L.discount}
              <Popover open={discOpen} onOpenChange={openDiscountPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
                    aria-label={L.changeDiscount}
                    disabled={submitting}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="start">
                  {/* % / ₹ mode toggle — a segmented control, not tabs (neither
                      button owns a panel; both edit the same discount). */}
                  <div
                    className="mb-2.5 grid grid-cols-2 gap-1 rounded-lg border bg-muted/50 p-1"
                    role="group"
                    aria-label={L.changeDiscount}
                  >
                    <button
                      type="button"
                      aria-pressed={discMode === 'pct'}
                      onClick={() => setDiscMode('pct')}
                      className={`h-10 rounded-md text-xs font-bold transition-colors ${
                        discMode === 'pct'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      % · {L.discountTypePercent}
                    </button>
                    <button
                      type="button"
                      aria-pressed={discMode === 'flat'}
                      onClick={() => setDiscMode('flat')}
                      className={`h-10 rounded-md text-xs font-bold transition-colors ${
                        discMode === 'flat'
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ₹ · {L.discountTypeFlat}
                    </button>
                  </div>
                  {discMode === 'pct' ? (
                    <>
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">
                        {L.discountPct}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {pctChips.map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() => onDiscountChange({ pct })}
                            className={`tnum h-11 w-14 rounded-xl border text-base font-bold transition-colors ${
                              discountFlat === 0 && discountPct === pct
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'bg-card hover:bg-accent'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">
                        {L.flatDiscountLabel}
                      </p>
                      <div className="relative w-48">
                        <Input
                          inputMode="decimal"
                          value={flatText}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8)
                            applyFlat(v)
                          }}
                          placeholder={L.flatDiscountPlaceholder}
                          aria-label={L.flatDiscountLabel}
                          className="tnum h-12 pr-12 text-lg font-bold"
                          disabled={submitting}
                        />
                        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                          / {formatINR(subtotal)}
                        </span>
                      </div>
                      {flatInvalid && (
                        <p className="mt-1.5 text-xs font-medium text-destructive">
                          {L.flatDiscountTooBig}
                        </p>
                      )}
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </span>
            <span className="tnum font-semibold text-emerald-600 dark:text-emerald-400">
              {discountAmount > 0
                ? `-${formatINR(discountAmount)} ${
                    discountFlat > 0 ? `(${formatINR(discountFlat)})` : `(${discountPct}%)`
                  }`
                : L.none}
            </span>
          </div>
          {branch.gstEnabled && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({branch.gstPct}%)</span>
              <span className="tnum font-semibold text-foreground">
                {formatINR(gstAmount)}
              </span>
            </div>
          )}
          {tip > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{L.tipLabel}</span>
              <span className="tnum font-semibold text-amber-700 dark:text-amber-400">
                +{formatINR(tip)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-baseline justify-between border-t border-dashed pt-3">
          <span className="text-base font-semibold">{L.total}</span>
          <motion.span
            key={total}
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            className="tnum text-3xl font-bold text-primary"
          >
            {formatINR(total)}
          </motion.span>
        </div>
      </div>

      {/* Tip — collapsed chip, quick amounts, custom */}
      <div className="mt-3 [@media(max-height:740px)]:mt-2">
        {tipPanelOpen || tip > 0 ? (
          <div className="rounded-xl border bg-card p-2.5">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <HandCoins className="size-4" aria-hidden />
                {L.tipLabel}
              </span>
              {tip > 0 ? (
                <span className="tnum flex items-center gap-1 text-sm font-bold text-primary">
                  +{formatINR(tip)}
                  <button
                    type="button"
                    aria-label={L.removeTip}
                    onClick={removeTip}
                    disabled={submitting}
                    className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive after:absolute after:-inset-1.5 after:rounded-lg after:content-['']"
                  >
                    <X className="size-4" />
                  </button>
                </span>
              ) : null}
            </div>
            {tipCustom ? (
              <div className="flex gap-2">
                <Input
                  inputMode="decimal"
                  value={customTipText}
                  onChange={(e) =>
                    setCustomTipText(e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 7))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustomTip()
                  }}
                  placeholder={L.customTipPlaceholder}
                  aria-label={L.customTip}
                  autoFocus
                  className="tnum h-12 text-lg font-bold"
                  disabled={submitting}
                />
                <Button
                  size="lg"
                  className="h-12 shrink-0 px-5 font-bold"
                  disabled={!Number.isFinite(Number(customTipText)) || Number(customTipText) <= 0}
                  onClick={applyCustomTip}
                >
                  {L.apply}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[10, 20, 50].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => addTip(amount)}
                    disabled={submitting}
                    className="tnum h-11 rounded-xl border bg-card px-4 text-base font-bold transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    +{formatINR(amount)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCustomTipText('')
                    setTipCustom(true)
                  }}
                  disabled={submitting}
                  className="h-11 rounded-xl border bg-card px-4 text-base font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                >
                  {L.customTip}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTipPanelOpen(true)}
            disabled={submitting}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground disabled:opacity-50"
          >
            <HandCoins className="size-4" aria-hidden />
            {L.addTip}
          </button>
        )}
      </div>

      {/* Payment method cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 [@media(max-height:740px)]:mt-2">
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          className={methodCard}
          onClick={() => openDialog('CASH')}
          disabled={submitting}
        >
          <Banknote className="size-8 text-primary" />
          <span className="text-base font-bold">{L.cash}</span>
          <span className="text-xs text-muted-foreground">{L.cashHint}</span>
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          className={methodCard}
          onClick={() => openDialog('UPI')}
          disabled={submitting}
        >
          <QrCode className="size-8 text-primary" />
          <span className="text-base font-bold">{L.upi}</span>
          <span className="text-xs text-muted-foreground">{L.upiHint}</span>
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          className={methodCard}
          onClick={() => openDialog('CARD')}
          disabled={submitting}
        >
          <CreditCard className="size-8 text-primary" />
          <span className="text-base font-bold">{L.card}</span>
          <span className="text-xs text-muted-foreground">{L.cardHint}</span>
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          className={methodCard}
          onClick={() => openDialog('SPLIT')}
          disabled={submitting}
        >
          <Split className="size-8 text-primary" />
          <span className="text-base font-bold">{L.split}</span>
          <span className="text-xs text-muted-foreground">{L.splitHint}</span>
        </motion.button>
      </div>

      {/* Optional bill note */}
      <div className="mt-3 [@media(max-height:740px)]:mt-2">
        {noteOpen || note.trim() !== '' ? (
          <div className="relative">
            <StickyNote
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <Input
              value={note}
              onChange={(e) => onNoteChange(e.target.value.slice(0, 200))}
              placeholder={L.notePlaceholder}
              className="h-12 border-amber-300/70 bg-amber-50/60 pl-9 pr-16 dark:border-amber-900/60 dark:bg-amber-950/30"
              autoFocus={noteOpen}
              disabled={submitting}
              aria-label={L.addNote}
            />
            {note.trim() === '' && (
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {L.cancel}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden />
            {L.addNote}
          </button>
        )}
      </div>

      {/* ── Cash dialog (single-method path) ── */}
      <Dialog open={dialog === 'CASH'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{L.cashPayment} — {formatINR(total)}</DialogTitle>
            <DialogDescription>{L.tapCashReceived}</DialogDescription>
          </DialogHeader>
          <div>
            <p className="micro text-muted-foreground">
              {L.cashReceived}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setTendered(total)}
                className={`tnum h-11 rounded-xl border px-4 font-bold transition-colors ${
                  tendered === total
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent'
                }`}
              >
                {L.exact} {formatINR(total)}
              </button>
              {quickTenders.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setTendered(amount)}
                  className={`tnum h-11 rounded-xl border px-4 text-base font-bold transition-colors ${
                    tendered === amount
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-card hover:bg-accent'
                  }`}
                >
                  {formatINR(amount)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setTendered(null)
                  setCustomText('')
                }}
                className={`h-11 rounded-xl border px-4 text-base font-bold transition-colors ${
                  tendered !== null && ![total, ...quickTenders].includes(tendered)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent'
                }`}
              >
                {L.custom}
              </button>
            </div>
            {(tendered === null || ![total, ...quickTenders].includes(tendered)) && (
              <Input
                inputMode="numeric"
                value={customText}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 7)
                  setCustomText(digits)
                  setTendered(digits ? Number(digits) : null)
                }}
                placeholder={L.enterAmountReceived}
                className="tnum mt-3 h-12 text-lg"
                aria-label={L.enterAmountReceived}
              />
            )}
          </div>
          <div
            className={`mt-4 flex min-h-16 items-center justify-center rounded-xl border-2 px-4 py-3 text-center ${
              change !== null && change < 0
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            }`}
            aria-live="polite"
          >
            {change === null ? (
              <span className="text-base font-semibold text-muted-foreground">
                {L.selectOrEnter}
              </span>
            ) : change === 0 ? (
              <span className="tnum text-2xl font-bold">{L.exactAmount}</span>
            ) : change > 0 ? (
              <span className="tnum text-2xl font-bold">
                {L.return} {formatINR(change)}
              </span>
            ) : (
              <span className="tnum text-2xl font-bold">
                {L.insufficient} {formatINR(-change)} {L.more}
              </span>
            )}
          </div>
          <DialogFooter>
            <Button
              size="lg"
              className="h-14 w-full text-base font-bold"
              disabled={change === null || change < 0 || submitting}
              onClick={() => onConfirm('CASH')}
            >
              {submitting ? L.saving : L.confirmCash}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── UPI dialog ── */}
      <Dialog open={dialog === 'UPI'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{L.upiPayment} — {formatINR(total)}</DialogTitle>
            <DialogDescription>
              {L.askCustomerScan} {formatINR(total)}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center">
            {branch.upiQrImage ? (
              <div className="w-full max-w-64 rounded-xl bg-white p-4 shadow-inner">
                <img
                  src={branch.upiQrImage}
                  alt="UPI QR code"
                  className="aspect-square w-full object-contain"
                />
              </div>
            ) : branch.upiId ? (
              qrLoading ? (
                <Skeleton className="aspect-square w-full max-w-64 rounded-xl" />
              ) : qrCurrent?.url ? (
                <div className="w-full max-w-64 rounded-xl bg-white p-4 shadow-inner">
                  <img
                    src={qrCurrent.url}
                    alt={`UPI QR code for ${branch.upiId}`}
                    className="aspect-square w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center">
                  <AlertTriangle className="size-6 text-amber-600" />
                  <p className="text-sm font-semibold">
                    {qrFailed ? L.qrGenerateFailed : L.qrUnavailable}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {L.askPayUpi.replace('{amount}', formatINR(total)).replace('{id}', branch.upiId)}
                  </p>
                  {qrFailed && (
                    <Button size="sm" variant="outline" className="mt-1 h-9" onClick={retryQr}>
                      {L.retry}
                    </Button>
                  )}
                </div>
              )
            ) : (
              <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center">
                <AlertTriangle className="size-6 text-amber-600" />
                <p className="text-sm font-semibold">{L.upiNotConfigured}</p>
                <p className="text-xs text-muted-foreground">
                  {L.canStillConfirm}
                </p>
              </div>
            )}
            {branch.upiId && !qrLoading && (
              <p className="mt-3 text-sm text-muted-foreground">
                {L.upiIdLabel} <span className="font-semibold text-foreground">{branch.upiId}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              size="lg"
              className="h-14 w-full bg-emerald-600 text-base font-bold text-white shadow-none hover:bg-emerald-700"
              disabled={submitting}
              onClick={() => onConfirm('UPI')}
            >
              {submitting ? L.saving : L.paymentReceived}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Card dialog ── */}
      <Dialog open={dialog === 'CARD'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{L.cardPayment}</DialogTitle>
            <DialogDescription>
              {L.takeOnMachine} {formatINR(total)} {L.onMachineThenConfirm}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="flex size-20 items-center justify-center rounded-full bg-primary/10">
              <CreditCard className="size-10 text-primary" />
            </span>
            <p className="tnum text-4xl font-bold text-primary">
              {formatINR(total)}
            </p>
          </div>
          <DialogFooter>
            <Button
              size="lg"
              className="h-14 w-full text-base font-bold"
              disabled={submitting}
              onClick={() => onConfirm('CARD')}
            >
              {submitting ? L.saving : L.confirmCard}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Split payment dialog ── */}
      <Dialog open={dialog === 'SPLIT'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Split className="size-5 text-primary" aria-hidden />
              {L.splitPayment} — {formatINR(total)}
            </DialogTitle>
            <DialogDescription>{L.splitAllocate}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            {METHODS.map(({ method, labelKey }) => {
              const icon =
                method === 'CASH' ? Banknote : method === 'UPI' ? QrCode : CreditCard
              const Icon = icon
              return (
                <div key={method} className="flex items-center gap-2 sm:gap-2.5">
                  {/* Icon + label stack on phones — a 360px dialog would
                      otherwise squeeze the ₹ input to ~60px next to a 56px
                      label column and the Fill-remaining button. */}
                  <div className="flex w-12 shrink-0 flex-col items-center gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-11 sm:rounded-xl">
                      <Icon className="size-4 sm:size-5" aria-hidden />
                    </span>
                    <span className="text-center text-[10px] font-bold leading-none text-foreground sm:w-14 sm:text-left sm:text-sm sm:leading-tight">
                      {L[labelKey]}
                    </span>
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                      ₹
                    </span>
                    <Input
                      inputMode="decimal"
                      value={splitAmt[method]}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8)
                        setSplitAmt((s) => ({ ...s, [method]: v }))
                        setSplitTendered(null)
                      }}
                      placeholder="0"
                      aria-label={`${L[labelKey]} ₹`}
                      className="tnum h-12 pl-8 text-lg font-bold"
                      disabled={submitting}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (remaining > 0) {
                        // Absorb the remainder INTO this row (100 + 45 → 145),
                        // not replace — replacing would throw away what the
                        // staff already typed and grow "remaining" backwards.
                        setSplitAmt((s) => {
                          const cur = Number(s[method])
                          const base = s[method] !== '' && Number.isFinite(cur) ? cur : 0
                          return { ...s, [method]: String(round2(base + remaining)) }
                        })
                        setSplitTendered(null)
                      }
                    }}
                    disabled={remaining <= 0 || submitting}
                    className="h-12 shrink-0 rounded-xl border px-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50 sm:px-3"
                  >
                    {L.splitFillRemaining}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Live remaining indicator */}
          <div
            className={`mt-3 flex min-h-12 items-center justify-between rounded-xl border-2 px-4 py-2.5 ${
              splitOver
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : splitComplete
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}
            aria-live="polite"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              {splitComplete && <Check className="size-4" aria-hidden />}
              {splitOver ? L.splitOverAllocated : L.splitRemaining}
            </span>
            <span className="tnum text-xl font-bold">
              {formatINR(Math.abs(remaining))}
            </span>
          </div>

          {/* Cash tender helper for the CASH slice — same quick-tender pattern
              as the single cash dialog, sized against the cash allocation. */}
          {splitComplete && splitCash > 0 && (
            <div className="mt-3 rounded-xl border bg-muted/40 p-3">
              <p className="micro text-muted-foreground">
                {L.cashReceived} ({formatINR(splitCash)})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSplitTendered(splitCash)}
                  className={`tnum h-11 rounded-xl border px-4 font-bold transition-colors ${
                    splitTendered === splitCash
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-card hover:bg-accent'
                  }`}
                >
                  {L.exact}
                </button>
                {splitCashTenders.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setSplitTendered(amount)}
                    className={`tnum h-11 rounded-xl border px-4 text-base font-bold transition-colors ${
                      splitTendered === amount
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-card hover:bg-accent'
                    }`}
                  >
                    {formatINR(amount)}
                  </button>
                ))}
              </div>
              {splitChange !== null && (
                <p
                  className={`tnum mt-2 text-center text-lg font-bold ${
                    splitChange < 0 ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                  aria-live="polite"
                >
                  {splitChange >= 0
                    ? `${L.return} ${formatINR(splitChange)}`
                    : `${L.insufficient} ${formatINR(-splitChange)} ${L.more}`}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              size="lg"
              className="h-14 w-full text-base font-bold"
              disabled={!splitComplete || submitting}
              onClick={confirmSplit}
            >
              {submitting ? L.saving : L.confirmSplit}
            </Button>
            {!splitComplete && (
              <p className="text-center text-xs text-muted-foreground">{L.splitNotAllocated}</p>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
