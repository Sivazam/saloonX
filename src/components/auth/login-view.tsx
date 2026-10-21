'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDownToLine,
  ArrowLeft,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { apiGet, apiPost } from '@/lib/api-client'
import { firebaseAuth } from '@/lib/firebase'
import type { BranchRef, MeResponse } from '@/lib/types'
import { useAppStore, useT } from '@/store/use-app-store'
import { LangToggle } from '@/components/shell/lang-toggle'
import { ServiceArt } from '@/components/service-art'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/* ── SaloonX brand mark (hand-crafted — mirrors seed-assets/saloonx-logo.svg) ── */
export function SaloonXMark({ size = 40 }: { size?: number }) {
  const prefersReduced = useReducedMotion()
  return (
    <motion.svg
      viewBox="0 0 192 192"
      width={size}
      height={size}
      aria-hidden
      initial={prefersReduced ? false : { scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
    >
      <rect width="192" height="192" rx="46" fill="#5E1A2C" />
      <line x1="62" y1="60" x2="134" y2="138" stroke="#F6EFE7" strokeWidth="17" strokeLinecap="round" />
      <line x1="130" y1="60" x2="62" y2="138" stroke="#E8A54B" strokeWidth="17" strokeLinecap="round" />
      <circle cx="60" cy="58" r="16" fill="none" stroke="#F6EFE7" strokeWidth="10" />
      <motion.circle
        cx="132"
        cy="58"
        r="16"
        fill="none"
        stroke="#E8A54B"
        strokeWidth="10"
        style={{ transformOrigin: '132px 58px' }}
        animate={prefersReduced ? undefined : { scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={prefersReduced ? undefined : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.svg>
  )
}

/* Variants for staggered entrance of the brand-panel feature list + form fields. */
const STAGGER_ITEM = {
  hidden: { opacity: 0, x: -8 },
  show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
}

const FORM_STAGGER_PARENT = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
} as const

const FORM_STAGGER_ITEM = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
}

/** Friendly error wording for raw Firebase error codes. */
function friendly(raw: string): string {
  if (raw.includes('INVALID_LOGIN_CREDENTIALS') || raw.includes('INVALID_PASSWORD') || raw.includes('EMAIL_NOT_FOUND'))
    return 'Wrong email or password'
  if (raw.includes('INVALID_EMAIL')) return 'That email address doesn\u2019t look right'
  if (raw.includes('TOO_MANY_ATTEMPTS')) return 'Too many attempts — please wait a minute'
  if (raw.includes('NETWORK_REQUEST_FAILED')) return 'Could not reach the login service — check your connection'
  if (raw.includes('USER_DISABLED')) return 'This account has been disabled'
  return 'Could not sign in — please try again'
}

/** Collapsed-by-default demo credentials card. OPT-IN via NEXT_PUBLIC_SHOW_DEMO_HINTS:
 *  a production deployment must deliberately set it to "true" (e.g. a demo
 *  environment) — the default is hidden, so working credentials are never
 *  advertised on a real salon's login screen. */
function DemoAccountsCard() {
  const [open, setOpen] = useState(false)
  if (process.env.NEXT_PUBLIC_SHOW_DEMO_HINTS !== 'true') return null
  return (
    <div className="mt-8 rounded-xl border bg-muted/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-3 text-left"
      >
        <span className="micro text-muted-foreground">Demo accounts</span>
        <span className="text-xs font-semibold text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <p className="px-3.5 pb-3.5 text-xs leading-relaxed text-muted-foreground">
          Platform — <span className="font-semibold text-foreground">dev@saloonx.example</span>
          <br />
          Franchise admin — <span className="font-semibold text-foreground">ravi@glowgo.example</span>
          <br />
          Staff — <span className="font-semibold text-foreground">priya@glowgo.example</span>
          <span className="text-muted-foreground"> · password </span>
          <span className="font-semibold text-foreground">saloon123</span>
        </p>
      )}
    </div>
  )
}

/* ── Split-screen layout ──────────────────────────────────────────────── */

/* The five signature services woven through the brand panel — one illustrated
 * chip each (hair, skin, beard, ritual, colour) so the panel reads "salon"
 * at a glance, even before reading a word. */
const PANEL_SERVICES = ['Haircut', 'Fruit Facial', 'Royal Shave', 'Head Massage', 'Hair Colour']

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-primary lg:flex lg:w-[46%] lg:shrink-0">
      {/* Subtle geometric texture — large soft rings, no gradient slop */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 size-[420px] rounded-full border-[44px] border-primary-foreground/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -bottom-32 size-[520px] rounded-full border-[60px] border-primary-foreground/5"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary-foreground/10"
      />
      {/* warm amber glow — the salon lamp behind the panel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_320px_at_85%_10%,oklch(0.83_0.13_80/0.16),transparent_65%)]"
      />

      <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
        <div className="flex items-center gap-3">
          <SaloonXMark size={44} />
          <div>
            <p className="text-xl font-bold tracking-tight text-primary-foreground">SaloonX</p>
            <p className="micro text-primary-foreground/60">Salon billing, franchised</p>
          </div>
        </div>

        <div className="max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight text-primary-foreground xl:text-[2.9rem]">
            Bill in seconds.
            <br />
            Run your whole chain.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-primary-foreground/70">
            The POS built for busy salons — every franchise, every branch, one login. Staff
            just bill; owners see everything.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              { icon: Building2, text: 'Every branch, its own menu & prices' },
              { icon: ShieldCheck, text: 'Encrypted sign-in for your whole team' },
              { icon: Lock, text: 'Reports only owners can see' },
            ].map(({ icon: Icon, text }, i) => (
              <motion.li
                key={text}
                variants={STAGGER_ITEM}
                initial="hidden"
                animate="show"
                transition={{ delay: 0.2 + i * 0.08, duration: 0.22 }}
                className="flex items-center gap-3 text-sm text-primary-foreground/85"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                {text}
              </motion.li>
            ))}
          </ul>

          {/* Signature service strip — illustrated chips in frosted tiles */}
          <div className="mt-9 flex items-center gap-2.5">
            {PANEL_SERVICES.map((name, i) => (
              <motion.span
                key={name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 + i * 0.07, duration: 0.3 }}
                title={name}
                className="flex size-11 items-center justify-center rounded-xl border border-primary-foreground/12 bg-primary-foreground/8"
              >
                <ServiceArt name={name} className="size-5.5 text-primary-foreground/75" />
              </motion.span>
            ))}
            <span className="ml-1 h-px flex-1 bg-primary-foreground/15" aria-hidden />
            <span className="micro shrink-0 text-primary-foreground/50">and 25 more</span>
          </div>
        </div>

        <p className="text-xs text-primary-foreground/40">SaloonX · encrypted secure sign-in</p>
      </div>
    </div>
  )
}

/* ── View ─────────────────────────────────────────────────────────────── */

export function LoginView() {
  const setSession = useAppStore((s) => s.setSession)
  const L = useT()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetMode, setResetMode] = useState(false)

  /** Session data fetched right after a successful Firebase sign-in. */
  const [me, setMe] = useState<MeResponse | null>(null)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  async function completeLogin() {
    // Exchange the Firebase ID token for a SaloonX session cookie.
    const auth = firebaseAuth()
    const idToken = await auth.currentUser?.getIdToken()
    if (!idToken) throw new Error('Not signed in')

    try {
      await apiPost('/api/auth/firebase-session', { idToken })
    } catch (e) {
      // Not provisioned / disabled — sign out of Firebase and surface the reason.
      await signOut(auth).catch(() => undefined)
      throw e
    }

    const res = await apiGet<MeResponse>('/api/auth/me')
    setMe(res)
    if (res.branches.length <= 1) {
      // Single-branch user (or super admin) — straight into the app.
      setSession(res)
    }
    // Multi-branch users see the branch picker (rendered below).
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password)
      await completeLogin()
    } catch (e) {
      const raw = (e as { code?: string; message?: string }).message ?? ''
      setError(friendly(raw))
    } finally {
      setBusy(false)
    }
  }

  async function sendReset(ev: React.FormEvent) {
    ev.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await sendPasswordResetEmail(firebaseAuth(), email.trim())
      toast.success(L.resetSent)
      setResetMode(false)
      setPassword('')
    } catch (e) {
      const raw = (e as { code?: string; message?: string }).message ?? ''
      setError(friendly(raw))
    } finally {
      setBusy(false)
    }
  }

  async function chooseBranch(b: BranchRef) {
    if (switchingTo) return
    setSwitchingTo(b.id)
    try {
      await apiPost('/api/auth/switch-branch', { branchId: b.id })
      if (me) setSession({ ...me, currentBranch: b })
    } catch (e) {
      toast.error((e as Error).message)
      setSwitchingTo(null)
    }
  }

  /** If Firebase still has a session but our cookie expired, resume it
   *  silently; otherwise clear the stale Firebase state. */
  useEffect(() => {
    const unsub = onAuthStateChanged(firebaseAuth(), (user) => {
      if (!user) return
      let cancelled = false
      void user
        .getIdToken()
        .then((token) => apiPost('/api/auth/firebase-session', { idToken: token }))
        .then(() => apiGet<MeResponse>('/api/auth/me'))
        .then((res) => {
          if (cancelled) return
          if (res.branches.length <= 1) setSession(res)
          else setMe(res)
        })
        .catch(() => {
          // No (or expired) SaloonX session — reset the Firebase state so the
          // form behaves predictably.
          void signOut(firebaseAuth()).catch(() => undefined)
        })
    })
    return () => unsub()
     
  }, [])

  return (
    <div className="flex min-h-dvh bg-background">
      <BrandPanel />

      {/* ── Form / picker panel ── */}
      <div className="relative flex min-h-dvh flex-1 flex-col px-6 sm:px-10 lg:px-14">
        {/* Mobile brand header */}
        <div className="flex items-center justify-between py-6 lg:hidden">
          <div className="flex items-center gap-2.5">
            <SaloonXMark size={32} />
            <p className="text-lg font-bold tracking-tight">SaloonX</p>
          </div>
          <LangToggle />
        </div>
        <div className="hidden justify-end pt-6 lg:flex">
          <LangToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <AnimatePresence mode="wait" initial={false}>
              {me ? (
                /* ── Step 2: branch picker (multi-branch users only) ── */
                <motion.div
                  key="picker"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22 }}
                >
                  <p className="micro text-muted-foreground">{L.welcomeBack}</p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight">
                    {me.user.name.split(' ')[0]}
                  </h1>
                  <h2 className="mt-4 text-lg font-semibold leading-snug">{L.chooseWhereYouWork}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{L.branchPickerHint}</p>

                  <div className="mt-5 grid gap-2">
                    {me.branches.map((b, i) => (
                      <motion.button
                        key={b.id}
                        type="button"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05, duration: 0.18 }}
                        whileTap={{ scale: 0.96 }}
                        disabled={switchingTo !== null}
                        onClick={() => void chooseBranch(b)}
                        className="hairline group flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/50 disabled:opacity-60"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
                          {switchingTo === b.id ? (
                            <Loader2 className="size-4.5 animate-spin" aria-hidden />
                          ) : (
                            <Building2 className="size-4.5" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold leading-tight">{b.name}</span>
                          {b.city && (
                            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="size-3 shrink-0" aria-hidden />
                              {b.city}
                            </span>
                          )}
                        </span>
                      </motion.button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="mt-6 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => {
                      void signOut(firebaseAuth()).catch(() => undefined)
                      setMe(null)
                    }}
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    {L.backToSignIn}
                  </button>
                </motion.div>
              ) : (
                /* ── Step 1: email + password (Firebase Auth) ── */
                <motion.div
                  key="signin"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22 }}
                >
                  <h1 className="text-2xl font-bold tracking-tight">
                    {resetMode ? L.forgotPassword : L.welcomeBack}
                  </h1>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {resetMode ? L.resetHint : L.signInToAccount}
                  </p>

                  <motion.form
                    className="mt-7 space-y-4"
                    onSubmit={resetMode ? sendReset : submit}
                    variants={FORM_STAGGER_PARENT}
                    initial="hidden"
                    animate="show"
                  >
                    <motion.div variants={FORM_STAGGER_ITEM} className="space-y-1.5">
                      <label htmlFor="login-email" className="micro text-muted-foreground">
                        {L.email}
                      </label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                        <Input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          required
                          className="h-12 rounded-xl pl-9"
                          placeholder="you@salon.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          aria-invalid={!!error}
                        />
                      </div>
                    </motion.div>

                    {!resetMode && (
                      <motion.div variants={FORM_STAGGER_ITEM} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label htmlFor="login-password" className="micro text-muted-foreground">
                            {L.password}
                          </label>
                          <button
                            type="button"
                            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                            onClick={() => {
                              setResetMode(true)
                              setError(null)
                            }}
                          >
                            {L.forgotPassword}
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                          <Input
                            id="login-password"
                            type={showPw ? 'text' : 'password'}
                            autoComplete="current-password"
                            required
                            className="h-12 rounded-xl pl-9 pr-11"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            aria-invalid={!!error}
                          />
                          <button
                            type="button"
                            aria-label={showPw ? L.hidePassword : L.showPassword}
                            className="absolute top-1/2 right-3 flex size-6 -translate-y-1/2 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                            onClick={() => setShowPw((v) => !v)}
                          >
                            {showPw ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        role="alert"
                        className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                      >
                        {error}
                      </motion.p>
                    )}

                    <motion.div variants={FORM_STAGGER_ITEM} whileTap={{ scale: 0.96 }} className="pt-0">
                      <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-[15px] font-bold" disabled={busy}>
                        {busy ? (
                          <>
                            <Loader2 className="animate-spin" aria-hidden />
                            {resetMode ? L.sendResetLink : L.signingIn}
                          </>
                        ) : resetMode ? (
                          <>
                            <KeyRound className="size-4" aria-hidden />
                            {L.sendResetLink}
                          </>
                        ) : (
                          L.signIn
                        )}
                      </Button>
                    </motion.div>

                    {resetMode && (
                      <motion.div variants={FORM_STAGGER_ITEM} className="pt-0">
                        <button
                          type="button"
                          className="flex w-full items-center justify-center gap-1.5 pt-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                          onClick={() => {
                            setResetMode(false)
                            setError(null)
                          }}
                        >
                          <ArrowLeft className="size-4" aria-hidden />
                          {L.backToSignIn}
                        </button>
                      </motion.div>
                    )}
                  </motion.form>

                  {/* Demo accounts — collapsed by default so a real deployment's
                      login screen isn't advertising credentials. */}
                  <DemoAccountsCard />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="pb-6 text-center">
          <p className="text-xs text-muted-foreground">
            {L.rememberTip}
          </p>
          {/* Direct download link for the full source bundle (zipper.zip in /public).
              Served statically by Next.js at /zipper.zip. */}
          <a
            href="/zipper.zip"
            download
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            <ArrowDownToLine className="size-3.5" aria-hidden />
            Download full source (zipper.zip · 15 MB)
          </a>
        </div>
      </div>
    </div>
  )
}
