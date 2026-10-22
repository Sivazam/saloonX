'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  HandCoins,
  Minus,
  Plus,
  ReceiptText,
  Scissors,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { formatINR } from '@/lib/format'
import { useAppStore, useT, type CartItem } from '@/store/use-app-store'
import { Button } from '@/components/ui/button'

/** Who the bill is for — summarised at the top of the ticket from step 2 on. */
export interface TicketCustomer {
  /** Display name ("Ravi Kumar") or the raw mobile. */
  name: string
  /** Second line — visits · spend, or "New customer". */
  sub: string
  initials: string
  walkIn?: boolean
}

interface TicketPanelProps {
  /** 1 = services, 2 = customer, 3 = payment — drives the footer CTA. */
  step: 1 | 2 | 3
  subtotal: number
  discountAmount: number
  /** How the discount is expressed — "10%" / "₹50" — shown on the discount line. */
  discountLabel?: string | null
  gstPct?: number
  gstAmount?: number
  tip?: number
  customer?: TicketCustomer | null
  /** Step 2: gate the CTA until a customer is resolved (or walk-in). */
  continueDisabled?: boolean
  submitting?: boolean
  onContinue?: () => void
  /** Desktop aside caps to the viewport; the mobile drawer lets it breathe. */
  fillViewport?: boolean
  className?: string
}

/** Compact − / qty / + pill used on every ticket line. */
function LineStepper({
  item,
  onDecrement,
  onIncrement,
}: {
  item: CartItem
  onDecrement: (item: CartItem) => void
  onIncrement: (item: CartItem) => void
}) {
  return (
    <div
      className="flex h-9 shrink-0 items-center rounded-full border bg-background shadow-sm"
      role="group"
      aria-label={`${item.name} quantity`}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        aria-label={`${item.name} — remove one`}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onDecrement(item)}
      >
        <Minus className="size-3.5" strokeWidth={2.5} />
      </motion.button>
      <span className="tnum w-6 text-center text-sm font-bold">{item.qty}</span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.85 }}
        aria-label={`${item.name} — add one`}
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onIncrement(item)}
      >
        <Plus className="size-3.5" strokeWidth={2.5} />
      </motion.button>
    </div>
  )
}

export function TicketPanel({
  step,
  subtotal,
  discountAmount,
  discountLabel = null,
  gstPct = 0,
  gstAmount = 0,
  tip = 0,
  customer = null,
  continueDisabled = false,
  submitting = false,
  onContinue,
  fillViewport = true,
  className = '',
}: TicketPanelProps) {
  const cart = useAppStore((s) => s.cart)
  const addToCart = useAppStore((s) => s.addToCart)
  const setCartQty = useAppStore((s) => s.setCartQty)
  const clearCart = useAppStore((s) => s.clearCart)
  const lang = useAppStore((s) => s.lang)
  const L = useT()

  // Two-tap clear: first tap arms a destructive confirm, second tap wipes.
  const [clearArmed, setClearArmed] = useState(false)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current)
  }, [])
  const onClearTap = () => {
    if (clearArmed) {
      if (clearTimer.current) clearTimeout(clearTimer.current)
      setClearArmed(false)
      clearCart()
      return
    }
    setClearArmed(true)
    clearTimer.current = setTimeout(() => setClearArmed(false), 2600)
  }

  const increment = (item: CartItem) =>
    addToCart({ serviceId: item.serviceId, name: item.name, price: item.price, custom: item.custom })
  const decrement = (item: CartItem) => setCartQty(item.serviceId, item.qty - 1)

  const totalQty = cart.reduce((a, c) => a + c.qty, 0)
  const total = subtotal - discountAmount + gstAmount + tip
  const empty = cart.length === 0

  return (
    <section
      aria-label={L.currentBill}
      className={`flex flex-col overflow-hidden rounded-2xl border bg-card hairline ${
        fillViewport ? 'max-h-[calc(100dvh-6.5rem)]' : ''
      } ${className}`}
    >
      {/* ── Header band — espresso ink, echoes the sidebar ─────────────── */}
      <header className="flex items-center gap-2.5 bg-foreground px-4 py-3 text-background sm:px-5">
        <ReceiptText className="size-4.5 shrink-0 opacity-80" aria-hidden />
        <span className="micro flex-1 truncate">{L.currentBill}</span>
        {totalQty > 0 && (
          <span className="tnum shrink-0 rounded-full bg-background/15 px-2 py-0.5 text-[11px] font-bold">
            {totalQty} {totalQty === 1 ? L.item : L.items}
          </span>
        )}
        {cart.length > 0 &&
          (clearArmed ? (
            <button
              type="button"
              onClick={onClearTap}
              className="h-8 shrink-0 rounded-lg bg-red-500/90 px-2.5 text-[11px] font-bold tracking-wide text-white uppercase transition-colors hover:bg-red-500"
            >
              {L.tapAgainToClear}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClearTap}
              aria-label={L.clearBill}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg opacity-70 transition-colors hover:bg-background/15 hover:opacity-100"
            >
              <Trash2 className="size-4" />
            </button>
          ))}
      </header>

      {/* ── Customer slot ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b bg-secondary/30 px-4 py-3 sm:px-5">
        {customer ? (
          <>
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                customer.walkIn
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary'
              }`}
              aria-hidden
            >
              {customer.walkIn ? <UserRound className="size-4.5" /> : customer.initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold">{customer.name}</p>
              <p className="truncate text-xs text-muted-foreground">{customer.sub}</p>
            </div>
          </>
        ) : (
          <>
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground"
              aria-hidden
            >
              <UserRound className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-medium text-muted-foreground">{L.customerSlot}</p>
              <p className="truncate text-xs text-muted-foreground/70">{L.customerNextStep}</p>
            </div>
          </>
        )}
      </div>

      {/* ── Line items ──────────────────────────────────────────────────── */}
      {empty ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary" aria-hidden>
            <Scissors className="size-6 text-muted-foreground" />
          </div>
          <p className="font-semibold">{L.billEmpty}</p>
          <p className="max-w-45 text-sm text-muted-foreground">{L.billEmptyHint}</p>
        </div>
      ) : (
        <ul
          className={`divide-y overflow-y-auto px-4 sm:px-5 ${
            fillViewport ? 'min-h-0 flex-1' : 'max-h-80'
          }`}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {cart.map((item) => (
              <motion.li
                key={item.serviceId}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="py-2.5"
              >
                {/* Row 1 — full-width name + remove */}
                <div className="flex items-center gap-1.5">
                  <p className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{item.name}</span>
                    {item.custom && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                        {lang === 'hi' ? 'अन्य' : 'Custom'}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    aria-label={`${L.removeFromBill} ${item.name} ${L.fromBill}`}
                    onClick={() => setCartQty(item.serviceId, 0)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {/* Row 2 — stepper + unit price · line total */}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <LineStepper item={item} onDecrement={decrement} onIncrement={increment} />
                  <p className="tnum flex shrink-0 items-baseline gap-1.5">
                    <span className="text-xs text-muted-foreground">
                      {formatINR(item.price)} {L.each}
                    </span>
                    <span className="text-sm font-bold">{formatINR(item.price * item.qty)}</span>
                  </p>
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* ── Totals ──────────────────────────────────────────────────────── */}
      {!empty && (
        <div className="space-y-1.5 border-t border-dashed px-4 py-3.5 text-sm sm:px-5">
          <div className="flex justify-between text-muted-foreground">
            <span>{L.subtotal}</span>
            <span className="tnum font-semibold text-foreground">{formatINR(subtotal)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
              <span>
                {L.discount}
                {discountLabel ? ` · ${discountLabel}` : ''}
              </span>
              <span className="tnum font-semibold">−{formatINR(discountAmount)}</span>
            </div>
          )}
          {gstPct > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>GST ({gstPct}%)</span>
              <span className="tnum font-semibold text-foreground">{formatINR(gstAmount)}</span>
            </div>
          )}
          {tip > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{L.tipLabel}</span>
              <span className="tnum font-semibold text-amber-700 dark:text-amber-400">
                +{formatINR(tip)}
              </span>
            </div>
          )}
          <div className="mt-2.5 flex items-baseline justify-between border-t pt-2.5">
            <span className="micro text-muted-foreground">{L.total}</span>
            <motion.span
              key={total}
              initial={{ scale: 0.95, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="tnum text-2xl font-bold tracking-tight"
            >
              {formatINR(total)}
            </motion.span>
          </div>
        </div>
      )}

      {/* ── Footer CTA — step-aware ─────────────────────────────────────── */}
      {step < 3 ? (
        <div className="border-t bg-secondary/30 p-3 sm:p-4">
          <Button
            size="lg"
            className="h-14 w-full text-base font-bold"
            disabled={empty || continueDisabled || submitting}
            onClick={onContinue}
          >
            {step === 1 ? L.continueToCustomer : L.continueToPayment}
            <ArrowRight className="size-5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 border-t bg-secondary/30 px-4 py-3 text-muted-foreground sm:px-5">
          <HandCoins className="size-4.5 shrink-0" aria-hidden />
          <p className="text-xs font-medium">{L.pickPaymentMethod}</p>
        </div>
      )}
    </section>
  )
}
