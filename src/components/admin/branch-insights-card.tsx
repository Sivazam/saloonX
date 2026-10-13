'use client'

// ─────────────────────────────────────────────────────────────────────────
// Branch insights — the in-franchise league table for ADMIN dashboards.
// Ranks every branch by revenue with medals, growth badges vs the prior
// window, P&L colour, share bars, staffing + new-customer stats.
// (The platform console's FranchiseCompareCard is the SUPER_ADMIN cousin.)
// ─────────────────────────────────────────────────────────────────────────

import { motion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Crown,
  MapPin,
  TrendingUp,
  UserRoundPlus,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/format'
import type { BranchCompareResponse } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

const RANK_STYLES = [
  'border-amber-400/70 bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800 shadow-[0_1px_6px_rgba(217,169,46,0.35)] dark:from-amber-900/60 dark:to-amber-800/40 dark:text-amber-200',
  'border-slate-300 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700 dark:from-slate-700/60 dark:to-slate-800/40 dark:text-slate-200',
  'border-orange-300/70 bg-gradient-to-br from-orange-100 to-orange-200 text-orange-800 dark:from-orange-900/50 dark:to-orange-800/40 dark:text-orange-200',
]
const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="tnum shrink-0 rounded-full border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
        new
      </span>
    )
  }
  const up = pct >= 0
  return (
    <span
      className={cn(
        'tnum flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold',
        up
          ? 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-300'
          : 'border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-300',
      )}
      title={`${up ? 'Up' : 'Down'} ${Math.abs(pct)}% vs the previous period`}
    >
      {up ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
      {Math.abs(pct)}%
    </span>
  )
}

function StatChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof UsersRound
  label: string
  value: string
  tone?: 'emerald' | 'rose'
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 rounded-md border bg-background/60 px-1.5 py-0.5 text-[10px] font-medium',
        tone === 'emerald' && 'border-emerald-300/60 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300',
        tone === 'rose' && 'border-rose-300/60 text-rose-700 dark:border-rose-500/40 dark:text-rose-300',
        !tone && 'text-muted-foreground',
      )}
      title={label}
    >
      <Icon className="size-3" aria-hidden />
      <span className="tnum">{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function BranchInsightsCard({
  data,
  loading,
  rangeLabel,
}: {
  data: BranchCompareResponse | undefined
  loading: boolean
  rangeLabel: string
}) {
  if (loading || !data || data.branches.length === 0) {
    return (
      <section className="hairline overflow-hidden rounded-xl bg-card" aria-label="Branch insights">
        <header className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
          <Skeleton className="size-8 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-32" />
          </div>
        </header>
        <div className="space-y-3 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </section>
    )
  }

  const branches = data.branches
  const maxRevenue = branches[0]?.revenue || 1
  const topBranch = branches[0]
  const weakest = [...branches].sort((a, b) => a.profit - b.profit)[0]
  const negative = branches.filter((b) => b.profit < 0)

  return (
    <section className="hairline overflow-hidden rounded-xl bg-card" aria-label="Branch insights">
      <header className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <Building2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-tight">Branch insights</h3>
          <p className="text-xs text-muted-foreground">
            {rangeLabel} · {branches.length} branches · franchise{' '}
            <span className={cn('font-semibold', data.franchise.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
              {formatINR(data.franchise.profit)}
            </span>{' '}
            profit
          </p>
        </div>
        {negative.length > 0 && (
          <span className="hidden shrink-0 rounded-full border border-rose-300/70 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-300 sm:block">
            {negative.length} losing money
          </span>
        )}
      </header>

      <ul className="divide-y">
        {branches.map((b, i) => {
          const short = b.name.split('—')[1]?.trim() || b.name
          const pct = Math.max(6, Math.round((b.revenue / maxRevenue) * 100))
          const profitTone = b.profit >= 0 ? 'emerald' : 'rose'
          return (
            <motion.li
              key={b.branchId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.25 }}
              className="relative px-4 py-3"
            >
              {/* subtle rank rail */}
              <span
                className="absolute inset-y-3 left-0 w-1 rounded-r"
                style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {/* Rank medal */}
                <span
                  className={cn(
                    'tnum flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-extrabold',
                    RANK_STYLES[i % 3] ?? 'border-border bg-muted text-muted-foreground',
                  )}
                  aria-label={`Rank ${i + 1} by revenue`}
                >
                  {i + 1}
                </span>

                {/* Name + city */}
                <div className="min-w-0 flex-1 basis-40">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold" title={b.name}>
                    {short}
                    {i === 0 && b.revenue > 0 && (
                      <Crown className="size-3.5 shrink-0 text-amber-500" aria-label="Top earner" />
                    )}
                  </p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <MapPin className="size-3 shrink-0" aria-hidden />
                    {b.city ?? '—'}
                    {b.prefix ? ` · ${b.prefix} bills` : ''}
                  </p>
                </div>

                {/* Money column */}
                <div className="ml-auto flex shrink-0 flex-col items-end">
                  <p className="tnum text-sm font-extrabold">{formatINR(b.revenue)}</p>
                  <p className="tnum text-[10px] text-muted-foreground">
                    {b.bills} bills · avg {formatINR(b.avgBill)}
                  </p>
                </div>

                <GrowthBadge pct={b.growthPct} />
              </div>

              {/* Share bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.7, delay: 0.15 + i * 0.06, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
                  />
                </div>
                <span className="tnum micro shrink-0 text-muted-foreground">{b.sharePct}%</span>
              </div>

              {/* Stat chips */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatChip
                  icon={TrendingUp}
                  label="profit"
                  value={`${b.profit >= 0 ? '+' : '−'}${formatINR(Math.abs(b.profit))}`}
                  tone={profitTone as 'emerald' | 'rose'}
                />
                <StatChip icon={UsersRound} label="staff" value={`${b.staffCount} staff`} />
                <StatChip icon={UserRoundPlus} label="new customers" value={`${b.newCustomers} new`} />
                {b.expenses > 0 && (
                  <StatChip
                    icon={Building2}
                    label="expenses"
                    value={`costs ${formatINR(b.expenses)}`}
                  />
                )}
              </div>
            </motion.li>
          )
        })}
      </ul>

      <footer className="flex items-start gap-2 border-t bg-muted/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-amber-300/60 text-amber-600 dark:text-amber-400">
          <Crown className="size-2.5" aria-hidden />
        </span>
        <p>
          <span className="font-semibold text-foreground">
            {topBranch.name.split('—')[1]?.trim() || topBranch.name}
          </span>{' '}
          leads with {topBranch.sharePct}% of revenue
          {weakest && weakest.branchId !== topBranch.branchId && weakest.profit < 0 ? (
            <>
              {' '}· watch{' '}
              <span className="font-semibold text-rose-600 dark:text-rose-400">
                {weakest.name.split('—')[1]?.trim() || weakest.name}
              </span>{' '}
              (profit {formatINR(weakest.profit)})
            </>
          ) : null}
          . Growth compares {rangeLabel.toLowerCase()} with the window before it.
        </p>
      </footer>
    </section>
  )
}
