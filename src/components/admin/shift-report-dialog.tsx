'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Banknote,
  CalendarDays,
  ChevronDown,
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
import {
  shiftReportFile,
  downloadShiftReportPdf,
  type ReportContext,
  type ShiftTillCount,
} from './report-pdf'
import { cn } from '@/lib/utils'
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

/* ── Till-count denomination calculator ────────────────────────────────────
 * Staff count the cash drawer at end-of-shift. This grid lets them punch in
 * the number of each note/coin they're holding; the running sum is compared
 * to the day's `cashCollected` so they can spot a shortfall or surplus
 * before the manager signs off the handover.
 *
 * The counts live in the DIALOG (lifted state) so the share/download actions
 * can print them on the handover PDF; today's count is mirrored to
 * localStorage so closing the dialog (or a mid-count reload) never loses it.
 */
const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const

type TillCounts = Record<number, string>

function emptyTillCounts(): TillCounts {
  const seed: TillCounts = {}
  for (const d of DENOMINATIONS) seed[d] = ''
  return seed
}

/** localStorage key — one snapshot per staff member per day. */
function tillStorageKey(staffKey: string, date: string): string {
  return `sx-till-${staffKey}-${date}`
}

/** Same-day snapshot for this staff member + day, or an empty grid. Corrupted
 *  or foreign payloads fall back to empty — the count is always re-enterable. */
function loadTillCounts(staffKey: string, date: string): TillCounts {
  const seed = emptyTillCounts()
  if (typeof window === 'undefined') return seed
  try {
    const raw = window.localStorage.getItem(tillStorageKey(staffKey, date))
    if (!raw) return seed
    const parsed = JSON.parse(raw) as { counts?: Record<string, unknown> } | null
    if (!parsed || typeof parsed !== 'object' || !parsed.counts) return seed
    for (const d of DENOMINATIONS) {
      const v = parsed.counts[String(d)]
      if (typeof v === 'string' && /^\d{0,5}$/.test(v)) seed[d] = v
    }
  } catch {
    // corrupted snapshot — start clean
  }
  return seed
}

/** Persist today's grid + purge this staff member's stale-day snapshots, so
 *  storage never accumulates and yesterday's count can never bleed into a new
 *  day (the date is part of the key — only the same day ever restores). */
function saveTillCounts(staffKey: string, date: string, counts: TillCounts): void {
  if (typeof window === 'undefined') return
  try {
    const key = tillStorageKey(staffKey, date)
    const prefix = `sx-till-${staffKey}-`
    const stale: string[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix) && k !== key) stale.push(k)
    }
    for (const k of stale) window.localStorage.removeItem(k)
    window.localStorage.setItem(key, JSON.stringify({ counts }))
  } catch {
    // storage blocked/full — the in-memory count still prints on the PDF
  }
}

function formatDenom(d: number): string {
  // ₹2000 → "₹2000", ₹5 → "₹5"
  return `₹${d}`
}

function TillCountCard({
  expectedCash,
  counts,
  onSetCount,
}: {
  expectedCash: number
  counts: TillCounts
  onSetCount: (d: number, v: string) => void
}) {
  const [open, setOpen] = useState(false)

  const countedTotal = useMemo(
    () =>
      DENOMINATIONS.reduce((sum, d) => {
        const n = Number(counts[d] || 0)
        return Number.isFinite(n) ? sum + n * d : sum
      }, 0),
    [counts],
  )

  const delta = countedTotal - expectedCash
  const deltaState =
    Math.abs(delta) < 0.005 ? 'match' : delta > 0 ? 'surplus' : 'shortfall'

  const totalNotes = DENOMINATIONS.reduce(
    (n, d) => n + (Number(counts[d] || 0) || 0),
    0,
  )

  return (
    <div className="hairline overflow-hidden rounded-xl bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <Banknote className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Count the till</p>
          <p className="text-[11px] text-muted-foreground">
            Tally your notes & coins · expected {formatINR(expectedCash)}
          </p>
        </div>
        {open && (
          <span
            className={cn(
              'tnum shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold',
              deltaState === 'match' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
              deltaState === 'surplus' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
              deltaState === 'shortfall' && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
            )}
          >
            {deltaState === 'match'
              ? '✓ match'
              : `${delta > 0 ? '+' : '−'}${formatINR(Math.abs(delta))}`}
          </span>
        )}
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="border-t bg-muted/30 px-3.5 py-3"
        >
          <div className="grid grid-cols-2 gap-1.5">
            {DENOMINATIONS.map((d) => (
              <label
                key={d}
                className="flex min-h-11 items-center justify-between gap-1.5 rounded-lg border bg-card px-2.5 py-2"
              >
                <span className="tnum text-xs font-semibold">{formatDenom(d)}</span>
                <span className="text-[10px] text-muted-foreground">×</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={counts[d]}
                  onChange={(e) => onSetCount(d, e.target.value)}
                  placeholder="0"
                  aria-label={`Count of ${formatDenom(d)} notes or coins`}
                  className="tnum h-8 w-14 rounded-md border bg-background px-1.5 text-right text-xs font-semibold focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                />
              </label>
            ))}
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t pt-2 text-xs">
            <span className="text-muted-foreground">
              Counted total
              {totalNotes > 0 && (
                <span className="ml-1.5 text-[10px]">· {totalNotes} notes/coins</span>
              )}
            </span>
            <span className="tnum font-bold">{formatINR(countedTotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Expected (from cash bills)</span>
            <span className="tnum text-muted-foreground">{formatINR(expectedCash)}</span>
          </div>
          <div
            className={cn(
              'mt-2 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold',
              deltaState === 'match' && 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
              deltaState === 'surplus' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
              deltaState === 'shortfall' && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
            )}
          >
            <span>{deltaState === 'match' ? 'Till balances' : deltaState === 'surplus' ? 'Surplus' : 'Shortfall'}</span>
            <span className="tnum">
              {deltaState === 'match'
                ? formatINR(0)
                : `${delta > 0 ? '+' : '−'}${formatINR(Math.abs(delta))}`}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
            Tip: leave the count blank for denominations you don’t have. The manager signs the printed
            PDF only when the till is balanced or the difference is explained.
          </p>
        </motion.div>
      )}
    </div>
  )
}

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

  // Till-count grid — lifted state, shared by the on-screen card AND the PDF
  // actions below. One snapshot per staff member per day: the viewed staff
  // member's id, falling back to the signed-in user's own id (self dialog).
  const tillStaffKey = staffId ?? user?.id ?? 'me'
  const [tillCounts, setTillCounts] = useState<TillCounts>(emptyTillCounts)

  // Re-seed the grid whenever the staff member or the viewed day changes
  // (React's adjust-during-render pattern — same as the date reset above).
  // Only the SAME DAY restores: the storage key carries the date and the
  // purge in saveTillCounts() removes other days, so reviewing a past day or
  // opening the dialog on a new day always starts with an empty grid.
  const tillSeedKey = `${tillStaffKey}|${date}`
  const [tillSeeded, setTillSeeded] = useState<string | null>(null)
  if (tillSeeded !== tillSeedKey) {
    setTillSeeded(tillSeedKey)
    setTillCounts(date === today ? loadTillCounts(tillStaffKey, date) : emptyTillCounts())
  }

  function setTillCount(d: number, v: string) {
    // Whole-number, non-negative only. Coins allow zero, blanks are empty.
    const clean = v.replace(/[^\d]/g, '').slice(0, 5)
    const next = { ...tillCounts, [d]: clean }
    setTillCounts(next)
    // Only the CURRENT day's count is persisted — past-day reviews stay transient.
    if (date === today) saveTillCounts(tillStaffKey, date, next)
  }

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

  // The PDF payload — only when at least one denomination was counted, so an
  // untouched grid never prints a misleading "₹0 in drawer" shortfall.
  const till = useMemo<ShiftTillCount | undefined>(() => {
    const numeric: Record<number, number> = {}
    let counted = 0
    let any = false
    for (const d of DENOMINATIONS) {
      const n = Number(tillCounts[d] || 0) || 0
      if (n > 0) {
        numeric[d] = n
        counted += n * d
        any = true
      }
    }
    if (!any || !shift) return undefined
    return {
      counts: numeric,
      expected: shift.summary.cashCollected,
      counted,
      delta: Math.round((counted - shift.summary.cashCollected) * 100) / 100,
    }
  }, [tillCounts, shift])

  function sharePdf() {
    if (!shift) return
    const file = shiftReportFile(shift, ctx, till)
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
    downloadShiftReportPdf(shift, ctx, till)
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
          /* min-w-0: the bill rows carry nowrap truncate text — without it
             their intrinsic min-content forces a horizontal overflow inside
             DialogContent on 360px phones. */
          <div className="min-w-0 space-y-4">
            {/* Headline numbers. 2-up on phones (hero spans both): three
                equal cols leave ~74px per card — too narrow for amounts like
                ₹11,759.16, which painted 25px into the neighbouring card. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0 }}
                className="col-span-2 rounded-xl border border-emerald-300/60 bg-emerald-50/80 p-3 sm:col-span-1 dark:border-emerald-900 dark:bg-emerald-950/40"
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

            {/* Till-count denomination calculator (collapsible).
                 Staff count their drawer before handing over — the delta vs
                 expected cash highlights any shortfall/surplus up front. The
                 counts print on the PDF (see `till` above) and today's grid
                 survives a dialog close/reopen. */}
            <TillCountCard
              expectedCash={shift.summary.cashCollected}
              counts={tillCounts}
              onSetCount={setTillCount}
            />

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
                onClick={() => downloadShiftReportPdf(shift, ctx, till)}
                aria-label="Download shift report PDF"
              >
                <Download className="size-4" aria-hidden />
                Download
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
              <Users className="size-3" aria-hidden />
              {till
                ? 'The till count and signature lines print on the PDF — count the drawer before sharing.'
                : 'The manager signs the printed copy when the cash is handed over.'}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
