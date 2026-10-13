'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Download, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/format'
import type { FranchiseComparisonDTO, PlatformComparisonResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/* ── Cross-franchise comparison — the platform owner's league table ────── */

const BAR_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

function GrowthBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        <Minus className="size-3" aria-hidden /> new
      </span>
    )
  }
  const up = pct >= 0
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
        up
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
          : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
      )}
    >
      {up ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
      {up ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  )
}

/** Tiny inline sparkline — 6 revenue points as a smooth SVG path. */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 72
  const h = 24
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 2) + 1
    const y = h - 2 - ((v - min) / range) * (h - 4)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const area = `M1,${h} L${pts.join(' L')} L${w - 1},${h} Z`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 overflow-visible" aria-hidden>
      <path d={area} fill={color} opacity={0.14} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* last point marker */}
      {pts.length > 0 && (
        <circle
          cx={pts[pts.length - 1].split(',')[0]}
          cy={pts[pts.length - 1].split(',')[1]}
          r={2.2}
          fill={color}
        />
      )}
    </svg>
  )
}

export function FranchiseCompareCard({ data }: { data?: PlatformComparisonResponse }) {
  const [exporting, setExporting] = useState(false)

  const total = useMemo(
    () => data?.franchises.reduce((s, f) => s + f.revenue30d, 0) ?? 0,
    [data],
  )

  if (!data) {
    return (
      <section className="hairline rounded-xl bg-card p-5">
        <Skeleton className="h-5 w-52" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </section>
    )
  }

  if (data.franchises.length === 0) return null

  const exportCsv = () => {
    setExporting(true)
    try {
      const rows = [
        ['Franchise', 'Active', 'Branches', 'Revenue (30d)', 'Prev 30d', 'Growth %', 'Bills (30d)', 'Avg bill', 'Revenue / branch'],
        ...data.franchises.map((f) => [
          f.name,
          f.active ? 'yes' : 'paused',
          String(f.branchCount),
          f.revenue30d.toFixed(2),
          f.revenuePrev30d.toFixed(2),
          f.growthPct === null ? '' : f.growthPct.toFixed(1),
          String(f.bills30d),
          f.avgBill30d.toFixed(2),
          f.revenuePerBranch.toFixed(2),
        ]),
      ]
      const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `franchise-comparison-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Comparison exported', { description: `${data.franchises.length} franchises · last 30 days` })
    } finally {
      setExporting(false)
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="hairline rounded-xl bg-card p-5"
      aria-label="Cross-franchise comparison"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <BarChart3 className="size-4 text-primary" aria-hidden />
            Franchise Comparison
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rolling 30 days · last-30 vs prior-30 growth · 6-month trend
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.platform.growthPct !== null && (
            <GrowthBadge pct={data.platform.growthPct} />
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={exportCsv}
            disabled={exporting}
            title="Export the comparison table as CSV"
          >
            <Download className="size-3.5" aria-hidden />
            CSV
          </Button>
        </div>
      </div>

      {/* League table */}
      <div className="mt-4 space-y-2.5">
        {data.franchises.map((f, i) => {
          const share = total > 0 ? Math.round((f.revenue30d / total) * 100) : 0
          const color = BAR_COLORS[i % BAR_COLORS.length]
          return (
            <motion.div
              key={f.tenantId}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn(
                'rounded-xl border bg-background/60 p-3 transition-colors hover:border-primary/30',
                !f.active && 'opacity-60',
              )}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {/* Rank medal */}
                <span
                  className="tnum flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold"
                  style={{
                    borderColor: i === 0 ? 'var(--color-primary)' : undefined,
                    background: i === 0 ? 'var(--color-primary)' : undefined,
                    color: i === 0 ? 'var(--color-primary-foreground)' : undefined,
                  }}
                  aria-label={`Rank ${i + 1}`}
                >
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold">{f.name}</p>
                    {!f.active && (
                      <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                        paused
                      </span>
                    )}
                    <GrowthBadge pct={f.growthPct} />
                  </div>
                  <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
                    {f.branchCount} branch{f.branchCount !== 1 ? 'es' : ''} · {f.bills30d} bills · avg{' '}
                    {formatINR(f.avgBill30d)}
                  </p>
                </div>

                {/* Trend sparkline */}
                <Sparkline values={f.monthly.map((m) => m.revenue)} color={color} />

                {/* Revenue + share */}
                <div className="w-24 shrink-0 text-right">
                  <p className="tnum text-sm font-bold">{formatINR(f.revenue30d)}</p>
                  <p className="tnum text-[11px] text-muted-foreground">{share}% of platform</p>
                </div>
              </div>

              {/* Share bar */}
              <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${share}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 + i * 0.06 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: color }}
                />
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Footnote */}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Platform total (last 30 days): <span className="tnum font-bold text-foreground">{formatINR(data.platform.revenue30d)}</span>
        {data.platform.revenuePrev30d > 0 && (
          <>
            {' '}vs {formatINR(data.platform.revenuePrev30d)} prior
            {data.platform.growthPct !== null && data.platform.growthPct !== 0 && (
              <>
                {' '}(
                <span
                  className={cn(
                    'tnum font-bold',
                    data.platform.growthPct > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {data.platform.growthPct > 0 ? '+' : ''}
                  {data.platform.growthPct.toFixed(1)}%
                </span>
                )
              </>
            )}
          </>
        )}
        . Revenue per branch: {formatINR(
          data.franchises.reduce((s, f) => s + f.revenuePerBranch, 0) /
            Math.max(1, data.franchises.reduce((s, f) => s + f.branchCount, 0)),
        )}{' '}
        across {data.franchises.reduce((s, f) => s + f.branchCount, 0)} branches.
      </p>
    </motion.section>
  )
}
