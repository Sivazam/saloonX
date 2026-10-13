'use client'

// ─────────────────────────────────────────────────────────────────────────
// Offline bill queue — bill without internet, sync automatically later.
//
// When the connection drops mid-salon-rush, staff keep billing: the payment
// payload is written to IndexedDB with a unique clientRequestId, and a local
// preview bill is shown. The sync engine retries the moment the browser
// comes back online (and every 30s while a queue exists) — the API keys on
// clientRequestId so a half-delivered sync can never double-bill.
// ─────────────────────────────────────────────────────────────────────────

import type { BranchProfileDTO, PaymentMethod, TransactionDTO } from '@/lib/types'

export interface QueuedBill {
  /** UUID — doubles as the idempotency key sent to the API. */
  clientRequestId: string
  /** Payload exactly as POST /api/transactions expects. */
  payload: {
    items: { serviceId?: string; name?: string; price?: number; qty: number }[]
    discountPct: number
    paymentMethod: PaymentMethod
    note?: string
    customerMobile?: string
    customerName?: string
    clientRequestId: string
    clientCreatedAt: string
  }
  /** Display snapshot for the queue list + local receipt preview. */
  display: {
    total: number
    itemCount: number
    itemSummary: string
    branchName: string
    createdAt: string
  }
  /** Sync bookkeeping. */
  attempts: number
  lastError: string | null
  queuedAt: string
}

export type QueueEvent = 'queue-changed' | 'sync-started' | 'sync-finished'

const DB_NAME = 'saloonx-offline'
const DB_VERSION = 1
const STORE = 'bill-queue'

/** Bumped on every queue mutation / sync result — components re-read counts. */
export const QUEUE_EVENT = 'saloonx:queue'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'))
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientRequestId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open offline storage'))
  })
  return dbPromise
}

function txStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('Queue storage failed'))
      }),
  )
}

function emit(kind: QueueEvent, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { kind, ...(detail as object) } }))
}

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export async function enqueueBill(bill: Omit<QueuedBill, 'attempts' | 'lastError' | 'queuedAt'>): Promise<void> {
  const record: QueuedBill = { ...bill, attempts: 0, lastError: null, queuedAt: new Date().toISOString() }
  await txStore('readwrite', (s) => s.put(record))
  emit('queue-changed')
}

export async function getQueuedBills(): Promise<QueuedBill[]> {
  const all = await txStore<QueuedBill[]>('readonly', (s) => s.getAll())
  return all.sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1)) // FIFO
}

export async function countQueuedBills(): Promise<number> {
  return txStore('readonly', (s) => s.count())
}

export async function removeQueuedBill(clientRequestId: string): Promise<void> {
  await txStore('readwrite', (s) => s.delete(clientRequestId))
  emit('queue-changed')
}

/* ── Paper trail ────────────────────────────────────────────────────────── */

/** Rebuild the local preview bill (same shape the success screen showed)
 *  from a queued record + the session branch profile — powers the offline
 *  receipt PDF download/print from the sync popover. */
export function queuedBillToPreview(
  bill: QueuedBill,
  branch: BranchProfileDTO,
  staffName: string,
): TransactionDTO {
  const round2 = (n: number) => Math.round(n * 100) / 100
  const items = bill.payload.items.map((it, i) => ({
    id: `local-${i}`,
    serviceId: it.serviceId ?? null,
    serviceName: it.name ?? 'Item',
    price: it.price ?? 0,
    qty: it.qty,
  }))
  const subtotal = round2(items.reduce((s, it) => s + it.price * it.qty, 0))
  const discountAmount = round2((subtotal * bill.payload.discountPct) / 100)
  const gstPct = branch.gstEnabled ? branch.gstPct : 0
  const gstAmount = round2(((subtotal - discountAmount) * gstPct) / 100)
  return {
    id: bill.clientRequestId,
    billNo: `OFFLINE-${bill.clientRequestId.slice(0, 4).toUpperCase()}`,
    branchId: branch.id,
    branchName: bill.display.branchName || branch.name,
    tenantName: branch.tenantName,
    customerId: null,
    customerMobile: bill.payload.customerMobile ?? null,
    customerName: bill.payload.customerName ?? null,
    staffId: '',
    staffName,
    subtotal,
    discountPct: bill.payload.discountPct,
    discountAmount,
    gstPct,
    gstAmount,
    total: bill.display.total,
    paymentMethod: bill.payload.paymentMethod,
    note: bill.payload.note ?? null,
    status: 'PENDING_SYNC',
    voidedAt: null,
    voidReason: null,
    createdAt: bill.display.createdAt,
    items,
  }
}

/* ── Sync engine ────────────────────────────────────────────────────────── */

export interface SyncResult {
  synced: number
  failed: number
  offline: boolean
  bills: { billNo: string; total: number }[]
}

let syncing = false
let retryTimer: ReturnType<typeof setTimeout> | null = null

export function isSyncing(): boolean {
  return syncing
}

/** POST one queued bill. Network-level failures throw; server-level
 *  validation errors return the message (bill stays queued with lastError). */
async function pushOne(bill: QueuedBill): Promise<{ billNo: string; total: number }> {
  let res: Response
  try {
    res = await fetch('/api/transactions', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bill.payload),
    })
  } catch {
    throw new Error('__offline__') // fetch itself failed → connection still down
  }
  if (!res.ok) {
    let message = `Server rejected (HTTP ${res.status})`
    try {
      const j = (await res.json()) as { error?: string }
      if (j?.error) message = j.error
    } catch {
      /* keep default */
    }
    throw new Error(message)
  }
  const j = (await res.json()) as { transaction: { billNo: string; total: number } }
  return { billNo: j.transaction.billNo, total: j.transaction.total }
}

/** Try to sync the whole queue. Safe to call repeatedly — concurrent calls
 *  no-op. Network errors abort the run (queue stays); server rejections
 *  (e.g. a service was deleted meanwhile) mark the bill and continue. */
export async function syncQueue(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, offline: false, bills: [] }
  if (syncing || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    result.offline = true
    return result
  }
  syncing = true
  emit('sync-started')
  try {
    const bills = await getQueuedBills()
    for (const bill of bills) {
      try {
        const done = await pushOne(bill)
        await removeQueuedBill(bill.clientRequestId)
        result.synced += 1
        result.bills.push(done)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Sync failed'
        if (msg === '__offline__') {
          result.offline = true
          break // connection dropped again — stop, retry later
        }
        // Server rejected this bill (e.g. service no longer exists).
        // Keep it queued with the reason so the admin can discard it manually.
        bill.attempts += 1
        bill.lastError = msg
        await txStore('readwrite', (s) => s.put(bill))
        result.failed += 1
      }
    }
  } finally {
    syncing = false
    emit('sync-finished', result)
  }
  return result
}

/** Install global listeners: sync on reconnect + gentle 30s retry while a
 *  queue exists. Returns a cleanup (used by the React effect). */
export function installAutoSync(): () => void {
  const onOnline = () => void syncQueue()
  window.addEventListener('online', onOnline)
  const onQueueEvent = () => {
    void countQueuedBills().then((n) => {
      if (n > 0 && navigator.onLine && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null
          void syncQueue()
        }, 30_000)
      }
    })
  }
  window.addEventListener(QUEUE_EVENT, onQueueEvent)
  // Kick off once in case bills were queued before this session mounted.
  void syncQueue()
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener(QUEUE_EVENT, onQueueEvent)
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }
}
