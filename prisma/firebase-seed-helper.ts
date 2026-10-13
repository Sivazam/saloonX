/**
 * Firebase Auth helper for the seed script (node context, no SDK needed) —
 * uses the same public Identity Toolkit REST API as the app server.
 */
const API_KEY = "AIzaSyDymn4bmAZQVm4E7lDN7PDdP96_G0Vf_IU"
const BASE = "https://identitytoolkit.googleapis.com/v1"

const DEMO_PASSWORD = "saloon123"

export interface FirebaseAccount {
  email: string
  password: string
  name: string
}

/**
 * Idempotent Firebase user provisioning:
 * - create the account if it doesn't exist,
 * - if EMAIL_EXISTS (e.g. the DB was reset but Firebase wasn't), sign in and reuse.
 * Returns the Firebase UID, or null when Firebase is unreachable — the seed
 * then creates the local user with a `pending:` uid so the app still boots
 * and the account can be re-provisioned later.
 */
export async function ensureFirebaseUser({ email, password, name }: FirebaseAccount): Promise<string | null> {
  try {
    // Try to create.
    const signUp = await fetch(`${BASE}/accounts:signUp?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    })
    const created = (await signUp.json()) as { localId?: string; idToken?: string; error?: { message?: string } }
    if (signUp.ok && created.localId && created.idToken) {
      await fetch(`${BASE}/accounts:update?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: created.idToken, displayName: name }),
      }).catch(() => undefined)
      console.log(`  firebase ✓ created ${email}`)
      return created.localId
    }
    if (created.error?.message?.includes("EMAIL_EXISTS")) {
      // Account exists from a previous run — sign in to fetch its uid.
      const signIn = await fetch(`${BASE}/accounts:signInWithPassword?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      })
      const existing = (await signIn.json()) as { localId?: string }
      if (signIn.ok && existing.localId) {
        console.log(`  firebase ✓ reused ${email}`)
        return existing.localId
      }
      throw new Error(`EMAIL_EXISTS but could not sign in: ${String((existing as { error?: { message?: string } }).error?.message)}`)
    }
    throw new Error(created.error?.message ?? `signUp failed (${signUp.status})`)
  } catch (e) {
    console.warn(`  firebase ✗ ${email}: ${(e as Error).message} — provisioning local-only`)
    return null
  }
}
