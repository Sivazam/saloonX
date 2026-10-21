"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { apiGet } from "@/lib/api-client"
import type { MeResponse } from "@/lib/types"
import { useAppStore } from "@/store/use-app-store"
import { LoginView } from "@/components/auth/login-view"
import { AppShell } from "@/components/shell/app-shell"
import { SalonMenuApp } from "@/components/menu/salon-menu-app"

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        className="overflow-hidden rounded-2xl border shadow-sm"
      >
        <Image
          src="/icons/icon-192.png"
          alt="SaloonX logo"
          width={80}
          height={80}
          priority
          className="size-20"
        />
      </motion.div>
      <div className="text-center">
        <p className="text-xl font-bold tracking-tight">SaloonX</p>
        <p className="micro mt-1 text-muted-foreground">Salon billing, franchised</p>
      </div>
      <p className="sr-only">Loading SaloonX</p>
    </div>
  )
}

export default function Page() {
  const setSession = useAppStore((s) => s.setSession)
  const setHydrated = useAppStore((s) => s.setHydrated)
  const hydrated = useAppStore((s) => s.hydrated)
  const user = useAppStore((s) => s.user)

  // Public QR menu — `/?menu=<slug>` renders the customer-facing salon menu,
  // completely bypassing staff auth (guests scan the poster at the salon).
  const [menuSlug, setMenuSlug] = useState<string | null>(null)

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("menu")
    if (slug) {
      // Deferred to a microtask so it lands after hydration commits — the
      // same async pattern as the /me fetch below.
      Promise.resolve().then(() => setMenuSlug(slug))
    }
  }, [])

  useEffect(() => {
    if (menuSlug) return // a public menu visitor never needs the staff session
    let cancelled = false
    apiGet<MeResponse>("/api/auth/me")
      .then((res) => {
        if (cancelled) return
        setSession(res)
        // PWA app shortcuts (manifest.webmanifest) deep-link into a view:
        //   /?action=billing → New Bill, /?view=dashboard → Dashboard.
        // Role-guarded — staff always land on billing; unknown params ignored.
        try {
          const params = new URLSearchParams(window.location.search)
          const wanted = params.get("view") ?? (params.get("action") === "billing" ? "billing" : null)
          if (wanted === "dashboard" && res.user.role === "ADMIN") {
            useAppStore.getState().setView("dashboard")
          }
        } catch {
          /* URL parsing can't realistically fail here */
        }
      })
      .catch(() => {
        // Not signed in — stay on login.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [setSession, setHydrated, menuSlug])

  if (menuSlug) return <SalonMenuApp slug={menuSlug} />

  return <>{!hydrated ? <Splash /> : user ? <AppShell /> : <LoginView />}</>
}
