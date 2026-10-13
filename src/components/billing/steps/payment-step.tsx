'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import QRCode from 'qrcode'
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  Pencil,
  Plus,
  QrCode,
  StickyNote,
} from 'lucide-react'
import { formatINR } from '@/lib/format'
import type { BranchProfileDTO, PaymentMethod } from '@/lib/types'
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

interface PaymentStepProps {
  cart: CartItem[]
  branch: BranchProfileDTO
  discountPct: number
  onDiscountChange: (pct: number) => void
  note: string
  onNoteChange: (v: string) => void
  submitting: boolean
  onConfirm: (method: PaymentMethod) => void
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function PaymentStep({
  cart,
  branch,
  discountPct,
  onDiscountChange,
  note,
  onNoteChange,
  submitting,
  onConfirm,
}: PaymentStepProps) {
  const L = useT()
  const [dialog, setDialog] = useState<PaymentMethod | null>(null)
  const [tendered, setTendered] = useState<number | null>(null)
  const [customText, setCustomText] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  // QR cache entry keyed by the full UPI URI — setState only happens in the
  // async callbacks, never synchronously in the effect body.
  const [qr, setQr] = useState<{ key: string; url: string | null; failed: boolean } | null>(null)
  const qrFor = useRef<string | null>(null)

  const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0)
  const discountAmount = round2((subtotal * discountPct) / 100)
  const gstAmount = branch.gstEnabled
    ? round2(((subtotal - discountAmount) * branch.gstPct) / 100)
    : 0
  const total = round2(subtotal - discountAmount + gstAmount)

  const upiUri = branch.upiId
    ? `upi://pay?pa=${encodeURIComponent(branch.upiId)}&pn=${encodeURIComponent(
        branch.name,
      )}&am=${total.toFixed(2)}&cu=INR`
    : null
  const qrCurrent = qr !== null && qr.key === upiUri ? qr : null
  const qrLoading = upiUri !== null && (qrCurrent === null || qrCurrent.url === null)
  const qrFailed = qrCurrent?.failed === true

  const openDialog = (method: PaymentMethod) => {
    if (submitting) return
    setTendered(null)
    setCustomText('')
    setDialog(method)
  }

  // Auto-generate a UPI QR from the branch's UPI ID + this bill's amount.
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
  }, [dialog, branch.upiQrImage, upiUri])

  const change = tendered !== null ? round2(tendered - total) : null

  const methodCard =
    'flex h-28 flex-col items-center justify-center gap-1.5 rounded-xl border-2 bg-card shadow-sm transition-colors hover:border-primary/60 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-50 sm:h-32'

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-bold sm:text-2xl">{L.payment}</h1>

      {/* Summary card */}
      <div className="hairline mt-4 rounded-xl bg-card p-4">
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
            <span>Subtotal</span>
            <span className="tnum font-semibold text-foreground">
              {formatINR(subtotal)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              {L.discount}
              <Popover>
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
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    {L.discountPct}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[0, 5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => onDiscountChange(pct)}
                        className={`tnum h-11 w-14 rounded-xl border text-base font-bold transition-colors ${
                          discountPct === pct
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'bg-card hover:bg-accent'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </span>
            <span className="tnum font-semibold text-emerald-600 dark:text-emerald-400">
              {discountAmount > 0
                ? `-${formatINR(discountAmount)} (${discountPct}%)`
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

      {/* Payment method cards */}
      <div className="mt-4 grid grid-cols-3 gap-3">
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
      </div>

      {/* Optional bill note */}
      <div className="mt-3">
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

      {/* ── Cash dialog ── */}
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
              {[200, 500, 1000, 2000].map((amount) => (
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
                  tendered !== null && ![total, 200, 500, 1000, 2000].includes(tendered)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent'
                }`}
              >
                {L.custom}
              </button>
            </div>
            {(tendered === null || ![total, 200, 500, 1000, 2000].includes(tendered)) && (
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
                    {qrFailed ? "Couldn't generate the QR code" : 'QR code unavailable'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ask customer to pay {formatINR(total)} to {branch.upiId}
                  </p>
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
                UPI ID: <span className="font-semibold text-foreground">{branch.upiId}</span>
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
    </div>
  )
}
