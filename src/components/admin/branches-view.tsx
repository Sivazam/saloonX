'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BadgePercent,
  Building2,
  Clock3,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  Store,
  Trash2,
  Upload,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api-client'
import { formatINR } from '@/lib/format'
import type { BranchAdminDTO, BranchProfileDTO, StaffDTO } from '@/lib/types'
import { useAppStore } from '@/store/use-app-store'
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
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, initials } from './ui-atoms'

/* ── helpers ────────────────────────────────────────────────────────────── */

/** Downscale an image file to a PNG data URL. */
function fileToPngDataUrl(file: File, maxSide: number): Promise<string> {
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

function LogoChip({ logo, tenantLogo, name, size = 44 }: { logo: string | null; tenantLogo: string | null; name: string; size?: number }) {
  const src = logo ?? tenantLogo
  if (src) {
    return (
       
      <img src={src} alt="" className="shrink-0 rounded-xl border object-cover" style={{ width: size, height: size }} />
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

interface BranchForm {
  name: string
  city: string
  address: string
  phone: string
  upiId: string
  ownerMobile: string
  billPrefix: string
  gstEnabled: boolean
  gstPct: number
  loyaltyEnabled: boolean
  loyaltyVisits: number
  loyaltyDiscountPct: number
  receiptFooter: string
  logo: string | null
  upiQrImage: string | null
  /** staff ids to grant access (add-branch flow only) */
  assignIds: string[]
}

type BranchErrors = Partial<
  Record<'name' | 'city' | 'billPrefix' | 'ownerMobile' | 'gstPct' | 'loyaltyVisits' | 'loyaltyDiscountPct', string>
>

const emptyBranchForm = (): BranchForm => ({
  name: '',
  city: '',
  address: '',
  phone: '',
  upiId: '',
  ownerMobile: '',
  billPrefix: '',
  gstEnabled: false,
  gstPct: 18,
  loyaltyEnabled: true,
  loyaltyVisits: 3,
  loyaltyDiscountPct: 10,
  receiptFooter: '',
  logo: null,
  upiQrImage: null,
  assignIds: [],
})

function fromProfile(b: BranchProfileDTO): BranchForm {
  return {
    name: b.name,
    city: b.city ?? '',
    address: b.address ?? '',
    phone: b.phone ?? '',
    upiId: b.upiId ?? '',
    ownerMobile: b.ownerMobile ?? '',
    billPrefix: b.billPrefix,
    gstEnabled: b.gstEnabled,
    gstPct: b.gstPct,
    loyaltyEnabled: b.loyaltyEnabled,
    loyaltyVisits: b.loyaltyVisits,
    loyaltyDiscountPct: b.loyaltyDiscountPct,
    receiptFooter: b.receiptFooter ?? '',
    logo: b.logo,
    upiQrImage: b.upiQrImage,
    assignIds: [],
  }
}

/* ── Image upload row ───────────────────────────────────────────────────── */

function ImageField({
  label,
  hint,
  value,
  maxSide,
  onChange,
}: {
  label: string
  hint: string
  value: string | null
  maxSide: number
  onChange: (v: string | null) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      onChange(await fileToPngDataUrl(file, maxSide))
      toast.success('Image ready — remember to save')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
          {value ? (
             
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <Upload className="size-5 text-muted-foreground" aria-hidden />
          )}
        </span>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {value ? 'Replace' : 'Upload'}
            </Button>
            {value && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
        aria-label={label}
      />
    </div>
  )
}

/* ── View ──────────────────────────────────────────────────────────────── */

export default function BranchesView() {
  const qc = useQueryClient()
  const user = useAppStore((s) => s.user)

  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<BranchForm>(emptyBranchForm())
  const [addErrors, setAddErrors] = useState<BranchErrors>({})

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<BranchForm | null>(null)
  const [editErrors, setEditErrors] = useState<BranchErrors>({})

  const [deactivateTarget, setDeactivateTarget] = useState<BranchAdminDTO | null>(null)

  const branchesQ = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<{ branches: BranchAdminDTO[] }>('/api/branches'),
  })
  const staffQ = useQuery({
    queryKey: ['staff'],
    queryFn: () => apiGet<{ users: StaffDTO[] }>('/api/staff'),
  })
  const branches = branchesQ.data?.branches ?? []
  const staff = staffQ.data?.users ?? []

  const invalidateBranches = () => {
    void qc.invalidateQueries({ queryKey: ['branches'] })
    void qc.invalidateQueries({ queryKey: ['staff'] })
    void qc.invalidateQueries({ queryKey: ['auth-branches'] })
  }

  /* Edit flow loads the full profile */
  const profileQ = useQuery({
    queryKey: ['branch-profile', editId],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>(`/api/branches/${editId}`),
    enabled: !!editId,
  })

  const addMut = useMutation({
    mutationFn: (f: BranchForm) =>
      apiPost('/api/branches', {
        name: f.name.trim(),
        city: f.city.trim(),
        address: f.address.trim() || null,
        phone: f.phone.trim() || null,
        upiId: f.upiId.trim() || null,
        ownerMobile: f.ownerMobile.trim() || null,
        billPrefix: f.billPrefix.trim().toUpperCase(),
        gstEnabled: f.gstEnabled,
        adminUserIds: f.assignIds,
      }),
    onSuccess: (_d, f) => {
      invalidateBranches()
      toast.success(`${f.name} requested`, {
        description: `Bills will number ${f.billPrefix.toUpperCase()}-0001 — the platform reviews new branches before they go live.`,
      })
      setAddOpen(false)
      setAddForm(emptyBranchForm())
      setAddErrors({})
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const editMut = useMutation({
    mutationFn: (v: { id: string; f: BranchForm }) =>
      apiPut(`/api/branches/${v.id}`, {
        name: v.f.name.trim(),
        city: v.f.city.trim(),
        address: v.f.address.trim() || null,
        phone: v.f.phone.trim() || null,
        upiId: v.f.upiId.trim() || null,
        ownerMobile: v.f.ownerMobile.trim() || null,
        billPrefix: v.f.billPrefix.trim().toUpperCase(),
        gstEnabled: v.f.gstEnabled,
        gstPct: v.f.gstPct,
        loyaltyEnabled: v.f.loyaltyEnabled,
        loyaltyVisits: v.f.loyaltyVisits,
        loyaltyDiscountPct: v.f.loyaltyDiscountPct,
        receiptFooter: v.f.receiptFooter.trim() || null,
        logo: v.f.logo,
        upiQrImage: v.f.upiQrImage,
      }),
    onSuccess: (_d, v) => {
      invalidateBranches()
      void qc.invalidateQueries({ queryKey: ['branch'] })
      toast.success(`${v.f.name} updated`)
      setEditId(null)
      setEditForm(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deactivateMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/branches/${id}`),
    onSuccess: (res, id) => {
      invalidateBranches()
      const note = (res as { deleted?: boolean; note?: string }).deleted
        ? 'Branch deleted — it had no data.'
        : ((res as { note?: string }).note ?? 'Branch deactivated.')
      toast.success(note)
      setDeactivateTarget(null)
    },
    onError: (e: Error) => {
      toast.error(e.message)
      setDeactivateTarget(null)
    },
  })

  function openEdit(b: BranchAdminDTO) {
    setEditId(b.id)
    setEditErrors({})
    setEditForm(null) // loads once profileQ arrives
  }

  // Seed the edit form once its profile loads.
  const loadedProfile = profileQ.data?.branch
  if (editId && loadedProfile && loadedProfile.id === editId && editForm === null) {
    setEditForm(fromProfile(loadedProfile))
  }

  const validate = (f: BranchForm): BranchErrors => {
    const e: BranchErrors = {}
    if (f.name.trim().length < 2) e.name = 'Branch name is too short'
    if (f.city.trim().length < 2) e.city = 'City is required'
    if (!/^[A-Za-z0-9]{1,5}$/.test(f.billPrefix.trim())) e.billPrefix = '1–5 letters or digits'
    if (f.ownerMobile && !/^\d{10}$/.test(f.ownerMobile.trim())) e.ownerMobile = 'Owner WhatsApp must be 10 digits'
    if (f.gstEnabled && (f.gstPct < 0 || f.gstPct > 100)) e.gstPct = 'GST must be 0–100'
    if (f.loyaltyEnabled && f.loyaltyVisits < 1) e.loyaltyVisits = 'At least 1 visit'
    if (f.loyaltyEnabled && (f.loyaltyDiscountPct < 0 || f.loyaltyDiscountPct > 100))
      e.loyaltyDiscountPct = 'Discount must be 0–100'
    return e
  }

  function submitAdd() {
    const e = validate(addForm)
    setAddErrors(e)
    if (Object.keys(e).length > 0) return
    addMut.mutate(addForm)
  }

  function submitEdit() {
    if (!editForm || !editId) return
    const e = validate(editForm)
    setEditErrors(e)
    if (Object.keys(e).length > 0) return
    editMut.mutate({ id: editId, f: editForm })
  }

  const setAdd = <K extends keyof BranchForm>(key: K, value: BranchForm[K]) =>
    setAddForm((f) => ({ ...f, [key]: value }))
  const setEdit = <K extends keyof BranchForm>(key: K, value: BranchForm[K]) =>
    setEditForm((f) => (f ? { ...f, [key]: value } : f))

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">Branches</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {user?.tenantName ?? 'Your franchise'} · {branches.length}{' '}
            {branches.length === 1 ? 'outlet' : 'outlets'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus aria-hidden />
          Add Branch
        </Button>
      </div>

      {branchesQ.isPending ? (
        <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : branchesQ.isError ? (
        <div className="hairline mt-4 rounded-xl bg-card lg:mt-6">
          <EmptyState icon={AlertTriangle} title="Could not load branches" hint={(branchesQ.error as Error).message} />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void branchesQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      ) : branches.length === 0 ? (
        <div className="hairline mt-4 rounded-xl bg-card lg:mt-6">
          <EmptyState
            icon={Building2}
            title="No branches yet"
            hint="Open your first outlet — staff are assigned to branches to log in there."
          />
          <div className="flex justify-center pb-6">
            <Button onClick={() => setAddOpen(true)}>
              <Plus aria-hidden />
              Add Branch
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:mt-6 lg:grid-cols-2">
          {branches.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className={cn('hairline min-w-0 rounded-xl bg-card p-4', !b.active && 'opacity-75')}
            >
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <LogoChip logo={b.logo} tenantLogo={user?.tenantLogo ?? null} name={b.name} />
                {/* Mobile: name row runs full-width under the logo+revenue row. */}
                <div className="order-2 min-w-0 flex-1 basis-full sm:order-1 sm:basis-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 max-w-full truncate font-semibold">{b.name}</p>
                    {!b.approved && (
                      <Badge
                        className="gap-1 border-amber-300/70 bg-amber-50 text-amber-800 hover:bg-amber-50 dark:border-amber-800/70 dark:bg-amber-950/60 dark:text-amber-300 dark:hover:bg-amber-950/60"
                        title="The platform (SaloonX) reviews new branches before they go live"
                      >
                        <Clock3 className="size-3" aria-hidden />
                        Awaiting approval
                      </Badge>
                    )}
                    {!b.active && (
                      <Badge className="border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950">
                        Paused
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                    <MapPin className="mt-0.5 size-3 shrink-0" aria-hidden />
                    <span className="min-w-0 break-words">
                      {b.city ?? '—'}
                      {b.address ? ` · ${b.address}` : ''}
                    </span>
                  </p>
                </div>
                <div className="order-1 ml-auto shrink-0 pl-2 text-right sm:order-2 sm:ml-0 sm:pl-0">
                  <p className="tnum text-lg font-bold">{formatINR(b.revenue30d)}</p>
                  <p className="tnum text-[11px] text-muted-foreground">{b.bills30d} bills · 30d</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="micro rounded-md border bg-muted px-1.5 py-0.5 text-muted-foreground">
                  Bills {b.billPrefix}-0001
                </span>
                {b.gstEnabled && (
                  <span className="micro rounded-md border bg-muted px-1.5 py-0.5 text-muted-foreground">GST</span>
                )}
                <span className="tnum flex items-center gap-1 rounded-full border bg-background px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                  <UsersRound className="size-3" aria-hidden />
                  {b.userCount} staff
                </span>
                {b.phone && (
                  <span className="tnum rounded-full border bg-background px-1.5 py-px text-[11px] text-muted-foreground">
                    {b.phone}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center justify-end gap-1.5 border-t pt-3">
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => openEdit(b)}>
                  <Pencil className="size-3.5" aria-hidden />
                  Manage
                </Button>
                {b.active && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setDeactivateTarget(b)}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    <span className="hidden sm:inline">Deactivate</span>
                  </Button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Add branch dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Open a new branch</DialogTitle>
            <DialogDescription>
              A new outlet of {user?.tenantName ?? 'your franchise'}. It inherits the franchise menu —
              you can customise prices per branch from Menu & Prices.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50/70 p-3 dark:border-amber-800/60 dark:bg-amber-950/30">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
            <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
              New branches go live after a one-time platform review (usually within a day). Until then
              the branch can't bill — you can still set up its menu prices and profile.
            </p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="br-name">Branch name</Label>
                <Input
                  id="br-name"
                  value={addForm.name}
                  onChange={(e) => setAdd('name', e.target.value)}
                  placeholder="Glow & Go — Powai"
                  aria-invalid={!!addErrors.name}
                />
                {addErrors.name && <p className="text-xs text-destructive">{addErrors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-city">City</Label>
                <Input
                  id="br-city"
                  value={addForm.city}
                  onChange={(e) => setAdd('city', e.target.value)}
                  placeholder="Mumbai"
                  aria-invalid={!!addErrors.city}
                />
                {addErrors.city && <p className="text-xs text-destructive">{addErrors.city}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="br-address">Address</Label>
              <Input
                id="br-address"
                value={addForm.address}
                onChange={(e) => setAdd('address', e.target.value)}
                placeholder="Shop 4, Hiranandani Gardens…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="br-phone">Phone</Label>
                <Input
                  id="br-phone"
                  value={addForm.phone}
                  onChange={(e) => setAdd('phone', e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-upi">UPI ID (for this branch)</Label>
                <Input
                  id="br-upi"
                  value={addForm.upiId}
                  onChange={(e) => setAdd('upiId', e.target.value)}
                  placeholder="salon.powai@okhdfcbank"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="br-prefix">
                  Bill prefix <span className="text-[11px] font-normal text-muted-foreground">(unique)</span>
                </Label>
                <Input
                  id="br-prefix"
                  value={addForm.billPrefix}
                  onChange={(e) => setAdd('billPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                  placeholder="GG4"
                  className="tnum"
                  aria-invalid={!!addErrors.billPrefix}
                />
                {addErrors.billPrefix ? (
                  <p className="text-xs text-destructive">{addErrors.billPrefix}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Bills will number {addForm.billPrefix || 'XX'}-0001
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="br-owner">
                  Owner WhatsApp <span className="text-[11px] font-normal text-muted-foreground">(10 digits)</span>
                </Label>
                <Input
                  id="br-owner"
                  inputMode="numeric"
                  className="tnum"
                  value={addForm.ownerMobile}
                  onChange={(e) => setAdd('ownerMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  aria-invalid={!!addErrors.ownerMobile}
                />
                {addErrors.ownerMobile && <p className="text-xs text-destructive">{addErrors.ownerMobile}</p>}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">GST billing</p>
                <p className="text-xs text-muted-foreground">Adds 18% GST on this branch's bills.</p>
              </div>
              <Switch
                checked={addForm.gstEnabled}
                onCheckedChange={(v) => setAdd('gstEnabled', v)}
                aria-label="Enable GST for the new branch"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Grant branch access now</Label>
              <div className="grid max-h-40 gap-1.5 overflow-y-auto sm:grid-cols-2">
                {staff.map((u) => {
                  const checked = addForm.assignIds.includes(u.id)
                  const short = u.name
                  return (
                    <label
                      key={u.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border p-2.5 transition-colors',
                        checked ? 'border-primary/50 bg-primary/5' : 'bg-card hover:bg-accent/50',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setAdd('assignIds', v ? [...addForm.assignIds, u.id] : addForm.assignIds.filter((id) => id !== u.id))
                        }
                        aria-label={`Grant ${u.name} access`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{short}</span>
                        <span className="text-[11px] text-muted-foreground">{u.role === 'ADMIN' ? 'Admin' : 'Staff'}</span>
                      </span>
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Optional — you can also assign branches per person from the Staff tab.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addMut.isPending}>
              Cancel
            </Button>
            <Button onClick={submitAdd} disabled={addMut.isPending}>
              {addMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Open branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manage (edit) branch dialog ── */}
      <Dialog open={!!editId} onOpenChange={(o) => !o && (setEditId(null), setEditForm(null))}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          {editForm === null ? (
            <div className="flex flex-col items-center gap-3 py-14">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading branch profile…</p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="size-5 text-primary" aria-hidden />
                  Manage {editForm.name || 'branch'}
                </DialogTitle>
                <DialogDescription>
                  Profile, payments and billing rules for this branch only.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Profile */}
                <section>
                  <p className="micro mb-2 flex items-center gap-1.5 text-muted-foreground">
                    <Store className="size-3.5" aria-hidden /> Profile
                  </p>
                  <ImageField
                    label="Branch logo (optional)"
                    hint="Falls back to the franchise logo when empty."
                    value={editForm.logo}
                    maxSide={256}
                    onChange={(v) => setEdit('logo', v)}
                  />
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="eb-name">Branch name</Label>
                      <Input
                        id="eb-name"
                        value={editForm.name}
                        onChange={(e) => setEdit('name', e.target.value)}
                        aria-invalid={!!editErrors.name}
                      />
                      {editErrors.name && <p className="text-xs text-destructive">{editErrors.name}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="eb-city">City</Label>
                        <Input
                          id="eb-city"
                          value={editForm.city}
                          onChange={(e) => setEdit('city', e.target.value)}
                          aria-invalid={!!editErrors.city}
                        />
                        {editErrors.city && <p className="text-xs text-destructive">{editErrors.city}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="eb-phone">Phone</Label>
                        <Input
                          id="eb-phone"
                          value={editForm.phone}
                          onChange={(e) => setEdit('phone', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="eb-address">Address</Label>
                      <Textarea
                        id="eb-address"
                        value={editForm.address}
                        onChange={(e) => setEdit('address', e.target.value)}
                        rows={2}
                      />
                    </div>
                  </div>
                </section>

                {/* Payments */}
                <section>
                  <p className="micro mb-2 flex items-center gap-1.5 text-muted-foreground">
                    <QrCode className="size-3.5" aria-hidden /> Payments
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="eb-upi">UPI ID</Label>
                      <Input
                        id="eb-upi"
                        value={editForm.upiId}
                        onChange={(e) => setEdit('upiId', e.target.value)}
                        placeholder="salon@okhdfcbank"
                      />
                    </div>
                    <ImageField
                      label="Printed UPI QR (optional)"
                      hint="Upload only if the QR can't be generated from the UPI ID."
                      value={editForm.upiQrImage}
                      maxSide={512}
                      onChange={(v) => setEdit('upiQrImage', v)}
                    />
                    <div className="space-y-1.5">
                      <Label htmlFor="eb-owner">Owner WhatsApp (10 digits)</Label>
                      <Input
                        id="eb-owner"
                        inputMode="numeric"
                        className="tnum"
                        value={editForm.ownerMobile}
                        onChange={(e) => setEdit('ownerMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
                        aria-invalid={!!editErrors.ownerMobile}
                      />
                      {editErrors.ownerMobile && (
                        <p className="text-xs text-destructive">{editErrors.ownerMobile}</p>
                      )}
                    </div>
                  </div>
                </section>

                {/* Billing rules */}
                <section>
                  <p className="micro mb-2 flex items-center gap-1.5 text-muted-foreground">
                    <BadgePercent className="size-3.5" aria-hidden /> Billing rules
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">GST on bills</p>
                        <p className="text-xs text-muted-foreground">Applied on the discounted subtotal.</p>
                      </div>
                      <Switch
                        checked={editForm.gstEnabled}
                        onCheckedChange={(v) => setEdit('gstEnabled', v)}
                        aria-label="Enable GST"
                      />
                    </div>
                    {editForm.gstEnabled && (
                      <div className="space-y-1.5">
                        <Label htmlFor="eb-gst">GST %</Label>
                        <Input
                          id="eb-gst"
                          inputMode="decimal"
                          className="tnum"
                          value={String(editForm.gstPct)}
                          onChange={(e) => setEdit('gstPct', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
                          aria-invalid={!!editErrors.gstPct}
                        />
                        {editErrors.gstPct && <p className="text-xs text-destructive">{editErrors.gstPct}</p>}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">Returning-customer reward</p>
                        <p className="text-xs text-muted-foreground">Discount suggestion at the visit threshold.</p>
                      </div>
                      <Switch
                        checked={editForm.loyaltyEnabled}
                        onCheckedChange={(v) => setEdit('loyaltyEnabled', v)}
                        aria-label="Enable loyalty"
                      />
                    </div>
                    {editForm.loyaltyEnabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="eb-visits">Visits needed</Label>
                          <Input
                            id="eb-visits"
                            inputMode="numeric"
                            className="tnum"
                            value={String(editForm.loyaltyVisits)}
                            onChange={(e) =>
                              setEdit('loyaltyVisits', Math.max(1, Math.round(Number(e.target.value.replace(/\D/g, '')) || 0)))
                            }
                            aria-invalid={!!editErrors.loyaltyVisits}
                          />
                          {editErrors.loyaltyVisits && (
                            <p className="text-xs text-destructive">{editErrors.loyaltyVisits}</p>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="eb-discount">Discount %</Label>
                          <Input
                            id="eb-discount"
                            inputMode="decimal"
                            className="tnum"
                            value={String(editForm.loyaltyDiscountPct)}
                            onChange={(e) => setEdit('loyaltyDiscountPct', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
                            aria-invalid={!!editErrors.loyaltyDiscountPct}
                          />
                          {editErrors.loyaltyDiscountPct && (
                            <p className="text-xs text-destructive">{editErrors.loyaltyDiscountPct}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Receipt + prefix */}
                <section>
                  <p className="micro mb-2 flex items-center gap-1.5 text-muted-foreground">
                    <ReceiptText className="size-3.5" aria-hidden /> Receipt & numbering
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="eb-prefix">
                        Bill prefix <span className="text-[11px] font-normal text-muted-foreground">(unique across all franchises)</span>
                      </Label>
                      <Input
                        id="eb-prefix"
                        value={editForm.billPrefix}
                        onChange={(e) => setEdit('billPrefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                        className="tnum"
                        aria-invalid={!!editErrors.billPrefix}
                      />
                      {editErrors.billPrefix ? (
                        <p className="text-xs text-destructive">{editErrors.billPrefix}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">
                          New bills continue from {editForm.billPrefix}-0001
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="eb-footer">Receipt footer</Label>
                      <Textarea
                        id="eb-footer"
                        value={editForm.receiptFooter}
                        onChange={(e) => setEdit('receiptFooter', e.target.value.slice(0, 200))}
                        rows={2}
                        placeholder="Thank you for visiting!"
                      />
                    </div>
                  </div>
                </section>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => (setEditId(null), setEditForm(null))} disabled={editMut.isPending}>
                  Close
                </Button>
                <Button onClick={submitEdit} disabled={editMut.isPending}>
                  {editMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
                  Save changes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Deactivate confirm ── */}
      <AlertDialog open={!!deactivateTarget} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deactivateTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deactivateTarget && (deactivateTarget.bills30d > 0 || deactivateTarget.userCount > 0)
                ? 'This branch has past activity — it will be deactivated (history and reports preserved) and its staff lose access to it. Empty branches are deleted outright.'
                : 'This branch has no data — it will be deleted permanently.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deactivateMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn('bg-destructive text-white hover:bg-destructive/90')}
              disabled={deactivateMut.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (deactivateTarget) deactivateMut.mutate(deactivateTarget.id)
              }}
            >
              {deactivateMut.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {deactivateTarget && (deactivateTarget.bills30d > 0 || deactivateTarget.userCount > 0)
                ? 'Deactivate'
                : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
