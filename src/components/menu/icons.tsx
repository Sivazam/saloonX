'use client'

/**
 * Salon category icon set — a few hand-drawn SVGs (mustache, comb, lotus,
 * dryer, polish, lipstick) in the lucide stroke style (24×24, stroke-2, round
 * caps/joins), blended with lucide originals for the rest. Keys come from the
 * public menu API's iconForCategory() map.
 */
import type { ComponentType } from 'react'
import { Baby, Crown, Flower2, Palette, Scissors, Sparkles, Star } from 'lucide-react'

type IconProps = { className?: string }

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** Handlebar mustache — the barbershop classic. */
function MustacheIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 14.5c-1.3-2.6-3.7-3.6-5.7-3-1.6.5-3.4-.3-3.8-1.8" />
      <path d="M12 14.5c1.3-2.6 3.7-3.6 5.7-3 1.6.5 3.4-.3 3.8-1.8" />
      <path d="M12 14.5c-.4-1.5-2-2.3-3.4-1.8" opacity="0" />
      <path d="M3 8.6c1.2.2 2.2 1 2.6 2.1" />
      <path d="M21 8.6c-1.2.2-2.2 1-2.6 2.1" />
    </Svg>
  )
}

/** Barber comb — rounded spine with alternating teeth. */
function CombIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 5.5v3h16v-3" />
      <path d="M7 8.5v9" />
      <path d="M10 8.5v11.5" />
      <path d="M13 8.5v9" />
      <path d="M16 8.5v11.5" />
      <path d="M19 8.5v9" />
    </Svg>
  )
}

/** Spa lotus — centre petal, two side petals, resting leaf. */
function LotusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5c1.9 2.3 1.9 5.2 0 7.5-1.9-2.3-1.9-5.2 0-7.5z" />
      <path d="M4.8 8.7c2.9.2 5.2 2 6.2 4.7-3.1.3-5.6-1.6-6.2-4.7z" />
      <path d="M19.2 8.7c-2.9.2-5.2 2-6.2 4.7 3.1.3 5.6-1.6 6.2-4.7z" />
      <path d="M3.5 14.2c1.6 3.5 4.7 5.6 8.5 5.6s6.9-2.1 8.5-5.6" />
    </Svg>
  )
}

/** Hair dryer — round head, side nozzle, drop handle. */
function DryerIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11.5" cy="10.2" r="5.2" />
      <path d="M6.4 8.4H3.7a1 1 0 0 0-1 1v1.7a1 1 0 0 0 1 1h2.7" />
      <path d="M13.6 15.1l1.3 4.3a1.5 1.5 0 0 1-1.4 1.9h-.8" />
    </Svg>
  )
}

/** Nail-polish bottle — cap, neck and faceted body. */
function PolishIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9.5 2.5h5v4.5h-5z" />
      <path d="M12 7v1.4" />
      <path d="M8.5 11a2.1 2.1 0 0 1 2.1-2.1h2.8a2.1 2.1 0 0 1 2.1 2.1v1.6c0 3.5-1.7 6.3-3.5 8.4-1.8-2.1-3.5-4.9-3.5-8.4z" />
    </Svg>
  )
}

/** Lipstick — tube base, sleeve and angled bullet. */
function LipstickIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 21.5h6" />
      <path d="M9.5 21.5v-7.8h5v7.8" />
      <path d="M10.2 13.7V6.6a1.8 1.8 0 0 1 3.6 0v7.1" />
    </Svg>
  )
}

/** Straight razor — blade, spine and folded handle. */
function RazorIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14.7 3.6l5.7 5.7-8.8 8.8-5.7-5.7z" />
      <path d="M11.6 6.7l5.7 5.7" />
      <path d="M5.9 12.4l-2.4 5.1a1.6 1.6 0 0 0 .8 2.2c.7.3 1.6.1 2.1-.6l3.3-4.3" />
    </Svg>
  )
}

export const MENU_ICONS: Record<string, ComponentType<IconProps>> = {
  scissors: Scissors,
  mustache: MustacheIcon,
  razor: RazorIcon,
  comb: CombIcon,
  lotus: LotusIcon,
  flower: Flower2,
  palette: Palette,
  crown: Crown,
  dryer: DryerIcon,
  polish: PolishIcon,
  lipstick: LipstickIcon,
  kid: Baby,
  sparkles: Sparkles,
  star: Star,
}

export function MenuIcon({ icon, className }: { icon: string; className?: string }) {
  const Cmp = MENU_ICONS[icon] ?? Sparkles
  return <Cmp className={className} />
}
