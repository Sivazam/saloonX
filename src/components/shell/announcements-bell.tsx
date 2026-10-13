'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell,
  BellOff,
  Building2,
  CheckCheck,
  CircleSlash,
  Info,
  Loader2,
  Megaphone,
  PartyPopper,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { apiGet, apiPost } from '@/lib/api-client'
import { timeAgo } from '@/lib/format'
import type { AnnouncementDTO, AnnouncementKind, AnnouncementsResponse } from '@/lib/types'
import { useAppStore } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/** Per-kind look: icon + tint for the row chip, reused by the banner. */
const KIND_META: Record<AnnouncementKind, {
  icon: typeof PartyPopper
  chip: string
  label: string
}> = {
  BRANCH_APPROVED: {
    icon: PartyPopper,
    chip: 'border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    label: 'Branch live',
  },
  BRANCH_DECLINED: {
    icon: CircleSlash,
    chip: 'border-rose-300/70 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300',
    label: 'Declined',
  },
  BRANCH_PAUSED: {
    icon: Building2,
    chip: 'border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    label: 'Paused',
  },
  WELCOME: {
    icon: Megaphone,
    chip: 'border-primary/30 bg-primary/5 text-primary',
    label: 'Welcome',
  },
  INFO: {
    icon: Info,
    chip: 'border-border bg-muted text-muted-foreground',
    label: 'Notice',
  },
}

/**
 * Shared feed query (bell + banner components both subscribe; react-query
 * dedupes to a single request). Gentle polling keeps approvals fresh without
 * a manual refresh.
 */
function useAnnouncementFeed() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: () => apiGet<AnnouncementsResponse>('/api/announcements'),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
}

function useMarkRead() {
  const queryClient = useQueryClient()
  const [marking, setMarking] = useState(false)
  async function markRead(ids: string[]) {
    if (ids.length === 0) return
    setMarking(true)
    try {
      await apiPost('/api/announcements/read', { ids })
      await queryClient.invalidateQueries({ queryKey: ['announcements'] })
    } catch {
      toast.error('Could not mark as read — try again')
    } finally {
      setMarking(false)
    }
  }
  return { markRead, marking }
}

/** Header bell — popover feed of franchise announcements + unread badge. */
export function AnnouncementsBell() {
  const [open, setOpen] = useState(false)
  const feedQ = useAnnouncementFeed()
  const { markRead, marking } = useMarkRead()

  // The banner (separate component) asks the bell to open its popover.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('sx:open-announcements', onOpen)
    return () => window.removeEventListener('sx:open-announcements', onOpen)
  }, [])

  const feed = feedQ.data
  const unread = feed?.unread ?? 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Announcements — ${unread} new` : 'Announcements'}
          className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Bell className="size-[18px]" aria-hidden />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="tnum absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm"
              >
                {unread > 9 ? '9+' : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg border bg-primary/5 text-primary">
              <Bell className="size-3.5" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Announcements</p>
              <p className="micro text-muted-foreground">
                {unread > 0 ? `${unread} new` : 'All caught up'}
              </p>
            </div>
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs"
              disabled={marking}
              onClick={() =>
                void markRead((feed?.announcements ?? []).filter((a) => a.unread).map((a) => a.id))
              }
            >
              {marking ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <CheckCheck className="size-3.5" aria-hidden />
              )}
              Mark all read
            </Button>
          )}
        </div>

        {feedQ.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : feedQ.isError ? (
          <div className="p-4 text-sm text-muted-foreground">Couldn&apos;t load announcements.</div>
        ) : !feed || feed.announcements.length === 0 ? (
          <div className="p-6 text-center">
            <BellOff className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
            <p className="mt-2 text-sm font-medium">Nothing yet</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Branch approvals and platform notes land here.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {feed.announcements.map((a, i) => {
              const meta = KIND_META[a.kind] ?? KIND_META.INFO
              const Icon = meta.icon
              return (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.2) }}
                  className={cn('relative flex gap-3 px-4 py-3 transition-colors', a.unread ? 'bg-primary/[0.04]' : '')}
                >
                  {a.unread && (
                    <span
                      className="absolute left-1.5 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary"
                      aria-hidden
                    />
                  )}
                  <span
                    className={cn(
                      'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border',
                      meta.chip,
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate text-sm', a.unread ? 'font-semibold' : 'font-medium')}>
                        {a.title}
                      </p>
                      <span className="micro shrink-0 text-muted-foreground">{timeAgo(a.createdAt)}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {a.body}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className={cn('micro rounded-md border px-1.5 py-0.5', meta.chip)}>
                        {meta.label}
                      </span>
                      {a.unread && (
                        <button
                          type="button"
                          onClick={() => void markRead([a.id])}
                          disabled={marking}
                          className="micro rounded-md px-1.5 py-0.5 text-primary underline-offset-2 hover:bg-primary/10 hover:underline"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Slim celebratory banner under the header for a freshly approved branch.
 * Dismissing (or "View branches") marks the announcement read — it never
 * nags twice.
 */
export function AnnouncementBanner() {
  const feedQ = useAnnouncementFeed()
  const { markRead, marking } = useMarkRead()
  const role = useAppStore((s) => s.user?.role ?? 'STAFF')
  const setView = useAppStore((s) => s.setView)

  // Only FRESH approvals get the banner — an old unread one stays in the bell
  // (celebrating an 84-day-old branch live notice would be confusing).
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const banner = feedQ.data?.announcements.find(
    (a) =>
      a.unread &&
      a.kind === 'BRANCH_APPROVED' &&
      Date.now() - new Date(a.createdAt).getTime() < WEEK_MS,
  )

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="overflow-hidden border-b border-emerald-200/70 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/40"
        >
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-2 sm:px-4 lg:px-6">
            <span className="relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-emerald-300/70 bg-emerald-100/80 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
              <PartyPopper className="size-4" aria-hidden />
              <motion.span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500"
                animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
              />
            </span>
            <button
              type="button"
              aria-label="Open all announcements"
              onClick={() => window.dispatchEvent(new CustomEvent('sx:open-announcements'))}
              className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40"
            >
              <p className="truncate text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                {banner.title}
              </p>
              <p className="line-clamp-2 text-xs leading-snug text-emerald-700/80 dark:text-emerald-300/80">
                {banner.body}
              </p>
            </button>
            {role === 'ADMIN' && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 gap-1.5 border-emerald-300/70 bg-white/60 text-xs text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/70"
                disabled={marking}
                onClick={() => {
                  setView('branches')
                  void markRead([banner.id])
                }}
              >
                <Building2 className="size-3.5" aria-hidden />
                View branches
              </Button>
            )}
            <button
              type="button"
              aria-label="Dismiss announcement"
              disabled={marking}
              onClick={() => void markRead([banner.id])}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-emerald-700/70 transition-colors hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-300/70 dark:hover:bg-emerald-900/60 dark:hover:text-emerald-100"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
