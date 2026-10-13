'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  ChevronDown,
  Clock3,
  Loader2,
  MapPin,
  Network,
  Pause,
  Play,
  Plus,
  Store,
  UsersRound,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatINR } from '@/lib/format'
import type { PlatformComparisonResponse, TenantsResponse } from '@/lib/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, initials } from './ui-atoms'
import { FranchiseCompareCard } from './franchise-compare-card'

const formatCount = (n: number) => Math.round(n).toLocaleString('en-IN')

/* ── KPI card ──────────────────────────────────────────────────────────── */

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  chipClass,
  index,
}: {
  label: string
  value: string
  sub: string
  icon: typeof Store
  chipClass: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="hairline rounded-xl bg-card p-4"
    >
      <div className="flex items-center gap-3">
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', chipClass)}>
          <Icon className="size-4.5" aria-hidden />
        </span>
        <p className="micro text-muted-foreground">{label}</p>
      </div>
      <p className="tnum mt-2 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </motion.div>
  )
}

/* ── Logo chip ─────────────────────────────────────────────────────────── */

function LogoChip({ logo, name, size = 44 }: { logo: string | null; name: string; size?: number }) {
  if (logo) {
    return (
       
      <img
        src={logo}
        alt=""
        className="shrink-0 rounded-xl border object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-xl border bg-secondary text-sm font-bold text-secondary-foreground"
      style={{ width: size, height: size }}
    >
      {initials(name)}
    </span>
  )
}

/** Downscale an image file to a PNG data URL. */
function fileToLogoDataUrl(file: File, maxSide = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          URL.revokeObjectURL(url)
          reject(new Error('Your browser does not support image processing'))
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        URL.revokeObjectURL(url)
        reject(new Error('Could not process this image'))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read this image file'))
    }
    img.src = url
  })
}

/** Auto-suggest a bill prefix from a franchise name (e.g. "Glow & Go" → "GG"). */
function suggestPrefix(name: string): string {
  const words = name
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return words.slice(0, 3) || 'SX'
}

/* ── New franchise form state ──────────────────────────────────────────── */

interface FranchiseForm {
  name: string
  logo: string | null
  branchName: string
  city: string
  address: string
  phone: string
  upiId: string
  billPrefix: string
  adminName: string
  adminEmail: string
  adminPassword: string
}

const emptyFranchiseForm = (): FranchiseForm => ({
  name: '',
  logo: null,
  branchName: '',
  city: '',
  address: '',
  phone: '',
  upiId: '',
  billPrefix: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
})

type FranchiseErrors = Partial<
  Record<'name' | 'branchName' | 'city' | 'billPrefix' | 'adminName' | 'adminEmail' | 'adminPassword', string>
>

/* ── View ──────────────────────────────────────────────────────────────── */

export default function TenantsView() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<FranchiseForm>(emptyFranchiseForm())
  const [errors, setErrors] = useState<FranchiseErrors>({})
  const [pauseTarget, setPauseTarget] = useState<{ id: string; name: string; active: boolean } | null>(null)

  const tenantsQ = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiGet<TenantsResponse>('/api/tenants'),
  })
  const compareQ = useQuery({
    queryKey: ['platform-comparison'],
    queryFn: () => apiGet<PlatformComparisonResponse>('/api/stats/platform'),
  })
  const tenants = tenantsQ.data?.tenants ?? []
  const platform = tenantsQ.data?.platform

  const createMut = useMutation({
    mutationFn: (f: FranchiseForm) =>
      apiPost('/api/tenants', {
        name: f.name.trim(),
        logo: f.logo,
        firstBranch: {
          name: f.branchName.trim(),
          city: f.city.trim(),
          address: f.address.trim() || null,
          phone: f.phone.trim() || null,
          upiId: f.upiId.trim() || null,
          billPrefix: f.billPrefix.trim().toUpperCase(),
        },
        admin: { name: f.adminName.trim(), email: f.adminEmail.trim().toLowerCase(), password: f.adminPassword },
      }),
    onSuccess: (_d, f) => {
      void qc.invalidateQueries({ queryKey: ['tenants'] })
      toast.success(`${f.name} onboarded`, {
        description: `First branch + admin created — share ${f.adminEmail} with the owner.`,
      })
      setCreateOpen(false)
      setForm(emptyFranchiseForm())
      setErrors({})
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggleMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => apiPut(`/api/tenants/${v.id}`, { active: v.active }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['tenants'] })
      toast.success(v.active ? 'Franchise resumed' : 'Franchise paused')
      setPauseTarget(null)
    },
    onError: (e: Error) => {
      toast.error(e.message)
      setPauseTarget(null)
    },
  })

  /* ── Branch approvals (SUPER_ADMIN) ── */
  const approveMut = useMutation({
    mutationFn: (id: string) => apiPut(`/api/branches/${id}`, { approved: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenants'] })
      toast.success('Branch approved', { description: 'It can now bill — assign staff and share the good news.' })
    },
    onError: (e: Error) => toast.error(e.message),
  })
  const declineMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/branches/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tenants'] })
      toast.success('Request declined', { description: 'The branch was removed.' })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* Create dialog helpers */
  const set = <K extends keyof FranchiseForm>(key: K, value: FranchiseForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  // Auto-suggest prefix when the franchise name changes (only while untouched).
  function onNameChange(name: string) {
    setForm((f) => ({
      ...f,
      name,
      billPrefix: f.branchName === '' && f.adminEmail === '' ? suggestPrefix(name) : f.billPrefix,
    }))
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return
    try {
      const dataUrl = await fileToLogoDataUrl(file)
      set('logo', dataUrl)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  function submitCreate() {
    const e: FranchiseErrors = {}
    if (form.name.trim().length < 2) e.name = 'Franchise name is too short'
    if (form.branchName.trim().length < 2) e.branchName = 'Branch name is too short'
    if (form.city.trim().length < 2) e.city = 'City is required'
    if (!/^[A-Za-z0-9]{1,5}$/.test(form.billPrefix.trim())) e.billPrefix = '1–5 letters or digits'
    if (form.adminName.trim().length < 2) e.adminName = 'Admin name is too short'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail.trim())) e.adminEmail = 'Enter a valid email'
    if (form.adminPassword.length < 6) e.adminPassword = 'At least 6 characters'
    setErrors(e)
    if (Object.keys(e).length > 0) return
    createMut.mutate(form)
  }

  const logoInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg border bg-primary/5 text-primary">
              <Network className="size-4.5" aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Franchises</h1>
              <p className="text-sm text-muted-foreground">SaloonX platform · last 30 days</p>
            </div>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden />
          New Franchise
        </Button>
      </div>

      {/* Platform KPIs */}
      {tenantsQ.isPending ? (
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : tenantsQ.isError ? (
        <div className="hairline mt-4 rounded-xl bg-card">
          <EmptyState
            icon={AlertTriangle}
            title="Could not load the platform"
            hint={(tenantsQ.error as Error).message}
          />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void tenantsQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              index={0}
              label="Revenue 30d"
              value={formatINR(platform?.revenue30d ?? 0)}
              sub="across all franchises"
              icon={Store}
              chipClass="bg-primary/10 text-primary"
            />
            <Kpi
              index={1}
              label="Bills 30d"
              value={formatCount(platform?.bills30d ?? 0)}
              sub={`${platform?.newCustomers30d ?? 0} new customers`}
              icon={Building2}
              chipClass="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
            />
            <Kpi
              index={2}
              label="Franchises"
              value={`${platform?.activeTenants ?? 0}`}
              sub={`${platform?.activeBranches ?? 0} active branches`}
              icon={Network}
              chipClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
            />
            <Kpi
              index={3}
              label="Staff"
              value={formatCount(platform?.staffCount ?? 0)}
              sub="active admins + staff"
              icon={UsersRound}
              chipClass="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            />
          </div>

          {/* ── Cross-franchise comparison league table ── */}
          <div className="mt-4">
            <FranchiseCompareCard data={compareQ.data} />
          </div>

          {/* ── Branch approvals queue ── */}
          {(platform?.pendingBranches?.length ?? 0) > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-4 overflow-hidden rounded-xl border border-amber-300/60 bg-amber-50/70 dark:border-amber-800/60 dark:bg-amber-950/30"
              aria-label="Branches awaiting approval"
            >
              <div className="flex items-center gap-2.5 border-b border-amber-300/50 px-4 py-3 dark:border-amber-800/50">
                <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
                  <Clock3 className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold tracking-tight text-amber-900 dark:text-amber-100">
                    Branch approvals
                    <span className="ml-2 rounded-full bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-900 tnum dark:bg-amber-900 dark:text-amber-200">
                      {platform!.pendingBranches.length}
                    </span>
                  </h2>
                  <p className="text-xs text-amber-800/80 dark:text-amber-200/70">
                    New branches opened by franchise admins — approve to let them start billing.
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-amber-300/40 dark:divide-amber-800/40">
                {platform!.pendingBranches.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-amber-100/40 dark:hover:bg-amber-900/20"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-amber-300/60 bg-white text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <Building2 className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-amber-950 dark:text-amber-50">
                        {b.name}
                        <span className="ml-1.5 font-normal text-amber-800/70 dark:text-amber-200/60">· {b.tenantName}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/60">
                        {b.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="size-3" aria-hidden />
                            {b.city}
                          </span>
                        )}
                        <span className="rounded bg-amber-200/60 px-1.5 py-px font-semibold tracking-wide tnum dark:bg-amber-900/60">
                          {b.billPrefix}-0001
                        </span>
                        <span>requested {new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => approveMut.mutate(b.id)}
                        disabled={approveMut.isPending || declineMut.isPending}
                        className="h-8 gap-1.5 bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                      >
                        {approveMut.isPending && approveMut.variables === b.id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <BadgeCheck className="size-3.5" aria-hidden />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => declineMut.mutate(b.id)}
                        disabled={approveMut.isPending || declineMut.isPending}
                        className="h-8 gap-1.5 border-amber-300/70 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40"
                      >
                        {declineMut.isPending && declineMut.variables === b.id ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <X className="size-3.5" aria-hidden />
                        )}
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {/* Franchise cards */}
          {tenants.length === 0 ? (
            <div className="hairline mt-4 rounded-xl bg-card">
              <EmptyState
                icon={Network}
                title="No franchises yet"
                hint="Onboard your first franchise — you'll create its first branch and its admin in one go."
              />
              <div className="flex justify-center pb-6">
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  New Franchise
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {tenants.map((t) => {
                const isOpen = expanded.has(t.id)
                return (
                  <div key={t.id} className={cn('hairline overflow-hidden rounded-xl bg-card', !t.active && 'opacity-75')}>
                    <div className="flex flex-wrap items-center gap-3 p-4">
                      <LogoChip logo={t.logo} name={t.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-semibold">{t.name}</p>
                          {t.active ? (
                            <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:bg-emerald-950">
                              Active
                            </Badge>
                          ) : (
                            <Badge className="border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950">
                              Paused
                            </Badge>
                          )}
                        </div>
                        <p className="tnum mt-0.5 text-xs text-muted-foreground">
                          {t.branchCount} branches · {t.cityCount} cities · {t.userCount} staff
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum text-base font-bold">{formatINR(t.revenue30d)}</p>
                        <p className="tnum text-[11px] text-muted-foreground">{t.bills30d} bills · 30d</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('size-9', isOpen && 'bg-accent text-accent-foreground')}
                          aria-label={isOpen ? `Collapse ${t.name} branches` : `Expand ${t.name} branches`}
                          onClick={() => toggleExpanded(t.id)}
                        >
                          <ChevronDown className={cn('transition-transform', isOpen && 'rotate-180')} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 gap-1.5"
                          onClick={() => setPauseTarget({ id: t.id, name: t.name, active: t.active })}
                        >
                          {t.active ? (
                            <>
                              <Pause className="size-3.5" aria-hidden />
                              <span className="hidden sm:inline">Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="size-3.5" aria-hidden />
                              <span className="hidden sm:inline">Resume</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Branch table */}
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="divide-y border-t">
                          {t.branches.map((b) => (
                            <div key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                              <p className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</p>
                              {b.city && (
                                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="size-3" aria-hidden />
                                  {b.city}
                                </span>
                              )}
                              <span className="micro shrink-0 rounded-md border bg-muted px-1.5 py-0.5 text-muted-foreground">
                                {b.billPrefix}-0001
                              </span>
                              {b.gstEnabled && (
                                <span className="micro shrink-0 rounded-md border bg-muted px-1.5 py-0.5 text-muted-foreground">
                                  GST
                                </span>
                              )}
                              <span className="tnum shrink-0 text-xs text-muted-foreground">{b.userCount} staff</span>
                              <span className="tnum shrink-0 text-sm font-semibold">{formatINR(b.revenue30d)}</span>
                              {!b.active && (
                                <Badge className="border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950">
                                  Paused
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── New franchise dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Onboard a franchise</DialogTitle>
            <DialogDescription>
              Creates the franchise, its first branch and the franchise admin — one step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 1 · Franchise identity */}
            <section>
              <p className="micro mb-2 text-muted-foreground">1 · Franchise</p>
              <div className="flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
                  {form.logo ? (
                     
                    <img src={form.logo} alt="" className="size-full object-cover" />
                  ) : (
                    <Store className="size-5 text-muted-foreground" aria-hidden />
                  )}
                </span>
                <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  {form.logo ? 'Replace logo' : 'Upload logo'}
                </Button>
                {form.logo && (
                  <Button variant="outline" size="sm" className="text-muted-foreground" onClick={() => set('logo', null)}>
                    Remove
                  </Button>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void pickLogo(e.target.files?.[0])}
                  aria-label="Franchise logo"
                />
              </div>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="fr-name">Franchise name</Label>
                <Input
                  id="fr-name"
                  value={form.name}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="e.g. Glow & Go Salons"
                  aria-invalid={!!errors.name}
                />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
            </section>

            {/* 2 · First branch */}
            <section>
              <p className="micro mb-2 text-muted-foreground">2 · First branch</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fr-branch">Branch name</Label>
                    <Input
                      id="fr-branch"
                      value={form.branchName}
                      onChange={(e) => set('branchName', e.target.value)}
                      placeholder="Glow & Go — Andheri West"
                      aria-invalid={!!errors.branchName}
                    />
                    {errors.branchName && <p className="text-xs text-destructive">{errors.branchName}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fr-city">City</Label>
                    <Input
                      id="fr-city"
                      value={form.city}
                      onChange={(e) => set('city', e.target.value)}
                      placeholder="Mumbai"
                      aria-invalid={!!errors.city}
                    />
                    {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fr-prefix">
                      Bill prefix <span className="text-[11px] font-normal text-muted-foreground">(unique, 1–5 chars)</span>
                    </Label>
                    <Input
                      id="fr-prefix"
                      value={form.billPrefix}
                      onChange={(e) => set('billPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                      placeholder="GG"
                      className="tnum"
                      aria-invalid={!!errors.billPrefix}
                    />
                    {errors.billPrefix ? (
                      <p className="text-xs text-destructive">{errors.billPrefix}</p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Bills will number {form.billPrefix || 'XX'}-0001</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fr-upi">
                      UPI ID <span className="text-[11px] font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="fr-upi"
                      value={form.upiId}
                      onChange={(e) => set('upiId', e.target.value)}
                      placeholder="salon@okhdfcbank"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fr-phone">
                      Phone <span className="text-[11px] font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="fr-phone"
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fr-address">
                      Address <span className="text-[11px] font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      id="fr-address"
                      value={form.address}
                      onChange={(e) => set('address', e.target.value)}
                      placeholder="Shop 12, MG Road…"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 3 · Franchise admin */}
            <section>
              <p className="micro mb-2 text-muted-foreground">3 · Franchise admin</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fr-admin">Admin name</Label>
                  <Input
                    id="fr-admin"
                    value={form.adminName}
                    onChange={(e) => set('adminName', e.target.value)}
                    placeholder="e.g. Ravi (Owner)"
                    aria-invalid={!!errors.adminName}
                  />
                  {errors.adminName && <p className="text-xs text-destructive">{errors.adminName}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fr-admin-email">Email (their login)</Label>
                  <Input
                    id="fr-admin-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    value={form.adminEmail}
                    onChange={(e) => set('adminEmail', e.target.value)}
                    placeholder="owner@salon.com"
                    aria-invalid={!!errors.adminEmail}
                  />
                  {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail}</p>}
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label htmlFor="fr-admin-pw">
                  Password <span className="text-[11px] font-normal text-muted-foreground">(min 6 characters)</span>
                </Label>
                <Input
                  id="fr-admin-pw"
                  type="text"
                  autoComplete="new-password"
                  value={form.adminPassword}
                  onChange={(e) => set('adminPassword', e.target.value)}
                  placeholder="e.g. glow2024"
                  aria-invalid={!!errors.adminPassword}
                />
                {errors.adminPassword && <p className="text-xs text-destructive">{errors.adminPassword}</p>}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                The admin signs in with this email + password (a real Firebase login) and can open more
                branches, manage the menu and see the whole chain's reports.
              </p>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Create franchise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pause/resume confirm ── */}
      <AlertDialog open={!!pauseTarget} onOpenChange={(o) => !o && setPauseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pauseTarget?.active ? `Pause ${pauseTarget?.name}?` : `Resume ${pauseTarget?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pauseTarget?.active
                ? 'All staff of this franchise get logged out and cannot log in until you resume. Their data and reports are preserved untouched.'
                : 'The franchise comes back online — staff can log in at their branches again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggleMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggleMut.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (pauseTarget) toggleMut.mutate({ id: pauseTarget.id, active: !pauseTarget.active })
              }}
            >
              {toggleMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {pauseTarget?.active ? 'Pause franchise' : 'Resume franchise'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
