'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Banknote,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  Loader2,
  QrCode,
  Share2,
  ReceiptText,
  TrendingUp,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api-client'
import { formatINR, formatTime, friendlyDate, toDateKey, shiftDateKey } from '@/lib/format'
import type { ShiftReportResponse } from '@/lib/types'
import { useAppStore } from '@/store/use-app-store'
import { canShareFiles } from '@/components/billing/receipt-pdf'
import { shiftReportFile, downloadShiftReportPdf, type ReportContext } from './report-pdf'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

const METHODS = [
  { key: 'CASH', label: 'Cash', icon: Banknote, bar: 'bg-emerald-500' },
  { key: 'UPI', label: 'UPI', icon: QrCode, bar: 'bg-amber-500' },
  { key: 'CARD', label: 'Card', icon: CreditCard, bar: 'bg-rose-400' },
] as const

/**
 * One staff member's day — the numbers they hand over at shift end.
 * `staffId` omitted ⇒ the signed-in user's own shift.
 */
export function ShiftReportDialog({
  staffId,
  staffName,
  open,
  onOpenChange,
}: {
  staffId?: string
  staffName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const user = useAppStore((s) => s.user)
  const [date, setDate] = useState(() => toDateKey(new Date()))
  const today = toDateKey(new Date())

  // Every fresh open (or switching staff member in the Staff view) starts on
  // today — adjusted during render (React's recommended pattern, no effect).
  const sessionKey = open ? (staffId ?? 'me') : null
  const [prevSession, setPrevSession] = useState<string | null>(sessionKey)
  if (sessionKey !== prevSession) {
    setPrevSession(sessionKey)
    if (sessionKey !== null) setDate(toDateKey(new Date()))
  }

  const shiftQ = useQuery({
    queryKey: ['shift-report', staffId ?? 'me', date],
    queryFn: () =>
      apiGet<ShiftReportResponse>(
        `/api/staff/shift?date=${date}${staffId ? `&staffId=${staffId}` : ''}`,
      ),
    enabled: open,
    staleTime: 10_000,
  })

  const shift = shiftQ.data
  const ctx: ReportContext = {
    name: user?.tenantName ?? 'SaloonX',
    logo: user?.tenantLogo ?? null,
    tenantName: null,
  }

  function sharePdf() {
    if (!shift) return
    const file = shiftReportFile(shift, ctx)
    if (canShareFiles(file) && typeof navigator.share === 'function') {
      void navigator
        .share({
          files: [file],
          title: `Shift — ${shift.staff.name}`,
          text: `${shift.staff.name}'s shift on ${shift.date}: ${shift.summary.bills} bills, ${formatINR(shift.summary.revenue)} collected.`,
        })
        .catch(() => undefined)
      return
    }
    downloadShiftReportPdf(shift, ctx)
    toast.success('Shift report downloaded', {
      description: 'Send it to the branch owner for the handover.',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg border bg-primary/5 text-primary">
              <Clock3 className="size-4" aria-hidden />
            </span>
            Shift handover
          </DialogTitle>
          <DialogDescription>
            {(shift?.staff.name ?? staffName ?? 'Your')} day at {user?.tenantName ?? 'the salon'} — numbers to hand over.
          </DialogDescription>
        </DialogHeader>

        {/* Date stepper — flip through days to review a past shift (or today's so far) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setDate((d) => shiftDateKey(d, -1))}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <div className="relative flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate text-sm font-semibold">{friendlyDate(date)}</span>
            {date !== today && (
              <button
                type="button"
                onClick={() => setDate(today)}
                className="micro shrink-0 rounded-md border bg-primary/5 px-1.5 py-0.5 text-primary transition-colors hover:bg-primary/10"
              >
                Back to today
              </button>
            )}
            <span className="sr-only">Shift date</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value)
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Pick a date"
            />
          </div>
          <button
            type="button"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate((d) => shiftDateKey(d, 1))}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>

        {shiftQ.isPending ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-10 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : shiftQ.isError ? (
          <div className="rounded-xl border bg-destructive/10 p-4 text-sm text-destructive">
            {(shiftQ.error as Error).message}
          </div>
        ) : !shift ? null : shift.summary.bills === 0 ? (
          <div className="space-y-4">
            <div className="hairline rounded-xl bg-card p-8 text-center">
              <ReceiptText className="mx-auto size-10 text-muted-foreground/50" aria-hidden />
              <p className="mt-3 font-semibold">No bills — {friendlyDate(date)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(shift.staff.name.split(' ')[0] ?? 'Their')} shift report for {friendlyDate(date)} appears here after the first bill.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Headline numbers */}
            <div className="grid grid-cols-3 gap-2">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0 }}
                className="rounded-xl border border-emerald-300/60 bg-emerald-50/80 p-3 dark:border-emerald-900 dark:bg-emerald-950/40"
              >
                <p className="micro text-emerald-700 dark:text-emerald-400">Cash to hand over</p>
                <p className="tnum mt-1 text-lg font-bold text-emerald-800 dark:text-emerald-300">
                  {formatINR(shift.summary.cashCollected)}
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="hairline rounded-xl bg-card p-3"
              >
                <p className="micro text-muted-foreground">Collected</p>
                <p className="tnum mt-1 text-lg font-bold">{formatINR(shift.summary.revenue)}</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="hairline rounded-xl bg-card p-3"
              >
                <p className="micro text-muted-foreground">
                  {shift.staff.commissionPct > 0 ? 'Commission' : 'Bills'}
                </p>
                <p className="tnum mt-1 text-lg font-bold">
                  {shift.staff.commissionPct > 0 ? formatINR(shift.summary.commission) : shift.summary.bills}
                </p>
                {shift.staff.commissionPct > 0 && (
                  <p className="tnum text-[10px] text-muted-foreground">
                    {shift.staff.commissionPct}% · {shift.summary.bills} bills
                  </p>
                )}
              </motion.div>
            </div>

            {/* Payment split */}
            <div className="hairline space-y-2.5 rounded-xl bg-card p-3.5">
              <p className="micro text-muted-foreground">Payment split</p>
              {METHODS.map(({ key, label, icon: Icon, bar }) => {
                const split = shift.summary.byPayment[key]
                const pct = shift.summary.revenue > 0 ? Math.round((split.amount / shift.summary.revenue) * 100) : 0
                return (
                  <div key={key} className="flex items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-medium">
                          {label} <span className="text-muted-foreground">· {split.count}</span>
                        </p>
                        <p className="tnum text-xs font-semibold">{formatINR(split.amount)}</p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          className={bar}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <TrendingUp className="size-3.5" aria-hidden /> Avg bill {formatINR(shift.summary.avgBill)}
                </span>
                {shift.summary.discounts > 0 && (
                  <span className="tnum">Discounts {formatINR(shift.summary.discounts)}</span>
                )}
              </div>
            </div>

            {/* Bill list */}
            <div className="hairline overflow-hidden rounded-xl bg-card">
              <p className="micro border-b bg-muted/40 px-3.5 py-2 text-muted-foreground">
                Bills ·{' '}
                {shift.summary.firstBillAt && shift.summary.lastBillAt
                  ? `${formatTime(shift.summary.firstBillAt)}–${formatTime(shift.summary.lastBillAt)}`
                  : friendlyDate(date)}
              </p>
              <ul className="max-h-64 divide-y overflow-y-auto">
                {shift.bills.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="tnum min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{b.billNo}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {formatTime(b.createdAt)} · {b.customerName || b.customerMobile || 'Walk-in'}
                        {b.branchName.includes('—') ? ` · ${b.branchName.split('—')[1].trim()}` : ''}
                      </span>
                    </span>
                    <span className="micro rounded-md border bg-background px-1.5 py-0.5 text-muted-foreground">
                      {b.paymentMethod}
                    </span>
                    <span className="tnum text-sm font-bold">{formatINR(b.total)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button className="flex-1 gap-2" onClick={() => sharePdf()}>
                <Share2 className="size-4" aria-hidden />
                Share PDF
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => downloadShiftReportPdf(shift, ctx)}
                aria-label="Download shift report PDF"
              >
                <Download className="size-4" aria-hidden />
                Download
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <Users className="size-3" aria-hidden />
              The manager signs the printed copy when the cash is handed over.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
