'use client'

import { motion } from 'framer-motion'
import {
  Banknote,
  CloudOff,
  CreditCard,
  FileDown,
  MessageCircle,
  Printer,
  QrCode,
  Share2,
  Split,
  StickyNote,
} from 'lucide-react'
import { formatDateTime, formatINR } from '@/lib/format'
import type {
  BranchProfileDTO,
  PaymentMethodOrSplit,
  TransactionDTO,
} from '@/lib/types'
import { useT } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'
import { downloadReceiptPdf } from '../receipt-pdf'
import { shareReceiptPdf } from '../receipt-share'

interface SuccessStepProps {
  transaction: TransactionDTO
  branch: BranchProfileDTO
  /** Offline-queue bill: show the amber "will sync" banner instead of billNo. */
  pendingSync?: boolean
  onNewBill: () => void
}

const METHOD_META: Record<PaymentMethodOrSplit, { label: string; Icon: typeof Banknote }> = {
  CASH: { label: 'Cash', Icon: Banknote },
  UPI: { label: 'UPI', Icon: QrCode },
  CARD: { label: 'Card', Icon: CreditCard },
  SPLIT: { label: 'Split', Icon: Split },
}

function SuccessMark() {
  return (
    <motion.svg
      viewBox="0 0 100 100"
      className="size-24 text-emerald-500"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 16 }}
      aria-hidden="true"
    >
      <motion.circle
        cx="50"
        cy="50"
        r="44"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
      <motion.path
        d="M31 52 L45 66 L71 38"
        fill="none"
        stroke="currentColor"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.45, duration: 0.35, ease: 'easeOut' }}
      />
    </motion.svg>
  )
}

export function SuccessStep({ transaction: t, branch, pendingSync = false, onNewBill }: SuccessStepProps) {
  const L = useT()
  const method = METHOD_META[t.paymentMethod] ?? METHOD_META.CASH
  const methodLabel =
    t.paymentMethod === 'SPLIT'
      ? L.splitPayment
      : t.paymentMethod === 'CASH'
        ? L.cash
        : t.paymentMethod === 'UPI'
          ? L.upi
          : L.card
  // "Cash ₹600 + UPI ₹400" — the granular slices of a split settlement.
  const splitSummary =
    t.paymentMethod === 'SPLIT' && t.payments.length > 1
      ? t.payments
          .map((p) => {
            const label = p.method === 'CASH' ? L.cash : p.method === 'UPI' ? L.upi : L.card
            return `${label} ${formatINR(p.amount)}`
          })
          .join(' + ')
      : null
  const logo = branch.logo ?? branch.tenantLogo

  /* WhatsApp & More Share always deliver the same A5 PDF receipt that Print produces. */
  const whatsappShare = () => shareReceiptPdf(t, branch, { whatsapp: true, L })
  const sharePdf = () => shareReceiptPdf(t, branch, { whatsapp: false, L })

  return (
    <div className="mx-auto max-w-md">
      {/* Hero */}
      <div className="relative flex flex-col items-center pt-4 text-center">
        {/* Soft radial glow behind the check */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 h-44 w-64 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-400/10"
        />
        <SuccessMark />
        <motion.h1
          initial={{ opacity: 0, scale: 0.85, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 220, damping: 16 }}
          className="mt-4 text-2xl font-bold sm:text-3xl"
        >
          {L.billPaid}
        </motion.h1>
        <motion.p
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 16 }}
          className="tnum mt-2 text-5xl font-bold text-primary sm:text-6xl"
        >
          {formatINR(t.total)}
        </motion.p>
        <p className="mt-2 text-sm text-muted-foreground">
          {L.paidVia} {methodLabel} · {t.billNo}
        </p>
      </div>

      {/* Offline banner — bill saved on this device, syncing when back online */}
      {pendingSync && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto mt-3 flex max-w-md items-center gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-950/40"
          role="status"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
            <CloudOff className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{L.savedOffline}</p>
            <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/80">
              {L.savedOfflineHint}
            </p>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-amber-700 dark:text-amber-300">
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              className="size-2 rounded-full bg-amber-500"
            />
          </span>
        </motion.div>
      )}

      {/* Receipt card */}
      <div className="print-receipt receipt-teeth mt-6 rounded-xl border bg-card p-5 text-card-foreground shadow-md">
        <div className="flex flex-col items-center text-center">
          {logo && (
             
            <img src={logo} alt="" className="mb-2 size-10 rounded-lg border object-cover" />
          )}
          <p className="text-lg font-bold">{branch.name}</p>
          {branch.tenantName && branch.tenantName !== branch.name && (
            <p className="micro mt-0.5 text-muted-foreground">{branch.tenantName}</p>
          )}
          {branch.address && (
            <p className="mt-0.5 text-xs text-muted-foreground">{branch.address}</p>
          )}
          {branch.phone && (
            <p className="text-xs text-muted-foreground">Phone: {branch.phone}</p>
          )}
        </div>

        <div className="mt-3 border-t border-dashed pt-3 text-center text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">{t.billNo}</p>
          <p>{formatDateTime(t.createdAt)}</p>
          {pendingSync && (
            <p className="mt-1.5 rounded-lg border border-amber-300/70 bg-amber-50 px-2 py-1.5 font-medium text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300">
              {L.provisionalReceipt}
            </p>
          )}
        </div>

        <ul className="mt-3 space-y-1.5 border-t border-dashed pt-3">
          {t.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">
                {item.serviceName} <span className="font-semibold">x{item.qty}</span>
              </span>
              <span className="tnum shrink-0 font-semibold">
                {formatINR(item.price * item.qty)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1.5 border-t border-dashed pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{L.subtotal}</span>
            <span className="tnum font-semibold">{formatINR(t.subtotal)}</span>
          </div>
          {t.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>
                {L.discount}{' '}
                {t.discountFlat
                  ? `(${formatINR(t.discountFlat)})`
                  : `(${t.discountPct}%)`}
              </span>
              <span className="tnum font-semibold">
                -{formatINR(t.discountAmount)}
              </span>
            </div>
          )}
          {t.gstAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({t.gstPct}%)</span>
              <span className="tnum font-semibold">{formatINR(t.gstAmount)}</span>
            </div>
          )}
          {t.tipAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{L.tipLabel}</span>
              <span className="tnum font-semibold text-amber-700 dark:text-amber-400">+{formatINR(t.tipAmount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className="font-bold">{L.total}</span>
            <span className="tnum text-xl font-bold text-primary">
              {formatINR(t.total)}
            </span>
          </div>
          <p className="flex items-center justify-end gap-1.5 pt-1 text-xs font-semibold text-muted-foreground">
            <method.Icon className="size-4" />
            {splitSummary ? `${L.paidViaSplit}: ${splitSummary}` : `${L.paidVia} ${methodLabel}`}
          </p>
          {t.note && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <StickyNote className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">{t.note}</span>
            </p>
          )}
        </div>

        {branch.receiptFooter && (
          <div className="mt-3 border-t border-dashed pt-3 text-center text-xs text-muted-foreground">
            {branch.receiptFooter}
          </div>
        )}
      </div>

      {/* Actions — sharing always hands over the printed-style PDF receipt */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          size="lg"
          className="h-14 bg-emerald-600 text-base font-bold text-white shadow-none hover:bg-emerald-700"
          onClick={whatsappShare}
        >
          <span className="flex flex-col items-center leading-tight">
            <span className="flex items-center gap-2">
              <MessageCircle className="size-5" />
              {L.whatsapp}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-emerald-100/80">
              {L.pdfReceiptLabel}
            </span>
          </span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 text-base font-semibold"
          onClick={sharePdf}
        >
          <span className="flex flex-col items-center leading-tight">
            <span className="flex items-center gap-2">
              <Share2 className="size-5" />
              {L.moreShare}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground/80">
              {L.pdfReceiptLabel}
            </span>
          </span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 text-base font-semibold"
          onClick={() => downloadReceiptPdf(t, branch)}
        >
          <span className="flex flex-col items-center leading-tight">
            <span className="flex items-center gap-2">
              <FileDown className="size-5" />
              {L.downloadPdf}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground/80">
              {t.billNo}
            </span>
          </span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 text-base font-semibold"
          onClick={() => window.print()}
        >
          <span className="flex flex-col items-center leading-tight">
            <span className="flex items-center gap-2">
              <Printer className="size-5" />
              {L.print}
            </span>
            <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground/80">
              {t.billNo}
            </span>
          </span>
        </Button>
      </div>

      <Button
        size="lg"
        className="mt-3 h-14 w-full text-base font-bold"
        onClick={onNewBill}
      >
        {L.newBill}
      </Button>
    </div>
  )
}
