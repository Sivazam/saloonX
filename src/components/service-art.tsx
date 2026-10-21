'use client'

/**
 * ServiceArt — a set of 30 hand-drawn SVG illustrations, one per salon
 * service family (haircut, shave, facial, colour, massage, combos…).
 * Each is a 48×48 stroke drawing in the lucide idiom (round caps/joins)
 * with soft fill accents, so it scales cleanly from 16px chips to 56px
 * hero tiles in BOTH light & dark themes.
 *
 * `serviceArt(serviceName)` maps any service name to the right drawing
 * via keyword rules (most-specific first) — the same art is used by the
 * billing POS cards, the public QR menu and the admin catalog so the
 * whole product shares one visual language per service.
 */
import type { ComponentType, ReactNode } from 'react'

export type ArtProps = { className?: string }

function Art({ className, children }: ArtProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

/* soft fill accent (respects currentColor, theme-safe) */
function Fill({ d, o = 0.15 }: { d: string; o?: number }) {
  return <path d={d} fill="currentColor" fillOpacity={o} stroke="none" />
}

/* ── HAIR ─────────────────────────────────────────────────────────────────── */

/** Haircut — open scissors with a strand between the blades + snippets. */
function HaircutArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M27 7c4-2.5 9-2 12.5 1.5" />
      <path d="M16.5 24 38 10" />
      <path d="M16.5 24 38 38" />
      <path d="M15 21.5 10 16" />
      <path d="M15 26.5 10 32" />
      <circle cx="9" cy="14.5" r="4" />
      <circle cx="9" cy="33.5" r="4" />
      <circle cx="16.5" cy="24" r="1.5" fill="currentColor" stroke="none" />
      <path d="M35 22c1.2 1.8 3 1.8 4.2 0" opacity={0.55} />
      <path d="M31 29c1.2 1.8 3 1.8 4.2 0" opacity={0.55} />
    </Art>
  )
}

/** Kids cut — little scissors + a smiley face with a hair tuft. */
function KidsCutArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="32" cy="15" r="8" />
      <path d="M32 7c0-2 1-3.2 2.6-3.8" />
      <path d="M28.6 14h.1M35.4 14h.1" strokeWidth={3} />
      <path d="M28.5 18.2q3.5 2.8 7 0" />
      <path d="M12 21.5 28 33" />
      <path d="M12 21.5 6 16.5" />
      <path d="M12 21.5 7 27.5" />
      <circle cx="5" cy="15" r="3.4" />
      <circle cx="6.5" cy="29" r="3.4" />
      <circle cx="12" cy="21.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M22 40.5c1 .9 2.2 1.3 3.5 1.3" opacity={0.55} />
    </Art>
  )
}

/** Layer cut — three flowing layered strands. */
function LayersArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M11 19c8.5-9 21.5-9 30 0" />
      <path d="M8 27c10.5-8 25.5-8 36 0" opacity={0.75} />
      <path d="M6 36c11.5-6 28.5-6 40 0" opacity={0.5} />
      <path d="M24 40.5v.1M16 40.5v.1M32 40.5v.1" strokeWidth={3} opacity={0.5} />
    </Art>
  )
}

/** Blow dry — hair dryer with airflow waves + a blown curl. */
function BlowDryArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="16" cy="17" r="8.5" />
      <path d="M24.3 13.5h5.2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-5.2" />
      <path d="M18.5 25.5l2.2 7.5a3 3 0 0 0 2.9 2.2h1.4" />
      <path d="M38 14c2.8 1.7 2.8 6.3 0 8" />
      <path d="M42.5 10.5c4.6 2.9 4.6 11.1 0 14" opacity={0.55} />
      <path d="M36 30c3.5 1.5 4.5 4.5 2.5 7.5" opacity={0.55} />
    </Art>
  )
}

/** Straightening — flat iron plates with a sleek strand + shine. */
function StraightenArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <rect x="9" y="14" width="24" height="8" rx="4" />
      <rect x="9" y="26" width="24" height="8" rx="4" />
      <path d="M9 18 4 15M9 30 4 33" />
      <path d="M36 23h8" />
      <path d="M38 12l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" opacity={0.7} />
    </Art>
  )
}

/** Keratin / smoothening — glossy S-strand + treatment drop + shine. */
function KeratinArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M10 12c14-6 28 0 30 8s-14 10-30 6" />
      <path d="M10 20c14-4 26 0 28 6" opacity={0.5} />
      <path d="M22 32c2.6 3.2 3.9 5.4 3.9 7.4a3.9 3.9 0 1 1-7.8 0c0-2 1.3-4.2 3.9-7.4z" />
      <Fill d="M22 32c2.6 3.2 3.9 5.4 3.9 7.4a3.9 3.9 0 1 1-7.8 0c0-2 1.3-4.2 3.9-7.4z" o={0.18} />
      <path d="M38 30l1.2 2.6 2.6 1.2-2.6 1.2L38 37.6l-1.2-2.6-2.6-1.2 2.6-1.2z" opacity={0.7} />
    </Art>
  )
}

/** Highlights / balayage — hair swatch with bold painted streaks. */
function HighlightsArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M7 13q11-8 22-3" />
      <path d="M11 13q5 15-1 30" />
      <path d="M19 11q7 13 3 28" />
      <path d="M27 11q9 11 7 24" />
      <path d="M18.4 13.5q4.5 9 3 18.5" strokeWidth={4.2} opacity={0.5} />
      <path d="M26.6 14q5.5 7.5 5 15.5" strokeWidth={4.2} opacity={0.5} />
      <path d="M38 32l1.2 2.6 2.6 1.2-2.6 1.2L38 39.6l-1.2-2.6-2.6-1.2 2.6-1.2z" opacity={0.8} />
    </Art>
  )
}

/** Root touch-up — colour bottle + root dots. */
function RootsArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M19 5.5h8v4h-8z" />
      <path d="M20 9.5h6" />
      <path d="M17 13.5h12v20a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" />
      <path d="M21 20h4" opacity={0.6} />
      <path d="M8 8h.1M12 5.5h.1M5.5 12h.1" strokeWidth={3} />
      <path d="M9 30q2.4 2.8 0 5.6" opacity={0.55} />
      <path d="M40 28q2.4 2.8 0 5.6" opacity={0.55} />
    </Art>
  )
}

/** Hair colour — colour bowl + brush. */
function ColorBowlArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M7 25h30c0 9.5-6.5 15.5-15 15.5S7 34.5 7 25z" />
      <Fill d="M9.5 27h25c-.6 7.5-6 12.5-12.5 12.5S10.1 34.5 9.5 27z" o={0.18} />
      <path d="M33 4l6 6" />
      <path d="M31.5 10.5l6 6L25 29l-7.5 1.5L19 23z" />
      <path d="M13 17q3 3.4 0 6.8" opacity={0.55} />
    </Art>
  )
}

/** Buzz / skin fade — hair clipper with teeth. */
function ClipperArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M18 5h10a4 4 0 0 1 4 4v19a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7V9a4 4 0 0 1 4-4z" />
      <path d="M14 29h18" opacity={0.6} />
      <path d="M15.5 35l-2 6M19.5 35l-.5 6M23 35v6M26.5 35l.5 6M30.5 35l2 6" />
      <path d="M23 12v9" opacity={0.5} />
    </Art>
  )
}

/** Hair tattoo — head with a star shaved in. */
function HairTattooArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M24 8a13 13 0 0 1 13 13v8a13 13 0 0 1-26 0v-8A13 13 0 0 1 24 8z" />
      <path d="M24 16l1.9 5.1 5.1 1.9-5.1 1.9L24 30l-1.9-5.1L17 23l5.1-1.9z" />
      <Fill d="M24 16l1.9 5.1 5.1 1.9-5.1 1.9L24 30l-1.9-5.1L17 23l5.1-1.9z" o={0.22} />
      <path d="M16 34l3 2 3-2 3 2 3-2 3 2" opacity={0.55} />
    </Art>
  )
}

/* ── SHAVE / BEARD ────────────────────────────────────────────────────────── */

/** Clean shave — cartridge razor + foam swirl. */
function ShaveArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M9 13h17a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3z" />
      <path d="M15.5 22l4.5 16.5a3 3 0 0 0 5.8-1.3" />
      <path d="M35 17c4.5 0 6.5 2.5 6.5 5.5S39.5 28 36 28c-3 0-5-1.5-5-3.5" />
      <path d="M38 33h.1M42 30h.1M40 37h.1" strokeWidth={3} opacity={0.6} />
    </Art>
  )
}

/** Royal / hot-towel shave — straight razor + crown + steam. */
function RoyalShaveArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M7 33 29 11l4 4L11 37z" />
      <path d="M29 11l5.5-5.5a2.4 2.4 0 0 1 3.4 0l4.6 4.6a2.4 2.4 0 0 1 0 3.4L37 23" />
      <path d="M11 37l-3.5 3.5" opacity={0.6} />
      <path d="M10 12q-3.5 3.5 0 7" opacity={0.55} />
      <path d="M31 27l1.4-6.2 3.8 3.4 2.4-4.7 2.4 4.7 3.8-3.4L31 27z" opacity={0.9} />
    </Art>
  )
}

/** Beard trim — beard + mustache with scissors. */
function BeardTrimArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M11 18c0 16 4 24 14 24s14-8 14-24" />
      <path d="M18 20c2.5-3 5.5-3 6-.5.5-2.5 3.5-2.5 6-.5" />
      <path d="M17 27q7 6 14 0" opacity={0.6} />
      <path d="M36 6.5 44 12M36 6.5l-1.5-3" />
      <circle cx="33" cy="2.9" r="1.4" opacity={0.8} />
    </Art>
  )
}

/** Beard spa / sculpt — beard + steam + sparkle. */
function BeardSpaArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M12 20c0 15 4 23 13 23s13-8 13-23" />
      <path d="M18.5 21.5c2.5-3 5.5-3 6-.5.5-2.5 3.5-2.5 6-.5" />
      <path d="M9 10q-3 3 0 6M39 10q3 3 0 6" opacity={0.55} />
      <path d="M40 26l1.2 2.6 2.6 1.2-2.6 1.2L40 33.6l-1.2-2.6-2.6-1.2 2.6-1.2z" opacity={0.7} />
    </Art>
  )
}

/** Beard colour — beard + colour drop. */
function BeardColorArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M11 22c0 14 4 21 12 21s12-7 12-21" />
      <path d="M17.5 23.5c2.5-3 5.5-3 6-.5.5-2.5 3.5-2.5 6-.5" />
      <path d="M40 5c3 3.6 4.5 6 4.5 8.2A4.5 4.5 0 1 1 35.5 13C35.5 11 37 8.6 40 5z" />
      <Fill d="M40 5c3 3.6 4.5 6 4.5 8.2A4.5 4.5 0 1 1 35.5 13C35.5 11 37 8.6 40 5z" o={0.2} />
    </Art>
  )
}

/* ── FACIALS / SKIN ───────────────────────────────────────────────────────── */

/** Fruit facial — serene face + a big citrus slice. */
function FruitFacialArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="18" cy="28" r="11" />
      <path d="M12.5 27q1.8 1.8 3.6 0M19.9 27q1.8 1.8 3.6 0" opacity={0.8} />
      <path d="M15 32.5q3 2.6 6 0" />
      <circle cx="38" cy="11" r="8" />
      <path d="M38 3v16M30 11h16M32.3 5.3l11.4 11.4M43.7 5.3 32.3 16.7" />
      <Fill d="M38 3a8 8 0 0 1 5.7 2.4L38 11z" o={0.35} />
      <Fill d="M38 19a8 8 0 0 1-5.7-2.4L38 11z" o={0.35} />
    </Art>
  )
}

/** Gold facial — face + diamond + sparkles. */
function GoldFacialArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="21" cy="28" r="11.5" />
      <path d="M15.5 27q1.8 1.8 3.6 0M22.9 27q1.8 1.8 3.6 0" opacity={0.8} />
      <path d="M18 32.5q3 2.6 6 0" />
      <path d="M38 5l4.5 5.5L38 16l-4.5-5.5z" />
      <Fill d="M38 5l4.5 5.5L38 16l-4.5-5.5z" o={0.25} />
      <path d="M7 9l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" opacity={0.7} />
      <path d="M40 22h.1M36 25h.1" strokeWidth={3} opacity={0.6} />
    </Art>
  )
}

/** Hydra facial — face + water drops. */
function HydraFacialArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="19" cy="28" r="11.5" />
      <path d="M13.5 27q1.8 1.8 3.6 0M20.9 27q1.8 1.8 3.6 0" opacity={0.8} />
      <path d="M16 32.5q3 2.6 6 0" />
      <path d="M40 4c3.2 3.8 4.8 6.4 4.8 8.7a4.8 4.8 0 1 1-9.6 0C35.2 10.4 36.8 7.8 40 4z" />
      <Fill d="M40 4c3.2 3.8 4.8 6.4 4.8 8.7a4.8 4.8 0 1 1-9.6 0C35.2 10.4 36.8 7.8 40 4z" o={0.2} />
      <path d="M43 24q2.2 2.6 2.2 4.5a2.2 2.2 0 1 1-4.4 0q0-1.9 2.2-4.5" opacity={0.6} />
    </Art>
  )
}

/** Glow / vitamin-C facial — face + sun. */
function GlowFacialArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="20" cy="29" r="11" />
      <path d="M14.5 28q1.8 1.8 3.6 0M21.9 28q1.8 1.8 3.6 0" opacity={0.8} />
      <path d="M17 33q3 2.6 6 0" />
      <circle cx="38.5" cy="10.5" r="3.2" />
      <path d="M38.5 3.5v2.2M38.5 15.3v2.2M31.5 10.5h2.2M43.3 10.5h2.2M33.6 5.6l1.5 1.5M42 14.4l1.5 1.5M43.4 5.6 41.9 7.1M35 14.4l-1.5 1.5" opacity={0.75} />
      <path d="M7 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" opacity={0.7} />
    </Art>
  )
}

/** Cleanup — fresh face with cleansing bubbles. */
function CleanupArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="19" cy="28" r="11" />
      <path d="M13.5 27q1.8 1.8 3.6 0M20.9 27q1.8 1.8 3.6 0" opacity={0.8} />
      <path d="M16 32.5q3 2.6 6 0" />
      <circle cx="37.5" cy="9.5" r="4" />
      <circle cx="43.5" cy="17" r="2.4" />
      <circle cx="36" cy="19" r="1.7" />
      <path d="M24 39.5q2.2 2.6 2.2 4.4a2.2 2.2 0 1 1-4.4 0q0-1.8 2.2-4.4" opacity={0.7} />
    </Art>
  )
}

/** De-tan — face + crossed-out sun (tan removal). */
function DetanArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <circle cx="19" cy="28" r="11" />
      <path d="M13.5 27q1.8 1.8 3.6 0M20.9 27q1.8 1.8 3.6 0" opacity={0.8} />
      <path d="M16 32.5q3 2.6 6 0" />
      <circle cx="38" cy="10" r="4" />
      <path d="M38 3.5v2M38 14.5v2M31.5 10h2M42.5 10h2M33.4 5.4l1.4 1.4M41.2 13.2l1.4 1.4M42.6 5.4l-1.4 1.4M34.8 13.2l-1.4 1.4" opacity={0.75} />
      <path d="M31 17 45 3" strokeWidth={2.6} />
    </Art>
  )
}

/* ── MASSAGE / SPA ────────────────────────────────────────────────────────── */

/** Head massage — head with pressing fingers + pressure arcs. */
function HeadMassageArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M13 42c0-13 3.5-19 11-19s11 6 11 19" />
      <path d="M11 25c0-9.5 5-15 13-15s13 5.5 13 15" />
      <path d="M16 14.5q2.5-2.2 5.5-2.2M32 14.5q-2.5-2.2-5.5-2.2" />
      <path d="M9 8.5q6-5 14-4M39 8.5q-6-5-14-4" opacity={0.55} />
      <path d="M24 32q3-2 5 0" opacity={0.5} />
    </Art>
  )
}

/** Champi / oil massage — oil pot + dripping over a head. */
function ChampiArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M11 5.5h9v4h-9z" />
      <path d="M10 9.5h11v9a3.5 3.5 0 0 1-3.5 3.5h-4A3.5 3.5 0 0 1 10 18.5z" />
      <Fill d="M12 12h7v6.5a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 12 18.5z" o={0.2} />
      <path d="M15.5 26q2.4 2.8 0 5.6M22 30q2.4 2.8 0 5.6" opacity={0.7} />
      <path d="M31 44c0-8 2-12 7-12s7 4 7 12" />
      <path d="M29.5 34c0-6 3.2-9.5 8.5-9.5s8.5 3.5 8.5 9.5" />
    </Art>
  )
}

/** Shoulder massage — shoulders with kneading hands + motion arcs. */
function ShoulderArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M6 40c0-11 7-17 18-17s18 6 18 17" />
      <path d="M20 23a4 4 0 0 1 8 0" />
      <path d="M14 32q1.5-5 6.5-5M34 32q-1.5-5-6.5-5" />
      <path d="M9 24q2.5-4 7-4.5M39 24q-2.5-4-7-4.5" opacity={0.55} />
    </Art>
  )
}

/** Aroma therapy — candle with aroma curls. */
function AromaArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M24 22h8v13a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3z" />
      <path d="M23 22v-3h10v3" opacity={0.6} />
      <path d="M28 12.5c2.7 3 4 5 4 6.8a4 4 0 1 1-8 0c0-1.8 1.3-3.8 4-6.8z" />
      <Fill d="M28 12.5c2.7 3 4 5 4 6.8a4 4 0 1 1-8 0c0-1.8 1.3-3.8 4-6.8z" o={0.22} />
      <path d="M10 27c-3.2 3.4-3.2 8.2 0 11.6M38 27c3.2 3.4 3.2 8.2 0 11.6" opacity={0.55} />
      <path d="M14 13h.1M42 13h.1M9 17h.1M44 20h.1" strokeWidth={3} opacity={0.5} />
    </Art>
  )
}

/** Scalp therapy / dandruff — head with follicle dots + drops + flakes. */
function ScalpArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M16 42c0-13 3-19 10-19s10 6 10 19" />
      <path d="M14 26c0-9 4.5-14 12-14s12 5 12 14" />
      <path d="M16.5 20h.1M21 16.5h.1M26 15h.1M31 16.5h.1M35.5 20h.1" strokeWidth={3} opacity={0.65} />
      <path d="M39 30c2.4 2.9 3.6 4.9 3.6 6.6a3.6 3.6 0 1 1-7.2 0c0-1.7 1.2-3.7 3.6-6.6" opacity={0.85} />
      <path d="M8 30l3 3M11 30l-3 3" opacity={0.6} />
    </Art>
  )
}

/* ── COMBOS / GROOM ───────────────────────────────────────────────────────── */

/** Combo / package — scissors + star + sparkle. */
function ComboArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M15 21.5 33 9M15 21.5 33 34" />
      <path d="M13.8 19 9 14.2M13.8 24 9 28.8" />
      <circle cx="8" cy="13" r="3.6" />
      <circle cx="8" cy="30" r="3.6" />
      <circle cx="15" cy="21.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M38 5l1.5 3.4L43 10l-3.5 1.6L38 15l-1.5-3.4L33 10l3.5-1.6z" />
      <path d="M36 34l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" opacity={0.7} />
      <path d="M27 41h10" opacity={0.6} />
    </Art>
  )
}

/** Groom package — bow tie + crown. */
function GroomArt({ className }: ArtProps) {
  return (
    <Art className={className}>
      <path d="M24 31l-9-5.5a1.5 1.5 0 0 0-2.3 1.3v8.4a1.5 1.5 0 0 0 2.3 1.3L24 31z" />
      <path d="M24 31l9-5.5a1.5 1.5 0 0 1 2.3 1.3v8.4a1.5 1.5 0 0 1-2.3 1.3L24 31z" />
      <path d="M21.5 28h5v6h-5z" />
      <path d="M14 13l1.6-8 4.6 3.6L24 3l3.8 5.6 4.6-3.6 1.6 8z" />
      <path d="M14 13h20" />
      <path d="M8 41h.1M40 41h.1" strokeWidth={3} opacity={0.5} />
    </Art>
  )
}

/* ── Matcher ──────────────────────────────────────────────────────────────── */

type ArtEntry = {
  key: string
  Art: ComponentType<ArtProps>
  /** billing/admin tile — dark-mode aware tint */
  tile: string
  /** public menu tile — warm light palette */
  warmTile: string
  /** small lucide stand-in for dense UI (chips) */
  re: RegExp
}

const ENTRIES: ArtEntry[] = [
  { key: 'hairtattoo', Art: HairTattooArt, re: /tattoo/i, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', warmTile: 'bg-violet-100/70 text-violet-700' },
  { key: 'clipper', Art: ClipperArt, re: /buzz|skin fade|\bfade\b/i, tile: 'bg-stone-500/10 text-stone-600 dark:text-stone-300', warmTile: 'bg-stone-200/70 text-stone-700' },
  { key: 'kidscut', Art: KidsCutArt, re: /kid|child/i, tile: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', warmTile: 'bg-orange-100/70 text-orange-700' },
  { key: 'straighten', Art: StraightenArt, re: /straighten|rebond|smoothen/i, tile: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', warmTile: 'bg-teal-100/70 text-teal-700' },
  { key: 'keratin', Art: KeratinArt, re: /keratin|botox/i, tile: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', warmTile: 'bg-teal-100/70 text-teal-700' },
  { key: 'groom', Art: GroomArt, re: /groom|bridal/i, tile: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', warmTile: 'bg-rose-100/70 text-rose-700' },
  { key: 'combo', Art: ComboArt, re: /\+|combo|package|full works|monthly/i, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', warmTile: 'bg-amber-100/70 text-amber-700' },
  { key: 'blowdry', Art: BlowDryArt, re: /blow|wash/i, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', warmTile: 'bg-amber-100/70 text-amber-700' },
  { key: 'layers', Art: LayersArt, re: /layer/i, tile: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', warmTile: 'bg-rose-100/70 text-rose-700' },
  { key: 'highlights', Art: HighlightsArt, re: /balayage|highlight/i, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', warmTile: 'bg-violet-100/70 text-violet-700' },
  { key: 'roots', Art: RootsArt, re: /root|touch[- ]?up/i, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', warmTile: 'bg-violet-100/70 text-violet-700' },
  { key: 'beardcolor', Art: BeardColorArt, re: /beard\s*(colou?r|dye)/i, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', warmTile: 'bg-violet-100/70 text-violet-700' },
  { key: 'colorbowl', Art: ColorBowlArt, re: /colou?r|dye|grey|gray/i, tile: 'bg-violet-500/10 text-violet-600 dark:text-violet-400', warmTile: 'bg-violet-100/70 text-violet-700' },
  { key: 'goldfacial', Art: GoldFacialArt, re: /gold/i, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', warmTile: 'bg-amber-100/70 text-amber-700' },
  { key: 'hydrafacial', Art: HydraFacialArt, re: /hydra/i, tile: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', warmTile: 'bg-teal-100/70 text-teal-700' },
  { key: 'glowfacial', Art: GlowFacialArt, re: /vitamin|glow/i, tile: 'bg-lime-500/10 text-lime-600 dark:text-lime-400', warmTile: 'bg-lime-100/70 text-lime-700' },
  { key: 'facial', Art: FruitFacialArt, re: /facial/i, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', warmTile: 'bg-emerald-100/70 text-emerald-700' },
  { key: 'detan', Art: DetanArt, re: /detan|de-tan/i, tile: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', warmTile: 'bg-orange-100/70 text-orange-700' },
  { key: 'cleanup', Art: CleanupArt, re: /clean[- ]?up/i, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', warmTile: 'bg-emerald-100/70 text-emerald-700' },
  { key: 'champi', Art: ChampiArt, re: /champi/i, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', warmTile: 'bg-amber-100/70 text-amber-700' },
  { key: 'shoulder', Art: ShoulderArt, re: /shoulder/i, tile: 'bg-pink-500/10 text-pink-600 dark:text-pink-400', warmTile: 'bg-rose-100/70 text-rose-700' },
  { key: 'scalp', Art: ScalpArt, re: /scalp|dandruff/i, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', warmTile: 'bg-emerald-100/70 text-emerald-700' },
  { key: 'aroma', Art: AromaArt, re: /aroma|therapy|ritual|\bspa\b|wellness/i, tile: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', warmTile: 'bg-emerald-100/70 text-emerald-700' },
  { key: 'headmassage', Art: HeadMassageArt, re: /head/i, tile: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', warmTile: 'bg-orange-100/70 text-orange-700' },
  { key: 'royalshave', Art: RoyalShaveArt, re: /royal|hot towel/i, tile: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', warmTile: 'bg-amber-100/70 text-amber-700' },
  { key: 'shave', Art: ShaveArt, re: /shav/i, tile: 'bg-stone-500/10 text-stone-600 dark:text-stone-300', warmTile: 'bg-stone-200/70 text-stone-700' },
  { key: 'beardspa', Art: BeardSpaArt, re: /beard\s*(spa|sculpt)/i, tile: 'bg-teal-500/10 text-teal-600 dark:text-teal-400', warmTile: 'bg-teal-100/70 text-teal-700' },
  { key: 'beardtrim', Art: BeardTrimArt, re: /beard|mustache|moustache/i, tile: 'bg-stone-500/10 text-stone-600 dark:text-stone-300', warmTile: 'bg-stone-200/70 text-stone-700' },
  { key: 'haircut', Art: HaircutArt, re: /cut|trim|styling|stylist|hair/i, tile: 'bg-rose-500/10 text-rose-600 dark:text-rose-400', warmTile: 'bg-rose-100/70 text-rose-700' },
]

const FALLBACK = ENTRIES.find((e) => e.key === 'haircut')!

/**
 * Resolve the illustration for a service (or category) name.
 * Rules run most-specific first: "Beard Colour" → beardcolor (not colorbowl),
 * "Haircut + Beard" → combo (has "+"), "Aroma Head Ritual" → aroma, etc.
 */
export function serviceArt(name: string): ArtEntry {
  return ENTRIES.find((e) => e.re.test(name)) ?? FALLBACK
}

/** Thin wrapper so consumers can render `<ServiceArt name={…} className=… />`. */
export function ServiceArt({ name, className }: { name: string; className?: string }) {
  const { Art } = serviceArt(name)
  return <Art className={className} />
}
