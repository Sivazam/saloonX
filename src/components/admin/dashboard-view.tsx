'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowRight,
  BadgePercent,
  Building2,
  Cake,
  Check,
  FileText,
  MessageCircle,
  ReceiptText,
  Sparkles,
  TrendingUp,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { apiGet, apiPut } from '@/lib/api-client'
import { formatINR, formatDate, formatTime } from '@/lib/format'
import type {
  BirthdayCustomerDTO,
  BranchProfileDTO,
  HoursStatsResponse,
  MethodSummary,
  MonthlyStatDTO,
  MonthlyStatsResponse,
  PaymentMethod,
  StatsResponse,
  TransactionDTO,
  TransactionsResponse,
} from '@/lib/types'
import { useAppStore } from '@/store/use-app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { canShareFiles } from '@/components/billing/receipt-pdf'
import { EmptyState, METHOD_META, MethodBadge, formatAxisINR, initials, parseDateKey } from './ui-atoms'
import { RangePicker, computePreset, detectPreset, type DateRange } from './range-picker'
import { downloadSummaryReportPdf, summaryReportFile, type ReportContext } from './report-pdf'
import { BusyHoursCard } from './busy-hours-card'
import { BirthdayCampaignCard } from './birthday-campaign-card'
import { BranchInsightsCard } from './branch-insights-card'
import type { BirthdayCampaignResponse, BranchCompareResponse } from '@/lib/types'

const DAY_MS = 86_400_000
const RANK_BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

const formatCount = (n: number) => Math.round(n).toLocaleString('en-IN')

const round2 = (n: number) => Math.round(n * 100) / 100

const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

const PRESET_LABEL: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
}

/* ── Animated number (framer-motion value rendered as text) ──────────────── */

function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, format)
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: 'easeOut' })
    return () => controls.stop()
  }, [mv, value])
  return <motion.span>{text}</motion.span>
}

/* ── KPI cards ───────────────────────────────────────────────────────────── */

function KpiCard({
  label,
  sub,
  value,
  format,
  icon: Icon,
  chipClass,
  index,
}: {
  label: string
  sub: string
  value: number
  format: (n: number) => string
  icon: LucideIcon
  chipClass: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.3 }}
      className="hairline rounded-xl bg-card p-4 lg:p-5"
    >
      <div className="flex items-center gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', chipClass)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <p className="micro text-muted-foreground">{label}</p>
      </div>
      <p className="tnum mt-3 text-xl font-bold tracking-tight sm:text-2xl lg:text-[1.65rem]">
        <CountUp value={value} format={format} />
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </motion.div>
  )
}

/* ── Payment split ──────────────────────────────────────────────────────── */

function PaymentSplitCard({
  byMethod,
  total,
}: {
  byMethod: Record<PaymentMethod, MethodSummary>
  total: number
}) {
  const methods: PaymentMethod[] = ['CASH', 'UPI', 'CARD']
  return (
    <div className="hairline rounded-xl bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Payment Split</h2>
        <span className="tnum text-xs text-muted-foreground">{formatINR(total)} total</span>
      </div>
      <div className="mt-4 space-y-4">
        {methods.map((m, i) => {
          const { amount, count } = byMethod[m]
          const meta = METHOD_META[m]
          const Icon = meta.icon
          const pct = total > 0 ? Math.round((amount / total) * 100) : 0
          return (
            <div key={m}>
              <div className="flex items-center gap-2.5">
                <span className={cn('flex size-8 items-center justify-center rounded-lg', meta.chipClass)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="text-sm font-medium">{meta.label}</span>
                <span className="tnum ml-auto text-sm font-bold">{formatINR(amount)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, delay: 0.15 + i * 0.1, ease: 'easeOut' }}
                    className={cn('h-full rounded-full', meta.barClass)}
                  />
                </div>
                <span className="tnum w-[4.5rem] shrink-0 text-right text-[11px] text-muted-foreground">
                  {count} bills · {pct}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Per-branch breakdown (franchise-wide scope only) ───────────────────── */

function BranchSplitCard({ byBranch }: { byBranch: StatsResponse['byBranch'] }) {
  const max = byBranch[0]?.revenue || 1
  return (
    <div className="hairline rounded-xl bg-card p-4 lg:p-5">
      <div className="flex items-center gap-2">
        <Building2 className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold">Branches</h2>
        <span className="micro ml-auto text-muted-foreground">{byBranch.length} active</span>
      </div>
      <ul className="mt-4 space-y-3.5">
        {byBranch.map((b, i) => {
          const short = b.name.split('—')[1]?.trim() || b.name
          const pct = Math.max(4, Math.round((b.revenue / max) * 100))
          return (
            <li key={b.branchId}>
              <div className="flex items-center gap-2.5">
                <p className="min-w-0 flex-1 truncate text-sm font-medium" title={b.name}>
                  {short}
                </p>
                <p className="tnum shrink-0 text-xs text-muted-foreground">{b.bills} bills</p>
                <p className="tnum shrink-0 text-sm font-bold">{formatINR(b.revenue)}</p>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: RANK_BAR_COLORS[i % RANK_BAR_COLORS.length] }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ── Monthly profit trend (6 months) ───────────────────────────────────── */

interface TrendTipProps {
  active?: boolean
  label?: string
  payload?: { dataKey?: string; value?: number }[]
}

function TrendTooltip({ active, payload, label }: TrendTipProps) {
  if (!active || !payload?.length) return null
  const get = (key: string) => payload.find((p) => p.dataKey === key)?.value ?? 0
  const profit = get('profit')
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs font-semibold">{label}</p>
      <p className="tnum mt-1 text-[11px]">
        <span className="text-muted-foreground">Revenue </span>
        <span className="font-semibold">{formatINR(get('revenue'))}</span>
      </p>
      <p className="tnum text-[11px]">
        <span className="text-muted-foreground">Expenses </span>
        <span className="font-semibold">{formatINR(get('expenses'))}</span>
      </p>
      <p className="tnum text-[11px]">
        <span className="text-muted-foreground">Profit </span>
        <span className={cn('font-bold', profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
          {formatINR(profit)}
        </span>
      </p>
    </div>
  )
}

function ProfitTrendCard({ months, loading }: { months: MonthlyStatDTO[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="hairline rounded-xl bg-card p-4 lg:p-5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-3 h-64" />
      </div>
    )
  }
  const totalProfit = months.reduce((s, m) => s + m.profit, 0)
  const avgProfit = months.length > 0 ? totalProfit / months.length : 0
  const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }
  return (
    <section className="hairline rounded-xl bg-card p-4 lg:p-5" aria-label="Profit trend by month">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Profit trend</h2>
          <p className="micro text-muted-foreground">last {months.length} months · revenue vs expenses</p>
        </div>
        {/* Mobile: the avg-profit pill and the legend WRAP onto separate rows
            instead of forcing a 380px+ header (page overflow at 390px). */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="tnum shrink-0 rounded-full border bg-background px-2.5 py-1 text-[11px] font-semibold">
            Avg profit <span className={avgProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{formatINR(avgProfit)}</span>
            <span className="text-muted-foreground">/mo</span>
          </span>
          <span className="micro flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-1)]" aria-hidden />Revenue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-[var(--chart-2)]" aria-hidden />Expenses
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded-full bg-[var(--chart-3)]" aria-hidden />Profit
            </span>
          </span>
        </div>
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} tickFormatter={formatAxisINR} />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
            <Bar dataKey="revenue" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Bar dataKey="expenses" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={22} />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="var(--chart-3)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: 'var(--chart-3)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/* ── Revenue chart ──────────────────────────────────────────────────────── */

interface ChartTipProps {
  active?: boolean
  label?: string
  payload?: { value?: number; payload?: { bills: number } }[]
}

function ChartTooltip({ active, payload, label }: ChartTipProps) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-xs font-semibold">{label}</p>
      <p className="tnum text-sm font-bold text-rose-600 dark:text-rose-400">
        {formatINR(point.value ?? 0)}
      </p>
      <p className="tnum text-[11px] text-muted-foreground">{point.payload?.bills ?? 0} bills</p>
    </div>
  )
}

function RevenueChart({ daily, useBars }: { daily: StatsResponse['daily']; useBars: boolean }) {
  const data = useMemo(
    () => daily.map((d) => ({ ...d, day: dayFmt.format(parseDateKey(d.date)) })),
    [daily],
  )
  const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }
  return (
    <div className="hairline h-full rounded-xl bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Revenue</h2>
        <span className="micro text-muted-foreground">by day</span>
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          {useBars ? (
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={38} tickFormatter={formatAxisINR} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
              <Bar dataKey="revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="day"
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={38} tickFormatter={formatAxisINR} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                fill="url(#revGradient)"
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ── Top services / staff performance ────────────────────────────────────── */

function TopServicesCard({ top }: { top: StatsResponse['topServices'] }) {
  const max = top[0]?.revenue || 1
  return (
    <div className="hairline rounded-xl bg-card p-4 lg:p-5">
      <h2 className="text-sm font-semibold">Top Services</h2>
      {top.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No services sold"
          hint="No billable services in this range yet."
          className="py-8"
        />
      ) : (
        <ul className="mt-4 space-y-4">
          {top.map((s, i) => (
            <li key={s.name}>
              <div className="flex items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="tnum text-xs text-muted-foreground">{s.count} sold</p>
                </div>
                <p className="tnum text-sm font-bold">{formatINR(s.revenue)}</p>
              </div>
              <div className="mt-1.5 ml-[34px] h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(4, Math.round((s.revenue / max) * 100))}%` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: RANK_BAR_COLORS[i % RANK_BAR_COLORS.length] }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StaffPerformanceCard({ top }: { top: StatsResponse['topStaff'] }) {
  const totalCommission = top.reduce((a, s) => a + s.commission, 0)
  const anyCommission = top.some((s) => s.commissionPct > 0)
  return (
    <div className="hairline rounded-xl bg-card p-4 lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Staff Performance</h2>
        {anyCommission && (
          <Badge className="tnum gap-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-950">
            <BadgePercent className="size-3" aria-hidden />
            Commission {formatINR(totalCommission)}
          </Badge>
        )}
      </div>
      {top.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No staff activity"
          hint="No bills were created by staff in this range."
          className="py-8"
        />
      ) : (
        <ul className="mt-4 space-y-4">
          {top.map((s) => (
            <li key={s.userId} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-secondary text-xs font-bold text-secondary-foreground"
              >
                {initials(s.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="tnum text-xs text-muted-foreground">
                  {s.bills} {s.bills === 1 ? 'bill' : 'bills'}
                  {s.commissionPct > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {' · '}{s.commissionPct}% commission
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tnum text-sm font-bold">{formatINR(s.revenue)}</p>
                {s.commission > 0 && (
                  <p className="tnum text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    +{formatINR(s.commission)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {anyCommission && (
        <p className="mt-4 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Commission is calculated on the selected range's revenue at each staff member's current rate.
        </p>
      )}
    </div>
  )
}

/* ── Birthday reminders ─────────────────────────────────────────────────── */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "MM-DD" → "14 Mar" */
function formatBirthday(mmdd: string): string {
  const [mm, dd] = mmdd.split('-').map(Number)
  return `${dd} ${MONTH_SHORT[mm - 1] ?? ''}`.trim()
}

function BirthdayGreetingButton({ c, tenantName }: { c: BirthdayCustomerDTO; tenantName: string }) {
  const first = (c.name ?? 'there').split(' ')[0]
  const queryClient = useQueryClient()
  const [justWished, setJustWished] = useState(false)
  const when =
    c.daysUntil === 0 ? 'today' : c.daysUntil === 1 ? 'tomorrow' : `on ${formatBirthday(c.birthday ?? '')}`
  const message =
    c.daysUntil === 0
      ? `Happy Birthday, ${first}! 🎂 Wishing you a wonderful year ahead. Celebrate with a pampering session at ${tenantName} — a little birthday treat awaits you!`
      : `Namaste ${first}! 🎉 Your birthday is ${when}! Treat yourself at ${tenantName} — come celebrate with us and enjoy a little birthday surprise. See you soon!`

  // A wish "counts" as sent for two weeks (covers early wishes for the
  // upcoming birthday) — then the button invites a fresh one.
  const wishedRecently =
    justWished ||
    (c.lastWishAt ? Date.now() - new Date(c.lastWishAt).getTime() < 14 * 24 * 60 * 60 * 1000 : false)

  function wish() {
    window.open(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
    // Campaign tracking — fire-and-forget, never blocks the WhatsApp tab.
    setJustWished(true)
    void apiPut(`/api/customers/${c.id}`, { wishSent: true })
      .then(() => queryClient.invalidateQueries({ queryKey: ['birthdays'] }))
      .catch(() => undefined)
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={wish}
      aria-label={
        wishedRecently
          ? `Birthday wish already sent to ${c.name ?? c.mobile} — send again on WhatsApp`
          : `Send birthday wishes to ${c.name ?? c.mobile} on WhatsApp`
      }
      className={
        wishedRecently
          ? 'h-8 gap-1.5 border-emerald-300/70 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/70'
          : 'h-8 gap-1.5 border-emerald-300/70 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70'
      }
    >
      {wishedRecently ? <Check className="size-3.5" aria-hidden /> : <MessageCircle className="size-3.5" aria-hidden />}
      {wishedRecently ? 'Wished' : 'Wish'}
    </Button>
  )
}

function BirthdaysCard({
  customers,
  loading,
  tenantName,
  onManage,
}: {
  customers: BirthdayCustomerDTO[]
  loading: boolean
  tenantName: string
  onManage: () => void
}) {
  return (
    <section className="hairline overflow-hidden rounded-xl bg-card" aria-label="Upcoming birthdays">
      <header className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg border border-rose-200/70 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <Cake className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-tight">Birthdays this week</h3>
          <p className="text-xs text-muted-foreground">
            {customers.length > 0
              ? `${customers.length} customer${customers.length === 1 ? '' : 's'} celebrating — send them a wish, win the visit.`
              : 'No birthdays in the next 7 days.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={onManage}>
          Customers
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      </header>

      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Add birthdays from the Customers view to get reminder lists here. 🎈
        </p>
      ) : (
        <ul className="max-h-64 divide-y overflow-y-auto">
          {customers.map((c, i) => (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.18 }}
              className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 flex-col items-center justify-center rounded-lg border text-[10px] font-bold leading-none',
                  c.daysUntil === 0
                    ? 'border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'
                    : 'bg-background text-muted-foreground',
                )}
              >
                <span className="tnum text-[13px]">{c.birthday?.slice(3)}</span>
                <span className="micro">{c.birthday ? MONTH_SHORT[Number(c.birthday.slice(0, 2)) - 1] : ''}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {c.name ?? '—'}
                  {c.daysUntil === 0 && (
                    <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                      TODAY 🎉
                    </span>
                  )}
                </p>
                <p className="tnum truncate text-[11px] text-muted-foreground">
                  +91 {c.mobile}
                  {c.daysUntil > 0 && ` · in ${c.daysUntil}d`}
                  {c.homeBranchName ? ` · ${c.homeBranchName.split('—')[1]?.trim() || c.homeBranchName}` : ''}
                </p>
              </div>
              <BirthdayGreetingButton c={c} tenantName={tenantName} />
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ── Recent bills ───────────────────────────────────────────────────────── */

function RecentBillsCard({
  bills,
  loading,
  showBranch,
  onViewAll,
}: {
  bills: TransactionDTO[]
  loading: boolean
  showBranch: boolean
  onViewAll: () => void
}) {
  return (
    <div className="hairline mt-4 rounded-xl bg-card shadow-sm">
      <div className="flex items-center justify-between px-4 py-3.5 lg:px-5">
        <h2 className="text-sm font-semibold">Recent Bills</h2>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          View all
          <ArrowRight aria-hidden />
        </Button>
      </div>
      <div className="divide-y border-t">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 lg:px-5">
              <Skeleton className="h-4 w-14 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-14 shrink-0" />
            </div>
          ))
        ) : bills.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No bills in this range"
            hint="Create a bill from the Billing tab and it will show up here."
          />
        ) : (
          bills.map((t) => (
            <div
              key={t.id}
              className={cn('flex items-center gap-3 px-4 py-2.5 lg:px-5', t.status === 'VOIDED' && 'opacity-60')}
            >
              <p className="tnum w-[4.6rem] shrink-0 text-sm font-semibold">{t.billNo}</p>
              {showBranch && (
                <p className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground md:block" title={t.branchName}>
                  {t.branchName.split('—')[1]?.trim() || t.branchName}
                </p>
              )}
              <p className="hidden w-14 shrink-0 text-xs text-muted-foreground sm:block">
                {formatTime(t.createdAt)}
              </p>
              <p className="min-w-0 flex-1 truncate text-sm">
                {t.customerName || t.customerMobile || (
                  <span className="italic text-muted-foreground">Walk-in</span>
                )}
              </p>
              <div className="flex shrink-0 items-center gap-1.5">
                <MethodBadge method={t.paymentMethod} />
                {t.status === 'VOIDED' && (
                  <Badge className="border-transparent bg-red-100 text-[10px] text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-950">
                    Voided
                  </Badge>
                )}
              </div>
              <p
                className={cn(
                  'tnum w-20 shrink-0 text-right text-sm font-bold',
                  t.status === 'VOIDED' && 'text-muted-foreground line-through',
                )}
              >
                {formatINR(t.total)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ── P&L strip: revenue − expenses = net profit ─────────────────────────── */

function ProfitStrip({
  revenue,
  expenses,
  onManageExpenses,
}: {
  revenue: number
  expenses: { total: number; count: number; byCategory: Record<string, { amount: number; count: number }> }
  onManageExpenses: () => void
}) {
  const profit = round2(revenue - expenses.total)
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0
  const cats = Object.entries(expenses.byCategory).sort((a, b) => b[1].amount - a[1].amount).slice(0, 4)
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3 }}
      className="hairline mt-4 rounded-xl bg-card p-4 lg:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="size-4 text-primary" aria-hidden />
          Profit & Loss
        </h2>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={onManageExpenses}>
          <ReceiptText className="size-3.5" aria-hidden />
          Manage Expenses
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-3 items-center gap-2 sm:gap-4">
        <div>
          <p className="micro text-muted-foreground">Revenue</p>
          <p className="tnum mt-0.5 text-base font-bold sm:text-xl">{formatINR(revenue)}</p>
        </div>
        <div className="text-center">
          <p className="micro text-muted-foreground">Expenses</p>
          <p className="tnum mt-0.5 text-base font-bold text-rose-600 sm:text-xl dark:text-rose-400">
            −{formatINR(expenses.total)}
          </p>
        </div>
        <div className="text-right">
          <p className="micro text-muted-foreground">Net Profit</p>
          <p
            className={`tnum mt-0.5 text-base font-bold sm:text-xl ${
              profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
            }`}
          >
            {formatINR(profit)}
          </p>
        </div>
      </div>
      {/* Expense share of revenue bar */}
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        {expenses.total > 0 && revenue > 0 && (
          <div
            className="h-full bg-rose-500/70"
            style={{ width: `${Math.min(96, Math.round((expenses.total / revenue) * 100))}%` }}
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span>
          Margin:{' '}
          <span className={`tnum font-bold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {margin}%
          </span>
        </span>
        {cats.map(([cat, v]) => (
          <span key={cat} className="tnum flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-rose-500/60" aria-hidden />
            {cat.charAt(0) + cat.slice(1).toLowerCase()} {formatINR(v.amount)}
          </span>
        ))}
        {expenses.count === 0 && (
          <span className="italic">
            No expenses logged yet — add rent, supplies & salaries for a true profit line.
          </span>
        )}
      </div>
    </motion.div>
  )
}

/* ── View ──────────────────────────────────────────────────────────────── */

export default function DashboardView() {
  const setView = useAppStore((s) => s.setView)
  const user = useAppStore((s) => s.user)
  const scopeBranches = useAppStore((s) => s.branches)
  const [range, setRange] = useState<DateRange>(() => computePreset('7d'))
  /** null = whole franchise; otherwise a branchId from scopeBranches. */
  const [branchScope, setBranchScope] = useState<string | null>(null)

  const scopeParam = branchScope ? `&branchId=${branchScope}` : ''
  const statsQ = useQuery({
    queryKey: ['stats', range.from, range.to, branchScope ?? 'all'],
    queryFn: () => apiGet<StatsResponse>(`/api/stats?from=${range.from}&to=${range.to}${scopeParam}`),
  })
  const branchQ = useQuery({
    queryKey: ['branch'],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>('/api/branch'),
  })
  const recentQ = useQuery({
    queryKey: ['recent-bills', range.from, range.to, branchScope ?? 'all'],
    queryFn: () =>
      apiGet<TransactionsResponse>(
        `/api/transactions?from=${range.from}&to=${range.to}${scopeParam}&page=1&limit=5`,
      ),
  })
  const birthdaysQ = useQuery({
    queryKey: ['birthdays'],
    queryFn: () => apiGet<{ customers: BirthdayCustomerDTO[] }>('/api/customers?birthdaysWithin=7'),
  })
  const monthlyQ = useQuery({
    queryKey: ['stats-monthly', branchScope ?? 'all'],
    queryFn: () => apiGet<MonthlyStatsResponse>(`/api/stats/monthly?months=6${scopeParam}`),
  })
  const hoursQ = useQuery({
    queryKey: ['stats-hours', range.from, range.to, branchScope ?? 'all'],
    queryFn: () => apiGet<HoursStatsResponse>(`/api/stats/hours?from=${range.from}&to=${range.to}${scopeParam}`),
  })
  // Birthday-campaign funnel — franchise-wide marketing view, own cache key
  // (independent of the branch scope chips: customers are franchise-wide).
  const campaignQ = useQuery({
    queryKey: ['stats-birthdays', '6m'],
    queryFn: () => apiGet<BirthdayCampaignResponse>('/api/stats/birthdays?months=6'),
  })
  // Branch league table — only meaningful across the whole franchise.
  const compareQ = useQuery({
    queryKey: ['stats-branches-compare', range.from, range.to],
    enabled: !branchScope,
    queryFn: () => apiGet<BranchCompareResponse>(`/api/stats/branches-compare?from=${range.from}&to=${range.to}`),
  })

  const rangeDays = useMemo(
    () => Math.round((parseDateKey(range.to).getTime() - parseDateKey(range.from).getTime()) / DAY_MS) + 1,
    [range.from, range.to],
  )

  const preset = detectPreset(range)
  const rangeLabel =
    preset === 'custom'
      ? `${formatDate(`${range.from}T00:00:00`)} – ${formatDate(`${range.to}T00:00:00`)}`
      : (PRESET_LABEL[preset] ?? 'Range')

  const scopeName = branchScope
    ? scopeBranches.find((b) => b.id === branchScope)?.name
    : 'All branches'
  const scopeShort = scopeName === 'All branches' ? 'All branches' : (scopeName?.split('—')[1]?.trim() || scopeName)

  /** Report branding context — branch-scoped or franchise-wide. */
  const reportCtx: ReportContext = branchScope
    ? {
        name: scopeName ?? 'SaloonX',
        logo: branchQ.data?.branch.logo ?? user?.tenantLogo ?? null,
        tenantName: user?.tenantName ?? null,
      }
    : {
        name: user?.tenantName ?? 'SaloonX',
        logo: user?.tenantLogo ?? null,
        tenantName: user?.tenantName ?? null,
      }

  /**
   * Share the range summary as a PDF REPORT — never plain text.
   * Mobile: the PDF goes to the native share sheet (Web Share L2).
   * Desktop: the PDF downloads + a short note can be pasted anywhere.
   */
  const shareReport = () => {
    const s = statsQ.data
    if (!s) return
    const file = summaryReportFile(s, reportCtx, rangeLabel)
    if (canShareFiles(file) && typeof navigator.share === 'function') {
      void navigator
        .share({
          files: [file],
          title: `Business Summary — ${scopeShort}`,
          text: `${reportCtx.name} · ${rangeLabel} report`,
        })
        .catch(() => undefined) // user dismissed the sheet — not an error
      return
    }
    downloadSummaryReportPdf(s, reportCtx, rangeLabel)
    toast.success('Summary report downloaded', {
      description: `${scopeShort} · ${rangeLabel}`,
    })
  }

  /** Quick WhatsApp note to the owner (report PDF travels via the Share button). */
  const whatsappNote = () => {
    const s = statsQ.data
    if (!s) return
    const ownerMobile = branchQ.data?.branch.ownerMobile?.replace(/\D/g, '')
    const lines = [
      `*${reportCtx.name} — ${rangeLabel}*`,
      `Revenue: ${formatINR(s.totalRevenue)} · ${s.totalBills} bills`,
      `Cash ${formatINR(s.byMethod.CASH.amount)} · UPI ${formatINR(s.byMethod.UPI.amount)} · Card ${formatINR(s.byMethod.CARD.amount)}`,
      `New customers: ${s.newCustomers} · Returning: ${s.returningBills}`,
    ]
    if (s.expenses.total > 0) {
      lines.push(`Expenses: ${formatINR(s.expenses.total)} · *Net profit: ${formatINR(s.totalRevenue - s.expenses.total)}*`)
    }
    lines.push('Full PDF report follows 📄')
    window.open(
      ownerMobile && ownerMobile.length === 10
        ? `https://wa.me/91${ownerMobile}?text=${encodeURIComponent(lines.join('\n'))}`
        : `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`,
      '_blank',
      'noopener',
    )
  }

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Dashboard</h1>
          <p className="tnum mt-0.5 text-sm text-muted-foreground">
            {rangeLabel} · {scopeShort}
            {statsQ.data ? ` · ${statsQ.data.totalBills} bills` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker value={range} onChange={setRange} />
          <Button
            size="sm"
            disabled={!statsQ.data}
            onClick={shareReport}
            className="h-10 gap-1.5"
            title="Share the business summary as a PDF report"
          >
            <FileText className="size-4" aria-hidden />
            Share Report
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!statsQ.data}
            onClick={whatsappNote}
            className="h-10 gap-1.5 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400"
            title="Send a short note to the owner on WhatsApp"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </Button>
        </div>
      </div>

      {/* Branch scope chips — franchise admins compare branches at a glance */}
      {scopeBranches.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Branch scope">
          <button
            type="button"
            onClick={() => setBranchScope(null)}
            aria-pressed={branchScope === null}
            className={cn(
              'h-8 shrink-0 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors',
              branchScope === null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            All branches
          </button>
          {scopeBranches.map((b) => {
            const active = branchScope === b.id
            const short = b.name.split('—')[1]?.trim() || b.name
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBranchScope(b.id)}
                aria-pressed={active}
                title={b.name}
                className={cn(
                  'h-8 max-w-40 shrink-0 truncate rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {short}
              </button>
            )
          })}
        </div>
      )}

      {statsQ.isError ? (
        <div className="hairline mt-6 rounded-xl bg-card">
          <EmptyState
            icon={AlertTriangle}
            title="Could not load the dashboard"
            hint={(statsQ.error as Error).message}
          />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void statsQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : statsQ.isPending ? (
        <div className="mt-4 space-y-4 lg:mt-6 lg:space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[7.5rem] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Skeleton className="h-80 rounded-xl lg:col-span-2" />
            <Skeleton className="h-80 rounded-xl" />
          </div>
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="mt-4 space-y-4 lg:mt-6 lg:space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <KpiCard
              index={0}
              label="Revenue"
              sub={`${statsQ.data.totalBills} bills · avg ${formatINR(statsQ.data.avgBill)}`}
              value={statsQ.data.totalRevenue}
              format={formatINR}
              icon={ReceiptText}
              chipClass="bg-primary/10 text-primary"
            />
            <KpiCard
              index={1}
              label="Bills"
              sub={`${statsQ.data.returningBills} returning · ${statsQ.data.newCustomers} new customers`}
              value={statsQ.data.totalBills}
              format={formatCount}
              icon={TrendingUp}
              chipClass="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
            />
            <KpiCard
              index={2}
              label="New customers"
              sub="first-ever visits in range"
              value={statsQ.data.newCustomers}
              format={formatCount}
              icon={UsersRound}
              chipClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            />
            <KpiCard
              index={3}
              label="Avg bill"
              sub={`over ${statsQ.data.totalBills} bills`}
              value={statsQ.data.avgBill}
              format={formatINR}
              icon={Sparkles}
              chipClass="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            />
          </div>

          {/* Charts + payment split (+ branch split when franchise-wide) */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RevenueChart daily={statsQ.data.daily} useBars={rangeDays <= 2} />
            </div>
            <PaymentSplitCard byMethod={statsQ.data.byMethod} total={statsQ.data.totalRevenue} />
          </div>

          {/* Monthly profit trend — revenue vs expenses vs profit */}
          <ProfitTrendCard
            months={monthlyQ.data?.months ?? []}
            loading={monthlyQ.isLoading}
          />

          {/* Business-hours heatmap — staffing planner */}
          <BusyHoursCard data={hoursQ.data} loading={hoursQ.isLoading} rangeLabel={rangeLabel} />

          {/* Branch insights league table — replaces the plain split when
              viewing the whole franchise (superset: P&L, growth, staffing). */}
          {!branchScope && compareQ.data && compareQ.data.branches.length > 0 ? (
            <BranchInsightsCard data={compareQ.data} loading={compareQ.isLoading} rangeLabel={rangeLabel} />
          ) : (
            !branchScope &&
            statsQ.data.byBranch.length > 0 && <BranchSplitCard byBranch={statsQ.data.byBranch} />
          )}

          {/* Top services + staff */}
          <div className="grid gap-4 lg:grid-cols-2">
            <TopServicesCard top={statsQ.data.topServices} />
            <StaffPerformanceCard top={statsQ.data.topStaff} />
          </div>

          {/* P&L */}
          <ProfitStrip
            revenue={statsQ.data.totalRevenue}
            expenses={statsQ.data.expenses}
            onManageExpenses={() => setView('expenses')}
          />

          {/* Birthday reminders */}
          <BirthdaysCard
            customers={birthdaysQ.data?.customers ?? []}
            loading={birthdaysQ.isLoading}
            tenantName={user?.tenantName ?? 'the salon'}
            onManage={() => setView('customers')}
          />

          {/* Birthday campaign analytics — did the wishes work? */}
          <BirthdayCampaignCard
            data={campaignQ.data}
            loading={campaignQ.isLoading}
            tenantName={user?.tenantName ?? 'the salon'}
            months={6}
          />

          {/* Recent bills */}
          <RecentBillsCard
            bills={recentQ.data?.data ?? []}
            loading={recentQ.isLoading}
            showBranch={!branchScope && scopeBranches.length > 1}
            onViewAll={() => setView('transactions')}
          />
        </div>
      )}
    </div>
  )
}
