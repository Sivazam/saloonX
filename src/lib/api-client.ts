'use client'

// Thin JSON fetch helpers. All requests are same-origin (cookie auth).
// Errors thrown: `Error(message)` parsed from `{ "error": message }` responses.

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  let payload: unknown = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error: unknown }).error === 'string'
        ? (payload as { error: string }).error
        : `Request failed (${res.status})`
    throw new Error(message)
  }

  return payload as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body ?? {})
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PUT', path, body ?? {})
}

export function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('DELETE', path, body)
}
