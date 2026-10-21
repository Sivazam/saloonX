'use client'

import { useState } from 'react'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Download,
  FileText,
  Home,
  IndianRupee,
  Lightbulb,
  Loader2,
  Megaphone,
  Package,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  UsersRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { DuoCurrencyInr, DuoWarning } from '@/components/ui/duotone-icons'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatINR, formatDate, toDateKey } from '@/lib/format'
import type { ExpenseCategory, ExpenseDTO, ExpensesResponse } from '@/lib/types'
import { useAppStore } from '@/store/use-app-store'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './ui-atoms'
import { RangePicker, computePreset, type DateRange } from './range-picker'
import { downloadExpenseReportPdf } from './report-pdf'

/* ── Category metadata (icon + label + colors) ─────────────────────────────── */

interface CategoryMeta {
  label: string
  icon: LucideIcon
  chip: string // icon tile colors
}

const CATEGORY_META: Record<ExpenseCategory, CategoryMeta> = {
  RENT: { label: 'Rent', icon: Home, chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
  SUPPLIES: { label: 'Supplies', icon: Package, chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  SALARY: { label: 'Salary / Payouts', icon: UsersRound, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  UTILITY: { label: 'Utilities', icon: Lightbulb, chip: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  MARKETING: { label: 'Marketing', icon: Megaphone, chip: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  MAINTENANCE: { label: 'Maintenance', icon: Wrench, chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' },
  OTHER: { label: 'Other', icon: TrendingDown, chip: 'bg-muted text-muted-foreground' },
}

const CATEGORY_ORDER: ExpenseCategory[] = [
  'RENT',
  'SUPPLIES',
  'SALARY',
  'UTILITY',
  'MARKETING',
  'MAINTENANCE',
  'OTHER',
]

function CategoryBadge({ category }: { category: ExpenseCategory }) {
  const meta = CATEGORY_META[category] ?? CATEGORY_META.OTHER
  const Icon = meta.icon
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${meta.chip}`} aria-hidden>
      <Icon className="size-4.5" />
    </span>
  )
}

/* ── Add / Edit dialog ─────────────────────────────────────────────────────── */

interface ExpenseFormState {
  id?: string
  category: ExpenseCategory
  description: string
  amount: string
  date: string // YYYY-MM-DD
  /** Which branch this expense belongs to. */
  branchId?: string
}

const emptyForm = (): ExpenseFormState => ({
  category: 'SUPPLIES',
  description: '',
  amount: '',
  date: toDateKey(new Date()),
})

function ExpenseDialog({
  open,
  onOpenChange,
  initial,
  branches,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: ExpenseFormState
  branches: { id: string; name: string; city?: string | null }[]
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<ExpenseFormState>(initial)
  const [saving, setSaving] = useState(false)

  // Re-seed the form each time the dialog opens (id-keyed remount would also work).
  const [seed, setSeed] = useState(initial)
  if (open && seed !== initial) {
    setSeed(initial)
    setForm(initial)
  }

  const set = <K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const amountNum = Number(form.amount)
  const amountValid = Number.isFinite(amountNum) && amountNum >= 0.5
  const editing = Boolean(form.id)

  const save = async () => {
    if (!amountValid) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        category: form.category,
        description: form.description.trim() || null,
        amount: Math.round(amountNum * 100) / 100,
        date: form.date,
        ...(form.branchId ? { branchId: form.branchId } : {}),
      }
      if (editing) {
        await apiPut('/api/expenses', { id: form.id, ...body })
      } else {
        await apiPost('/api/expenses', body)
      }
      await qc.invalidateQueries({ queryKey: ['expenses-list'] })
      await qc.invalidateQueries({ queryKey: ['stats'] })
      toast.success(editing ? 'Expense updated' : 'Expense added')
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DuoCurrencyInr className="size-5 text-rose-600 dark:text-rose-400" />
            {editing ? 'Edit Expense' : 'Add Expense'}
          </DialogTitle>
          <DialogDescription>
            Rent, supplies, salaries — everything the salon spends.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_ORDER.map((c) => {
                const meta = CATEGORY_META[c]
                const Icon = meta.icon
                const active = form.category === c
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('category', c)}
                    className={`flex h-12 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      active ? 'border-primary bg-primary/10 text-primary' : 'bg-card hover:bg-accent'
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-amount">Amount (₹)</Label>
            <div className="relative">
              <IndianRupee
                className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="exp-amount"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 9)
                  set('amount', v)
                }}
                placeholder="0"
                autoFocus
                className="h-14 pl-10 text-2xl font-bold tabular-nums"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && amountValid) void save()
                }}
              />
            </div>
            {form.amount !== '' && !amountValid && (
              <p className="text-xs font-medium text-destructive">Enter at least ₹0.50</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-desc">Description (optional)</Label>
            <Input
              id="exp-desc"
              value={form.description}
              onChange={(e) => set('description', e.target.value.slice(0, 120))}
              placeholder="e.g. Shampoo stock, October rent"
              className="h-12"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exp-date">Date</Label>
            <Input
              id="exp-date"
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
              className="h-12"
              max={toDateKey(new Date())}
            />
          </div>
          {branches.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="exp-branch">Branch</Label>
              <Select
                value={form.branchId ?? branches[0]?.id ?? ''}
                onValueChange={(v) => set('branchId', v)}
              >
                <SelectTrigger id="exp-branch" className="h-12">
                  <SelectValue placeholder="Choose a branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name.split('—')[1]?.trim() || b.name}
                      {b.city ? ` · ${b.city}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            size="lg"
            className="h-14 w-full text-base font-bold"
            disabled={!amountValid || saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Expense'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── View ──────────────────────────────────────────────────────────────────── */

export default function ExpensesView() {
  const [range, setRange] = useState<DateRange>(() => computePreset('month'))
  const [category, setCategory] = useState<string>('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ExpenseFormState>(emptyForm)
  const [confirmDelete, setConfirmDelete] = useState<ExpenseDTO | null>(null)
  const qc = useQueryClient()
  const setView = useAppStore((s) => s.setView)
  const currentBranch = useAppStore((s) => s.currentBranch)
  const scopeBranches = useAppStore((s) => s.branches)
  const user = useAppStore((s) => s.user)

  const expensesQ = useInfiniteQuery({
    queryKey: ['expenses-list', range.from, range.to, category, branchFilter],
    queryFn: ({ pageParam }) =>
      apiGet<ExpensesResponse>(
        `/api/expenses?from=${range.from}&to=${range.to}${category ? `&category=${category}` : ''}${branchFilter !== 'all' ? `&branchId=${branchFilter}` : ''}&page=${pageParam}&limit=100`,
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, pg) => n + pg.data.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
  })
  const expenses = expensesQ.data ? expensesQ.data.pages.flatMap((p) => p.data) : []
  const total = expensesQ.data?.pages[0]?.total ?? 0
  const branchOptions = expensesQ.data?.pages[0]?.branches ?? scopeBranches

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['expenses-list'] })
    await qc.invalidateQueries({ queryKey: ['stats'] })
  }

  const remove = async (e: ExpenseDTO) => {
    try {
      await apiDelete(`/api/expenses?id=${e.id}`)
      await invalidate()
      toast.success('Expense deleted')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setConfirmDelete(null)
    }
  }

  const summary = expensesQ.data?.pages[0]?.summary
  const byCategorySorted = summary
    ? Object.entries(summary.byCategory).sort((a, b) => b[1].amount - a[1].amount)
    : []
  const maxCatAmount = byCategorySorted[0]?.[1].amount ?? 1

  /* ── Exports (apply the ACTIVE range/category/branch filters) ── */
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  function exportFilterQS() {
    const p = new URLSearchParams({ from: range.from, to: range.to, limit: '1000' })
    if (category) p.set('category', category)
    if (branchFilter !== 'all') p.set('branchId', branchFilter)
    return p.toString()
  }

  async function exportCsv() {
    if (exporting) return
    setExporting('csv')
    try {
      const qs = exportFilterQS()
      // Authorised via the session cookie — same fetch as any API call.
      const res = await fetch(`/api/export/expenses?${qs}`)
      if (!res.ok) throw new Error('Could not prepare the CSV')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `saloonx-expenses-${range.from}-to-${range.to}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Expense CSV downloaded', {
        description: 'Includes every entry in the current range, category and branch filters.',
      })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExporting(null)
    }
  }

  async function exportPdf() {
    if (exporting) return
    setExporting('pdf')
    try {
      const qs = exportFilterQS()
      // Up to 1,000 entries per PDF (the API's export ceiling) — beyond that
      // the PDF is truncated and says so, and the CSV carries the full ledger.
      const all = await apiGet<ExpensesResponse>(`/api/expenses?${qs}`)
      if (all.data.length === 0) {
        toast.error('No expenses in this range to export')
        return
      }
      const scopeName =
        branchFilter !== 'all'
          ? (branchOptions.find((b) => b.id === branchFilter)?.name ?? user?.tenantName ?? 'SaloonX')
          : (user?.tenantName ?? 'SaloonX')
      const rangeLabel = category
        ? `${CATEGORY_META[category as ExpenseCategory]?.label ?? category} · ${formatDate(`${range.from}T00:00:00`)} – ${formatDate(`${range.to}T00:00:00`)}`
        : `${formatDate(`${range.from}T00:00:00`)} – ${formatDate(`${range.to}T00:00:00`)}`
      const truncated = all.total > all.data.length ? { shown: all.data.length, total: all.total } : undefined
      downloadExpenseReportPdf(
        all.data,
        scopeName,
        user?.tenantLogo ?? null,
        rangeLabel,
        { scope: scopeName, from: range.from, to: range.to },
        truncated,
      )
      if (truncated) {
        toast.warning(
          `PDF shows the first ${truncated.shown.toLocaleString('en-IN')} of ${truncated.total.toLocaleString('en-IN')} entries`,
          { description: 'Download the CSV for the complete ledger.' },
        )
      } else {
        toast.success('Expense report downloaded', {
          description: `${all.data.length} entries · ${formatINR(all.summary.total)} total.`,
        })
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExporting(null)
    }
  }

  const openAdd = () => {
    setForm({ ...emptyForm(), branchId: currentBranch?.id ?? scopeBranches[0]?.id })
    setDialogOpen(true)
  }
  const openEdit = (e: ExpenseDTO) => {
    setForm({
      id: e.id,
      category: e.category,
      description: e.description ?? '',
      amount: String(e.amount),
      date: toDateKey(new Date(e.date)),
      branchId: e.branchId,
    })
    setDialogOpen(true)
  }

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Expenses</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Track salon spending — powers the profit line on the{' '}
            <button
              type="button"
              className="font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => setView('dashboard')}
            >
              dashboard
            </button>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker value={range} onChange={setRange} />
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={() => void exportCsv()}
            disabled={exporting !== null || expensesQ.isPending}
            aria-label="Export expenses as CSV"
          >
            {exporting === 'csv' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
            <span className="hidden sm:inline">CSV</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5"
            onClick={() => void exportPdf()}
            disabled={exporting !== null || expensesQ.isPending}
            aria-label="Export expenses as PDF"
          >
            {exporting === 'pdf' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />}
            <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button size="sm" className="h-10 gap-1.5" onClick={openAdd}>
            <Plus className="size-4" aria-hidden />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Category filter chips */}
      <div className="relative mt-4">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition-colors ${
            category === '' ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
          }`}
        >
          All
        </button>
        {CATEGORY_ORDER.map((c) => {
          const meta = CATEGORY_META[c]
          const active = category === c
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(active ? '' : c)}
              className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${
                active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent'
              }`}
            >
              <meta.icon className="size-3.5" aria-hidden />
              {meta.label}
            </button>
          )
        })}
        </div>
        {/* Right-edge fade: hints the chips row scrolls */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
      </div>

      {expensesQ.isError ? (
        <div className="mt-6 rounded-2xl border bg-card">
          <EmptyState icon={DuoWarning} title="Could not load expenses" hint={(expensesQ.error as Error).message} />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void expensesQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : expensesQ.isPending ? (
        <div className="mt-4 space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Summary card — total + per-category bars */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-2xl border bg-card p-4 shadow-sm lg:p-5"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Total expenses
                <span className="ml-2 font-normal text-muted-foreground">
                  {total.toLocaleString('en-IN')} {total === 1 ? 'entry' : 'entries'}
                </span>
              </h2>
              <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                −{formatINR(summary?.total ?? 0)}
              </p>
            </div>
            {byCategorySorted.length > 0 && (
              <div className="mt-4 space-y-2.5">
                {byCategorySorted.map(([cat, v]) => {
                  const meta = CATEGORY_META[cat as ExpenseCategory] ?? CATEGORY_META.OTHER
                  const Icon = meta.icon
                  const pct = Math.max(4, Math.round((v.amount / maxCatAmount) * 100))
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.chip}`} aria-hidden>
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate font-semibold">{meta.label}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                            {formatINR(v.amount)} · {v.count}
                          </span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            className="h-full rounded-full bg-rose-500/70"
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* Entries */}
          <div className="mt-5 space-y-2">
            {expenses.length === 0 ? (
              <div className="rounded-2xl border bg-card p-10 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-500/10">
                  <DuoCurrencyInr className="size-7 text-rose-600 dark:text-rose-400" />
                </div>
                <p className="mt-4 text-lg font-semibold">No expenses in this range</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Add rent, supply purchases, salaries — the dashboard shows your profit.
                </p>
                <Button className="mt-4 h-12 px-6" onClick={openAdd}>
                  <Plus className="size-5" aria-hidden />
                  Add Expense
                </Button>
              </div>
            ) : (
              expenses.map((e, i) => (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.03, duration: 0.2 }}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm lg:p-4"
                >
                  <CategoryBadge category={e.category} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {e.description || CATEGORY_META[e.category].label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(e.date)} · {CATEGORY_META[e.category].label} · by {e.createdByName}
                      {scopeBranches.length > 1 && e.branchName !== '—'
                        ? ` · ${e.branchName.split('—')[1]?.trim() || e.branchName}`
                        : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-base font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    −{formatINR(e.amount)}
                  </p>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 rounded-xl"
                      aria-label={`Edit expense ${e.description ?? ''}`}
                      onClick={() => openEdit(e)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-10 rounded-xl text-muted-foreground hover:text-destructive"
                      aria-label={`Delete expense ${e.description ?? ''}`}
                      onClick={() => setConfirmDelete(e)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </motion.div>
              ))
            )}

            {/* Load more — the list pages 100 entries at a time instead of
                silently truncating; "Showing X of Y" keeps the tail visible. */}
            {expenses.length > 0 && total > expenses.length && (
              <div className="space-y-2 pt-1">
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => void expensesQ.fetchNextPage()}
                  disabled={expensesQ.isFetchingNextPage}
                >
                  {expensesQ.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
                  Load more
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Showing {expenses.length.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} entries
                </p>
              </div>
            )}
            {expenses.length > 0 && total === expenses.length && total > 100 && (
              <p className="pt-1 text-center text-xs text-muted-foreground">
                Showing all {total.toLocaleString('en-IN')} entries
              </p>
            )}
          </div>
        </>
      )}

      {/* Add/Edit dialog */}
      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={form}
        branches={branchOptions}
        onSaved={() => {
          void invalidate()
        }}
      />

      {/* Delete confirm */}
      <Dialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this expense?</DialogTitle>
            <DialogDescription>
              {confirmDelete
                ? `${confirmDelete.description ?? CATEGORY_META[confirmDelete.category].label} · ${formatINR(confirmDelete.amount)} on ${formatDate(confirmDelete.date)}. This cannot be undone.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:flex-row-reverse">
            <Button
              variant="destructive"
              className="h-12"
              onClick={() => confirmDelete && void remove(confirmDelete)}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
            <Button variant="outline" className="h-12" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
