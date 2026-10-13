'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/format'
import type { HoursStatsResponse } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

/* ── Busy hours heatmap — weekday × hour bill density ──────────────────── */

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOUR_MIN = 8
const HOUR_MAX = 21
const HOURS = Array.from({ length: HOUR_MAX - HOUR_MIN + 1 }, (_, i) => HOUR_MIN + i)

/** "9" → "9a", "13" → "1p", "12" → "12p" */
function hourLabel(h: number): string {
  const suffix = h < 12 ? 'a' : 'p'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve}${suffix}`
}

function hourTitle(h: number): string {
  return `${hourLabel(h)} – ${hourLabel(h + 1)}`
}

interface BusyHoursCardProps {
  data?: HoursStatsResponse
  loading: boolean
  rangeLabel: string
}

export function BusyHoursCard({ data, loading, rangeLabel }: BusyHoursCardProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const grid = useMemo(() => {
    const m = new Map<string, { bills: number; revenue: number }>()
    for (const c of data?.cells ?? []) m.set(`${c.dow}-${c.hour}`, { bills: c.bills, revenue: c.revenue })
    return m
  }, [data])

  const maxBills = useMemo(() => {
    let max = 0
    for (const c of data?.cells ?? []) max = Math.max(max, c.bills)
    return max
  }, [data])

  const maxDow = useMemo(() => {
    let maxI = 0
    ;(data?.dowTotals ?? []).forEach((d, i) => {
      if (d.bills > (data?.dowTotals[maxI]?.bills ?? 0)) maxI = i
    })
    return maxI
  }, [data])

  if (loading || !data) {
    return (
      <section className="hairline rounded-xl bg-card">
        <div className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-56 w-full" />
        </div>
      </section>
    )
  }

  if (data.totalBills === 0) {
    return null
  }

  const peak = data.peak
  const busiestDay = data.dowTotals[maxDow]
  const peakHour = [...data.hourTotals].sort((a, b) => b.bills - a.bills)[0]

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="hairline rounded-xl bg-card p-5"
      aria-label="Busy hours heatmap"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <CalendarClock className="size-4 text-primary" aria-hidden />
            Busy Hours
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rangeLabel} · when customers actually walk in
          </p>
        </div>
        {peak && peak.bills > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300">
            <Flame className="size-3.5" aria-hidden />
            Peak {DOW[peak.dow]} {hourTitle(peak.hour)} · {peak.bills} bills
          </span>
        )}
      </div>

      {/* Heatmap grid: hour columns × weekday rows */}
      <div className="mt-4 overflow-x-auto pb-1">
        <div className="min-w-[560px]">
          {/* Hour axis */}
          <div
            className="grid gap-[3px] pl-9 pr-9"
            style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}
          >
            {HOURS.map((h) => (
              <span
                key={h}
                className="tnum text-center text-[10px] font-medium text-muted-foreground"
                title={hourTitle(h)}
              >
                {h % 2 === 0 ? hourLabel(h) : ''}
              </span>
            ))}
          </div>

          {/* Rows */}
          <div className="mt-1 flex flex-col gap-[3px]">
            {DOW.map((label, dow) => {
              const dayTotal = data.dowTotals[dow]
              const isPeakDay = dow === maxDow
              return (
                <div key={label} className="flex items-center gap-1">
                  <span
                    className={cn(
                      'w-8 shrink-0 text-right text-[11px] font-semibold',
                      isPeakDay ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {label}
                  </span>
                  <div
                    className="grid flex-1 gap-[3px]"
                    style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}
                  >
                    {HOURS.map((h) => {
                      const cell = grid.get(`${dow}-${h}`)!
                      const intensity =
                        maxBills === 0 || cell.bills === 0
                          ? 0
                          : 0.15 + 0.85 * Math.sqrt(cell.bills / maxBills)
                      const isPeakCell = peak?.dow === dow && peak?.hour === h && peak.bills > 0
                      const isHovered = hovered === `${dow}-${h}`
                      return (
                        <button
                          key={h}
                          type="button"
                          className={cn(
                            'group relative h-7 rounded-[5px] border transition-all duration-150',
                            cell.bills === 0
                              ? 'border-border/60 bg-muted/40'
                              : 'border-transparent',
                            isPeakCell && 'ring-2 ring-amber-500 ring-offset-1 ring-offset-card',
                            isHovered && 'z-10 scale-[1.18] shadow-md',
                          )}
                          style={
                            cell.bills > 0
                              ? { backgroundColor: `rgb(190 24 93 / ${intensity})` }
                              : undefined
                          }
                          onMouseEnter={() => setHovered(`${dow}-${h}`)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(`${dow}-${h}`)}
                          onBlur={() => setHovered(null)}
                          aria-label={`${label} ${hourTitle(h)}: ${cell.bills} bills, ${formatINR(cell.revenue)}`}
                        >
                          {/* Hover tooltip */}
                          {isHovered && cell.bills > 0 && (
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] font-semibold text-popover-foreground shadow-lg">
                              {cell.bills} bill{cell.bills > 1 ? 's' : ''} · {formatINR(cell.revenue)}
                            </span>
                          )}
                          {cell.bills > 0 && (
                            <span
                              className={cn(
                                'tnum absolute inset-0 flex items-center justify-center text-[10px] font-bold',
                                intensity > 0.55 ? 'text-white' : 'text-foreground/70',
                              )}
                            >
                              {cell.bills}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {/* Per-day total rail */}
                  <span
                    className={cn(
                      'tnum w-9 shrink-0 text-left text-[11px] font-bold',
                      isPeakDay ? 'text-primary' : 'text-muted-foreground',
                    )}
                  >
                    {dayTotal.bills > 0 ? dayTotal.bills : '·'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Hour totals rail */}
          <div className="mt-1.5 flex items-center gap-1">
            <span className="w-8 shrink-0" />
            <div
              className="grid flex-1 gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}
            >
              {data.hourTotals.map((h) => (
                <span
                  key={h.hour}
                  className={cn(
                    'tnum text-center text-[10px] font-semibold',
                    peakHour && h.hour === peakHour.hour ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {h.bills > 0 ? h.bills : '·'}
                </span>
              ))}
            </div>
            <span className="w-9 shrink-0" />
          </div>
        </div>
      </div>

      {/* Legend + reading */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          Less
          <span className="flex gap-[2px]">
            {[0.18, 0.4, 0.62, 0.85, 1].map((o) => (
              <span
                key={o}
                className="size-3 rounded-[3px]"
                style={{ backgroundColor: `rgb(190 24 93 / ${o})` }}
              />
            ))}
          </span>
          More
        </span>
        <span>
          Busiest day:{' '}
          <span className="font-bold text-foreground">
            {DOW[maxDow]} ({busiestDay?.bills ?? 0} bills)
          </span>
        </span>
        {peakHour && peakHour.bills > 0 && (
          <span>
            Rush hour:{' '}
            <span className="font-bold text-foreground">
              {hourTitle(peakHour.hour)} ({peakHour.bills} bills)
            </span>
          </span>
        )}
      </div>
    </motion.section>
  )
}
