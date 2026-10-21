'use client'

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarClock, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/format'
import type { HoursStatsResponse } from '@/lib/types'
import { Skeleton } from '@/components/ui/skeleton'

/* ── Busy hours heatmap — weekday × hour bill density ────────────────────
 * Accessibility: the grid is one tab stop. Each cell is `role="gridcell"`
 * with `tabindex="-1"` and an `aria-label` so screen readers can announce
 * "Mon 9a–10a, 4 bills, ₹1,200" but the keyboard user is not forced to walk
 * 98 cells to get past the card. A textual summary at the bottom carries
 * the peak + busiest-day information for users who skip the grid entirely.
 */

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
  /** Translated card title — defaults to English (kept for any other callers). */
  title?: string
}

export function BusyHoursCard({ data, loading, rangeLabel, title = 'Busy Hours' }: BusyHoursCardProps) {
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

  // Top-5 hottest slots — flat, screen-reader-friendly summary at the bottom
  // of the card. Memoised alongside the other grid derivations so all hooks
  // run unconditionally before the early returns below.
  const topCells = useMemo(
    () =>
      [...(data?.cells ?? [])]
        .filter((c) => c.bills > 0)
        .sort((a, b) => b.bills - a.bills)
        .slice(0, 5)
        .map((c) => `${DOW[c.dow]} ${hourTitle(c.hour)} with ${c.bills} bills (${formatINR(c.revenue)})`),
    [data],
  )

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

  // Grid layout: weekday-label column + HOURS.length hour columns + per-day total column.
  const colCount = HOURS.length + 2
  // Grid rows: hour-axis row + DOW.length day rows + hour-totals rail row.
  const rowCount = 1 + DOW.length + 1

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
            {title}
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

      {/* Heatmap grid: hour columns × weekday rows. role="grid" + aria
          counts make it a single tab-stop for keyboard users — cells are
          `tabindex="-1"` so the screen-reader still announces each cell's
          aria-label without adding 98 tab stops. */}
      <div className="mt-4 overflow-x-auto pb-1">
        <div
          className="min-w-[600px]"
          role="grid"
          aria-rowcount={rowCount}
          aria-colcount={colCount}
          aria-label={`Busy hours heatmap, ${DOW.length} days × ${HOURS.length} hours`}
          aria-describedby="busy-hours-summary"
        >
          {/* Hour axis (row 1) */}
          <div
            role="row"
            aria-rowindex={1}
            className="grid gap-[3px] pl-9 pr-9"
            style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(0, 1fr))` }}
          >
            {HOURS.map((h) => (
              <span
                key={h}
                role="columnheader"
                className="tnum text-center text-[10px] font-medium text-muted-foreground"
                title={hourTitle(h)}
              >
                {h % 2 === 0 ? hourLabel(h) : ''}
              </span>
            ))}
          </div>

          {/* Day rows */}
          <div className="mt-1 flex flex-col gap-[3px]">
            {DOW.map((label, dow) => {
              const dayTotal = data.dowTotals[dow]
              const isPeakDay = dow === maxDow
              return (
                <div role="row" aria-rowindex={dow + 2} key={label} className="flex items-center gap-1">
                  <span
                    role="rowheader"
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
                      // Empty cells (0 bills) carry no label so the SR doesn't
                      // announce 60+ "0 bills" entries; only non-empty cells
                      // are gridcells with labels.
                      if (cell.bills === 0) {
                        return (
                          <span
                            key={h}
                            role="gridcell"
                            tabIndex={-1}
                            aria-hidden={isHovered ? undefined : true}
                            className="h-9 rounded-[5px] border border-border/60 bg-muted/40"
                          />
                        )
                      }
                      return (
                        <span
                          key={h}
                          role="gridcell"
                          tabIndex={-1}
                          aria-label={`${label} ${hourTitle(h)}: ${cell.bills} bills, ${formatINR(cell.revenue)}`}
                          className={cn(
                            'group relative h-9 cursor-default rounded-[5px] border transition-all duration-150',
                            'border-transparent',
                            isPeakCell && 'ring-2 ring-amber-500 ring-offset-1 ring-offset-card',
                            isHovered && 'z-10 scale-[1.18] shadow-md',
                          )}
                          style={{ backgroundColor: `rgb(190 24 93 / ${intensity})` }}
                          onMouseEnter={() => setHovered(`${dow}-${h}`)}
                          onMouseLeave={() => setHovered(null)}
                        >
                          {/* Hover tooltip (mouse only — focus is removed for a11y) */}
                          {isHovered && cell.bills > 0 && (
                            <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[10px] font-semibold text-popover-foreground shadow-lg">
                              {cell.bills} bill{cell.bills > 1 ? 's' : ''} · {formatINR(cell.revenue)}
                            </span>
                          )}
                          <span
                            className={cn(
                              'tnum absolute inset-0 flex items-center justify-center text-[10px] font-bold',
                              intensity > 0.55 ? 'text-white' : 'text-foreground/70',
                            )}
                          >
                            {cell.bills}
                          </span>
                        </span>
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

      {/* Screen-reader summary — visually hidden, but carries the peak +
          top-5 hottest slots so keyboard/SR users get the same takeaway
          as the visual heatmap. */}
      <p id="busy-hours-summary" className="sr-only">
        {peak && peak.bills > 0
          ? `Busiest slot is ${DOW[peak.dow]} ${hourTitle(peak.hour)} with ${peak.bills} bills. `
          : ''}
        {peakHour && peakHour.bills > 0
          ? `Rush hour is ${hourTitle(peakHour.hour)}. `
          : ''}
        {topCells.length > 0
          ? `Top slots: ${topCells.join('; ')}.`
          : ''}
      </p>
    </motion.section>
  )
}
