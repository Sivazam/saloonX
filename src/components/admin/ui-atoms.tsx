'use client'

import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Banknote, CreditCard, QrCode } from 'lucide-react'
import { DuoWarning } from '@/components/ui/duotone-icons'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { CustomerDTO, PaymentMethod, Role, StaffDTO } from '@/lib/types'

/* ── Shared icon type — accepts both lucide-react and Phosphor duotone icons ── */
export type IconType = React.ComponentType<{
  size?: number | string
  className?: string
  'aria-hidden'?: boolean
}>

/* ── Response wrappers (not in lib/types — shared by admin views) ─────────── */

export interface StaffListResponse {
  users: StaffDTO[]
}

export interface CustomersResponse {
  customers: CustomerDTO[]
  total: number
}

/* ── Small helpers ─────────────────────────────────────────────────────────── */

export function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter((w) => /^[a-zA-Z]/.test(w))
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || name.slice(0, 1).toUpperCase()
  )
}

/** Parse a local YYYY-MM-DD key as a local Date (avoids UTC-midnight shift). */
export function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`)
}

/** Debounce a fast-changing value (search inputs). */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}

/** Compact INR-ish axis label: 1200 → "1.2k", 150000 → "1.5L". */
export function formatAxisINR(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return String(Math.round(n))
}

/* ── Payment method visual language (Cash=emerald, UPI=rose, Card=amber) ───── */

export const METHOD_META: Record<
  PaymentMethod,
  { label: string; icon: IconType; badgeClass: string; chipClass: string; barClass: string; dotClass: string }
> = {
  CASH: {
    label: 'Cash',
    icon: Banknote,
    badgeClass: 'border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-950',
    chipClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    barClass: 'bg-emerald-500',
    dotClass: 'bg-emerald-500',
  },
  UPI: {
    label: 'UPI',
    icon: QrCode,
    badgeClass: 'border-transparent bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-950',
    chipClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
    barClass: 'bg-rose-500',
    dotClass: 'bg-rose-500',
  },
  CARD: {
    label: 'Card',
    icon: CreditCard,
    badgeClass: 'border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950',
    chipClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    barClass: 'bg-amber-500',
    dotClass: 'bg-amber-500',
  },
}

export function MethodBadge({ method, className }: { method: PaymentMethod; className?: string }) {
  const meta = METHOD_META[method]
  const Icon = meta.icon
  return (
    <Badge className={cn(meta.badgeClass, className)}>
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  )
}

/* ── Role badge (matches the app shell colors) ─────────────────────────────── */

export function RoleBadge({ role }: { role: Role }) {
  if (role === 'SUPER_ADMIN')
    return (
      <Badge className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/10">
        Platform
      </Badge>
    )
  return role === 'ADMIN' ? (
    <Badge className="border-transparent bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-950">
      Admin
    </Badge>
  ) : (
    <Badge className="border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950">
      Staff
    </Badge>
  )
}

/* ── Empty state ───────────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon = DuoWarning,
  title,
  hint,
  action,
  className,
}: {
  icon?: IconType
  title: string
  hint?: string
  /** Optional CTA — typically a `<Button>` to reset filters / create the first
   *  row / jump to the relevant view. Renders below the copy. */
  action?: React.ReactNode
  className?: string
}) {
  const prefersReduced = useReducedMotion()
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-14 text-center', className)}>
      <motion.div
        className="flex size-12 items-center justify-center rounded-2xl bg-muted"
        animate={prefersReduced ? undefined : { y: [0, -4, 0] }}
        transition={prefersReduced ? undefined : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        <Icon className="size-6 text-muted-foreground" />
      </motion.div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {hint && <p className="mx-auto max-w-xs text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  )
}
