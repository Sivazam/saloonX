'use client'

import { Languages } from 'lucide-react'
import { useAppStore, useT } from '@/store/use-app-store'
import { apiPut } from '@/lib/api-client'
import { cn } from '@/lib/utils'

/**
 * EN ⇄ हिंदी toggle — login + billing + the admin shell header/drawer.
 * Preference is stored per device in localStorage AND — once signed in — on
 * the user's profile, so their language follows them across devices.
 */
export function LangToggle({ className = '' }: { className?: string }) {
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  const user = useAppStore((s) => s.user)
  const L = useT()

  function toggle() {
    const next = lang === 'en' ? 'hi' : 'en'
    setLang(next)
    // Screen readers / TTS must pronounce Hindi text with a Hindi voice.
    document.documentElement.lang = next
    // Signed in → persist on the profile (fire-and-forget; the toggle itself
    // must never wait on the network). The login screen has no session yet,
    // so its toggle only touches localStorage.
    if (user) void apiPut('/api/auth/me', { lang: next }).catch(() => undefined)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={L.admLangToggleAria}
      title={L.admLangToggleTitle}
      className={cn(
        'flex h-11 shrink-0 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [@media(max-height:740px)]:h-9 [@media(max-height:740px)]:px-2.5',
        className,
      )}
    >
      <Languages className="size-4 text-primary" aria-hidden />
      {lang === 'en' ? 'हिं' : 'EN'}
    </button>
  )
}
