'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  Clock,
  CloudOff,
  IndianRupee,
  Plus,
  ShoppingBag,
  X,
} from 'lucide-react'
import { useAppStore, newCustomItemId, useT, type CartItem } from '@/store/use-app-store'
import { formatINR } from '@/lib/format'
import type { CategoryDTO } from '@/lib/types'
import { serviceArt, ServiceArt } from '@/components/service-art'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
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
  onContinue: () => void
}

/* Each service card carries its own hand-drawn illustration (see
 * service-art.tsx) — resolved from the service name, so "Beard Trim",
 * "Fruit Facial" and "Head Massage" each get distinct artwork instead of
 * one generic icon per category. */

function QtyStepper({
  serviceId,
  qty,
  onDecrement,
  onIncrement,
  className = '',
}: {
  serviceId: string
  qty: number
  onDecrement: (serviceId: string) => void
  onIncrement: (serviceId: string) => void
  className?: string
}) {
  return (
    <div
      className={`flex items-center justify-between ${className}`}
      onClick={(e) => e.stopPropagation()}
      role="group"
      aria-label="Adjust quantity"
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        aria-label="Remove one"
        className="flex size-11 items-center justify-center rounded-xl text-primary-foreground/90 hover:bg-white/15"
        onClick={() => onDecrement(serviceId)}
      >
        <span aria-hidden className="text-xl leading-none font-light">−</span>
      </motion.button>
      <span className="min-w-8 text-center text-base font-bold tabular-nums">{qty}</span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        aria-label="Add one"
        className="flex size-11 items-center justify-center rounded-xl text-primary-foreground/90 hover:bg-white/15"
        onClick={() => onIncrement(serviceId)}
      >
        <Plus className="size-5" />
      </motion.button>
    </div>
  )
}

export function ServiceSelectStep({
  categories,
  loading,
  error,
  savedMenu = false,
  onRetry,
  onContinue,
}: ServiceSelectStepProps) {
  const cart = useAppStore((s) => s.cart)
  const addToCart = useAppStore((s) => s.addToCart)
  const setCartQty = useAppStore((s) => s.setCartQty)
  const lang = useAppStore((s) => s.lang)
  const L = useT()
  // ADMINs get the mobile bottom nav (fixed, z-40) — lift the sticky cart
  // bar above it on phones so the Continue CTA is never covered mid-scroll.
  const hasMobileNav = useAppStore((s) => s.user?.role === 'ADMIN')

  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customAmount, setCustomAmount] = useState('')

  // Billing only shows active services; hide categories left empty.
  const cats = useMemo(
    () =>
      categories
        .map((c) => ({ ...c, services: c.services.filter((s) => s.active) }))
        .filter((c) => c.services.length > 0),
    [categories],
  )

  const visible = activeCategory === 'all' ? cats : cats.filter((c) => c.id === activeCategory)

  const totalQty = cart.reduce((a, c) => a + c.qty, 0)
  const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0)

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

      {/* Category chips — sticky under the app header */}
      {cats.length > 0 && (
        <div className="sticky top-16 z-20 -mx-4 bg-background/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ id: 'all', name: L.all }, ...cats].map((c) => {
                const active = activeCategory === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCategory(c.id)}
                    className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[13px] font-semibold transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-card text-foreground hover:bg-accent'
                    }`}
                  >
                    <ServiceArt name={c.name} className="size-4.5 shrink-0 opacity-90" />
                    {c.name}
                  </button>
                )
              })}
            </div>
            {/* Right-edge fade: hints the chips row scrolls */}
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent" />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="mt-2">
        {loading ? (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="min-h-[6.5rem] rounded-2xl" />
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
        ) : (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
            {visible.flatMap((cat, ci) => {
              return cat.services.map((service, si) => {
                const qty = qtyOf(service.id)
                const art = serviceArt(service.name)
                return (
                  <motion.div
                    key={service.id}
                    role="button"
                    tabIndex={0}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(ci + si, 2) * 0.02, duration: 0.2 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => increment(service.id, service.name, service.price)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        increment(service.id, service.name, service.price)
                      }
                    }}
                    aria-label={`${service.name}, ${formatINR(service.price)}`}
                    className={`relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border bg-card p-3 text-left transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      qty > 0 ? 'shadow-sm ring-2 ring-primary' : 'hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${art.tile}`}
                        aria-hidden
                      >
                        <art.Art className="size-8" />
                      </span>
                      <div className="min-w-0 self-center">
                        <p className="line-clamp-2 text-[13px] leading-snug font-semibold">{service.name}</p>
                        {service.durationMin ? (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="size-3" />
                            {service.durationMin} min
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <p className="text-[15px] leading-tight font-bold text-primary tabular-nums">
                        {formatINR(service.price)}
                      </p>
                      {qty === 0 && (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Plus className="size-4" />
                        </span>
                      )}
                    </div>
                    {qty > 0 && (
                      <QtyStepper
                        serviceId={service.id}
                        qty={qty}
                        onDecrement={decrement}
                        onIncrement={(id) => increment(id, service.name, service.price)}
                        className="absolute inset-x-0 bottom-0 bg-primary text-primary-foreground"
                      />
                    )}
                  </motion.div>
                )
              })
            })}

            {/* Custom amount card — always last, opens a dialog */}
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setCustomOpen(true)}
              className="flex cursor-pointer flex-col justify-between rounded-2xl border-2 border-dashed border-amber-500/60 bg-amber-500/5 p-3 text-left transition-colors hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500"
            >
              <div className="flex items-start gap-2.5">
                <span
                  className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  aria-hidden
                >
                  <IndianRupee className="size-6" />
                </span>
                <p className="line-clamp-2 self-center text-[13px] leading-snug font-semibold text-amber-800 dark:text-amber-300">
                  {L.customAmount}
                </p>
              </div>
              <p className="text-[11px] font-medium text-amber-700/80 dark:text-amber-400/80">
                {L.customAmountDesc}
              </p>
            </motion.button>
          </div>
        )}
      </div>

      {/* Sticky cart bar */}
      <AnimatePresence>
        {cart.length > 0 && (
          <motion.div
            initial={{ y: 64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 64, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={hasMobileNav
              ? 'sticky bottom-[calc(4.75rem_+_env(safe-area-inset-bottom))] z-20 mt-6 lg:bottom-4'
              : 'sticky bottom-4 z-20 mt-6'}
          >
            <div className="mx-auto flex max-w-xl items-center gap-3 rounded-2xl border bg-card p-3 pl-5 shadow-lg">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={totalQty}
                      initial={{ opacity: 0, scale: 0.6, y: -6 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.6, y: 6 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="tnum inline-block"
                    >
                      {totalQty}
                    </motion.span>
                  </AnimatePresence>{' '}
                  {totalQty === 1 ? L.item : L.items} ·{' '}
                  <span className="text-primary">{formatINR(subtotal)}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{L.tapToAddMore}</p>
              </div>
              <Button
                size="lg"
                className="h-12 px-7 text-base"
                onClick={() => setDrawerOpen(true)}
              >
                {L.continue}
                <ArrowRight className="size-5" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2 text-lg">
              <ShoppingBag className="size-5 text-primary" />
              {L.yourBill}
            </DrawerTitle>
          </DrawerHeader>
          <div className="max-h-96 overflow-y-auto px-4">
            <ul className="divide-y">
              <AnimatePresence mode="popLayout" initial={false}>
                {cart.map((item: CartItem) => (
                  <motion.li
                    key={item.serviceId}
                    layout
                    initial={{ opacity: 0, scale: 0.94, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 4 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate font-semibold">
                        <span className="truncate">{item.name}</span>
                        {item.custom && (
                          <span className="shrink-0 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                            {lang === 'hi' ? 'अन्य' : 'Custom'}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground">{formatINR(item.price)} {L.each}</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-xl border bg-background p-1">
                      <button
                        type="button"
                        aria-label={`${L.removeOne} ${item.name}`}
                        className="flex size-11 items-center justify-center rounded-lg hover:bg-accent"
                        onClick={() => decrement(item.serviceId)}
                      >
                        <span aria-hidden className="text-xl leading-none font-light">−</span>
                      </button>
                      <span className="w-7 text-center text-lg font-bold tabular-nums">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`${L.addOne} ${item.name}`}
                        className="flex size-11 items-center justify-center rounded-lg hover:bg-accent"
                        onClick={() => increment(item.serviceId, item.name, item.price)}
                      >
                        <Plus className="size-5" />
                      </button>
                    </div>
                    <div className="w-20 text-right font-bold tabular-nums">
                      {formatINR(item.price * item.qty)}
                    </div>
                    <button
                      type="button"
                      aria-label={`${L.removeFromBill} ${item.name} ${L.fromBill}`}
                      className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive"
                      onClick={() => setCartQty(item.serviceId, 0)}
                    >
                      <X className="size-5" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
          <DrawerFooter>
            <div className="flex items-center justify-between px-1 pb-2 text-lg font-bold">
              <span>{L.subtotal}</span>
              <span className="text-primary">{formatINR(subtotal)}</span>
            </div>
            <Button
              size="lg"
              className="h-14 text-base font-bold"
              onClick={() => {
                setDrawerOpen(false)
                onContinue()
              }}
            >
              {L.continue}
              <ArrowRight className="size-5" />
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Custom amount dialog */}
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
