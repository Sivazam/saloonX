'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgePercent,
  Cake,
  Check,
  ChevronLeft,
  Delete,
  History,
  QrCode,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react'
import { formatINR, formatDate } from '@/lib/format'
import type { CustomerDTO, LastVisitDTO, LookupResponse } from '@/lib/types'
import type { CartItem } from '@/store/use-app-store'
import { useAppStore, useT } from '@/store/use-app-store'
import type { KeypadState } from '../use-keypad'
import { formatMobileDisplay } from '../use-keypad'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export interface CustomerContinueInfo {
  mobile: string
  name: string
  customer: CustomerDTO | null
  walkIn: boolean
}

export type LoyaltyDecision = 'none' | 'applied' | 'skipped'

interface CustomerStepProps {
  keypad: KeypadState
  cart: CartItem[]
  customer: CustomerDTO | null
  recommendation: LookupResponse['recommendation']
  lastVisit: LastVisitDTO | null
  menuOffer: LookupResponse['menuOffer']
  onApplyMenuOffer: () => void
  /** Lookup failed on a server/network error — bill anyway with this mobile. */
  onContinueAnyway: () => void
  fetchedMobile: string | null
  lookupLoading: boolean
  lookupError: string | null
  walkIn: boolean
  onWalkInChange: (v: boolean) => void
  name: string
  onNameChange: (v: string) => void
  discountPct: number
  loyaltyDecision: LoyaltyDecision
  onLoyaltyDecision: (d: LoyaltyDecision) => void
  onLookup: () => void
  onBack: () => void
  onContinue: (info: CustomerContinueInfo) => void
}

function initials(name: string | null, mobile: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  return mobile.slice(-2)
}

/** "Last visit" service chips — lets staff say "same as last time?" instantly. */
function LastVisitHint({ lastVisit }: { lastVisit: LastVisitDTO }) {
  const L = useT()
  const shown = lastVisit.services.slice(0, 3)
  const extra = lastVisit.services.length - shown.length
  return (
    <div className="mt-2 rounded-xl bg-muted/60 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <History className="size-3.5" />
        {L.lastVisitLabel} · {formatDate(lastVisit.date)} · {formatINR(lastVisit.total)}
        {lastVisit.branchName && (
          <span className="min-w-0 truncate rounded-full border bg-card px-1.5 py-px text-[10px] font-medium">
            {lastVisit.branchName}
          </span>
        )}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {shown.map((s) => (
          <span
            key={s}
            className="max-w-45 truncate rounded-full border bg-card px-2 py-0.5 text-xs font-medium"
          >
            {s}
          </span>
        ))}
        {extra > 0 && (
          <span className="rounded-full border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            +{extra}
          </span>
        )}
      </div>
    </div>
  )
}

/** Days until the next "MM-DD" birthday (0 = today). Feb 29 birthdays are
 *  celebrated on Feb 28 in non-leap years instead of rolling into March. */
function birthdayCountdown(mmdd: string): number {
  const [mm, dd] = mmdd.split('-').map(Number)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  let y = now.getFullYear()
  let target = new Date(y, mm - 1, dd)
  if (mm === 2 && dd === 29 && !isLeap(y)) target = new Date(y, 1, 28)
  if (target < today) {
    y += 1
    target = new Date(y, mm - 1, dd)
    if (mm === 2 && dd === 29 && !isLeap(y)) target = new Date(y, 1, 28)
  }
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** "🎂 Birthday in 3 days" — a warm nudge for the staff to congratulate. */
function BirthdayHint({ birthday }: { birthday: string }) {
  const L = useT()
  const d = birthdayCountdown(birthday)
  if (d > 7) return null
  return (
    <p className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-rose-200/70 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
      <Cake className="size-3.5 shrink-0" aria-hidden />
      {d === 0 ? L.birthdayToday : d === 1 ? L.birthdayTomorrow : L.birthdayIn.replace('{n}', String(d))}
    </p>
  )
}

export function CustomerStep({
  keypad,
  cart,
  customer,
  recommendation,
  lastVisit,
  menuOffer,
  onApplyMenuOffer,
  onContinueAnyway,
  fetchedMobile,
  lookupLoading,
  lookupError,
  walkIn,
  onWalkInChange,
  name,
  onNameChange,
  discountPct,
  loyaltyDecision,
  onLoyaltyDecision,
  onLookup,
  onBack,
  onContinue,
}: CustomerStepProps) {
  const L = useT()
  // ADMINs get the mobile bottom nav (fixed, z-40) — lift the sticky action
  // bar above it on phones so Continue is never covered mid-scroll.
  const hasMobileNav = useAppStore((s) => s.user?.role === 'ADMIN')
  const totalQty = cart.reduce((a, c) => a + c.qty, 0)
  const subtotal = cart.reduce((a, c) => a + c.price * c.qty, 0)

  const resolved =
    !walkIn &&
    keypad.digits.length === 10 &&
    fetchedMobile === keypad.digits &&
    !lookupLoading &&
    !lookupError

  const showBanner = resolved && customer && recommendation?.eligible && loyaltyDecision === 'none'
  const applied = resolved && loyaltyDecision === 'applied' && discountPct > 0

  const canContinue = walkIn || resolved

  const keypadButton =
    'flex h-16 items-center justify-center rounded-2xl border bg-card text-2xl font-semibold shadow-sm transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40 sm:h-20 [@media(max-height:740px)]:h-11 [@media(max-height:740px)]:text-xl'

  return (
    <div className="mx-auto max-w-md">
      {/* Cart chip (mobile — the desktop ticket panel shows the live bill) */}
      <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold lg:hidden [@media(max-height:740px)]:py-1">
        <Check className="size-4 text-emerald-600" />
        {totalQty} {totalQty === 1 ? L.item : L.items} · {formatINR(subtotal)}
      </div>

      <h1 className="mt-4 text-xl font-bold sm:text-2xl [@media(max-height:740px)]:mt-2 [@media(max-height:740px)]:text-lg">{L.customerMobile}</h1>
      <p className="mt-1 text-sm text-muted-foreground [@media(max-height:740px)]:hidden">
        {L.returningHint}
      </p>

      {/* Big display box — popLayout so rapid taps show the newest digits instantly */}
      <div className="relative mt-4 flex min-h-16 items-center justify-center overflow-hidden rounded-2xl border-2 bg-card px-4 [@media(max-height:740px)]:mt-2 [@media(max-height:740px)]:min-h-10">
        <AnimatePresence mode="popLayout" initial={false}>
          {walkIn ? (
            <motion.span
              key="walkin"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="text-2xl font-bold text-muted-foreground"
            >
              {L.walkInDisplay}
            </motion.span>
          ) : (
            <motion.span
              key={keypad.digits || 'empty'}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, position: 'absolute' }}
              className={`text-2xl font-bold tracking-wide tabular-nums [@media(max-height:740px)]:text-xl ${
                keypad.digits ? '' : 'text-muted-foreground/50'
              }`}
            >
              {keypad.digits ? formatMobileDisplay(keypad.digits) : L.enterMobile}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Keypad / walk-in undo */}
      {walkIn ? (
        <div className="mt-6 rounded-2xl border bg-card p-5 text-center">
          <p className="font-semibold">{L.billingWithout}</p>
          <p className="mt-1 text-sm text-muted-foreground">{L.wontCountLoyalty}</p>
          <Button
            variant="outline"
            className="mt-4 h-12 px-6"
            onClick={() => onWalkInChange(false)}
          >
            {L.useMobileInstead}
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3 [@media(max-height:740px)]:mt-2 [@media(max-height:740px)]:gap-1.5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <motion.button
              key={d}
              type="button"
              whileTap={{ scale: 0.94 }}
              className={keypadButton}
              onClick={() => keypad.press(d)}
            >
              {d}
            </motion.button>
          ))}
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            aria-label={L.deleteDigit}
            className={keypadButton}
            onClick={keypad.backspace}
            disabled={keypad.digits.length === 0}
          >
            <Delete className="size-7 [@media(max-height:740px)]:size-6" />
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            className={keypadButton}
            onClick={() => keypad.press('0')}
          >
            0
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            aria-label={L.lookup}
            className={`${keypadButton} ${keypad.digits.length === 10 ? 'bg-primary/10 text-primary' : ''}`}
            onClick={onLookup}
            disabled={lookupLoading}
          >
            {lookupLoading ? (
              <span className="size-7 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Check className="size-7 [@media(max-height:740px)]:size-6" />
            )}
          </motion.button>
        </div>
      )}

      {/* Lookup results — wrapper must collapse fully when empty (short viewports) */}
      <div className="mt-5 empty:hidden [@media(max-height:740px)]:mt-3">
        <AnimatePresence mode="wait">
          {lookupLoading && keypad.digits.length === 10 ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <Skeleton className="h-28 w-full rounded-2xl" />
            </motion.div>
          ) : lookupError && !walkIn ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-center"
              role="alert"
            >
              <p className="font-semibold text-destructive">{L.lookupFailedTitle}</p>
              <p className="mt-1 text-xs text-muted-foreground/80">{lookupError}</p>
              <p className="mt-1 text-sm text-muted-foreground">{L.checkNumberAgain}</p>
              {/* The show must go on: bill with this mobile anyway (loyalty
                  simply skipped) instead of losing the customer attribution. */}
              <Button
                variant="outline"
                className="mt-3 h-12 px-5"
                onClick={onContinueAnyway}
              >
                {L.continueAnyway}
              </Button>
              <p className="mt-1.5 text-xs text-muted-foreground">{L.continueAnywayHint}</p>
            </motion.div>
          ) : showBanner && customer && recommendation ? (
            <motion.div
              key="found"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="overflow-hidden rounded-2xl border bg-card"
            >
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                    {initials(customer.name, customer.mobile)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {customer.name ?? L.customerWord}
                    </p>
                    <p className="text-sm tabular-nums text-muted-foreground">
                      {customer.mobile}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {customer.visits} {customer.visits === 1 ? L.visitWord : L.visitsWord} ·{' '}
                      {formatINR(customer.totalSpend)} · {L.lastWord}{' '}
                      {customer.lastVisitAt ? formatDate(customer.lastVisitAt) : L.today}
                    </p>
                    {customer.birthday && <BirthdayHint birthday={customer.birthday} />}
                  </div>
                </div>
                {lastVisit && <LastVisitHint lastVisit={lastVisit} />}
              </div>
              <div className="bg-primary p-4 text-primary-foreground">
                <p className="flex items-center gap-2 font-bold">
                  <BadgePercent className="size-5" />
                  {L.loyaltyReward} {recommendation.discountPct}
                  {L.offWord}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="lg"
                    className="h-14 border-2 border-white/60 bg-white/15 text-base font-bold text-white shadow-none hover:bg-white/25"
                    onClick={() => onLoyaltyDecision('applied')}
                  >
                    {L.applyOff.replace('{n}', String(recommendation.discountPct))}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 border-white/50 bg-transparent text-base font-semibold text-white shadow-none hover:bg-white/10 hover:text-white"
                    onClick={() => onLoyaltyDecision('skipped')}
                  >
                    {L.skip}
                  </Button>
                </div>
              </div>
            </motion.div>
          ) : resolved && customer ? (
            <motion.div
              key="found-plain"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                  {initials(customer.name, customer.mobile)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{customer.name ?? L.customerWord}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {customer.mobile}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {customer.visits} {customer.visits === 1 ? L.visitWord : L.visitsWord} ·{' '}
                    {formatINR(customer.totalSpend)} · {L.lastWord}{' '}
                    {customer.lastVisitAt ? formatDate(customer.lastVisitAt) : L.today}
                  </p>
                  {customer.birthday && <BirthdayHint birthday={customer.birthday} />}
                </div>
              </div>
              {lastVisit && <LastVisitHint lastVisit={lastVisit} />}
            </motion.div>
          ) : resolved && !customer ? (
            <motion.div
              key="new"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl border bg-card p-4"
            >
              <p className="flex items-center gap-2 font-bold">
                <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600">
                  <UserPlus className="size-5" />
                </span>
                {L.newCustomer}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{L.newCustomerHint}</p>
              <Input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={L.customerNameOptional}
                className="mt-3 h-12 text-base"
                maxLength={60}
                aria-label={L.customerNameOptional}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* QR-menu signup offer — guest registered from the salon's public menu */}
        <AnimatePresence>
          {resolved && menuOffer && loyaltyDecision === 'none' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-3 flex items-center gap-3 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-4 py-3"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400">
                <QrCode className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{L.menuOfferTitle}</p>
                <p className="tnum mt-0.5 truncate text-xs text-amber-700/90 dark:text-amber-400/90">
                  {L.menuOfferCode} <span className="font-bold tracking-[0.15em]">{menuOffer.code}</span> · {L.menuOfferHint}
                </p>
              </div>
              <Button
                size="sm"
                className="h-10 shrink-0 bg-amber-600 font-bold text-white hover:bg-amber-600/90"
                onClick={onApplyMenuOffer}
              >
                {L.applyOff.replace('{n}', String(menuOffer.pct))}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loyalty applied chip */}
        <AnimatePresence>
          {applied && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-3 flex items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3"
            >
              <p className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
                <BadgePercent className="size-5" />
                {discountPct}{L.offApplied}
              </p>
              <button
                type="button"
                aria-label={L.undoDiscount}
                className="flex size-11 items-center justify-center rounded-xl text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400"
                onClick={() => onLoyaltyDecision('none')}
              >
                <X className="size-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Show the active discount when returning from payment */}
        {!applied && discountPct > 0 && resolved && (
          <p className="mt-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 font-bold text-emerald-700 dark:text-emerald-400">
            {discountPct}{L.discountSet}
          </p>
        )}
      </div>

      {/* Quiet walk-in skip — outside the lookup wrapper so it can collapse fully */}
      {!walkIn && !resolved && !lookupLoading && (
        <button
          type="button"
          onClick={() => onWalkInChange(true)}
          className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline [@media(max-height:740px)]:mt-2 [@media(max-height:740px)]:min-h-10"
        >
          <UserRound className="size-4" />
          {L.skipWalkIn}
        </button>
      )}

      {/* No mobile bottom bar here anymore: the viewport-pinned cart bar
          (billing-flow root) is always present while the bill has items and
          carries the same "Continue to Payment" CTA with the same gating
          (walk-in or resolved lookup). Back = the step stepper at the top;
          the desktop ticket aside owns the CTA on lg. */}
    </div>
  )
}
