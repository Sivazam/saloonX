'use client'

/**
 * SaloonX duotone icon system — Phosphor Icons (duotone weight).
 *
 * WHY: lucide-react (the prior icon set) is the default every AI-generated
 * UI ships with — its uniform outline weight reads as "generic AI". Phosphor's
 * **duotone** weight renders a two-tone glyph (primary shape + a 25%-opacity
 * secondary layer) that looks hand-crafted and distinctive, while staying
 * legally free (MIT) and tree-shakeable.
 *
 * WHERE TO USE: the "hero" icon spots — KPI card chips, sidebar nav items,
 * card headers, empty-state illustrations, payment-method badges.
 *
 * WHERE NOT TO USE: micro-affordances (chevrons, × close, ✓ check, search,
 * ± plus/minus). Duotone is too heavy at 16px and below; lucide stays there
 * for crispness. This is the "better-ui" rule: high-frequency / tiny
 * interactions get no expressive weight.
 *
 * All duotone icons inherit `currentColor` for the primary layer and use a
 * derived opacity for the secondary — so they adapt to text/badge tone
 * automatically. Pass `size` (default 20) and `weight` (default "duotone").
 */
import type { IconProps } from '@phosphor-icons/react'
import {
  Bank,
  Bell,
  Building,
  Cake,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ChatCircle,
  ChartBar,
  ChartLineDown,
  ChartLineUp,
  Check,
  Clock,
  CreditCard,
  Crown,
  CurrencyInr,
  DownloadSimple,
  Eye,
  Gear,
  GearSix,
  Gift,
  House,
  ListChecks,
  MagnifyingGlass,
  MapPin,
  MapTrifold,
  Minus,
  Money,
  Moon,
  Percent,
  Phone,
  Plus,
  Printer,
  Receipt,
  Repeat,
  Scissors,
  ShareNetwork,
  Sparkle,
  SprayBottle,
  Storefront,
  Sun,
  Tag,
  Ticket,
  Translate,
  TrendDown,
  TrendUp,
  Trash,
  Users,
  UsersThree,
  Wallet,
  Warning,
  X,
} from '@phosphor-icons/react'

export type DuotoneWeight = 'duotone' | 'regular' | 'bold' | 'fill'

/** Default duotone weight — the signature two-tone look. */
export const DUOTONE = 'duotone' as const

/** A Phosphor icon component (forward-ref to an <svg>). */
type PhosphorIcon = React.ForwardRefExoticComponent<
  IconProps & React.RefAttributes<SVGSVGElement> & { weight?: IconProps['weight'] }
>

/** Wrapper: every duotone icon defaults to weight="duotone" + currentColor. */
function duo(Icon: PhosphorIcon) {
  return function DuotoneIcon({ size = 20, weight = DUOTONE, ...rest }: IconProps & { weight?: DuotoneWeight }) {
    return <Icon size={size} weight={weight} aria-hidden={rest['aria-label'] ? undefined : true} {...rest} />
  }
}

/* ── Curated duotone set for SaloonX (salon billing POS) ──────────────────── */

// KPI / finance
export const DuoCurrencyInr = duo(CurrencyInr)
export const DuoReceipt = duo(Receipt)
export const DuoTrendUp = duo(TrendUp)
export const DuoTrendDown = duo(TrendDown)
export const DuoChartBar = duo(ChartBar)
export const DuoChartLineUp = duo(ChartLineUp)
export const DuoChartLineDown = duo(ChartLineDown)
export const DuoWallet = duo(Wallet)
export const DuoBank = duo(Bank)
export const DuoMoney = duo(Money)
export const DuoCreditCard = duo(CreditCard)
export const DuoPercent = duo(Percent)
export const DuoTag = duo(Tag)
export const DuoGift = duo(Gift)

// Customers / people
export const DuoUsers = duo(Users)
export const DuoUsersThree = duo(UsersThree)
export const DuoCrown = duo(Crown)
export const DuoRepeat = duo(Repeat)

// Salon-specific
export const DuoScissors = duo(Scissors)
export const DuoSprayBottle = duo(SprayBottle)
export const DuoSparkle = duo(Sparkle)
export const DuoStorefront = duo(Storefront)

// Nav / sections
export const DuoHouse = duo(House)
export const DuoBuilding = duo(Building)
export const DuoListChecks = duo(ListChecks)
export const DuoMapTrifold = duo(MapTrifold)
export const DuoGear = duo(Gear)
export const DuoGearSix = duo(GearSix)
export const DuoTicket = duo(Ticket)
export const DuoCalendarBlank = duo(CalendarBlank)
export const DuoClock = duo(Clock)

// Actions (larger / state-level only — micro-affordances stay on lucide)
export const DuoBell = duo(Bell)
export const DuoChatCircle = duo(ChatCircle)
export const DuoShareNetwork = duo(ShareNetwork)
export const DuoDownloadSimple = duo(DownloadSimple)
export const DuoPrinter = duo(Printer)
export const DuoPhone = duo(Phone)
export const DuoMapPin = duo(MapPin)
export const DuoEye = duo(Eye)
export const DuoCake = duo(Cake)
export const DuoSun = duo(Sun)
export const DuoMoon = duo(Moon)
export const DuoTranslate = duo(Translate)
export const DuoWarning = duo(Warning)

/* ── Micro icons: keep crisp at tiny sizes (chevrons / × / ✓ / ± / search) ──
 * Re-exported here so there's ONE icon import surface. Duotone at 16px looks
 * muddy, so these stay on the regular weight (still Phosphor, just flat). */
export {
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  Check,
  MagnifyingGlass,
  Minus,
  Plus,
  X,
} from '@phosphor-icons/react'

