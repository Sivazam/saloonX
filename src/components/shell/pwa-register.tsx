"use client"

import { useEffect } from "react"
import { toast } from "sonner"

/**
 * Registers the service worker and surfaces deploys to kiosk users:
 * a POS tablet that stays open for weeks would otherwise run stale code
 * forever. When a new worker finishes installing we show a non-blocking
 * toast with a Reload action; the reload only happens if the user taps it
 * (never mid-bill).
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return

    let reloading = false
    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // A worker might already be waiting when the page loads (deploy that
        // happened while the tab was closed) — prompt for it too.
        const promptWaiting = (worker: ServiceWorker) => {
          toast.info("A new version is available", {
            description: "Tap Reload to pick up the latest SaloonX update.",
            duration: 12000,
            action: {
              label: "Reload",
              onClick: () => {
                worker.postMessage({ type: "SKIP_WAITING" })
              },
            },
          })
        }

        if (registration.waiting && navigator.serviceWorker.controller) {
          promptWaiting(registration.waiting)
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing
          if (!installing) return
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promptWaiting(installing)
            }
          })
        })

        // Check for updates when the tab becomes visible again (kiosks that
        // sleep overnight pick up morning deploys on wake).
        const onUpdateCheck = () => registration.update().catch(() => undefined)
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") onUpdateCheck()
        })
      })
      .catch(() => {
        // SW registration is best-effort; the app works without it.
      })

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
    }
  }, [])

  return null
}
