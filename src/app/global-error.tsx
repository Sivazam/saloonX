'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * App-Router GLOBAL error boundary — the only boundary that catches a crash
 * INSIDE the root layout itself (or a root-layout server component). Replaces
 * the entire document, so it owns <html> + <body>. Used as a last-resort
 * fallback so the user never sees a raw white screen / stack trace.
 *
 * Intentionally inlines its own styles instead of pulling Tailwind (the layout
 * that wires Tailwind may be what crashed). Black-on-white, system fonts,
 * accessible contrast — a "panic screen" that still lets the user recover.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[SaloonX] global error:', error.message, error.digest)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#ffffff',
          color: '#18181b',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            border: '1px solid #e4e4e7',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            background: '#ffffff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '999px',
              background: '#fef2f2',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={24} color="#dc2626" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>
            SaloonX hit a problem
          </h1>
          <p style={{ fontSize: 14, color: '#71717a', margin: '0 0 20px', lineHeight: 1.5 }}>
            The app crashed and couldn&rsquo;t recover on its own. Your bills and
            data are safe. Try again &mdash; if it keeps happening, ask your
            franchise admin to check the connection.
          </p>
          {error.digest && (
            <p
              style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: '#a1a1aa',
                margin: '0 0 16px',
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              background: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={16} /> Try again
          </button>
        </div>
      </body>
    </html>
  )
}
