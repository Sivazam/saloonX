'use client'

import { useMemo, useState } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { BadgePercent, Cake, CalendarClock, Check, Loader2, MessageCircle, Pencil, Search, StickyNote, X } from 'lucide-react'
import { DuoCalendarBlank, DuoUsers, DuoWarning } from '@/components/ui/duotone-icons'
import { toast } from 'sonner'
import { apiGet, apiPut } from '@/lib/api-client'
import { formatDate, formatDateTime, formatINR } from '@/lib/format'
import type { BranchProfileDTO, CustomerDTO, CustomerHistoryResponse } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, initials, useDebouncedValue, type CustomersResponse } from './ui-atoms'
import { MethodBadge } from './ui-atoms'
import { StatusBadge } from './transactions-view'
import { useAppStore } from '@/store/use-app-store'
import { Scissors } from 'lucide-react'
import { cn } from '@/lib/utils'

const LOYALTY_BADGE_CLASS =
  'border-transparent bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:hover:bg-rose-950'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Days until the next occurrence of a recurring "MM-DD" birthday (0 = today). */
function daysUntilBirthday(mmdd: string): number {
  const [mm, dd] = mmdd.split('-').map(Number)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let next = new Date(now.getFullYear(), mm - 1, dd)
  if (next < startOfToday) next = new Date(now.getFullYear() + 1, mm - 1, dd)
  return Math.round((next.getTime() - startOfToday.getTime()) / 86_400_000)
}

function BirthdayBadge({ birthday }: { birthday: string }) {
  const d = daysUntilBirthday(birthday)
  if (d > 7) {
    return (
      <span className="tnum inline-flex items-center gap-1 rounded-full border bg-background px-1.5 py-px text-[10px] font-medium text-muted-foreground">
        <Cake className="size-3" aria-hidden />
        {birthday.slice(3)} {MONTHS_SHORT[Number(birthday.slice(0, 2)) - 1]}
      </span>
    )
  }
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-bold',
        d === 0
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
          : 'border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300',
      )}
    >
      <Cake className="size-3" aria-hidden />
      {d === 0 ? 'Today 🎉' : `in ${d}d`}
    </span>
  )
}

function LoyaltyBadge({ visits }: { visits: number }) {
  return (
    <Badge className={LOYALTY_BADGE_CLASS}>
      <BadgePercent aria-hidden />
      Loyalty: {visits} visits
    </Badge>
  )
}

/* ── Lapsed-customer win-back ─────────────────────────────────────────────── */

const LAPSED_DAYS = 60

/** Whole days since the last visit (null → never visited). */
function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const then = new Date(iso)
  return Math.floor((Date.now() - then.getTime()) / 86_400_000)
}

function isLapsed(c: CustomerDTO): boolean {
  const d = daysSince(c.lastVisitAt)
  return d !== null && d >= LAPSED_DAYS
}

function LapsedBadge({ days }: { days: number }) {
  return (
    <Badge className="border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950">
      <CalendarClock aria-hidden />
      {days}d ago
    </Badge>
  )
}

/** Pre-filled WhatsApp win-back message for a lapsed customer. */
function reminderLink(c: CustomerDTO, salonName: string): string {
  const first = (c.name ?? '').trim().split(/\s+/)[0]
  const msg = `Namaste${first ? ` ${first}` : ''}! We miss you at ${salonName} 💇‍♂️✂️ It's been a while since your last visit — come back soon and let us pamper you again. See you soon! 🌹`
  return `https://wa.me/91${c.mobile}?text=${encodeURIComponent(msg)}`
}

function ReminderButton({ c, salonName }: { c: CustomerDTO; salonName: string }) {
  return (
    <button
      type="button"
      aria-label={`Send WhatsApp reminder to ${c.name || c.mobile}`}
      title="Send WhatsApp reminder"
      onClick={(e) => {
        e.stopPropagation()
        window.open(reminderLink(c, salonName), '_blank')
      }}
      className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-colors hover:bg-emerald-500/20 dark:text-emerald-400"
    >
      <MessageCircle className="size-4.5" aria-hidden />
    </button>
  )
}

/* ── Visit history drill-down ─────────────────────────────────────────────── */

function CustomerHistoryDialog({
  customer,
  onClose,
}: {
  customer: CustomerDTO | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const historyQ = useQuery({
    queryKey: ['customer-history', customer?.id],
    queryFn: () => apiGet<CustomerHistoryResponse>(`/api/customers/${customer?.id}`),
    enabled: !!customer,
  })

  // Single inline "Edit profile" panel covering the three fields a salon
  // actually mistypes at billing time: name, mobile, birthday. The previous
  // dialog only edited birthday — which left the most-common error (a typo'd
  // mobile) uncorrectable for the lifetime of the customer row.
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [mobileDraft, setMobileDraft] = useState('')
  const [birthdayDraft, setBirthdayDraft] = useState('')

  const profileMut = useMutation({
    mutationFn: (patch: { name?: string | null; mobile?: string; birthday?: string | null }) =>
      apiPut<{ customer: CustomerDTO }>(`/api/customers/${customer?.id}`, patch),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['customers-list'] })
      void qc.invalidateQueries({ queryKey: ['birthdays'] })
      void qc.invalidateQueries({ queryKey: ['customer-history', customer?.id] })
      // Reflect saved values back into the draft so a re-edit starts clean.
      const c = res.customer
      setNameDraft(c.name ?? '')
      setMobileDraft(c.mobile)
      setBirthdayDraft(c.birthday ? `${c.birthday.slice(3)}-${c.birthday.slice(0, 2)}` : '')
      toast.success('Customer profile updated')
      setEditing(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const data = historyQ.data
  /** Freshest profile (the list row prop can be stale after edits) — guarded by the render null-check. */
  const live = (data?.customer ?? customer) as CustomerDTO

  // Re-seed drafts whenever the live customer changes (new customer opened or
  // fresh server data after a save). Idempotent by id — no effect churn.
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (live && seededFor !== live.id) {
    setSeededFor(live.id)
    setNameDraft(live.name ?? '')
    setMobileDraft(live.mobile)
    setBirthdayDraft(live.birthday ? `${live.birthday.slice(3)}-${live.birthday.slice(0, 2)}` : '')
    setEditing(false)
  }

  /** Build the PATCH body — only sends the fields that actually changed. */
  function buildPatch(): { name?: string | null; mobile?: string; birthday?: string | null } | null {
    if (!live) return null
    const patch: { name?: string | null; mobile?: string; birthday?: string | null } = {}
    const trimmedName = nameDraft.trim()
    if (trimmedName !== (live.name ?? '')) {
      patch.name = trimmedName || null
    }
    const cleanMobile = mobileDraft.replace(/\D/g, '').slice(0, 10)
    if (cleanMobile !== live.mobile) {
      if (!/^\d{10}$/.test(cleanMobile)) {
        toast.error('Mobile must be exactly 10 digits')
        return null
      }
      patch.mobile = cleanMobile
    }
    if (birthdayDraft.trim() === '') {
      if (live.birthday) patch.birthday = null
    } else {
      const m = /^(\d{2})-(\d{2})$/.exec(birthdayDraft.trim())
      if (!m) {
        toast.error('Birthday must be DD-MM, e.g. 14-03')
        return null
      }
      const dd = m[1]
      const mm = m[2]
      const mmdd = `${mm}-${dd}`
      if (mmdd !== live.birthday) patch.birthday = mmdd
    }
    if (Object.keys(patch).length === 0) {
      toast('No changes to save')
      return null
    }
    return patch
  }

  function saveProfile() {
    const patch = buildPatch()
    if (!patch) return
    profileMut.mutate(patch)
  }

  const mobileDirty = mobileDraft.replace(/\D/g, '').slice(0, 10) !== live.mobile
  const mobileInvalid = mobileDirty && !/^\d{10}$/.test(mobileDraft.replace(/\D/g, '').slice(0, 10))

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        {customer && (
          <>
            <DialogHeader className="border-b pb-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                >
                  {initials(live.name || live.mobile)}
                </span>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-left text-lg">
                    {live.name || 'Unknown customer'}
                  </DialogTitle>
                  <DialogDescription className="text-left font-mono">{live.mobile}</DialogDescription>
                </div>
                {!editing && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit
                  </Button>
                )}
              </div>

              {editing ? (
                /* Inline profile editor — name + mobile + birthday on one card.
                 * These are the three fields a salon actually mistypes at billing
                 * time. Previously only birthday was editable, so a typo'd mobile
                 * orphaned the customer for the lifetime of their row. */
                <div className="mt-3 space-y-2.5 rounded-xl border bg-muted/40 p-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="cust-name"
                      className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      Name
                    </label>
                    <Input
                      id="cust-name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value.slice(0, 60))}
                      placeholder="Customer name (optional)"
                      className="h-9"
                      maxLength={60}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="cust-mobile"
                      className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      Mobile (10 digits)
                    </label>
                    <Input
                      id="cust-mobile"
                      inputMode="numeric"
                      value={mobileDraft}
                      onChange={(e) => setMobileDraft(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="9876543210"
                      className={cn('tnum h-9 font-mono', mobileInvalid && 'border-destructive')}
                      aria-invalid={mobileInvalid || undefined}
                    />
                    {mobileDirty && !mobileInvalid && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        Changing the mobile — if another customer already has this number, the salon must merge profiles instead.
                      </p>
                    )}
                    {mobileInvalid && (
                      <p className="text-[11px] text-destructive">Mobile must be exactly 10 digits.</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="cust-bday"
                      className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      Birthday (optional)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <Input
                        id="cust-bday"
                        value={birthdayDraft}
                        onChange={(e) =>
                          setBirthdayDraft(
                            e.target.value.replace(/\D/g, '').replace(/^(\d{0,2})(\d{0,2}).*$/, (_, dd, mm) =>
                              [dd, mm].filter(Boolean).join('-'),
                            ),
                          )
                        }
                        placeholder="DD-MM"
                        maxLength={5}
                        className="tnum h-9 w-24 font-semibold"
                        aria-label="Birthday day and month (DD-MM)"
                      />
                      {live.birthday && (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          className="h-9 shrink-0 gap-1.5 text-destructive hover:text-destructive"
                          disabled={profileMut.isPending}
                          onClick={() => {
                            setBirthdayDraft('')
                            void profileMut.mutate({ birthday: null })
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Button
                      size="sm"
                      className="h-9 gap-1.5"
                      disabled={profileMut.isPending || mobileInvalid}
                      onClick={saveProfile}
                    >
                      {profileMut.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-3.5" aria-hidden />
                      )}
                      Save changes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 gap-1.5 text-muted-foreground"
                      disabled={profileMut.isPending}
                      onClick={() => {
                        // Re-seed drafts from the live customer and bail.
                        setNameDraft(live.name ?? '')
                        setMobileDraft(live.mobile)
                        setBirthdayDraft(
                          live.birthday ? `${live.birthday.slice(3)}-${live.birthday.slice(0, 2)}` : '',
                        )
                        setEditing(false)
                      }}
                    >
                      <X className="size-3.5" aria-hidden />
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                /* Read-only birthday chip — powers the dashboard reminder list. */
                <div className="mt-3 flex items-center gap-2">
                  {live.birthday ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
                      <Cake className="size-3.5" aria-hidden />
                      {live.birthday.slice(3)} {MONTHS_SHORT[Number(live.birthday.slice(0, 2)) - 1]}
                      {daysUntilBirthday(live.birthday) <= 7 && (
                        <span className="font-bold">
                          ·{' '}
                          {daysUntilBirthday(live.birthday) === 0
                            ? 'today 🎉'
                            : `in ${daysUntilBirthday(live.birthday)}d`}
                        </span>
                      )}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setBirthdayDraft('')
                        setEditing(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-rose-300 hover:text-rose-700"
                    >
                      <Cake className="size-3.5" aria-hidden />
                      Add birthday
                    </button>
                  )}
                </div>
              )}
            </DialogHeader>

            {historyQ.isPending ? (
              <div className="space-y-2.5 py-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 rounded-xl" />
                ))}
              </div>
            ) : historyQ.isError ? (
              <EmptyState
                icon={DuoWarning}
                title="Could not load history"
                hint={(historyQ.error as Error).message}
              />
            ) : !data || data.transactions.length === 0 ? (
              <EmptyState
                icon={DuoCalendarBlank}
                title="No visits yet"
                hint="Bills created for this mobile number will appear here."
              />
            ) : (
              <>
                {/* Totals */}
                <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-3 text-center">
                  <div>
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Bills</p>
                    <p className="text-base font-bold tabular-nums">{data.totals.bills}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Spend</p>
                    <p className="text-base font-bold tabular-nums">{formatINR(data.totals.spend)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Avg Bill</p>
                    <p className="text-base font-bold tabular-nums">{formatINR(data.totals.avgBill)}</p>
                  </div>
                </div>

                {/* History list */}
                <div className="mt-3 space-y-2">
                  {data.transactions.map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        'rounded-xl border bg-card p-3 text-sm',
                        t.status === 'VOIDED' && 'opacity-60',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-xs font-semibold">{t.billNo}</p>
                        <p
                          className={cn(
                            'font-semibold tabular-nums',
                            t.status === 'VOIDED' && 'text-muted-foreground line-through',
                          )}
                        >
                          {formatINR(t.total)}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{formatDateTime(t.createdAt)}</span>
                        <div className="flex items-center gap-1">
                          <MethodBadge method={t.paymentMethod} />
                          {t.status === 'VOIDED' && <StatusBadge status={t.status} />}
                        </div>
                      </div>
                      <p className="mt-1.5 truncate text-xs">
                        {t.items.map((it) => (it.qty > 1 ? `${it.serviceName} ×${it.qty}` : it.serviceName)).join(', ')}
                      </p>
                      {t.note && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-amber-700 dark:text-amber-400">
                          <StickyNote className="size-3 shrink-0" aria-hidden />
                          {t.note}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Served by {t.staffName}</p>
                    </div>
                  ))}
                  {data.transactions.length >= 100 && (
                    <p className="text-center text-xs text-muted-foreground">
                      Showing the latest 100 bills
                    </p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function CustomersView() {
  const setView = useAppStore((s) => s.setView)
  const [search, setSearch] = useState('')
  const [lapsedOnly, setLapsedOnly] = useState(false)
  const [selected, setSelected] = useState<CustomerDTO | null>(null)
  const debouncedSearch = useDebouncedValue(search, 400)

  const branchQ = useQuery({
    queryKey: ['branch'],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>('/api/branch'),
  })
  const branch = branchQ.data?.branch

  const listQ = useInfiniteQuery({
    queryKey: ['customers-list', debouncedSearch],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ page: String(pageParam), limit: '50' })
      if (debouncedSearch) p.set('search', debouncedSearch)
      return apiGet<CustomersResponse>(`/api/customers?${p.toString()}`)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, pg) => n + pg.customers.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
  })

  const customers = useMemo(
    () => (listQ.data ? listQ.data.pages.flatMap((p) => p.customers) : []),
    [listQ.data],
  )
  const total = listQ.data?.pages[0]?.total ?? 0

  const loyaltyEnabled = branch?.loyaltyEnabled ?? false
  const loyaltyVisits = branch?.loyaltyVisits ?? 0
  const isLoyal = (c: CustomerDTO) => loyaltyEnabled && loyaltyVisits > 0 && c.visits >= loyaltyVisits
  const salonName = branch?.name ?? 'our salon'

  const lapsedCount = useMemo(() => customers.filter(isLapsed).length, [customers])
  const visibleCustomers = useMemo(
    () => (lapsedOnly ? customers.filter(isLapsed) : customers),
    [customers, lapsedOnly],
  )

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Customers</h1>
          {listQ.data && <Badge variant="secondary">{total.toLocaleString('en-IN')}</Badge>}
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or mobile..."
            className="pl-8"
            aria-label="Search customers"
          />
        </div>
      </div>

      {/* Win-back filter — customers who haven't visited in 60+ days */}
      {listQ.data && lapsedCount > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLapsedOnly((v) => !v)}
            aria-pressed={lapsedOnly}
            className={`flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors ${
              lapsedOnly
                ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                : 'bg-card text-muted-foreground hover:bg-accent'
            }`}
          >
            <CalendarClock className="size-4" aria-hidden />
            {lapsedOnly ? `Showing ${visibleCustomers.length}` : lapsedCount} haven't visited {LAPSED_DAYS}+ days
          </button>
          <span className="text-xs text-muted-foreground">Tap 💬 on a row to send a WhatsApp reminder</span>
        </div>
      )}

      {loyaltyEnabled && (
        <p className="mt-2 text-xs text-muted-foreground">
          Rose badges mark customers eligible for the {branch?.loyaltyDiscountPct ?? 0}% returning-customer
          discount ({loyaltyVisits}+ visits).
        </p>
      )}

      {listQ.isPending ? (
        <div className="mt-4 space-y-2.5 lg:mt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-2xl md:h-14" />
          ))}
        </div>
      ) : listQ.isError ? (
        <div className="mt-4 rounded-2xl border bg-card lg:mt-6">
          <EmptyState icon={DuoWarning} title="Could not load customers" hint={(listQ.error as Error).message} />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void listQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : visibleCustomers.length === 0 ? (
        <div className="mt-4 rounded-2xl border bg-card lg:mt-6">
          <EmptyState
            icon={DuoUsers}
            title={debouncedSearch ? 'No customers match your search' : 'No customers yet'}
            hint={
              debouncedSearch
                ? `Nothing matches "${debouncedSearch}" — try a different name or mobile number.`
                : 'Customers are added automatically the first time you bill them on the Billing screen.'
            }
            action={
              <Button
                variant="outline"
                size="sm"
                className="mt-1 gap-1.5"
                onClick={() => setView('billing')}
              >
                <Scissors className="size-4" aria-hidden />
                Go to Billing
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-2xl border bg-card shadow-sm md:block lg:mt-6">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Customer</TableHead>
                  <TableHead>Mobile</TableHead>
                  <TableHead>Visits</TableHead>
                  <TableHead className="pr-4 text-right">Total Spend</TableHead>
                  <TableHead className="pr-4">Last Visit</TableHead>
                  <TableHead className="w-14" aria-label="Reminder" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCustomers.map((c) => {
                  const lapsed = isLapsed(c)
                  const d = daysSince(c.lastVisitAt)
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setSelected(c)}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground"
                          >
                            {initials(c.name || c.mobile)}
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[160px] truncate text-[13px] font-medium">
                              {c.name || 'Unknown'}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {isLoyal(c) && <LoyaltyBadge visits={c.visits} />}
                              {lapsed && d !== null && <LapsedBadge days={d} />}
                              {c.birthday && <BirthdayBadge birthday={c.birthday} />}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[13px] text-muted-foreground">{c.mobile}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="secondary">{c.visits} visits</Badge>
                          {c.homeBranchName && (
                            <span
                              className="max-w-32 truncate rounded-full border bg-background px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                              title={`${c.homeBranchName}${(c.branchCount ?? 0) > 1 ? ` +${(c.branchCount ?? 1) - 1} more branches` : ''}`}
                            >
                              {c.homeBranchName.split('—')[1]?.trim() || c.homeBranchName}
                              {(c.branchCount ?? 0) > 1 ? ` +${(c.branchCount ?? 1) - 1}` : ''}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="pr-4 text-right font-semibold tabular-nums">
                        {formatINR(c.totalSpend)}
                      </TableCell>
                      <TableCell className="pr-4 text-[13px] text-muted-foreground">
                        {c.lastVisitAt ? formatDate(c.lastVisitAt) : 'Never'}
                      </TableCell>
                      <TableCell className="w-14 pr-4">
                        {lapsed && <ReminderButton c={c} salonName={salonName} />}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-2.5 md:hidden">
            {visibleCustomers.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 6) * 0.03, duration: 0.22 }}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(c)
                  }
                }}
                className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-sm transition-colors hover:bg-accent/50 active:bg-accent"
              >
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground"
                >
                  {initials(c.name || c.mobile)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">{c.name || 'Unknown'}</p>
                    {isLoyal(c) && (
                      <Badge className={LOYALTY_BADGE_CLASS}>
                        <BadgePercent aria-hidden />
                        {c.visits}
                      </Badge>
                    )}
                    {c.birthday && <BirthdayBadge birthday={c.birthday} />}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{c.mobile}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {c.visits} visits · {c.lastVisitAt ? formatDate(c.lastVisitAt) : 'never visited'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums">{formatINR(c.totalSpend)}</p>
                    <p className="text-[11px] text-muted-foreground">spent</p>
                  </div>
                  {isLapsed(c) && <ReminderButton c={c} salonName={salonName} />}
                </div>
              </motion.div>
            ))}
            {visibleCustomers.length === 0 && (
              <p className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
                No lapsed customers — everyone visited within {LAPSED_DAYS} days. 🎉
              </p>
            )}
          </div>

          {/* Load more */}
          {listQ.hasNextPage && (
            <div className="mt-4 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => void listQ.fetchNextPage()}
                disabled={listQ.isFetchingNextPage}
              >
                {listQ.isFetchingNextPage ? <Loader2 className="animate-spin" aria-hidden /> : null}
                Load more
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Showing {customers.length} of {total.toLocaleString('en-IN')} customers
              </p>
            </div>
          )}
        </>
      )}

      <CustomerHistoryDialog customer={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
