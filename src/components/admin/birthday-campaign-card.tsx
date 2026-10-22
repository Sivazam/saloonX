'use client'

// ─────────────────────────────────────────────────────────────────────────
// Birthday campaign analytics — the "did the WhatsApp wish work?" card.
// Funnel: known birthdays → wishes sent → visits won within 14 days →
// revenue those visits brought. Plus a "missed opportunities" follow-up
// list (birthday passed, nobody wished, nobody came).
// ─────────────────────────────────────────────────────────────────────────

import { motion } from 'framer-motion'
import {
  ArrowRight,
  Cake,
  Crown,
  Gift,
  MessageCircle,
  PartyPopper,
  TrendingUp,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/format'
import type { BirthdayCampaignResponse, MissedBirthdayDTO } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const MONTH_SHORTS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/* ── Funnel step ────────────────────────────────────────────────────────── */

function FunnelStep({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  width,
  delay,
}: {
  icon: typeof Cake
  label: string
  value: string
  sub: string
  tone: 'muted' | 'primary' | 'emerald' | 'amber'
  width: number // % of full width
  delay: number
}) {
  const tones = {
    muted: 'border-border bg-muted/60 text-muted-foreground',
    primary: 'border-primary/25 bg-primary/10 text-primary',
    emerald: 'border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300',
    amber: 'border-amber-300/60 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300',
  }
  return (
    <motion.div
      initial={{ opacity: 0, scaleX: 0.85 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
      style={{ width: `${Math.max(28, width)}%` }}
      className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2', tones[tone])}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background/70 dark:bg-background/40">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="tnum text-[15px] font-bold leading-none">{value}</p>
        <p className="micro mt-0.5 truncate leading-tight">{label}</p>
      </div>
      <span className="sr-only">{sub}</span>
    </motion.div>
  )
}

/* ── Monthly mini chart ─────────────────────────────────────────────────── */

function MonthlyFunnel({ monthly }: { monthly: BirthdayCampaignResponse['monthly'] }) {
  const max = Math.max(1, ...monthly.map((m) => m.eligible))
  return (
    <div>
      <p className="micro mb-2 text-muted-foreground">WISHES vs VISITS WON · BY MONTH</p>
      <div className="flex h-24 items-end gap-2">
        {monthly.map((m, i) => (
          <div key={m.ym} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${m.label}: ${m.wished} wished · ${m.visits} visited · ${formatINR(m.revenue)}`}>
            {/* eligible outline */}
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(3, (m.eligible / max) * 100)}%` }}
              transition={{ delay: 0.15 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
              className="w-full rounded-t-[3px] border border-dashed border-border bg-muted/50"
            />
            {/* wished fill */}
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(2, (m.wished / max) * 100)}%` }}
              transition={{ delay: 0.25 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
              className="-mt-[100%] w-full rounded-t-[3px] bg-primary/70"
              style={{ position: 'relative', zIndex: 1 }}
            />
            {/* visits marker */}
            {m.visits > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4 + i * 0.05 }}
                className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 shadow-sm dark:border-emerald-500/50 dark:bg-emerald-950 dark:text-emerald-300"
              >
                {m.visits}✓
              </motion.span>
            )}
            <p className="micro mt-1 text-center text-muted-foreground">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm border border-dashed border-border bg-muted/60" /> birthdays
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-primary/70" /> wished
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full border border-emerald-300 bg-emerald-100 dark:bg-emerald-950" /> came back
        </span>
      </div>
    </div>
  )
}

/* ── Missed opportunity row ─────────────────────────────────────────────── */

function MissedRow({ m, onMessage }: { m: MissedBirthdayDTO; onMessage: (m: MissedBirthdayDTO) => void }) {
  const [mm] = (m.birthday ?? '').split('-').map(Number)
  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/40"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-amber-300/60 bg-amber-50 text-[10px] font-bold text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300">
        {MONTH_SHORTS[(mm || 1) - 1]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{m.name ?? '—'}</p>
        {/* Money stays COMPLETE — the phone/branch side truncates instead
            (the old single truncating line ellipsized "spent ₹1,234.56"). */}
        <p className="tnum flex items-baseline gap-1 text-[11px] text-muted-foreground">
          <span className="min-w-0 truncate">
            +91 {m.mobile}
            {m.homeBranchName ? ` · ${m.homeBranchName.split('—')[1]?.trim() || m.homeBranchName}` : ''}
          </span>
          <span className="shrink-0 whitespace-nowrap">· spent {formatINR(m.totalSpend)}</span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 gap-1 border border-amber-300/60 text-amber-700 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-950/70"
        onClick={() => onMessage(m)}
        aria-label={`Send a win-back offer to ${m.name ?? m.mobile} on WhatsApp`}
      >
        <MessageCircle className="size-3.5" aria-hidden />
        Win back
      </Button>
    </motion.li>
  )
}

/* ── Card ───────────────────────────────────────────────────────────────── */

export function BirthdayCampaignCard({
  data,
  loading,
  tenantName,
  months,
}: {
  data: BirthdayCampaignResponse | undefined
  loading: boolean
  tenantName: string
  months: number
}) {
  if (loading || !data) {
    return (
      <section className="hairline overflow-hidden rounded-xl bg-card" aria-label="Birthday campaigns">
        <header className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </header>
        <div className="space-y-3 p-4">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      </section>
    )
  }

  const t = data.totals
  const hasAny = t.eligible > 0
  const winBack = (m: MissedBirthdayDTO) => {
    const first = (m.name ?? 'there').split(' ')[0]
    const message = `Hi ${first}! We noticed we missed wishing you a happy birthday last month 🙏 Better late than never — here's a little make-up treat from ${tenantName}: show this message for 15% off your next visit. Valid this month. See you soon!`
    window.open(`https://wa.me/91${m.mobile}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
  }

  return (
    <section className="hairline overflow-hidden rounded-xl bg-card" aria-label="Birthday campaigns">
      <header className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg border border-rose-200/70 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <PartyPopper className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-tight">Birthday campaigns</h3>
          <p className="text-xs text-muted-foreground">
            Last {months} months · {t.wished} wishes sent · {t.visits} came back within 14 days
          </p>
        </div>
        {hasAny && (
          <span
            className={cn(
              'tnum hidden shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold sm:block',
              t.conversionPct >= 40
                ? 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300'
                : t.conversionPct >= 20
                  ? 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {t.conversionPct}% convert
          </span>
        )}
      </header>

      {!hasAny ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No tracked birthdays in the last {months} months — add birthdays from the Customers view and
          wish customers when the reminder list shows up. 🎂
        </p>
      ) : (
        <div className="space-y-5 p-4">
          {/* Funnel */}
          <div className="space-y-2">
            <FunnelStep
              icon={Cake}
              label="birthdays known"
              value={String(t.eligible)}
              sub={`${t.eligible} customers celebrated`}
              tone="muted"
              width={100}
              delay={0.05}
            />
            <FunnelStep
              icon={Gift}
              label="wishes sent"
              value={String(t.wished)}
              sub={`${t.wished} WhatsApp wishes tracked`}
              tone="primary"
              width={t.eligible > 0 ? Math.max(38, (t.wished / t.eligible) * 100) : 40}
              delay={0.15}
            />
            <FunnelStep
              icon={UsersRound}
              label="came back · 14-day window"
              value={String(t.visits)}
              sub={`${t.visits} visits won`}
              tone="emerald"
              width={t.wished > 0 ? Math.max(30, (t.visits / t.wished) * 100) : 32}
              delay={0.25}
            />
            <FunnelStep
              icon={TrendingUp}
              label="revenue won"
              value={formatINR(t.revenue)}
              sub={`avg ${formatINR(t.avgTicket)} per winning visit`}
              tone="amber"
              width={t.wished > 0 ? Math.max(34, (t.visits / Math.max(1, t.wished)) * 100) : 36}
              delay={0.35}
            />
          </div>

          {/* Monthly chart */}
          {data.monthly.some((m) => m.eligible > 0) && <MonthlyFunnel monthly={data.monthly} />}

          {/* Missed opportunities */}
          {data.missed.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <div className="flex items-center gap-2 border-b bg-muted/50 px-3.5 py-2">
                <Crown className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
                <p className="text-xs font-semibold">Missed — highest spenders nobody wished</p>
                <ArrowRight className="ml-auto size-3 text-muted-foreground" aria-hidden />
              </div>
              <ul className="max-h-56 divide-y overflow-y-auto">
                {data.missed.map((m) => (
                  <MissedRow key={`${m.id}-${m.occurredYm}`} m={m} onMessage={winBack} />
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            A visit is “won” when the customer pays within 14 days of the birthday. Wish tracking covers
            the latest wish per customer — early numbers grow more accurate as you keep wishing.
          </p>
        </div>
      )}
    </section>
  )
}
