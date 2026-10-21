'use client'

// ─────────────────────────────────────────────────────────────────────────
// First-run onboarding checklist (ADMIN dashboard).
// A brand-new franchise admin lands on an empty dashboard — this card walks
// them through the five setup steps that turn it on:
//   services → UPI id → staff → QR menu poster → first bill.
// Progressively checked from data the dashboard already loads (branch
// profile, current-range stats) plus two light queries (/api/staff and —
// only once the card is visible — /api/catalog/franchise). Auto-hides when
// every item is done; a dismiss (✕) persists per user in localStorage.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Check, X } from 'lucide-react'
import { DuoSparkle } from '@/components/ui/duotone-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { apiGet } from '@/lib/api-client'
import type { BranchProfileDTO, FranchiseMenuResponse, StaffDTO } from '@/lib/types'
import { useAppStore, useT, type View } from '@/store/use-app-store'

const ONBOARDING_KEY = 'sx-onboarding-dismissed'

/** Per-user dismissal key — each admin dismisses for themself only. */
function dismissedKey(userId: string | null | undefined): string {
  return userId ? `${ONBOARDING_KEY}:${userId}` : ONBOARDING_KEY
}

function isDismissed(userId: string | null | undefined): boolean {
  try {
    return localStorage.getItem(dismissedKey(userId)) === '1'
  } catch {
    return false // private mode — default to showing the card
  }
}

interface OnboardingItem {
  key: string
  label: string
  done: boolean
  view: View
}

export function OnboardingCard({
  branch,
  branchReady,
  totalBills,
}: {
  /** Current branch profile (dashboard's ['branch'] query) — UPI id + QR slug. */
  branch: BranchProfileDTO | null
  branchReady: boolean
  /** Bills in the currently loaded dashboard range (first-bill check). */
  totalBills: number
}) {
  const L = useT()
  const user = useAppStore((s) => s.user)
  const setView = useAppStore((s) => s.setView)
  const prefersReduced = useReducedMotion()

  // The dashboard only mounts for ADMINs (staff stay on billing, the platform
  // console is SUPER_ADMIN-only), but the role check keeps this defensive.
  const isAdmin = user?.role === 'ADMIN'
  const [dismissed, setDismissed] = useState(() => isDismissed(user?.id))

  // Staff list — light + shared cache key with the Staff view.
  const staffQ = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet<{ users: StaffDTO[] }>('/api/staff'),
    enabled: !dismissed && isAdmin,
  })

  // Cheap completeness signals (branch profile + current-range bills).
  const upiDone = branchReady && !!branch?.upiId
  const qrDone = branchReady && !!branch?.menuSlug
  const billDone = totalBills > 0
  const staffDone = staffQ.isSuccess && (staffQ.data?.users.length ?? 0) > 1
  const cheapTodo = !upiDone || !qrDone || !billDone || !staffDone
  // Wait for the cheap signals before deciding anything — an established
  // salon never sees a flash of the card while queries load.
  const ready = branchReady && staffQ.isSuccess

  // The catalog is only fetched once the card is (potentially) visible — it
  // can't create visibility on its own, so a fully-set-up salon that simply
  // never added catalog services is left alone.
  const potentiallyVisible = !dismissed && isAdmin && ready && cheapTodo
  const catalogQ = useQuery({
    queryKey: ['franchise-menu'],
    queryFn: () => apiGet<FranchiseMenuResponse>('/api/catalog/franchise'),
    enabled: potentiallyVisible,
  })
  const serviceCount = catalogQ.data
    ? catalogQ.data.categories.reduce((sum, c) => sum + c.services.length, 0)
    : 0
  const servicesDone = catalogQ.isSuccess && serviceCount > 0

  // Visible while ANY item is incomplete; auto-hides (null) when all are done.
  const visible = !dismissed && isAdmin && ready && (cheapTodo || (catalogQ.isSuccess && serviceCount === 0))

  const items: OnboardingItem[] = [
    { key: 'services', label: L.admOnbServices, done: servicesDone, view: 'services' },
    { key: 'upi', label: L.admOnbUpi, done: upiDone, view: 'settings' },
    { key: 'staff', label: L.admOnbStaff, done: staffDone, view: 'staff' },
    { key: 'qr', label: L.admOnbQr, done: qrDone, view: 'qrmenu' },
    { key: 'bill', label: L.admOnbFirstBill, done: billDone, view: 'billing' },
  ]
  const doneCount = items.filter((i) => i.done).length

  function dismiss() {
    try {
      localStorage.setItem(dismissedKey(user?.id), '1')
    } catch {
      /* private mode — hiding for this visit only */
    }
    setDismissed(true)
  }

  if (!visible) return null

  return (
    <motion.section
      initial={prefersReduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="hairline rounded-xl bg-card p-4 lg:p-5"
      aria-label={L.admOnbAria}
    >
      <header className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
          <DuoSparkle className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="text-[15px] font-bold tracking-tight">{L.admOnbTitle}</h2>
            <span className="tnum rounded-full border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {L.admOnbProgress
                .replace('{done}', String(doneCount))
                .replace('{total}', String(items.length))}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={items.length}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(doneCount / items.length) * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full rounded-full bg-emerald-500"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={L.admOnbDismiss}
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="size-4.5" aria-hidden />
        </button>
      </header>

      {totalBills === 0 && (
        <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
          {L.admOnbEncourage}
        </p>
      )}

      <ul className="mt-3 divide-y">
        {items.map((item, i) => (
          <li key={item.key} className="flex items-center gap-3 py-1.5">
            {item.done ? (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <Check className="size-4" aria-hidden />
              </span>
            ) : item.key === 'services' && catalogQ.isPending ? (
              /* Catalog still loading — pulse instead of flashing a false "todo". */
              <span
                className="size-7 shrink-0 motion-safe:animate-pulse rounded-full bg-muted"
                aria-hidden
              />
            ) : (
              <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-bold text-muted-foreground">
                {i + 1}
              </span>
            )}
            <p
              className={cn(
                'min-w-0 flex-1 text-sm',
                item.done ? 'text-muted-foreground' : 'font-medium',
              )}
            >
              {item.label}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView(item.view)}
              aria-label={L.admOnbGoAria.replace('{label}', item.label)}
              className={cn(
                // 40px visual + a 4px invisible apron → a 48px thumb target
                // without inflating the row height.
                "relative h-10 gap-1 px-3 after:absolute after:-inset-1 after:content-['']",
                item.done && 'text-muted-foreground',
              )}
            >
              {L.admOnbGo}
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </motion.section>
  )
}
