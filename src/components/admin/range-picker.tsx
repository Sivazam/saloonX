'use client'

import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toDateKey } from '@/lib/format'
import { useT } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type PresetId = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom'
export interface DateRange {
  /** Inclusive, YYYY-MM-DD (local). */
  from: string
  /** Inclusive, YYYY-MM-DD (local). */
  to: string
}

const DAY_MS = 86_400_000

/** Compute the inclusive { from, to } for a non-custom preset. */
export function computePreset(id: Exclude<PresetId, 'custom'>, now = new Date()): DateRange {
  const today = toDateKey(now)
  switch (id) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = toDateKey(new Date(now.getTime() - DAY_MS))
      return { from: y, to: y }
    }
    case '7d':
      return { from: toDateKey(new Date(now.getTime() - 6 * DAY_MS)), to: today }
    case '30d':
      return { from: toDateKey(new Date(now.getTime() - 29 * DAY_MS)), to: today }
    case 'month':
      return { from: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: today }
  }
}

// Preset ids in display order — labels are language-aware, so the labeled
// list is built inside the component (see RangePicker).
const PRESET_IDS: Exclude<PresetId, 'custom'>[] = ['today', 'yesterday', '7d', '30d', 'month']

/** Which preset (or 'custom') matches the given range? */
export function detectPreset(range: DateRange): PresetId {
  for (const id of PRESET_IDS) {
    const r = computePreset(id)
    if (r.from === range.from && r.to === range.to) return id
  }
  return 'custom'
}

/**
 * Preset chips + custom-range popover. Produces inclusive { from, to } date keys.
 */
export function RangePicker({
  value,
  onChange,
  className,
}: {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}) {
  const L = useT()
  const presets: { id: Exclude<PresetId, 'custom'>; label: string }[] = [
    { id: 'today', label: L.admRangeToday },
    { id: 'yesterday', label: L.admRangeYesterday },
    { id: '7d', label: L.admRange7d },
    { id: '30d', label: L.admRange30d },
    { id: 'month', label: L.admRangeMonth },
  ]
  const active = detectPreset(value)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(value)

  function openPopover() {
    setDraft(active === 'custom' ? value : computePreset('today'))
    setOpen(true)
  }

  function applyCustom() {
    if (!draft.from || !draft.to) return
    const from = draft.from < draft.to ? draft.from : draft.to
    const to = draft.from < draft.to ? draft.to : draft.from
    onChange({ from, to })
    setOpen(false)
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)} role="group" aria-label={L.admRangeGroupAria}>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {presets.map((p) => {
          const isActive = active === p.id
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(computePreset(p.id))}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
                isActive
                  ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-pressed={active === 'custom'}
            aria-label={L.admRangeCustomAria}
            onClick={openPopover}
            className={cn(
              'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
              active === 'custom'
                ? 'border-transparent bg-primary text-primary-foreground shadow-sm'
                : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            <CalendarRange className="size-3.5" aria-hidden />
            {L.admRangeCustom}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="range-from" className="text-xs">
                  {L.admRangeFrom}
                </Label>
                <Input
                  id="range-from"
                  type="date"
                  className="h-8 text-xs"
                  value={draft.from}
                  onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="range-to" className="text-xs">
                  {L.admRangeTo}
                </Label>
                <Input
                  id="range-to"
                  type="date"
                  className="h-8 text-xs"
                  value={draft.to}
                  onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                />
              </div>
            </div>
            <Button size="sm" className="w-full" disabled={!draft.from || !draft.to} onClick={applyCustom}>
              {L.admRangeApply}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
