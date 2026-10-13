'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUpFromLine,
  CloudOff,
  CheckCheck,
  FileDown,
  Loader2,
  Printer,
  Trash2,
  RefreshCw,
  Signal,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatINR } from '@/lib/format'
import {
  QUEUE_EVENT,
  getQueuedBills,
  installAutoSync,
  queuedBillToPreview,
  removeQueuedBill,
  syncQueue,
  type QueuedBill,
  type SyncResult,
} from '@/lib/offline-queue'
import { downloadReceiptPdf } from '@/components/billing/receipt-pdf'
import { useAppStore } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatTime } from '@/lib/format'
import { apiGet } from '@/lib/api-client'
import type { BranchProfileDTO } from '@/lib/types'

type ConnectionState = 'online' | 'offline' | 'syncing' | 'pending'

/** Compact header indicator + queue management popover.
 *  STATES:  ⚡ offline (amber) · queue pending (amber badge) ·
 *           syncing (spinning) · all synced (green flicker) */
export function SyncIndicator() {
  const [open, setOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const [queue, setQueue] = useState<QueuedBill[]>([])
  const [syncing, setSyncing] = useState(false)
  const prevQueueLen = useRef(0)
  const user = useAppStore((s) => s.user)

  // Branch profile for the offline paper-trail receipts (same branding as
  // the success-screen receipt). Cached by react-query across the app.
  const branchQuery = useQuery({
    queryKey: ['branch'],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>('/api/branch'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const refresh = useCallback(() => {
    void getQueuedBills().then(setQueue).catch(() => setQueue([]))
  }, [])

  // Auto-sync engine + live state wiring.
  useEffect(() => {
    setOnline(navigator.onLine)
    refresh()
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)

    const onQueueEvent = (e: Event) => {
      const kind = (e as CustomEvent<{ kind: string }>).detail?.kind
      refresh()
      if (kind === 'sync-started') setSyncing(true)
      if (kind === 'sync-finished') setSyncing(false)
    }
    window.addEventListener(QUEUE_EVENT, onQueueEvent)
    const cleanupAutoSync = installAutoSync()
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      window.removeEventListener(QUEUE_EVENT, onQueueEvent)
      cleanupAutoSync()
    }
  }, [refresh])

  // Toast the outcome of an auto-sync (queue shrank while popover closed).
  useEffect(() => {
    if (prevQueueLen.current > 0 && queue.length < prevQueueLen.current) {
      const synced = prevQueueLen.current - queue.length
      if (synced > 0 && !open) {
        toast.success(`Synced ${synced} offline bill${synced > 1 ? 's' : ''}`, {
          description: 'Internet is back — your offline bills are now in the books.',
        })
      }
    }
    prevQueueLen.current = queue.length
  }, [queue, open])

  const pending = queue.length
  const hasFailures = queue.some((b) => b.lastError)
  const state: ConnectionState = syncing
    ? 'syncing'
    : !online
      ? 'offline'
      : pending > 0
        ? 'pending'
        : 'online'

  const runSync = async () => {
    if (syncing || !online) return
    setSyncing(true)
    try {
      const r = await syncQueue()
      refresh()
      if (r.synced > 0) {
        toast.success(`Synced ${r.synced} bill${r.synced > 1 ? 's' : ''}`, {
          description: r.bills
            .slice(0, 3)
            .map((b) => `${b.billNo} · ${formatINR(b.total)}`)
            .join('  ·  '),
        })
      }
      if (r.failed > 0) {
        toast.error(`${r.failed} bill${r.failed > 1 ? 's' : ''} rejected by the server`, {
          description: 'Tap the sync icon to review and discard them.',
        })
      }
      if (r.synced === 0 && r.failed === 0 && r.offline) {
        toast.info('Still offline — will retry automatically')
      }
    } finally {
      setSyncing(false)
    }
  }

  /* ── Paper trail: rebuild the preview bill and hand out the same A5 PDF
   *     receipt the success screen produced (branch profile + staff name). */
  const savePaperTrail = (bill: QueuedBill) => {
    const branch = branchQuery.data?.branch
    if (!branch) {
      toast.error('Branch details not loaded yet — try again in a moment')
      return
    }
    try {
      const preview = queuedBillToPreview(bill, branch, user?.name ?? '')
      downloadReceiptPdf(preview, branch)
      toast.success('Offline receipt PDF downloaded', {
        description: `${preview.billNo} · ${formatINR(preview.total)} — hand it to the customer or file it for the books.`,
      })
    } catch {
      toast.error('Could not build the offline receipt PDF')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            state === 'offline'
              ? `Offline${pending ? ` — ${pending} bills queued` : ''}`
              : pending > 0
                ? `${pending} bills waiting to sync`
                : 'All bills synced'
          }
          className={cn(
            'relative flex size-9 items-center justify-center rounded-lg border shadow-sm transition-colors',
            state === 'offline' || state === 'pending'
              ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300'
              : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300',
          )}
        >
          {state === 'syncing' ? (
            <Loader2 className="size-4.5 animate-spin" aria-hidden />
          ) : state === 'offline' ? (
            <CloudOff className="size-4.5" aria-hidden />
          ) : state === 'pending' ? (
            <ArrowUpFromLine className="size-4.5" aria-hidden />
          ) : (
            <Signal className="size-4.5" aria-hidden />
          )}
          {/* Count badge */}
          <AnimatePresence>
            {pending > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className={cn(
                  'tnum absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow',
                  hasFailures ? 'bg-destructive' : 'bg-primary',
                )}
              >
                {pending}
              </motion.span>
            )}
          </AnimatePresence>
          {/* Sync-success flicker */}
          <AnimatePresence>
            {!syncing && online && pending === 0 && (
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute -right-1 -top-1 size-2 rounded-full bg-emerald-500"
              />
            )}
          </AnimatePresence>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg',
              state === 'offline'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
            )}
          >
            {state === 'offline' ? <CloudOff className="size-4" /> : <CheckCheck className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {state === 'offline' ? 'You are offline' : 'All synced'}
            </p>
            <p className="text-xs text-muted-foreground">
              {pending === 0
                ? 'Every bill is safely in the books.'
                : `${pending} bill${pending > 1 ? 's' : ''} saved on this device${
                    state === 'offline' ? ' — syncing when back online' : ''
                  }`}
            </p>
          </div>
          {pending > 0 && online && (
            <Button size="sm" className="h-8 gap-1" onClick={() => void runSync()} disabled={syncing}>
              {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              Sync now
            </Button>
          )}
        </div>

        {queue.length > 0 ? (
          <>
            <ul className="max-h-72 overflow-y-auto px-2 py-2">
              {queue.map((b, i) => (
                <motion.li
                  key={b.clientRequestId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-accent"
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg border text-xs font-bold',
                      b.lastError
                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                        : 'border-primary/25 bg-primary/5 text-primary',
                    )}
                  >
                    ₹{Math.round(b.display.total) >= 1000 ? `${Math.round(b.display.total / 1000)}k` : Math.round(b.display.total)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{b.display.itemSummary}</p>
                    <p className="tnum truncate text-[11px] text-muted-foreground">
                      {formatINR(b.display.total)} · {b.payload.paymentMethod} · {formatTime(b.display.createdAt)}
                      {b.lastError ? ` · ⚠ ${b.lastError}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Download this offline bill as a PDF receipt"
                    title="Offline receipt PDF — paper trail for the customer or the books"
                    onClick={() => savePaperTrail(b)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary focus-visible:opacity-100"
                  >
                    <Printer className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Discard this offline bill"
                    title="Discard this bill — it will never be synced"
                    onClick={() => void removeQueuedBill(b.clientRequestId)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </motion.li>
              ))}
            </ul>
            <div className="flex items-center gap-2 border-t px-3 py-2">
              <button
                type="button"
                onClick={() => queue.forEach(savePaperTrail)}
                className="flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                <FileDown className="size-3.5" aria-hidden />
                Download all {queue.length} receipts
              </button>
              <p className="min-w-0 flex-1 text-[10px] leading-tight text-muted-foreground">
                Paper trail — OFFLINE-XXXX numbers become real bill numbers after sync.
              </p>
            </div>
            <p className="border-t px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {hasFailures
                ? '⚠ A red bill was rejected by the server (e.g. its service was removed). Discard it or ask your admin.'
                : 'Offline bills carry the real payment time and never double-count — syncing is safe to retry.'}
            </p>
          </>
        ) : (
          <div className="px-4 py-6 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="mx-auto flex size-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            >
              <CheckCheck className="size-5" />
            </motion.div>
            <p className="mt-2 text-sm font-semibold">Nothing waiting</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Keep billing even when the internet drops — bills sync themselves.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
