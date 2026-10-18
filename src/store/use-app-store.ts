'use client'
import { create } from 'zustand'
import type { AppUser, BranchRef, TransactionDTO } from '@/lib/types'
import { DICTS, LANG_STORAGE_KEY, type Dict, type Lang } from '@/lib/i18n'

export type View =
  | 'billing'
  | 'dashboard'
  | 'transactions'
  | 'expenses'
  | 'services'
  | 'staff'
  | 'customers'
  | 'settings'
  | 'branches'
  | 'qrmenu'
  | 'tenants'

export interface CartItem {
  serviceId: string
  name: string
  price: number
  qty: number
  /** true for ad-hoc items billed at a custom price (serviceId is a synthetic id) */
  custom?: boolean
}

/** Read the staff language preference once at store creation. Server renders
 *  default to 'en'; the app's splash/hydration gate means translated UI only
 *  paints after mount, so there is no hydration mismatch. */
function initialLang(): Lang {
  if (typeof window !== 'undefined') {
    try {
      const lang: Lang = localStorage.getItem(LANG_STORAGE_KEY) === 'hi' ? 'hi' : 'en'
      // Keep <html lang> truthful from the very first client render so screen
      // readers / TTS pick the right voice.
      document.documentElement.lang = lang
      return lang
    } catch {
      /* private mode etc. */
    }
  }
  return 'en'
}

/** Default landing view per role — super admin lands on the platform view. */
export function defaultView(role: string): View {
  return role === 'SUPER_ADMIN' ? 'tenants' : 'billing'
}

export interface SessionPayload {
  user: AppUser
  branches: BranchRef[]
  currentBranch: BranchRef | null
}

interface AppState {
  user: AppUser | null
  branches: BranchRef[]
  currentBranch: BranchRef | null
  hydrated: boolean
  view: View
  cart: CartItem[]
  lastBill: TransactionDTO | null
  lang: Lang
  setSession: (s: SessionPayload | null) => void
  setHydrated: (v: boolean) => void
  setView: (v: View) => void
  /** After a successful /api/auth/switch-branch call. */
  setCurrentBranch: (b: BranchRef | null) => void
  addToCart: (item: Omit<CartItem, 'qty'>) => void
  setCartQty: (serviceId: string, qty: number) => void
  clearCart: () => void
  setLastBill: (t: TransactionDTO | null) => void
  setLang: (l: Lang) => void
}

/** Unique synthetic id for a custom-amount cart item (never merges with another). */
export function newCustomItemId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// ── In-progress bill survives a refresh ─────────────────────────────────
// A staff member mid-billing should never lose the cart because the browser
// refreshed (accidental reload, battery saver, PWA eviction). The cart is a
// tiny JSON array of {serviceId,name,price,qty,custom} — persisted best-effort.
const CART_STORAGE_KEY = 'sx-cart'

function loadPersistedCart(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (c): c is CartItem =>
        typeof c === 'object' && c !== null &&
        typeof (c as CartItem).serviceId === 'string' &&
        typeof (c as CartItem).name === 'string' &&
        typeof (c as CartItem).price === 'number' &&
        Number.isFinite((c as CartItem).qty) && (c as CartItem).qty > 0,
    ).slice(0, 100)
  } catch {
    return []
  }
}

function persistCart(cart: CartItem[]) {
  try {
    if (cart.length === 0) localStorage.removeItem(CART_STORAGE_KEY)
    else localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  } catch {
    /* private mode / quota — the in-memory cart still works */
  }
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  branches: [],
  currentBranch: null,
  hydrated: false,
  view: 'billing',
  cart: loadPersistedCart(),
  lastBill: null,
  lang: initialLang(),
  setSession: (s) => {
    if (s) {
      // Server-persisted language: adopted on a fresh device (no explicit
      // local choice yet). Once this device has a preference it always wins —
      // the LangToggle keeps the profile in sync when signed in.
      const serverLang = s.user.lang === 'hi' || s.user.lang === 'en' ? s.user.lang : null
      let applyLang: Lang | null = null
      if (serverLang) {
        let hasLocal = false
        try {
          hasLocal = localStorage.getItem(LANG_STORAGE_KEY) !== null
        } catch {
          /* private mode */
        }
        if (!hasLocal) {
          try {
            localStorage.setItem(LANG_STORAGE_KEY, serverLang)
          } catch {
            /* ignore */
          }
          applyLang = serverLang
        }
      }
      set({
        user: s.user,
        branches: s.branches,
        currentBranch: s.currentBranch,
        view: defaultView(s.user.role),
        cart: [],
        ...(applyLang ? { lang: applyLang } : {}),
      })
    } else {
      set({ user: null, branches: [], currentBranch: null, view: 'billing', cart: [] })
    }
  },
  setHydrated: (hydrated) => set({ hydrated }),
  setView: (view) => set({ view }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),
  addToCart: (item) => set((s) => {
    // Custom items always start their own line (unique synthetic serviceId).
    const existing = item.custom ? undefined : s.cart.find((c) => c.serviceId === item.serviceId)
    const cart = existing
      ? s.cart.map((c) => (c.serviceId === item.serviceId ? { ...c, qty: c.qty + 1 } : c))
      : [...s.cart, { ...item, qty: 1 }]
    persistCart(cart)
    return { cart }
  }),
  setCartQty: (serviceId, qty) => set((s) => {
    const cart = qty <= 0
      ? s.cart.filter((c) => c.serviceId !== serviceId)
      : s.cart.map((c) => (c.serviceId === serviceId ? { ...c, qty } : c))
    persistCart(cart)
    return { cart }
  }),
  clearCart: () => {
    persistCart([])
    set({ cart: [] })
  },
  setLastBill: (lastBill) => set({ lastBill }),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang)
    } catch {
      /* ignore */
    }
    // Keep <html lang> in sync for screen readers.
    if (typeof document !== 'undefined') document.documentElement.lang = lang
    set({ lang })
  },
}))

/** Dictionary for the current staff language — `const L = useT()` in a component. */
export function useT(): Dict {
  const lang = useAppStore((s) => s.lang)
  return DICTS[lang]
}
