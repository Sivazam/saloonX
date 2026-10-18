// ─────────────────────────────────────────────────────────────────────────────
// Tiny in-memory sliding-window rate limiter (per key: ip + bucket).
// Suited to the single-process SQLite deployment — no external middleware.
// Buckets are pruned opportunistically so the map cannot grow unbounded.
// ─────────────────────────────────────────────────────────────────────────────

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
    if (bucket.hits.length === 0) buckets.delete(key)
  }
}

/** Best-effort client IP behind the Caddy proxy (X-Forwarded-For / X-Real-IP). */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return request.headers.get("x-real-ip") ?? "unknown"
}

export interface RateLimitResult {
  ok: boolean
  /** Seconds until the caller may retry. */
  retryAfter: number
}

/**
 * Consume one hit for `key`. Returns ok=false once `limit` requests within
 * `windowMs` have been seen for the same key.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  sweep(now, Math.max(windowMs, 60_000))

  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket)
    const oldest = bucket.hits[0] ?? now
    return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) }
  }

  bucket.hits.push(now)
  buckets.set(key, bucket)
  return { ok: true, retryAfter: 0 }
}

/** Standard 429 response with Retry-After. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: "Too many requests — slow down and try again shortly" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  )
}
