// Formatting helpers — Indian locale, INR currency.

export function formatINR(n: number): string {
  const isInteger = Math.abs(n - Math.round(n)) < 0.005
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: isInteger ? 0 : 2,
    minimumFractionDigits: isInteger ? 0 : 2,
  }).format(n)
}

export function formatDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function formatTime(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

export function formatDateTime(input: string | Date): string {
  return `${formatDate(input)}, ${formatTime(input)}`
}

/** YYYY-MM-DD for a date (local time), used for stats grouping / default filters. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Compact relative time for announcement lists — "just now", "5m", "3h", "2d",
 *  and beyond a week the actual date ("4 Mar"). */
export function timeAgo(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input
  const secs = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (secs < 45) return 'just now'
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))}m ago`
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`
  if (secs < 7 * 86400) return `${Math.round(secs / 86400)}d ago`
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(d)
}

/** "Today" · "Yesterday" · "Mon, 8 Oct" — for the shift-report date stepper. */
export function friendlyDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`) // noon avoids TZ edge flips
  const today = new Date()
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diff = Math.round((t0 - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff === -1) return 'Tomorrow'
  const sameYear = d.getFullYear() === today.getFullYear()
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(d)
}

/** Shift a YYYY-MM-DD by N days (N may be negative) — stays in local time. */
export function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}
