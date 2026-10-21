'use client'

import { useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Ban,
  Banknote,
  Copy,
  CreditCard,
  Download,
  FileDown,
  Loader2,
  QrCode,
  RotateCcw,
  Search,
  Split,
  StickyNote,
} from 'lucide-react'
import { DuoReceipt, DuoWarning } from '@/components/ui/duotone-icons'
import { cn } from '@/lib/utils'
import { apiGet, apiPut } from '@/lib/api-client'
import { formatDateTime, formatDate, formatINR, formatTime } from '@/lib/format'
import type {
  MethodSummary,
  TransactionDTO,
  TransactionsResponse,
} from '@/lib/types'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, METHOD_META, MethodBadge, useDebouncedValue, type StaffListResponse } from './ui-atoms'
import { RangePicker, computePreset, type DateRange } from './range-picker'
import type { BranchProfileDTO } from '@/lib/types'
import { downloadReportPdf } from './report-pdf'
import { buildReceiptText, downloadReceiptPdf } from '@/components/billing/receipt-pdf'
import { shareReceiptPdf } from '@/components/billing/receipt-share'
import { en } from '@/lib/i18n'
import { useAppStore } from '@/store/use-app-store'

/* ── Status badge (Paid / Voided) ─────────────────────────────────────────── */

export function StatusBadge({ status }: { status: string }) {
  if (status === 'VOIDED') {
    return (
      <Badge className="gap-1 border-transparent bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-950">
        <Ban className="size-3" aria-hidden />
        Voided
      </Badge>
    )
  }
  return (
    <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-950">
      Paid
    </Badge>
  )
}

/* ── Bill detail (receipt-style) + void action ─────────────────────────────── */

function BillDetailDialog({
  bill,
  branch,
  isAdmin,
  onClose,
}: {
  bill: TransactionDTO | null
  branch?: BranchProfileDTO
  isAdmin: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [voidOpen, setVoidOpen] = useState(false)
  const [reason, setReason] = useState('')

  const isVoided = bill?.status === 'VOIDED'

  /* Re-send the receipt as the printed-style PDF — never a text receipt. */
  function handleShareWhatsApp() {
    if (!bill || !branch) return
    shareReceiptPdf(bill, branch, { whatsapp: true, L: en })
  }

  function handleCopyReceipt() {
    if (!bill || !branch) return
    void navigator.clipboard.writeText(buildReceiptText(bill, branch))
    toast.success('Receipt copied to clipboard')
  }

  function handleDownloadReceipt() {
    if (!bill || !branch) return
    downloadReceiptPdf(bill, branch)
    toast.success(`Downloading ${bill.billNo} receipt…`)
  }

  const voidMutation = useMutation({
    mutationFn: () =>
      apiPut<{ transaction: TransactionDTO }>('/api/transactions/void', {
        id: bill?.id,
        reason: reason.trim(),
      }),
    onSuccess: (res) => {
      toast.success(`Bill ${res.transaction.billNo} voided`)
      setVoidOpen(false)
      setReason('')
      onClose()
      void queryClient.invalidateQueries({ queryKey: ['transactions-list'] })
      void queryClient.invalidateQueries({ queryKey: ['stats'] })
      void queryClient.invalidateQueries({ queryKey: ['recent-bills'] })
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
      void queryClient.invalidateQueries({ queryKey: ['customers-list'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <>
      <Dialog open={!!bill} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          {bill && (
            <>
              <DialogHeader className="border-b pb-4 text-center sm:text-center">
                <DialogTitle className="font-mono text-base tracking-wide">{bill.billNo}</DialogTitle>
                <DialogDescription>
                  {branch?.name ? `${branch.name} · ` : ''}
                  {formatDateTime(bill.createdAt)}
                </DialogDescription>
              </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-muted/60 p-3 text-sm">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Customer</p>
                  <p className="mt-0.5 truncate font-medium">
                    {bill.customerName || bill.customerMobile || (
                      <span className="italic text-muted-foreground">Walk-in</span>
                    )}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Served by</p>
                  <p className="mt-0.5 truncate font-medium">{bill.staffName}</p>
                </div>
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Payment</p>
                  <div className="mt-1">
                    <MethodBadge method={bill.paymentMethod} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Status</p>
                  <div className="mt-1">
                    <StatusBadge status={bill.status} />
                  </div>
                </div>
              </div>

              {bill.status === 'VOIDED' && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/50">
                  <Ban className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-semibold text-red-800 dark:text-red-300">
                      Voided {bill.voidedAt ? `· ${formatDateTime(bill.voidedAt)}` : ''}
                    </p>
                    {bill.voidReason && (
                      <p className="mt-0.5 text-red-700/90 dark:text-red-400/90">Reason: {bill.voidReason}</p>
                    )}
                    <p className="mt-0.5 text-xs text-red-700/70 dark:text-red-400/70">
                      This bill is excluded from all revenue reports and customer loyalty counts.
                    </p>
                  </div>
                </div>
              )}

              {bill.note && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/70 dark:bg-amber-950/40">
                  <StickyNote className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium tracking-wide text-amber-700/80 uppercase dark:text-amber-400/80">
                      Note
                    </p>
                    <p className="mt-0.5 break-words font-medium">{bill.note}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {bill.items.map((it) => (
                  <div key={it.id} className="flex items-baseline gap-2 text-sm">
                    <p className="min-w-0 flex-1 truncate">
                      {it.serviceName}
                      {it.qty > 1 && <span className="text-muted-foreground"> ×{it.qty}</span>}
                    </p>
                    <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {it.qty} × {formatINR(it.price)}
                    </p>
                    <p className="w-16 shrink-0 text-right font-medium tabular-nums">
                      {formatINR(it.price * it.qty)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 border-t pt-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatINR(bill.subtotal)}</span>
                </div>
                {bill.discountAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Discount ({bill.discountPct}%)</span>
                    <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                      −{formatINR(bill.discountAmount)}
                    </span>
                  </div>
                )}
                {bill.gstAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>GST ({bill.gstPct}%)</span>
                    <span className="tabular-nums">{formatINR(bill.gstAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-base font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatINR(bill.total)}</span>
                </div>
              </div>

              {branch?.receiptFooter && (
                <p className="border-t pt-3 text-center text-xs text-muted-foreground">
                  {branch.receiptFooter}
                </p>
              )}
            </div>

            <div className="border-t pt-4">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  className="h-11 gap-1.5"
                  disabled={isVoided || !branch}
                  onClick={handleShareWhatsApp}
                >
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24M8.53 7.33c-.16 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1 2.56.14.19 1.76 2.84 4.3 3.86 2.13.86 2.56.69 3.02.64.47-.04 1.51-.61 1.72-1.21.21-.6.21-1.11.15-1.21-.06-.1-.22-.16-.47-.28-.25-.13-1.47-.72-1.69-.81-.23-.08-.37-.12-.56.12-.16.25-.64.81-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-2-1.23-.73-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.09-.17.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.84-.2-.48-.4-.42-.56-.43l-.48-.01" />
                  </svg>
                  WhatsApp PDF
                </Button>
                <Button variant="outline" className="h-11 gap-1.5" disabled={isVoided || !branch} onClick={handleCopyReceipt}>
                  <Copy aria-hidden />
                  Copy
                </Button>
                <Button variant="outline" className="h-11 gap-1.5" disabled={isVoided || !branch} onClick={handleDownloadReceipt}>
                  <Download aria-hidden />
                  PDF
                </Button>
              </div>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {isVoided
                  ? 'Receipt sharing is disabled for voided bills.'
                  : bill.customerMobile
                    ? 'Sends the printed-style PDF receipt to the customer\u2019s WhatsApp chat.'
                    : 'Walk-in bill — the PDF downloads so you can send it anywhere.'}
              </p>
            </div>

            {isAdmin && !isVoided && (
              <div className="border-t pt-4">
                <Button
                  variant="outline"
                  className="w-full text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
                  onClick={() => setVoidOpen(true)}
                >
                  <Ban aria-hidden />
                  Void this bill
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>

    {/* Void confirmation */}
    <Dialog open={voidOpen} onOpenChange={(open) => !open && setVoidOpen(false)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-5 text-red-600 dark:text-red-400" aria-hidden />
            Void bill {bill?.billNo}?
          </DialogTitle>
          <DialogDescription>
            The bill stays in the ledger for audit, but is removed from revenue, staff stats and
            customer loyalty counts. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="void-reason" className="text-sm font-medium">
            Reason <span className="text-muted-foreground">(required)</span>
          </label>
          <Input
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Wrong amount, cancelled service…"
            maxLength={200}
            aria-invalid={reason.trim().length > 0 && reason.trim().length < 3}
          />
          <p
            className={cn(
              'text-xs',
              reason.trim().length >= 3 ? 'text-muted-foreground' : 'text-destructive',
            )}
          >
            {reason.trim().length >= 3
              ? 'Stays on the audit trail next to the voided bill.'
              : 'Give a short reason — at least 3 characters.'}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setVoidOpen(false)} disabled={voidMutation.isPending}>
            Keep bill
          </Button>
          <Button
            variant="destructive"
            onClick={() => voidMutation.mutate()}
            disabled={voidMutation.isPending || reason.trim().length < 3}
          >
            {voidMutation.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Ban aria-hidden />}
            Void bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}

/* ── View ──────────────────────────────────────────────────────────────────── */

export default function TransactionsView() {
  const user = useAppStore((s) => s.user)
  const scopeBranches = useAppStore((s) => s.branches)
  const [range, setRange] = useState<DateRange>(() => computePreset('30d'))
  const [method, setMethod] = useState('')
  const [staffId, setStaffId] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TransactionDTO | null>(null)
  const debouncedSearch = useDebouncedValue(search, 400)

  const staffQ = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet<StaffListResponse>('/api/staff'),
  })
  const branchQ = useQuery({
    queryKey: ['branch'],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>('/api/branch'),
  })

  const listQ = useInfiniteQuery({
    queryKey: ['transactions-list', range.from, range.to, method, staffId, branchFilter, debouncedSearch],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({
        from: range.from,
        to: range.to,
        page: String(pageParam),
        limit: '25',
      })
      if (method) p.set('method', method)
      if (staffId !== 'all') p.set('staffId', staffId)
      if (branchFilter !== 'all') p.set('branchId', branchFilter)
      if (debouncedSearch) p.set('search', debouncedSearch)
      return apiGet<TransactionsResponse>(`/api/transactions?${p.toString()}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, pg) => n + pg.data.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
  })

  const rows = useMemo(
    () => (listQ.data ? listQ.data.pages.flatMap((p) => p.data) : []),
    [listQ.data],
  )
  const summary = listQ.data?.pages[0]?.summary
  const total = listQ.data?.pages[0]?.total ?? 0

  function resetFilters() {
    setMethod('')
    setStaffId('all')
    setBranchFilter('all')
    setSearch('')
    setRange(computePreset('30d'))
  }

  // Exporting state mirrors the expenses view: blocks re-clicks and shows a
  // spinner on the CSV button. fetch+blob+<a download> survives popup
  // blockers (window.open('/api/export/csv') does not, on iOS Safari and on
  // most desktop browsers in stricter popup-blocking modes).
  const [exportingCsv, setExportingCsv] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  async function exportCsv() {
    if (exportingCsv) return
    setExportingCsv(true)
    toast('Preparing CSV…')
    try {
      // The CSV must mirror the on-screen filters exactly (method, staff,
      // search, branch) — otherwise the export silently disagrees with the
      // ledger the owner is looking at.
      const p = new URLSearchParams({ from: range.from, to: range.to })
      if (method) p.set('method', method)
      if (staffId !== 'all') p.set('staffId', staffId)
      if (branchFilter !== 'all') p.set('branchId', branchFilter)
      if (debouncedSearch) p.set('search', debouncedSearch)
      // Authorised via the session cookie — same fetch as any other API call.
      const res = await fetch(`/api/export/csv?${p.toString()}`)
      if (!res.ok) throw new Error('Could not prepare the CSV')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `saloonx-bills-${range.from}-to-${range.to}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Bills CSV downloaded', {
        description: 'Mirrors the filters above (voided bills included for audit).',
      })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExportingCsv(false)
    }
  }

  async function exportPdf() {
    if (exportingPdf || !summary || !branchQ.data?.branch) return
    setExportingPdf(true)
    const tid = toast.loading('Preparing export…')
    try {
      // The PDF must cover the WHOLE filter, not just the loaded page —
      // loop-fetch every page (100/page, newest first) with a progress toast.
      // Capped at 4,000 bills so the browser stays responsive on huge ledgers.
      const PAGE_SIZE = 100
      const EXPORT_CAP = 4000
      const allRows: TransactionDTO[] = []
      let filterTotal = 0
      for (let page = 1; ; page += 1) {
        const p = new URLSearchParams({
          from: range.from,
          to: range.to,
          page: String(page),
          limit: String(PAGE_SIZE),
        })
        if (method) p.set('method', method)
        if (staffId !== 'all') p.set('staffId', staffId)
        if (branchFilter !== 'all') p.set('branchId', branchFilter)
        if (debouncedSearch) p.set('search', debouncedSearch)
        const res = await apiGet<TransactionsResponse>(`/api/transactions?${p.toString()}`)
        filterTotal = res.total
        allRows.push(...res.data)
        toast.loading(`Preparing export… ${Math.min(allRows.length, EXPORT_CAP).toLocaleString('en-IN')} bills`, { id: tid })
        if (res.data.length === 0 || allRows.length >= res.total || allRows.length >= EXPORT_CAP) break
      }
      // PDF mirrors the revenue summary: voided bills are excluded (they stay
      // in the ledger + CSV export for the full audit trail).
      const paidRows = allRows.filter((r) => r.status !== 'VOIDED')
      if (!paidRows.length) {
        toast.error('All bills in this filter are voided — nothing to export', { id: tid })
        return
      }
      downloadReportPdf(paidRows, summary, branchQ.data.branch, range.from, range.to)
      if (filterTotal > EXPORT_CAP) {
        toast.warning(
          `PDF covers the newest ${EXPORT_CAP.toLocaleString('en-IN')} bills — use the CSV for all ${filterTotal.toLocaleString('en-IN')}`,
          { id: tid },
        )
      } else {
        toast.success(`PDF downloaded — ${paidRows.length.toLocaleString('en-IN')} paid bills`, { id: tid })
      }
    } catch (e) {
      toast.error((e as Error).message, { id: tid })
    } finally {
      setExportingPdf(false)
    }
  }

  const pdfDisabled = rows.length === 0 || !branchQ.data?.branch

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      {/* Sticky filter bar */}
      <div className="sticky top-16 z-20 -mx-4 -mt-4 bg-background/95 px-4 pt-4 pb-3 backdrop-blur lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-6 lg:pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Transactions</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Search, filter and export bills</p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={exportingCsv}>
                  {exportingCsv ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download aria-hidden />}
                  <span className="hidden sm:inline">CSV</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export filtered bills as CSV</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void exportPdf()}
                    disabled={pdfDisabled || exportingPdf}
                  >
                    {exportingPdf ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileDown aria-hidden />}
                    <span className="hidden sm:inline">PDF</span>
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {pdfDisabled
                  ? 'No bills to export'
                  : exportingPdf
                    ? 'Building the PDF — fetching every bill in the filter…'
                    : 'Download PDF report of every bill in the filter'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker value={range} onChange={setRange} />
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              className="rounded-lg"
              value={method || 'ALL'}
              onValueChange={(v) => setMethod(v === 'ALL' || v === '' ? '' : v)}
            >
              <ToggleGroupItem value="ALL" className="px-2.5 text-xs">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="CASH" className="gap-1 px-2.5 text-xs">
                <Banknote className="size-3.5" aria-hidden />
                Cash
              </ToggleGroupItem>
              <ToggleGroupItem value="UPI" className="gap-1 px-2.5 text-xs">
                <QrCode className="size-3.5" aria-hidden />
                UPI
              </ToggleGroupItem>
              <ToggleGroupItem value="CARD" className="gap-1 px-2.5 text-xs">
                <CreditCard className="size-3.5" aria-hidden />
                Card
              </ToggleGroupItem>
              <ToggleGroupItem value="SPLIT" className="gap-1 px-2.5 text-xs">
                <Split className="size-3.5" aria-hidden />
                Split
              </ToggleGroupItem>
            </ToggleGroup>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Filter by staff">
                <SelectValue placeholder="All staff" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All staff</SelectItem>
                {staffQ.data?.users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {scopeBranches.length > 1 && (
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger size="sm" className="w-[10.5rem]" aria-label="Filter by branch">
                  <SelectValue placeholder="All branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {scopeBranches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name.split('—')[1]?.trim() || b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="relative min-w-[150px] flex-1 sm:max-w-xs">
              <Search
                className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Bill no, mobile or name"
                className="h-8 pl-8 text-sm"
                aria-label="Search bills"
              />
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw aria-hidden />
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Summary strip */}
      {listQ.isPending ? (
        <Skeleton className="mt-4 h-[5.5rem] rounded-xl lg:mt-5" />
      ) : summary ? (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-3 sm:grid-cols-4 lg:mt-5 lg:p-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Revenue</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums">{formatINR(summary.revenue)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Paid bills
              {total > summary.count && (
                <span className="ml-1 font-normal normal-case text-muted-foreground/80">
                  +{(total - summary.count).toLocaleString('en-IN')} voided
                </span>
              )}
            </p>
            <p className="mt-0.5 text-lg font-bold tabular-nums">{summary.count.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Avg Bill</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums">{formatINR(summary.avgBill)}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Payment Split</p>
            <div className="mt-1 space-y-0.5">
              {(['CASH', 'UPI', 'CARD', 'SPLIT'] as const).map((m) => {
                // SPLIT (mixed-tender) appears only once it has activity — the
                // server bucket arrives with billing v1.1.
                const v = (summary.byMethod as Record<string, MethodSummary | undefined>)[m]
                if (m === 'SPLIT' && (!v || (v.count === 0 && v.amount === 0))) return null
                return (
                  <div key={m} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn('size-1.5 shrink-0 rounded-full', METHOD_META[m].dotClass)} aria-hidden />
                    <span className="w-7 shrink-0">{METHOD_META[m].label}</span>
                    <span className="truncate font-medium text-foreground tabular-nums">
                      {formatINR(v?.amount ?? 0)}
                    </span>
                    <span className="tabular-nums">({v?.count ?? 0})</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Ledger */}
      {listQ.isPending ? (
        <div className="mt-4 space-y-2 lg:mt-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl md:h-12" />
          ))}
        </div>
      ) : listQ.isError ? (
        <div className="mt-4 rounded-2xl border bg-card lg:mt-5">
          <EmptyState icon={DuoWarning} title="Could not load bills" hint={(listQ.error as Error).message} />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void listQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4 rounded-2xl border bg-card lg:mt-5">
          <EmptyState
            icon={DuoReceipt}
            title="No bills found"
            hint={
              debouncedSearch || method || staffId !== 'all' || branchFilter !== 'all'
                ? 'No bills match the current filters — try widening the date range or clearing them.'
                : 'No bills in this date range yet. Once a bill is rung up on the Billing screen, it appears here.'
            }
            action={
              <Button
                variant="outline"
                size="sm"
                className="mt-1 gap-1.5"
                onClick={resetFilters}
              >
                <RotateCcw className="size-4" aria-hidden />
                Reset filters
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block lg:mt-5">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Bill No</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="pr-4 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow
                    key={t.id}
                    className={cn('cursor-pointer', t.status === 'VOIDED' && 'opacity-60')}
                    onClick={() => setSelected(t)}
                  >
                    <TableCell className="pl-4 font-mono text-[13px] font-semibold">
                      {t.billNo}
                    </TableCell>
                    <TableCell>
                      <span className="block text-[13px]">{formatDate(t.createdAt)}</span>
                      <span className="block text-[11px] text-muted-foreground">{formatTime(t.createdAt)}</span>
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      <span className="block truncate text-[13px]">
                        {t.customerName || t.customerMobile || (
                          <span className="italic text-muted-foreground">Walk-in</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[180px]">
                      <span className="block truncate text-[13px]">{t.items[0]?.serviceName ?? '—'}</span>
                      {t.items.length > 1 && (
                        <span className="block text-[11px] text-muted-foreground">
                          +{t.items.length - 1} more
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px]">{t.staffName}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <MethodBadge method={t.paymentMethod} />
                        {t.status === 'VOIDED' && <StatusBadge status={t.status} />}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'pr-4 text-right font-semibold tabular-nums',
                        t.status === 'VOIDED' && 'text-muted-foreground line-through',
                      )}
                    >
                      {formatINR(t.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-2.5 md:hidden">
            {rows.map((t, i) => (
              <motion.button
                key={t.id}
                type="button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.03, duration: 0.22 }}
                onClick={() => setSelected(t)}
                className="w-full rounded-2xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-accent/50 active:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold">{t.billNo}</p>
                  <p
                    className={cn(
                      'text-base font-bold tabular-nums',
                      t.status === 'VOIDED' && 'text-muted-foreground line-through',
                    )}
                  >
                    {formatINR(t.total)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <span>
                    {formatDate(t.createdAt)}, {formatTime(t.createdAt)}
                  </span>
                  <span className="max-w-[45%] truncate">
                    {t.customerName || t.customerMobile || <span className="italic">Walk-in</span>}
                  </span>
                  {scopeBranches.length > 1 && (
                    <span className="max-w-[45%] truncate rounded-full border bg-background px-1.5 py-px text-[10px] font-medium">
                      {t.branchName.split('—')[1]?.trim() || t.branchName}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <MethodBadge method={t.paymentMethod} />
                    {t.status === 'VOIDED' && <StatusBadge status={t.status} />}
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {t.items.map((it) => it.serviceName).join(', ')}
                  </span>
                  <span className="shrink-0 text-muted-foreground">{t.staffName}</span>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Load more */}
          <div className="mt-4 space-y-2">
            {listQ.hasNextPage && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
              >
                {listQ.isFetchingNextPage ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : null}
                Load more
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Showing {rows.length} of {total.toLocaleString('en-IN')} bills
            </p>
          </div>
        </>
      )}

      <BillDetailDialog
        bill={selected}
        branch={branchQ.data?.branch}
        isAdmin={user?.role === 'ADMIN'}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
