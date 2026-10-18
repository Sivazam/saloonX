'use client'

/**
 * SalonMenuApp — the PUBLIC customer-facing menu behind the salon's QR code
 * (`/?menu=<slug>`). Completely independent of staff auth: a guest scans the
 * poster at the salon and lands on this branded, mobile-first experience.
 *
 * Design: premium editorial — ink hero with warm gold accents, cream paper
 * body, Fraunces display serif, hand-drawn category icons, Swiggy-style
 * floating category dock, live search, and a first-visit offer the guest can
 * register for (coupon code shown at the counter, auto-honoured at billing).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Clock,
  Flame,
  Loader2,
  MapPin,
  MessageCircle,
  Percent,
  Phone,
  Search,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react'
import { apiGet, apiPost } from '@/lib/api-client'
import { formatINR } from '@/lib/format'
import type { MenuLeadResponse, PublicMenuResponse } from '@/lib/types'
import { MenuIcon } from '@/components/menu/icons'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'

/* ── Claim persistence (per-salon, this device) ─────────────────────────── */

function loadClaim(slug: string): MenuLeadResponse | null {
  try {
    const raw = localStorage.getItem(`menu-claim-${slug}`)
    return raw ? (JSON.parse(raw) as MenuLeadResponse) : null
  } catch {
    return null
  }
}

function saveClaim(slug: string, claim: MenuLeadResponse) {
  try {
    localStorage.setItem(`menu-claim-${slug}`, JSON.stringify(claim))
  } catch {
    /* private mode — the guest can screenshot the ticket instead */
  }
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter((w) => /^[a-zA-Z]/.test(w))
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || name.slice(0, 1).toUpperCase()
  )
}

/** Branch/tenant logo chip with an ivory ring — used in the hero + header. */
function LogoChip({ logo, name, size = 56 }: { logo: string | null; name: string; size?: number }) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={`${name} logo`}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover ring-2 ring-white/25"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-amber-100/15 font-display font-semibold text-amber-100 ring-2 ring-white/25"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  )
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

function Hero({
  data,
  claim,
  onClaim,
}: {
  data: PublicMenuResponse
  claim: MenuLeadResponse | null
  onClaim: () => void
}) {
  const locality = data.branch.name.includes('—') ? data.branch.name.split('—').pop()!.trim() : data.branch.name
  const services = data.categories.reduce((a, c) => a + c.services.length, 0)

  return (
    <header className="menu-hero relative overflow-hidden rounded-b-[2rem] pb-7 pt-10 text-stone-100 sm:pb-9 sm:pt-14">
      {/* watermark scissors */}
      <MenuIcon
        icon={data.categories[0]?.icon ?? 'scissors'}
        className="pointer-events-none absolute -right-10 -top-10 size-56 rotate-12 text-white/[0.05]"
      />
      <div className="relative mx-auto max-w-3xl px-5">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex items-center gap-4"
        >
          <LogoChip logo={data.branch.logo ?? data.tenant.logo} name={data.tenant.name} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-200/90">
              {data.tenant.name}
            </p>
            <h1 className="font-display text-3xl font-semibold leading-tight text-stone-50 sm:text-4xl">
              {locality}
            </h1>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.4 }}
          className="mt-4 max-w-md font-display text-[15px] italic leading-relaxed text-stone-300"
        >
          “{data.branch.tagline}”
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.4 }}
          className="mt-5 flex flex-wrap items-center gap-2"
        >
          {data.branch.city && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-stone-200">
              <MapPin className="size-3.5 text-amber-200" /> {data.branch.city}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-stone-200">
            <Ticket className="size-3.5 text-amber-200" /> {services}+ services
          </span>
          {data.offer && data.offer.pct > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-200">
              <Sparkles className="size-3.5 text-amber-200" /> {data.offer.pct}% off for first visit
            </span>
          )}
        </motion.div>

        {/* Offer CTA / claimed chip */}
        <AnimatePresence mode="wait" initial={false}>
          {data.offer ? (
            claim ? (
              <motion.div
                key="claimed"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-emerald-300/30 bg-emerald-400/15 px-4 py-2.5 text-sm font-semibold text-emerald-200"
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-400/25">
                  <Check className="size-3.5" />
                </span>
                Your code <span className="tracking-[0.18em] text-emerald-100">{claim.code}</span> · {claim.pct}% off
              </motion.div>
            ) : (
              <motion.button
                key="cta"
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                whileTap={{ scale: 0.97 }}
                onClick={onClaim}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 px-5 py-3 text-sm font-bold text-stone-900 shadow-lg shadow-amber-900/30 transition hover:brightness-105"
              >
                <Percent className="size-4" />
                Claim {data.offer.pct}% off your first visit
                <ArrowUpRight className="size-4" />
              </motion.button>
            )
          ) : null}
        </AnimatePresence>
      </div>
    </header>
  )
}

/* ── Sticky search ───────────────────────────────────────────────────────── */

function SearchBar({
  value,
  onChange,
  resultCount,
}: {
  value: string
  onChange: (v: string) => void
  resultCount: number | null
}) {
  return (
    <div className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#faf7f1]/92 backdrop-blur-md">
      <div className="mx-auto max-w-3xl px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-stone-400" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Search services…"
            aria-label="Search services"
            className="h-12 w-full rounded-full border border-stone-200 bg-white pl-11 pr-12 text-[15px] text-stone-900 shadow-sm outline-none transition placeholder:text-stone-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/15"
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onChange('')}
              className="absolute right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-stone-200/70 text-stone-600 transition hover:bg-stone-200"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <AnimatePresence>
          {value && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden pt-2 text-xs font-medium text-stone-500"
            >
              {resultCount && resultCount > 0
                ? `${resultCount} service${resultCount === 1 ? '' : 's'} match “${value}”`
                : `No matches for “${value}” — clear the search to see everything`}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Category tiles ──────────────────────────────────────────────────────── */

function CategoryTiles({
  data,
  onJump,
}: {
  data: PublicMenuResponse
  onJump: (id: string) => void
}) {
  return (
    <section aria-label="Menu categories" className="mx-auto max-w-3xl px-5 pt-7">
      <h2 className="font-display text-xl font-semibold text-stone-900">Explore the menu</h2>
      <p className="mt-0.5 text-[13px] text-stone-600">Tap a tile to jump to that section</p>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
        {data.categories.map((cat, i) => (
          <motion.button
            key={cat.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: i * 0.04, duration: 0.32 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onJump(cat.id)}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-stone-200/90 bg-white p-3 shadow-sm transition hover:border-amber-300 hover:shadow-md"
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100 transition group-hover:bg-amber-100">
              <MenuIcon icon={cat.icon} className="size-5.5" />
            </span>
            <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-stone-700">
              {cat.name}
            </span>
          </motion.button>
        ))}
      </div>
    </section>
  )
}

/* ── Popular strip ───────────────────────────────────────────────────────── */

function PopularStrip({ data, onJump }: { data: PublicMenuResponse; onJump: (id: string) => void }) {
  const popular = data.categories.flatMap((c) =>
    c.services.filter((s) => s.popular).map((s) => ({ ...s, categoryId: c.id })),
  )
  if (popular.length === 0) return null
  return (
    <section aria-label="Most loved services" className="mx-auto max-w-3xl px-5 pt-7">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-stone-900">
        <Flame className="size-5 text-orange-500" /> Most loved here
      </h2>
      <p className="mt-0.5 text-[13px] text-stone-600">What regulars actually book</p>
      <div className="no-scrollbar -mx-5 mt-4 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1">
        {popular.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.categoryId)}
            className="flex shrink-0 snap-start items-center gap-2.5 rounded-full border border-orange-200/80 bg-white py-2 pl-2.5 pr-4 shadow-sm transition hover:border-orange-300"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-orange-50">
              <Flame className="size-4 text-orange-500" />
            </span>
            <span className="text-left">
              <span className="block max-w-36 truncate text-[13px] font-semibold text-stone-800">{s.name}</span>
              <span className="block text-[11px] font-medium text-stone-500">{formatINR(s.price)}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/* ── Menu sections ───────────────────────────────────────────────────────── */

function ServiceRow({ service }: { service: PublicMenuResponse['categories'][number]['services'][number] }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.28 }}
      className="flex items-center gap-3 rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-[15px] font-semibold leading-snug text-stone-900">{service.name}</h4>
          {service.popular && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-600 ring-1 ring-orange-200/70">
              <Flame className="size-3" /> Popular
            </span>
          )}
        </div>
        {service.durationMin != null && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-stone-500">
            <Clock className="size-3.5" /> {service.durationMin} min
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="tnum text-lg font-bold text-stone-900">{formatINR(service.price)}</p>
        {service.mrp != null && service.mrp > service.price && (
          <p className="tnum text-xs font-medium text-stone-400 line-through">{formatINR(service.mrp)}</p>
        )}
      </div>
    </motion.li>
  )
}

function MenuSections({ data }: { data: PublicMenuResponse }) {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-6">
      {data.categories.map((cat) => (
        <section key={cat.id} id={`cat-${cat.id}`} aria-label={cat.name} className="scroll-mt-24 pt-9">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-stone-900 text-amber-300 shadow-sm">
              <MenuIcon icon={cat.icon} className="size-5.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-2xl font-semibold leading-tight text-stone-900">{cat.name}</h3>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
                {cat.services.length} service{cat.services.length === 1 ? '' : 's'}
              </p>
            </div>
            <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-stone-200 to-transparent" />
          </div>
          <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {cat.services.map((s) => (
              <ServiceRow key={s.id} service={s} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* ── Visit us + footer ───────────────────────────────────────────────────── */

function whatsappHref(phone: string | null, salonName: string): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 10) digits = `91${digits}`
  if (digits.length < 12) return null
  const text = encodeURIComponent(`Hi ${salonName}! I found you via your menu QR — I'd like to book an appointment.`)
  return `https://wa.me/${digits}?text=${text}`
}

function VisitUs({ data }: { data: PublicMenuResponse }) {
  const wa = whatsappHref(data.branch.phone, data.branch.name)
  return (
    <section aria-label="Visit us" className="mx-auto max-w-3xl px-5 pb-4 pt-8">
      <div className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm sm:p-6">
        <h3 className="font-display text-2xl font-semibold text-stone-900">Visit us</h3>
        <div className="mt-4 space-y-3">
          {data.branch.address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(data.branch.address)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-3 rounded-2xl bg-stone-50 p-3.5 transition hover:bg-amber-50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 ring-1 ring-stone-200">
                <MapPin className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-stone-700">{data.branch.address}</span>
              <ArrowUpRight className="mt-1 size-4 shrink-0 text-stone-400" />
            </a>
          )}
          {data.branch.phone && (
            <a
              href={`tel:${data.branch.phone.replace(/\s/g, '')}`}
              className="flex items-center gap-3 rounded-2xl bg-stone-50 p-3.5 transition hover:bg-amber-50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700 ring-1 ring-stone-200">
                <Phone className="size-4.5" />
              </span>
              <span className="flex-1 text-sm font-medium text-stone-700">{data.branch.phone}</span>
              <ArrowUpRight className="size-4 shrink-0 text-stone-400" />
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 p-4 text-[15px] font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500"
            >
              <MessageCircle className="size-5" />
              Book on WhatsApp
            </a>
          )}
        </div>
        {data.offer && (
          <p className="mt-4 text-center text-xs text-stone-500">
            First visit? Register on this menu and show your code for {data.offer.pct}% off.
          </p>
        )}
      </div>
    </section>
  )
}

function MenuFooter({ tenantName }: { tenantName: string }) {
  return (
    <footer className="pb-44 pt-6 text-center">
      <p className="font-display text-[15px] italic text-stone-500">{tenantName}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">
        Prices & availability updated live by the salon
      </p>
      <p className="mt-3 text-[11px] text-stone-400">
        Powered by <span className="font-semibold text-stone-500">SaloonX</span>
      </p>
    </footer>
  )
}

/* ── Floating category dock (Swiggy-style) ───────────────────────────────── */

function CategoryDock({
  data,
  activeId,
  onJump,
  offer,
  claimed,
  onClaim,
}: {
  data: PublicMenuResponse
  activeId: string | null
  onJump: (id: string) => void
  offer: boolean
  claimed: boolean
  onClaim: () => void
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Keep the active pill centred without ever scrolling the page vertically.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !activeId) return
    const pill = el.querySelector<HTMLElement>(`[data-cat="${activeId}"]`)
    if (!pill) return
    const target = pill.offsetLeft - el.clientWidth / 2 + pill.clientWidth / 2
    el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeId])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 sm:bottom-5">
      <motion.nav
        initial={{ y: 70, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.25 }}
        aria-label="Menu sections"
        className="pointer-events-auto flex max-w-[min(92vw,42rem)] items-center gap-1 rounded-full bg-stone-900/97 p-1.5 shadow-2xl shadow-stone-900/30 ring-1 ring-white/10 backdrop-blur"
      >
        {offer && !claimed && (
          <button
            type="button"
            onClick={onClaim}
            aria-label="Claim first-visit offer"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-stone-900 shadow-inner transition hover:brightness-105 active:scale-95"
          >
            <Percent className="size-5" />
          </button>
        )}
        <div ref={scrollerRef} className="no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto">
          {data.categories.map((cat) => {
            const active = cat.id === activeId
            return (
              <button
                key={cat.id}
                type="button"
                data-cat={cat.id}
                onClick={() => onJump(cat.id)}
                aria-current={active ? 'true' : undefined}
                className={`flex min-w-[3.6rem] shrink-0 flex-col items-center gap-0.5 rounded-full px-2.5 py-1.5 transition-all ${
                  active ? 'bg-amber-400 text-stone-900' : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                <MenuIcon icon={cat.icon} className="size-5" />
                <span className="max-w-14 truncate text-[9px] font-semibold leading-none">
                  {cat.name.split(/[&—]/)[0].trim()}
                </span>
              </button>
            )
          })}
        </div>
      </motion.nav>
    </div>
  )
}

/* ── Claim drawer (register → coupon ticket) ─────────────────────────────── */

function ClaimDrawer({
  open,
  onOpenChange,
  slug,
  offerPct,
  onClaimed,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  slug: string
  offerPct: number
  onClaimed: (claim: MenuLeadResponse) => void
}) {
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<MenuLeadResponse | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setBusy(false)
      // keep `done` so reopening shows the ticket until a new claim succeeds
    }
  }, [open])

  const mobileValid = /^\d{10}$/.test(mobile)

  async function submit() {
    if (busy || !mobileValid) return
    setBusy(true)
    setError(null)
    try {
      const res = await apiPost<MenuLeadResponse>('/api/public/menu/lead', {
        slug,
        mobile,
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      setDone(res)
      saveClaim(slug, res)
      onClaimed(res)
    } catch (e) {
      setError((e as Error).message || 'Something went wrong — please try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="menu-root rounded-t-[2rem] border-stone-200 bg-[#faf7f1] text-stone-900">
        <div className="mx-auto w-full max-w-md pb-10">
          <DrawerTitle className="sr-only">Claim your first-visit offer</DrawerTitle>

          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-5 pt-2"
              >
                <div className="flex flex-col items-center text-center">
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.1 }}
                    className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50"
                  >
                    <Check className="size-7" />
                  </motion.span>
                  <h3 className="mt-4 font-display text-2xl font-semibold">
                    {done.already ? `You're already on the list${done.name ? `, ${done.name}` : ''}!` : `Welcome${done.name ? `, ${done.name}` : ''}!`}
                  </h3>
                  <p className="mt-1 text-sm text-stone-500">
                    Show this code at the counter for <strong className="text-stone-800">{done.pct}% off</strong> your
                    first visit.
                  </p>
                </div>

                {/* coupon ticket */}
                <motion.div
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 240, damping: 20 }}
                  className="ticket-notch relative mx-2 mt-6 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 px-6 py-6 text-center"
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-700">Your offer code</p>
                  <p className="tnum mt-2 text-4xl font-extrabold tracking-[0.22em] text-stone-900">{done.code}</p>
                  <p className="mt-2 text-xs font-medium text-amber-800">{done.pct}% OFF · first visit only</p>
                </motion.div>

                <p className="mt-4 text-center text-[11px] text-stone-400">
                  Screenshot this to keep it — we&apos;ll also recognise your number at billing.
                </p>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="mt-5 h-12 w-full rounded-2xl bg-stone-900 text-[15px] font-bold text-stone-50 transition hover:bg-stone-800"
                >
                  Back to the menu
                </button>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 pt-2">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-stone-900 shadow-md shadow-amber-500/25">
                    <Percent className="size-6" />
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-semibold leading-tight">Get {offerPct}% off</h3>
                    <p className="text-[13px] text-stone-500">Register once — show your code at the counter.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  <div>
                    <label htmlFor="claim-name" className="mb-1.5 block text-xs font-semibold text-stone-600">
                      Your name <span className="font-normal text-stone-400">(optional)</span>
                    </label>
                    <input
                      id="claim-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={60}
                      autoComplete="name"
                      placeholder="e.g. Aarav"
                      className="h-13 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3.5 text-[15px] outline-none transition placeholder:text-stone-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/15"
                    />
                  </div>
                  <div>
                    <label htmlFor="claim-mobile" className="mb-1.5 block text-xs font-semibold text-stone-600">
                      Mobile number
                    </label>
                    <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 transition focus-within:border-amber-400 focus-within:ring-4 focus-within:ring-amber-400/15">
                      <span className="tnum text-[15px] font-semibold text-stone-400">+91</span>
                      <input
                        id="claim-mobile"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        inputMode="numeric"
                        autoComplete="tel-national"
                        placeholder="10-digit number"
                        aria-label="10 digit mobile number"
                        className="h-13 w-full bg-transparent py-3.5 text-lg font-semibold tracking-[0.14em] outline-none placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-stone-400"
                      />
                      {mobile.length === 10 && <Check className="size-5 shrink-0 text-emerald-500" />}
                    </div>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={busy || !mobileValid}
                  className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-base font-bold text-stone-900 shadow-lg shadow-amber-500/25 transition enabled:hover:brightness-105 enabled:active:scale-[0.99] disabled:opacity-45"
                >
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <Ticket className="size-5" />}
                  {busy ? 'Getting your code…' : `Claim my ${offerPct}% off`}
                </button>
                <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">
                  We only use your number to recognise you at this salon. No spam, ever.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DrawerContent>
    </Drawer>
  )
}

/* ── Loading / error states ──────────────────────────────────────────────── */

function MenuSkeleton() {
  return (
    <div className="menu-root min-h-dvh bg-[#faf7f1]" aria-label="Loading menu">
      <div className="menu-hero h-72 rounded-b-[2rem]" />
      <div className="mx-auto max-w-3xl space-y-6 px-5 pt-7">
        <div className="h-12 animate-pulse rounded-full bg-stone-200/70" />
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-200/70" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-stone-200/70" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function MenuError({ message }: { message: string }) {
  return (
    <div className="menu-root flex min-h-dvh flex-col items-center justify-center bg-[#faf7f1] px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <AlertTriangle className="size-8" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-semibold text-stone-900">This menu link isn&apos;t working</h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-stone-500">{message}</p>
      <p className="mt-1 max-w-xs text-sm text-stone-500">Please scan the QR code at the salon again.</p>
    </div>
  )
}

/* ── Root component ──────────────────────────────────────────────────────── */

export function SalonMenuApp({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicMenuResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [claimOpen, setClaimOpen] = useState(false)
  // Lazy init from localStorage — safe for hydration because the first render
  // is always the skeleton (claim only affects post-load content).
  const [claim, setClaim] = useState<MenuLeadResponse | null>(() => loadClaim(slug))

  // Load the menu (public endpoint — no auth).
  useEffect(() => {
    let cancelled = false
    apiGet<PublicMenuResponse>(`/api/public/menu?slug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Could not load the menu')
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // Brand the browser tab with the salon's name.
  useEffect(() => {
    if (data) document.title = `${data.branch.name} — Menu`
  }, [data])

  // Track which section is in view (drives the dock's active pill).
  useEffect(() => {
    if (!data) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCat(entry.target.id.replace('cat-', ''))
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    )
    for (const cat of data.categories) {
      const el = document.getElementById(`cat-${cat.id}`)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [data])

  const jump = useCallback(
    (id: string) => {
      setSearch('')
      // next tick so hidden-by-search sections are back in the DOM
      requestAnimationFrame(() => {
        document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [],
  )

  // Search filters services across every category (categories with no matches
  // disappear; matches keep their section so guests keep context).
  const filtered = useMemo(() => {
    if (!data) return null
    const q = search.trim().toLowerCase()
    if (!q) return data.categories
    return data.categories
      .map((cat) => ({
        ...cat,
        services: cat.services.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (q.length >= 3 && cat.name.toLowerCase().includes(q)),
        ),
      }))
      .filter((cat) => cat.services.length > 0)
  }, [data, search])

  const resultCount = search
    ? (filtered?.reduce((a, c) => a + c.services.length, 0) ?? 0)
    : null

  if (error) return <MenuError message={error} />
  if (!data || !filtered) return <MenuSkeleton />

  return (
    <div className="menu-root min-h-dvh bg-[#faf7f1] font-sans text-stone-900 antialiased">
      <Hero data={data} claim={claim} onClaim={() => setClaimOpen(true)} />
      <SearchBar value={search} onChange={setSearch} resultCount={resultCount} />
      {!search && <CategoryTiles data={data} onJump={jump} />}
      {!search && <PopularStrip data={data} onJump={jump} />}
      {filtered.length > 0 ? (
        <MenuSections data={{ ...data, categories: filtered }} />
      ) : (
        <div className="mx-auto max-w-3xl px-5 py-14 text-center">
          <p className="font-display text-xl font-semibold text-stone-800">Nothing matches “{search}”</p>
          <p className="mt-1.5 text-sm text-stone-500">Try a shorter word — or browse the tiles above.</p>
        </div>
      )}
      <VisitUs data={data} />
      <MenuFooter tenantName={data.tenant.name} />

      <CategoryDock
        data={data}
        activeId={activeCat}
        onJump={jump}
        offer={!!data.offer}
        claimed={!!claim}
        onClaim={() => setClaimOpen(true)}
      />

      {data.offer && (
        <ClaimDrawer
          open={claimOpen}
          onOpenChange={setClaimOpen}
          slug={slug}
          offerPct={data.offer.pct}
          onClaimed={(c) => setClaim(c)}
        />
      )}
    </div>
  )
}
