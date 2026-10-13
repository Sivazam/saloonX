"use client"

import { useEffect } from "react"
import Image from "next/image"
import { motion } from "framer-motion"
import { apiGet } from "@/lib/api-client"
import type { MeResponse } from "@/lib/types"
import { useAppStore } from "@/store/use-app-store"
import { LoginView } from "@/components/auth/login-view"
import { AppShell } from "@/components/shell/app-shell"

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

  useEffect(() => {
    let cancelled = false
    apiGet<MeResponse>("/api/auth/me")
      .then((res) => {
        if (!cancelled) setSession(res)
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
  }, [setSession, setHydrated])

  return <>{!hydrated ? <Splash /> : user ? <AppShell /> : <LoginView />}</>
}
