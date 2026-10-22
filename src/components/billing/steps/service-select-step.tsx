'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Check,
  CloudOff,
  IndianRupee,
  Minus,
  Pencil,
  Plus,
  Search,
  SearchX,
  Sparkles,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, newCustomItemId, useT, type CartItem } from '@/store/use-app-store'
import { apiGet, apiPut } from '@/lib/api-client'
import { formatINR } from '@/lib/format'
import type { CategoryDTO, FavoritesResponse, ServiceDTO } from '@/lib/types'
import { ServiceArt, serviceArt } from '@/components/service-art'
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

interface ServiceSelectStepProps {
  categories: CategoryDTO[]
  loading: boolean
  error: string | null
  /** Network fetch failed but a ≤7-day-old cached menu is on screen —
   *  billing can continue offline from the saved copy. */
  savedMenu?: boolean
  onRetry: () => void
}

/* Catalog = a dense, searchable menu (the POS pattern), not a grid of
 * posters: icon chip · name · duration on the left, price and a round add
 * button on the right. In-cart rows invert their chip and swap the add
 * button for a stepper, so the state is obvious at arm's length. */

/** − / qty / + pill that replaces the add button once a service is in the bill. */
function RowStepper({
  qty,
  onDecrement,
  onIncrement,
}: {
  qty: number
  onDecrement: () => void
  onIncrement: () => void
}) {
  return (
    <div
      className="flex h-10 shrink-0 items-center rounded-full border bg-card shadow-sm"
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Adjust quantity"
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        aria-label="Remove one"
        className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={onDecrement}
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </motion.button>
      <span className="tnum w-6 text-center text-base font-bold">{qty}</span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        aria-label="Add one"
        className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={onIncrement}
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </motion.button>
    </div>
  )
}

/** One service row — the whole row is a tap target; the trailing control is
 *  the add button (or the stepper once it's in the bill). */
function ServiceRow({
  serviceId,
  name,
  price,
  durationMin,
  categoryName,
  qty,
  index,
  onAdd,
  onDecrement,
}: {
  serviceId: string
  name: string
  price: number
  durationMin: number | null
  categoryName?: string
  qty: number
  index: number
  onAdd: () => void
  onDecrement: () => void
}) {
  const L = useT()
  const art = serviceArt(name)
  const inCart = qty > 0
  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.025, duration: 0.22, ease: 'easeOut' }}
      whileTap={{ scale: 0.99 }}
      onClick={onAdd}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAdd()
        }
      }}
      aria-label={`${name}, ${formatINR(price)}`}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
        inCart ? 'bg-secondary/60' : 'hover:bg-secondary/45'
      }`}
    >
      {/* Icon chip — inverts to espresso once the service is on the bill */}
      <span
        aria-hidden
        className={`relative flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
          inCart ? 'bg-foreground text-background' : 'bg-secondary text-foreground/75 group-hover:text-foreground'
        }`}
      >
        <art.Art className="size-6" />
        {inCart && (
          <span className="tnum absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-foreground text-[10px] font-bold text-background">
            {qty}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[15px] font-semibold">{name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {categoryName ? `${categoryName} · ` : ''}
          {durationMin ? `${durationMin} min` : L.each}
        </span>
      </span>

      <span className="tnum shrink-0 text-right text-[15px] font-bold tracking-tight">
        {formatINR(price)}
      </span>

      <span className="w-[6.25rem] shrink-0 md:w-27 xl:w-[6.25rem]">
        {inCart ? (
          <RowStepper qty={qty} onDecrement={onDecrement} onIncrement={onAdd} />
        ) : (
          <motion.span
            whileTap={{ scale: 0.88 }}
            aria-hidden
            className="ml-auto flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground/70 transition-all duration-150 group-hover:border-foreground/45 group-hover:bg-foreground group-hover:text-background group-focus-visible:border-foreground/45"
          >
            <Plus className="size-4.5" strokeWidth={2.5} />
          </motion.span>
        )}
      </span>
    </motion.div>
  )
}

/* ── Favorites quick row ──────────────────────────────────────────────────
 * The one-tap row at the top of the catalog: per-user favorite services,
 * server-persisted (/api/favorites). Until a user curates their own list the
 * API returns the salon's most-billed services ("Most loved here") — a good
 * default that they can then edit into their own ("Your favorites").
 * Tiles mirror the menu-row language: art chip inverts to espresso with a
 * qty badge when the service is on the bill. */

function FavoritesSection({
  cats,
  qtyOf,
  onAdd,
}: {
  /** Active, branch-priced catalog — favorite tiles always bill THESE prices. */
  cats: CategoryDTO[]
  qtyOf: (serviceId: string) => number
  onAdd: (s: ServiceDTO) => void
}) {
  const L = useT()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)

  const favQ = useQuery({
    queryKey: ['favorites'],
    queryFn: () => apiGet<FavoritesResponse>('/api/favorites'),
    staleTime: 60_000,
  })

  const saveMut = useMutation({
    mutationFn: (serviceIds: string[]) =>
      apiPut<FavoritesResponse>('/api/favorites', { serviceIds }),
    onSuccess: (d) => {
      qc.setQueryData(['favorites'], d)
      toast.success(L.favSaved)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Join the favorite ids against the branch catalog — a favorite hidden at
  // this branch (or franchise-deactivated) silently drops out of the row.
  const byId = useMemo(() => {
    const m = new Map<string, { service: ServiceDTO; categoryName: string }>()
    for (const c of cats)
      for (const s of c.services) m.set(s.id, { service: s, categoryName: c.name })
    return m
  }, [cats])

  const tiles = useMemo(() => {
    const ids = favQ.data?.favorites ?? []
    return ids.map((id) => byId.get(id)).filter((x): x is { service: ServiceDTO; categoryName: string } => !!x)
  }, [favQ.data, byId])

  const removeOne = (serviceId: string) => {
    saveMut.mutate((favQ.data?.favorites ?? []).filter((id) => id !== serviceId))
  }

  if (favQ.isPending) {
    return (
      <div className="mt-3 flex gap-2 overflow-hidden" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[6.75rem] w-24 shrink-0 rounded-xl" />
        ))}
      </div>
    )
  }
  if (favQ.isError) return null // the catalog below is unaffected — quiet skip
  if (!editing && tiles.length === 0) return null

  const personalized = favQ.data?.personalized ?? false

  return (
    <section
      aria-label={personalized ? L.favYours : L.favMostLoved}
      className="mt-3 rounded-2xl border border-dashed border-foreground/25 bg-card/60 py-3"
    >
      <div className="flex items-center gap-2 px-3">
        <Sparkles className="size-3.5 shrink-0 text-primary" aria-hidden />
        <h3 className="micro min-w-0 flex-1 truncate text-muted-foreground">
          {personalized ? L.favYours : L.favMostLoved}
        </h3>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-pressed={editing}
          className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {editing ? (
            <>
              <Check className="size-3.5" aria-hidden />
              {L.favDone}
            </>
          ) : (
            <>
              <Pencil className="size-3" aria-hidden />
              {L.favEdit}
            </>
          )}
        </button>
      </div>

      <div className="relative mt-2.5">
        <div className="flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tiles.map(({ service }) => {
            const qty = qtyOf(service.id)
            const inCart = qty > 0
            const art = serviceArt(service.name)
            return (
              <div key={service.id} className="relative shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onAdd(service)}
                  aria-label={`${service.name}, ${formatINR(service.price)}`}
                  className={`flex w-24 flex-col items-start gap-1.5 rounded-xl border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
                    inCart
                      ? 'border-foreground/40 bg-secondary/70'
                      : 'border-border/70 bg-card hover:border-foreground/35 hover:bg-secondary/40'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`relative flex size-10 items-center justify-center rounded-xl transition-colors ${
                      inCart ? 'bg-foreground text-background' : 'bg-secondary text-foreground/75'
                    }`}
                  >
                    <art.Art className="size-5.5" />
                    {inCart && (
                      <span className="tnum absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-foreground text-[10px] font-bold text-background">
                        {qty}
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 min-h-8 text-xs leading-4 font-semibold">
                    {service.name}
                  </span>
                  <span className="tnum text-xs font-bold tracking-tight">
                    {formatINR(service.price)}
                  </span>
                </motion.button>
                {editing && (
                  <button
                    type="button"
                    aria-label={`${L.favRemoveOne}: ${service.name}`}
                    onClick={() => removeOne(service.id)}
                    className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-white"
                  >
                    <X className="size-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Add tile — visible in edit mode (and whenever the row is empty) */}
          {(editing || tiles.length === 0) && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex w-24 shrink-0 flex-col items-start gap-1.5 rounded-xl border border-dashed border-foreground/30 bg-card/40 p-2 text-left transition-colors hover:border-foreground/50 hover:bg-card"
            >
              <span
                aria-hidden
                className="flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground/70"
              >
                <Plus className="size-5" strokeWidth={2.5} />
              </span>
              <span className="text-xs leading-4 font-semibold text-muted-foreground">
                {L.favAddTile}
              </span>
            </button>
          )}

          {editing && tiles.length > 0 && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-hidden
              className="flex w-6 shrink-0 items-center justify-center text-muted-foreground/50"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
        {/* Right-edge fade: hints the row scrolls */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-2xl bg-gradient-to-l from-card to-transparent" />
      </div>

      <FavoritesPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        cats={cats}
        current={favQ.data?.favorites ?? []}
        saving={saveMut.isPending}
        onSave={(ids) => {
          saveMut.mutate(ids, { onSuccess: () => setPickerOpen(false) })
        }}
      />
    </section>
  )
}

/** Full-menu picker — search + grouped checkboxes; Save replaces the list.
 *  The selection state lives in PickerBody, mounted only while the dialog is
 *  open (radix unmounts closed content) — the `useState` initializer gives
 *  exactly the "sync from the saved list at open" semantics, no effects. */
function FavoritesPicker({
  open,
  onOpenChange,
  cats,
  current,
  saving,
  onSave,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cats: CategoryDTO[]
  current: string[]
  saving: boolean
  onSave: (ids: string[]) => void
}) {
  const L = useT()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{L.favPickerTitle}</DialogTitle>
          <DialogDescription>{L.favPickerHint}</DialogDescription>
        </DialogHeader>
        <PickerBody cats={cats} current={current} saving={saving} onSave={onSave} />
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  cats,
  current,
  saving,
  onSave,
}: {
  cats: CategoryDTO[]
  current: string[]
  saving: boolean
  onSave: (ids: string[]) => void
}) {
  const L = useT()
  const [picked, setPicked] = useState<Set<string>>(() => new Set(current))
  const [q, setQ] = useState('')

  const query = q.trim().toLowerCase()
  const groups = useMemo(() => {
    if (!query) return cats
    return cats
      .map((c) => ({
        ...c,
        services: c.services.filter(
          (s) => s.name.toLowerCase().includes(query) || c.name.toLowerCase().includes(query),
        ),
      }))
      .filter((c) => c.services.length > 0)
  }, [cats, query])

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 12) next.add(id)
      return next
    })
  }

  return (
    <>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 40))}
          placeholder={L.favPickerSearch}
          aria-label={L.favPickerSearch}
          className="h-11 rounded-xl pl-9"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain py-1">
        {groups.map((c) => (
          <div key={c.id}>
            <p className="micro px-1 pb-1.5 text-muted-foreground">{c.name}</p>
            <div className="space-y-1">
              {c.services.map((s) => {
                const on = picked.has(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(s.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${
                      on ? 'bg-secondary/60' : 'hover:bg-secondary/40'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        on ? 'border-foreground bg-foreground text-background' : 'border-border'
                      }`}
                    >
                      {on && <Check className="size-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                    <span className="tnum shrink-0 text-sm font-bold">{formatINR(s.price)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{L.noResults}</p>
        )}
      </div>
      <DialogFooter>
        <Button
          size="lg"
          className="h-12 w-full text-base font-bold"
          disabled={saving}
          onClick={() => onSave([...picked])}
        >
          {saving ? `${L.favSaved}…` : `${L.favDone} (${picked.size})`}
        </Button>
      </DialogFooter>
    </>
  )
}

export function ServiceSelectStep({
  categories,
  loading,
  error,
  savedMenu = false,
  onRetry,
}: ServiceSelectStepProps) {
  const cart = useAppStore((s) => s.cart)
  const addToCart = useAppStore((s) => s.addToCart)
  const setCartQty = useAppStore((s) => s.setCartQty)
  const lang = useAppStore((s) => s.lang)
  const L = useT()

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customAmount, setCustomAmount] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" anywhere (outside a text field) jumps to catalog search — the POS reflex.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t as HTMLElement | null)?.isContentEditable) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Billing only shows active services; hide categories left empty.
  const cats = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, services: c.services.filter((s) => s.active) }))
        .filter((c) => c.services.length > 0),
    [categories],
  )

  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  // Search beats the category filter — show a flat, categorised result list.
  const results = useMemo(() => {
    if (!searching) return null
    return cats.flatMap((c) =>
      c.services
        .filter(
          (s) =>
            s.name.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
        )
        .map((s) => ({ service: s, categoryName: c.name })),
    )
  }, [cats, q, searching])

  const visible = activeCategory === 'all' ? cats : cats.filter((c) => c.id === activeCategory)

  const qtyOf = (serviceId: string) => cart.find((c) => c.serviceId === serviceId)?.qty ?? 0

  const increment = (serviceId: string, name: string, price: number) =>
    addToCart({ serviceId, name, price })
  const decrement = (serviceId: string) => {
    const item = cart.find((c) => c.serviceId === serviceId)
    if (!item) return
    setCartQty(serviceId, item.qty - 1) // hitting 0 removes it from the cart
  }

  const addCustom = () => {
    const amount = Number(customAmount)
    if (!Number.isFinite(amount) || amount < 0.5) return
    addToCart({
      serviceId: newCustomItemId(),
      name: customName.trim() || L.customDefaultName,
      price: Math.round(amount * 100) / 100,
      custom: true,
    })
    setCustomOpen(false)
    setCustomName('')
    setCustomAmount('')
  }

  const customAmountNum = Number(customAmount)
  const customValid = Number.isFinite(customAmountNum) && customAmountNum >= 0.5

  return (
    <div>
      {/* Offline notice — fetch failed but a saved menu copy is usable */}
      {savedMenu && !loading && (
        <div
          className="mb-2 flex items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
          role="status"
        >
          <CloudOff className="size-4 shrink-0" aria-hidden />
          {L.savedMenuNotice}
        </div>
      )}

      {/* ── Search + category rail — sticky under the app header ────────── */}
      <div className="sticky top-16 z-20 -mx-4 bg-background/95 px-4 pt-1 pb-2.5 backdrop-blur lg:-mx-5 lg:px-5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 40))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (query) setQuery('')
                else searchRef.current?.blur()
              }
            }}
            placeholder={L.searchServices}
            aria-label={L.searchServices}
            className="h-12 rounded-xl border bg-card pr-11 pl-11 text-[15px] shadow-sm"
          />
          {searching ? (
            <button
              type="button"
              aria-label={L.clearSearch}
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 items-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground lg:flex">
              /
            </kbd>
          )}
        </div>

        {/* Category pills — hidden while searching (results span categories) */}
        {cats.length > 0 && !searching && (
          <div className="relative mt-2.5">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ id: 'all', name: L.all, services: [] }, ...cats].map((c) => {
                const active = activeCategory === c.id
                const count = c.services.length
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCategory(c.id)}
                    aria-pressed={active}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-all ${
                      active
                        ? 'border-foreground bg-foreground text-background shadow-sm'
                        : 'border-border/70 bg-card/60 text-foreground/70 hover:border-foreground/30 hover:text-foreground'
                    }`}
                  >
                    <ServiceArt
                      name={c.id === 'all' ? 'menu' : c.name}
                      className={`size-4 shrink-0 transition-opacity ${active ? 'opacity-90' : 'opacity-55'}`}
                    />
                    {c.name}
                    {count > 0 && (
                      <span className={`tnum text-[11px] font-bold ${active ? 'opacity-60' : 'text-muted-foreground/60'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Right-edge fade: hints the chips row scrolls */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
          </div>
        )}
      </div>

      {/* ── Favorites quick row (per-user, defaults to most-billed) ──────── */}
      {!searching && cats.length > 0 && !loading && !error && (
        <FavoritesSection
          cats={cats}
          qtyOf={qtyOf}
          onAdd={(s) => increment(s.id, s.name, s.price)}
        />
      )}

      {/* ── The menu ─────────────────────────────────────────────────────── */}
      <div className="mt-1">
        {loading ? (
          <div className="space-y-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="size-11 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-4 w-14" />
                <Skeleton className="size-10 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border bg-card p-8 text-center">
            <p className="font-semibold">{L.couldntLoad}</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4 h-12 px-6" onClick={onRetry}>
              {L.tryAgain}
            </Button>
          </div>
        ) : cats.length === 0 ? (
          <div className="rounded-2xl border bg-card p-10 text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <ServiceArt name="haircut" className="size-9 text-primary" />
            </div>
            <p className="mt-4 text-lg font-semibold">{L.noServices}</p>
            <p className="mt-1 text-sm text-muted-foreground">{L.noServicesHint}</p>
          </div>
        ) : searching ? (
          results && results.length > 0 ? (
            <>
              <p className="micro px-2 pb-2 pt-1 text-muted-foreground">
                {results.length} {L.resultsWord}
              </p>
              <div className="space-y-0.5">
                {results.map(({ service, categoryName }, i) => (
                  <ServiceRow
                    key={service.id}
                    serviceId={service.id}
                    name={service.name}
                    price={service.price}
                    durationMin={service.durationMin}
                    categoryName={categoryName}
                    qty={qtyOf(service.id)}
                    index={i}
                    onAdd={() => increment(service.id, service.name, service.price)}
                    onDecrement={() => decrement(service.id)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border bg-card p-10 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-secondary">
                <SearchX className="size-7 text-muted-foreground" aria-hidden />
              </div>
              <p className="mt-4 text-lg font-semibold">{L.noResults}</p>
              <p className="mt-1 text-sm text-muted-foreground">{L.noResultsHint}</p>
            </div>
          )
        ) : (
          visible.map((cat, ci) => (
            <section key={cat.id} className={ci > 0 ? 'mt-6' : 'mt-0'}>
              {activeCategory === 'all' && (
                <div className="flex items-baseline justify-between px-2 pb-1.5 pt-4 first:pt-1">
                  <h3 className="micro text-muted-foreground">{cat.name}</h3>
                  <span className="tnum text-[11px] font-semibold text-muted-foreground/60">
                    {cat.services.length}
                  </span>
                </div>
              )}
              <div className="space-y-0.5">
                {cat.services.map((service, si) => (
                  <ServiceRow
                    key={service.id}
                    serviceId={service.id}
                    name={service.name}
                    price={service.price}
                    durationMin={service.durationMin}
                    qty={qtyOf(service.id)}
                    index={ci + si}
                    onAdd={() => increment(service.id, service.name, service.price)}
                    onDecrement={() => decrement(service.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        {/* Custom amount — a menu row of its own, dashed (only when browsing) */}
        {!loading && !error && cats.length > 0 && !searching && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.06 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => setCustomOpen(true)}
            className="group mt-5 flex w-full cursor-pointer items-center gap-3 rounded-xl border border-dashed border-foreground/30 bg-card/40 px-2 py-2.5 text-left transition-colors hover:border-foreground/50 hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <span
              aria-hidden
              className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground/75 transition-colors group-hover:text-foreground"
            >
              <IndianRupee className="size-5.5" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[15px] font-semibold">{L.customAmount}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {L.customAmountDesc}
              </span>
            </span>
            <span
              aria-hidden
              className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30 text-foreground/60 transition-colors group-hover:border-foreground/50 group-hover:text-foreground"
            >
              <Plus className="size-4.5" strokeWidth={2.5} />
            </span>
          </motion.button>
        )}
      </div>

      {/* ── Custom amount dialog ─────────────────────────────────────────── */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="size-5 text-amber-600 dark:text-amber-400" />
              {L.customDialogTitle}
            </DialogTitle>
            <DialogDescription>{L.customAmountDesc}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="custom-item-name">{L.customNameLabel}</Label>
              <Input
                id="custom-item-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value.slice(0, 60))}
                placeholder={L.customNamePlaceholder}
                className="h-12"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="custom-item-amount">{L.customAmountLabel}</Label>
              <div className="relative">
                <IndianRupee
                  className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="custom-item-amount"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8)
                    setCustomAmount(v)
                  }}
                  placeholder="0"
                  autoFocus
                  className="h-14 pl-10 text-2xl font-bold tabular-nums"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customValid) addCustom()
                  }}
                />
              </div>
              {customAmount !== '' && !customValid && (
                <p className="text-xs font-medium text-destructive">
                  {lang === 'hi' ? 'कम से कम ₹0.50 डालें' : 'Enter at least ₹0.50'}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              size="lg"
              className="h-14 w-full bg-amber-600 text-base font-bold text-white shadow-none hover:bg-amber-700"
              disabled={!customValid}
              onClick={addCustom}
            >
              <Plus className="size-5" />
              {L.addToBill}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
