'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * App-Router route-level error boundary. Catches a render or server-component
 * crash in any segment BELOW the root layout (dashboard, billing, admin
 * views...) and shows a recoverable error card instead of a white screen.
 * The root layout (nav, footer, toasts) stays mounted — the user keeps
 * navigation context. For crashes INSIDE the root layout itself, see
 * `global-error.tsx`.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the digest in the console for ops without leaking internals
    // into the rendered UI (which an attacker could scrape).
    console.error('[SaloonX] route error:', error.message, error.digest)
  }, [error])

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          We hit an unexpected error loading this page. Your data is safe — try
          again, or refresh if the problem persists.
        </p>
        {error.digest && (
          <p className="font-mono text-[10px] text-muted-foreground">
            ref: {error.digest}
          </p>
        )}
        <Button onClick={reset} className="mt-2">
          <RotateCcw className="mr-2 size-4" /> Try again
        </Button>
      </div>
    </main>
  )
}
