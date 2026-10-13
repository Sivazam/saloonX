'use client'

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgePercent,
  Building2,
  Loader2,
  MapPin,
  QrCode,
  ReceiptText,
  Save,
  Store,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPut } from '@/lib/api-client'
import type { BranchProfileDTO } from '@/lib/types'
import { useAppStore } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { EmptyState } from './ui-atoms'

/* ── Form model ─────────────────────────────────────────────────────────── */

interface BranchSettingsForm {
  name: string
  city: string
  address: string
  phone: string
  logo: string | null
  ownerMobile: string
  upiId: string
  upiQrImage: string | null
  gstEnabled: boolean
  gstPct: number
  loyaltyEnabled: boolean
  loyaltyVisits: number
  loyaltyDiscountPct: number
  receiptFooter: string
}

type FieldErrors = Partial<Record<'name' | 'city' | 'gstPct' | 'loyaltyVisits' | 'loyaltyDiscountPct' | 'ownerMobile', string>>

function fromBranch(b: BranchProfileDTO): BranchSettingsForm {
  return {
    name: b.name,
    city: b.city ?? '',
    address: b.address ?? '',
    phone: b.phone ?? '',
    logo: b.logo,
    ownerMobile: b.ownerMobile ?? '',
    upiId: b.upiId ?? '',
    upiQrImage: b.upiQrImage,
    gstEnabled: b.gstEnabled,
    gstPct: b.gstPct,
    loyaltyEnabled: b.loyaltyEnabled,
    loyaltyVisits: b.loyaltyVisits,
    loyaltyDiscountPct: b.loyaltyDiscountPct,
    receiptFooter: b.receiptFooter ?? '',
  }
}

/** Downscale an image file to a PNG data URL (max 512px longest side). */
function fileToDownscaledDataUrl(file: File, maxSide = 512): Promise<string> {
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

/* ── Section card shell ─────────────────────────────────────────────────── */

function SectionCard({
  icon: Icon,
  chipClass,
  title,
  description,
  children,
}: {
  icon: typeof Store
  chipClass: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="hairline rounded-xl bg-card p-4 lg:p-5">
      <div className="flex items-center gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', chipClass)}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

/* ── Image upload field ─────────────────────────────────────────────────── */

function ImageUploadField({
  id,
  label,
  hint,
  value,
  onChange,
  onClear,
  aspect = 'square',
}: {
  id: string
  label: string
  hint: string
  value: string | null
  onChange: (dataUrl: string) => void
  onClear: () => void
  aspect?: 'square' | 'wide'
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const dataUrl = await fileToDownscaledDataUrl(file)
      onChange(dataUrl)
      toast.success('Image ready — hit Save changes')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted',
            aspect === 'square' ? 'size-20' : 'h-20 w-32',
          )}
        >
          {value ? (
             
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <Upload className="size-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => ref.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {value ? 'Replace' : 'Upload'}
            </Button>
            {value && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onClear}
              >
                <Trash2 aria-hidden />
                Remove
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  )
}

/* ── View ──────────────────────────────────────────────────────────────── */

export default function SettingsView() {
  const qc = useQueryClient()
  const user = useAppStore((s) => s.user)

  const branchQ = useQuery({
    queryKey: ['branch'],
    queryFn: () => apiGet<{ branch: BranchProfileDTO }>('/api/branch'),
  })
  const branch = branchQ.data?.branch

  const [form, setForm] = useState<BranchSettingsForm | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [seed, setSeed] = useState<string | null>(null)

  // Re-seed the form whenever fresh branch data arrives (idempotent by seed key).
  if (branch && seed !== branch.id) {
    setSeed(branch.id)
    setForm(fromBranch(branch))
    setErrors({})
  }

  const saveMut = useMutation({
    mutationFn: (f: BranchSettingsForm) =>
      apiPut('/api/branch', {
        name: f.name.trim(),
        city: f.city.trim(),
        address: f.address.trim() || null,
        phone: f.phone.trim() || null,
        logo: f.logo,
        ownerMobile: f.ownerMobile.trim() ? f.ownerMobile.trim() : null,
        upiId: f.upiId.trim() || null,
        upiQrImage: f.upiQrImage,
        gstEnabled: f.gstEnabled,
        gstPct: f.gstPct,
        loyaltyEnabled: f.loyaltyEnabled,
        loyaltyVisits: f.loyaltyVisits,
        loyaltyDiscountPct: f.loyaltyDiscountPct,
        receiptFooter: f.receiptFooter.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['branch'] })
      void qc.invalidateQueries({ queryKey: ['auth-branches'] })
      toast.success('Branch settings saved')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const set = <K extends keyof BranchSettingsForm>(key: K, value: BranchSettingsForm[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  function submit() {
    if (!form) return
    const e: FieldErrors = {}
    if (form.name.trim().length < 2) e.name = 'Branch name is too short'
    if (form.city.trim().length < 2) e.city = 'City is required'
    if (form.gstEnabled && (form.gstPct < 0 || form.gstPct > 100)) e.gstPct = 'GST must be 0–100'
    if (form.loyaltyEnabled && form.loyaltyVisits < 1) e.loyaltyVisits = 'At least 1 visit'
    if (form.loyaltyEnabled && (form.loyaltyDiscountPct < 0 || form.loyaltyDiscountPct > 100))
      e.loyaltyDiscountPct = 'Discount must be 0–100'
    if (form.ownerMobile && !/^\d{10}$/.test(form.ownerMobile.trim()))
      e.ownerMobile = 'Owner WhatsApp must be exactly 10 digits'
    setErrors(e)
    if (Object.keys(e).length > 0) {
      toast.error('Check the highlighted fields')
      return
    }
    saveMut.mutate(form)
  }

  if (branchQ.isPending && !form) {
    return (
      <div className="space-y-4 p-4 pb-24 lg:p-6 lg:pb-6">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (branchQ.isError) {
    return (
      <div className="p-4 pb-24 lg:p-6 lg:pb-6">
        <div className="hairline rounded-xl bg-card">
          <EmptyState
            icon={AlertTriangle}
            title="Could not load branch settings"
            hint={(branchQ.error as Error).message}
          />
          <div className="flex justify-center pb-6">
            <Button variant="outline" onClick={() => void branchQ.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!branch || !form) {
    return (
      <div className="p-4 pb-24 lg:p-6 lg:pb-6">
        <div className="hairline rounded-xl bg-card">
          <EmptyState
            icon={Building2}
            title="No branch context"
            hint="Settings manage the branch you are working at. Switch to a branch from the header."
          />
        </div>
      </div>
    )
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(fromBranch(branch))
  const tenantLogo = branch.tenantLogo

  return (
    <div className="p-4 pb-24 lg:p-6 lg:pb-6">
      {/* Branch identity header */}
      <div className="hairline flex flex-wrap items-center gap-4 rounded-xl bg-card p-4 lg:p-5">
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {form.logo || tenantLogo ? (
             
            <img src={form.logo ?? tenantLogo ?? ''} alt="" className="size-full object-cover" />
          ) : (
            <Building2 className="size-6 text-muted-foreground" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight lg:text-2xl">{branch.name}</h1>
            <span className="micro rounded-md border bg-muted px-1.5 py-0.5 text-muted-foreground">
              Bills {branch.billPrefix}-0001
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {user?.tenantName ?? branch.tenantName} · franchise
            {branch.city ? ` · ${branch.city}` : ''}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Branch settings apply <strong>only here</strong> — other branches are managed from the
          Branches tab.
        </p>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* Branch profile */}
        <SectionCard
          icon={Store}
          chipClass="bg-primary/10 text-primary"
          title="Branch profile"
          description="Shown on receipts and the branch picker."
        >
          <ImageUploadField
            id="branch-logo"
            label="Branch logo (optional)"
            hint="Falls back to the franchise logo when empty. Square images look best."
            value={form.logo}
            onChange={(v) => set('logo', v)}
            onClear={() => set('logo', null)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="set-name">Branch name</Label>
            <Input
              id="set-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Glow & Go — Andheri West"
              aria-invalid={!!errors.name}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-city">City</Label>
              <Input
                id="set-city"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Mumbai"
                aria-invalid={!!errors.city}
              />
              {errors.city && <p className="text-xs text-destructive">{errors.city}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-phone">Phone</Label>
              <Input
                id="set-phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-address">Full address</Label>
            <Textarea
              id="set-address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Shop 12, MG Road, …"
              rows={2}
            />
          </div>
        </SectionCard>

        {/* Payments */}
        <SectionCard
          icon={QrCode}
          chipClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          title="Payments"
          description="UPI collects money at THIS branch — each branch has its own."
        >
          <div className="space-y-1.5">
            <Label htmlFor="set-upi">UPI ID</Label>
            <Input
              id="set-upi"
              value={form.upiId}
              onChange={(e) => set('upiId', e.target.value)}
              placeholder="salon@okhdfcbank"
            />
            <p className="text-[11px] text-muted-foreground">
              Billing auto-generates a QR with the bill amount from this ID.
            </p>
          </div>
          <ImageUploadField
            id="upi-qr"
            label="Printed UPI QR (optional)"
            hint="Upload only if your UPI QR cannot be generated from the ID (e.g. merchant stickers)."
            value={form.upiQrImage}
            onChange={(v) => set('upiQrImage', v)}
            onClear={() => set('upiQrImage', null)}
          />
          <div className="space-y-1.5">
            <Label htmlFor="set-owner">Owner WhatsApp (10 digits)</Label>
            <Input
              id="set-owner"
              inputMode="numeric"
              className="tnum"
              value={form.ownerMobile}
              onChange={(e) => set('ownerMobile', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210"
              aria-invalid={!!errors.ownerMobile}
            />
            {errors.ownerMobile ? (
              <p className="text-xs text-destructive">{errors.ownerMobile}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Quick WhatsApp notes from the dashboard go to this number.
              </p>
            )}
          </div>
        </SectionCard>

        {/* Billing rules */}
        <SectionCard
          icon={BadgePercent}
          chipClass="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          title="Billing rules"
          description="GST and returning-customer rewards for this branch."
        >
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">GST on bills</p>
              <p className="text-xs text-muted-foreground">Adds GST on top of the discounted subtotal.</p>
            </div>
            <Switch
              checked={form.gstEnabled}
              onCheckedChange={(v) => set('gstEnabled', v)}
              aria-label="Enable GST"
            />
          </div>
          {form.gstEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="set-gst">GST %</Label>
              <Input
                id="set-gst"
                inputMode="decimal"
                className="tnum"
                value={String(form.gstPct)}
                onChange={(e) => set('gstPct', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
                aria-invalid={!!errors.gstPct}
              />
              {errors.gstPct && <p className="text-xs text-destructive">{errors.gstPct}</p>}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Returning-customer reward</p>
              <p className="text-xs text-muted-foreground">
                Suggest a discount when a customer crosses the visit threshold.
              </p>
            </div>
            <Switch
              checked={form.loyaltyEnabled}
              onCheckedChange={(v) => set('loyaltyEnabled', v)}
              aria-label="Enable loyalty"
            />
          </div>
          {form.loyaltyEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="set-visits">Visits needed</Label>
                <Input
                  id="set-visits"
                  inputMode="numeric"
                  className="tnum"
                  value={String(form.loyaltyVisits)}
                  onChange={(e) =>
                    set('loyaltyVisits', Math.max(1, Math.round(Number(e.target.value.replace(/\D/g, '')) || 0)))
                  }
                  aria-invalid={!!errors.loyaltyVisits}
                />
                {errors.loyaltyVisits && <p className="text-xs text-destructive">{errors.loyaltyVisits}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-discount">Discount %</Label>
                <Input
                  id="set-discount"
                  inputMode="decimal"
                  className="tnum"
                  value={String(form.loyaltyDiscountPct)}
                  onChange={(e) =>
                    set('loyaltyDiscountPct', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)
                  }
                  aria-invalid={!!errors.loyaltyDiscountPct}
                />
                {errors.loyaltyDiscountPct && (
                  <p className="text-xs text-destructive">{errors.loyaltyDiscountPct}</p>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Receipt */}
        <SectionCard
          icon={ReceiptText}
          chipClass="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          title="Receipt"
          description="The thank-you line printed at the bottom of this branch's receipts."
        >
          <div className="space-y-1.5">
            <Label htmlFor="set-footer">Receipt footer</Label>
            <Textarea
              id="set-footer"
              value={form.receiptFooter}
              onChange={(e) => set('receiptFooter', e.target.value.slice(0, 200))}
              placeholder="Thank you for visiting! Follow us on Instagram @yoursalon"
              rows={3}
            />
            <p className="tnum text-[11px] text-muted-foreground">{form.receiptFooter.length}/200</p>
          </div>
          {/* Live receipt preview */}
          <div className="rounded-lg border bg-background p-3">
            <p className="micro mb-2 text-muted-foreground">Preview</p>
            <div className="rounded-md border bg-card p-3 text-center text-xs">
              <p className="font-bold">{form.name || 'Branch name'}</p>
              <p className="text-muted-foreground">{form.address || 'Branch address'}</p>
              <p className="mt-2 font-semibold">GG1-0042</p>
              <p className="mt-1 text-muted-foreground">Haircut x1 — Rs. 150</p>
              <p className="mt-1 font-bold">Total — Rs. 150</p>
              <p className="mt-2 text-muted-foreground">{form.receiptFooter || 'Receipt footer message'}</p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Sticky save bar */}
      <div className="sticky bottom-20 z-20 mt-4 lg:bottom-4">
        <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
          <p className="flex-1 truncate text-xs text-muted-foreground">
            {dirty ? 'You have unsaved changes for this branch.' : 'All changes saved.'}
          </p>
          <Button
            onClick={submit}
            disabled={!dirty || saveMut.isPending}
            className="gap-1.5"
          >
            {saveMut.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Save changes
          </Button>
        </div>
      </div>
    </div>
  )
}
