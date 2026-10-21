'use client'

// ─────────────────────────────────────────────────────────────────────────
// Tiny localStorage cache with TTL + total try/catch safety.
//
// Used for offline-cold-start data (catalog / branch profile per branch) so
// billing step 1 still works after a reload with no network. localStorage is
// best-effort: private mode, quota errors and disabled storage must never
// throw into the billing flow.
// ─────────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  ts: number
  data: T
}

/** Read a cached value. Returns null when missing, expired (age > ttlMs), or
 *  storage is unavailable/corrupt — never throws. */
export function readLocalCache<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.ts !== 'number' ||
      !Number.isFinite(parsed.ts)
    ) {
      return null
    }
    if (Date.now() - parsed.ts > ttlMs) return null
    return parsed.data
  } catch {
    return null
  }
}

/** Best-effort write. Silently ignores failures (private mode / quota). */
export function writeLocalCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return
  try {
    const entry: CacheEntry<T> = { ts: Date.now(), data }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    /* private mode / quota exceeded — the in-memory app still works */
  }
}
