'use client'

/**
 * QrMenuView (ADMIN) — the "QR Menu" page. Every branch gets a scannable QR
 * that opens its public menu (`/?menu=<slug>`) on the guest's phone. Here the
 * owner can print a counter poster, download the QR, tune the first-visit
 * signup offer per branch, and watch guests register in real time.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import QRCode from 'qrcode'
import {
  BadgeCheck,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Percent,
  Printer,
  QrCode as QrCodeIcon,
  ScanLine,
  Sparkles,
  Ticket,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { apiGet, apiPut } from '@/lib/api-client'
import type { BranchAdminDTO, MenuLeadsStatsResponse } from '@/lib/types'
import { useAppStore } from '@/store/use-app-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './ui-atoms'

/* ── QR helpers ──────────────────────────────────────────────────────────── */

function menuUrl(slug: string): string {
  return `${window.location.origin}/?menu=${slug}`
}

async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    margin: 2,
    width: 640,
    errorCorrectionLevel: 'M',
    color: { dark: '#1c1917', light: '#ffffff' },
  })
}

/** A print-ready A5 counter poster: brand, QR, offer strip, address. */

/** HTML-escape everything interpolated into the poster — branch data is
 *  user-typed and this document runs on our own origin (no raw injection). */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function printPoster(branch: BranchAdminDTO, qr: string, url: string) {
  const locality = branch.name.includes('—') ? branch.name.split('—').pop()!.trim() : branch.name
  const offer = branch.menuOfferPct > 0
    ? `<div class="offer">Scan &amp; register on the menu — get ${branch.menuOfferPct}% OFF your first visit</div>`
    : `<div class="offer subtle">Scan to see our full service menu &amp; prices</div>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(branch.name)} — Menu QR</title>
<style>
  @page { size: A5 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #1c1917; background: #fff; }
  .poster { min-height: 190mm; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 10mm 6mm; border: 1.5mm solid #1c1917; border-radius: 8mm; }
  .brand { font-size: 13pt; letter-spacing: 0.35em; text-transform: uppercase; color: #92600a; font-weight: bold; }
  h1 { font-size: 34pt; margin: 4mm 0 2mm; }
  .divider { width: 42mm; border-top: 1pt solid #d6c9a8; margin: 4mm 0; }
  .qr { width: 92mm; height: 92mm; border: 3pt solid #1c1917; border-radius: 6mm; padding: 4mm; }
  .qr img { width: 100%; height: 100%; }
  .url { margin-top: 3mm; font-size: 9pt; color: #78716c; font-family: -apple-system, 'Segoe UI', sans-serif; word-break: break-all; }
  .offer { margin-top: 5mm; font-size: 13.5pt; font-weight: bold; background: #1c1917; color: #fbbf24; border-radius: 99px; padding: 4mm 8mm; max-width: 120mm; }
  .offer.subtle { background: transparent; color: #1c1917; border: 1.5pt solid #1c1917; }
  .steps { margin-top: 5mm; font-size: 10.5pt; color: #57534e; line-height: 1.7; font-family: -apple-system, 'Segoe UI', sans-serif; }
  .addr { margin-top: auto; font-size: 10pt; color: #57534e; font-family: -apple-system, 'Segoe UI', sans-serif; line-height: 1.5; }
  .foot { margin-top: 3mm; font-size: 8pt; letter-spacing: 0.25em; text-transform: uppercase; color: #a8a29e; }
</style></head><body>
<div class="poster">
  <div class="brand">${esc(branch.tenantName)}</div>
  <h1>${esc(locality)}</h1>
  <div class="divider"></div>
  <div class="qr"><img src="${qr}" alt="Menu QR code"></div>
  <div class="url">${esc(url)}</div>
  <div class="offer-wrap">${offer}</div>
  <div class="steps">1 · Point your camera at the code&nbsp;&nbsp;·&nbsp;&nbsp;2 · See our menu &amp; prices<br>3 · Register for your first-visit offer</div>
  <div class="addr">${[branch.address, branch.city].filter((x): x is string => !!x).map(esc).join('<br>')}${branch.phone ? `<br>${esc(branch.phone)}` : ''}</div>
  <div class="foot">Powered by SaloonX</div>
</div>
<script>window.onload = () => { window.print() }</script>
</body></html>`
  const w = window.open('', '_blank', 'width=640,height=900')
  if (!w) {
    toast.error('Allow pop-ups to print the poster')
    return
  }
  w.document.write(html)
  w.document.close()
}

/* ── Branch QR card ──────────────────────────────────────────────────────── */

function BranchQrCard({ branch, index }: { branch: BranchAdminDTO; index: number }) {
  const queryClient = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [pct, setPct] = useState(String(branch.menuOfferPct))
  const [tagline, setTagline] = useState(branch.menuTagline ?? '')
  const [prevBranch, setPrevBranch] = useState(branch)
  const url = branch.menuSlug ? menuUrl(branch.menuSlug) : null

  // Adjust local editors when the server sends fresh branch data (post-save
  // invalidation) — render-phase adjustment instead of an effect.
  if (prevBranch !== branch) {
    setPrevBranch(branch)
    setPct(String(branch.menuOfferPct))
    setTagline(branch.menuTagline ?? '')
  }

  useEffect(() => {
    if (!url) return
    let cancelled = false
    qrDataUrl(url).then((d) => {
      if (!cancelled) setQr(d)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  const saveMut = useMutation({
    mutationFn: () =>
      apiPut(`/api/branches/${branch.id}`, {
        menuOfferPct: Math.max(0, Math.min(100, Number(pct) || 0)),
        ...(tagline.trim() ? { menuTagline: tagline.trim() } : { menuTagline: null }),
      }),
    onSuccess: () => {
      toast.success(`${branch.name} menu settings saved`)
      void queryClient.invalidateQueries({ queryKey: ['branches'] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const dirty = Number(pct) !== branch.menuOfferPct || (tagline.trim() || null) !== (branch.menuTagline ?? null)

  function download() {
    if (!qr || !branch.menuSlug) return
    const a = document.createElement('a')
    a.href = qr
    a.download = `${branch.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-menu-qr.png`
    a.click()
    toast.success('QR downloaded — it stays valid forever')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
      className="overflow-hidden rounded-2xl border bg-card shadow-sm"
    >
      {/* QR preview header */}
      <div className="menu-hero relative flex items-center gap-4 px-5 py-4">
        <div className="size-20 shrink-0 rounded-xl bg-white p-1.5 shadow-md">
          {qr ? (
            <img src={qr} alt={`Menu QR for ${branch.name}`} className="size-full rounded-md" />
          ) : (
            <div className="flex size-full items-center justify-center rounded-md">
              <Loader2 className="size-6 animate-spin text-stone-400" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-stone-100">
          <p className="truncate text-sm font-bold">{branch.name}</p>
          <p className="micro mt-0.5 text-amber-200/90">{branch.city ?? ''}</p>
          {url ? (
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => toast.success('Menu link copied'))
              }}
              className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-stone-200 transition hover:bg-white/20"
              title="Copy link"
            >
              <Copy className="size-3 shrink-0" />
              <span className="truncate">/?menu={branch.menuSlug}</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 p-4">
        <Button variant="outline" className="h-11 gap-2" onClick={download} disabled={!qr}>
          <Download className="size-4" /> QR image
        </Button>
        <Button variant="outline" className="h-11 gap-2" disabled={!qr} onClick={() => url && qr && printPoster(branch, qr, url)}>
          <Printer className="size-4" /> Print poster
        </Button>
        <Button
          variant="outline"
          className="col-span-2 h-11 gap-2"
          onClick={() => url && window.open(url, '_blank')}
          disabled={!url}
        >
          <ExternalLink className="size-4" /> Open the guest menu
        </Button>
      </div>

      {/* Offer settings */}
      <div className="border-t bg-muted/40 p-4">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Sparkles className="size-3.5" /> Guest signup offer &amp; tagline
        </p>
        <div className="mt-2.5 grid grid-cols-[5.4rem_1fr] gap-2">
          <div className="relative">
            <Percent className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 2))}
              inputMode="numeric"
              aria-label="Signup discount percent"
              className="h-10 pr-8 text-center font-bold"
            />
          </div>
          <Input
            value={tagline}
            onChange={(e) => setTagline(e.target.value.slice(0, 120))}
            placeholder="Menu tagline (optional)"
            aria-label="Menu tagline"
            className="h-10"
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <p className="text-[11px] leading-snug text-muted-foreground">
            {Number(pct) > 0 ? `Guests see “Claim ${Number(pct)}% off” on the menu.` : 'Set 0 to hide the signup offer.'}
          </p>
          <Button size="sm" className="h-8 shrink-0 px-3.5" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

/* ── Leads list ──────────────────────────────────────────────────────────── */

function maskMobile(m: string): string {
  return `${m.slice(0, 2)}•••••${m.slice(-3)}`
}

function LeadsPanel() {
  const leadsQ = useQuery({
    queryKey: ['menu-leads'],
    queryFn: () => apiGet<MenuLeadsStatsResponse>('/api/menu-leads'),
    refetchInterval: 30_000,
  })

  if (leadsQ.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    )
  }
  if (leadsQ.isError) {
    return <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Could not load signups — {(leadsQ.error as Error).message}</p>
  }

  const { totals, recent } = leadsQ.data

  return (
    <div className="rounded-2xl border bg-card shadow-sm">
      <div className="grid grid-cols-3 divide-x border-b">
        <div className="p-4 text-center">
          <p className="tnum text-2xl font-extrabold">{totals.claims}</p>
          <p className="micro mt-0.5 text-muted-foreground">Signups</p>
        </div>
        <div className="p-4 text-center">
          <p className="tnum text-2xl font-extrabold text-emerald-600">{totals.redeemed}</p>
          <p className="micro mt-0.5 text-muted-foreground">Redeemed</p>
        </div>
        <div className="p-4 text-center">
          <p className="tnum text-2xl font-extrabold text-primary">
            {totals.claims > 0 ? Math.round((totals.redeemed / totals.claims) * 100) : 0}%
          </p>
          <p className="micro mt-0.5 text-muted-foreground">Conversion</p>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto p-2">
        {recent.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={ScanLine}
              title="No menu signups yet"
              hint="Print the poster and prop it at the counter — guests who scan and register show up here instantly."
            />
          </div>
        ) : (
          <ul className="space-y-1">
            {recent.map((l) => (
              <li key={l.id} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-accent/50">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 font-bold text-amber-700">
                  <Ticket className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {l.name ?? 'Guest'} <span className="tnum font-normal text-muted-foreground">· {maskMobile(l.mobile)}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.branchName} · code <span className="tnum font-semibold">{l.code}</span> · {l.pct}% off
                  </p>
                </div>
                {l.redeemedAt ? (
                  <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">
                    <BadgeCheck className="size-3" /> Used
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Pending
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ── View root ───────────────────────────────────────────────────────────── */

export default function QrMenuView() {
  const user = useAppStore((s) => s.user)
  const branchesQ = useQuery({
    queryKey: ['branches'],
    queryFn: () => apiGet<{ branches: BranchAdminDTO[] }>('/api/branches'),
  })

  const branches = useMemo(
    () => (branchesQ.data?.branches ?? []).filter((b) => b.approved && b.active),
    [branchesQ.data],
  )

  return (
    <div className="space-y-6 p-4 pb-24 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">QR Menu</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
            Your live menu on every guest&apos;s phone — print the poster, guests scan, browse services and register
            for their first-visit offer.
          </p>
        </div>
        <span className="micro inline-flex items-center gap-1.5 rounded-full border bg-amber-500/10 px-3 py-1.5 text-amber-700">
          <QrCodeIcon className="size-3.5" /> {user?.tenantName ?? 'Franchise'}
        </span>
      </div>

      {/* Leads + branch QR grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <UsersRound className="size-4" /> Menu signups
          </h2>
          <LeadsPanel />
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
            A signup automatically creates the guest&apos;s profile — at billing, entering their mobile shows the offer
            banner. The code redeems itself on their first discounted bill.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <ScanLine className="size-4" /> Posters &amp; QR codes ({branches.length})
          </h2>
          {branchesQ.isPending ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-80 rounded-2xl" />
              ))}
            </div>
          ) : branchesQ.isError ? (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              Could not load branches — {(branchesQ.error as Error).message}
            </p>
          ) : branches.length === 0 ? (
            <EmptyState
              icon={QrCodeIcon}
              title="No live branches yet"
              hint="Branches appear here once the platform approves them."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {branches.map((b, i) => (
                <BranchQrCard key={b.id} branch={b} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="rounded-xl border bg-muted/40 p-3.5 text-xs leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Tip:</strong> the QR never expires and always shows today&apos;s prices —
        change your menu in <em>Menu &amp; Prices</em> and every scan reflects it instantly. Redeemed offers show up
        in your dashboard like any other discount — no manual coupon bookkeeping needed.
      </p>
    </div>
  )
}
