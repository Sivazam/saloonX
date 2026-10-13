/**
 * Firebase (server-side, no Admin SDK) — via the public Identity Toolkit REST
 * API. These calls DO NOT require a service account: `accounts:signUp` uses
 * the public web key (allowed for email/password providers), and
 * `accounts:lookup` verifies an ID token cryptographically at Google before
 * returning the account — which is exactly what our session bootstrap needs.
 *
 * Upgrade path for production hardening: swap `verifyFirebaseToken` for the
 * Admin SDK (`verifyIdToken`) once a service account is available; the call
 * signature stays the same.
 */
import { firebaseConfig } from "@/lib/firebase"

const API_KEY = firebaseConfig.apiKey
const BASE = "https://identitytoolkit.googleapis.com/v1"

interface FirebaseUser {
  localId: string
  email: string
  emailVerified: boolean
  displayName?: string
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const msg = typeof data.error === "object" && data.error !== null && "message" in data.error
      ? String((data.error as { message: unknown }).message)
      : `Firebase request failed (${res.status})`
    throw new FirebaseError(msg)
  }
  return data as T
}

export class FirebaseError extends Error {}

/** Map raw Identity Toolkit messages to staff-friendly wording. */
export function friendlyAuthMessage(raw: string): string {
  if (raw.includes("EMAIL_EXISTS")) return "This email already has an account"
  if (raw.includes("INVALID_EMAIL")) return "That email address doesn't look right"
  if (raw.includes("WEAK_PASSWORD")) return "Password must be at least 6 characters"
  if (raw.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) return "Too many attempts — try again in a minute"
  if (raw.includes("OPERATION_NOT_ALLOWED")) return "Email/password accounts are not enabled in Firebase yet"
  if (raw.includes("NETWORK_ERROR")) return "Could not reach Firebase — check your connection"
  return raw
}

/**
 * Create a Firebase Auth user (email/password) + display name.
 * Returns the Firebase UID. Throws FirebaseError with a friendly message.
 */
export async function createFirebaseUser(
  email: string,
  password: string,
  displayName: string,
): Promise<{ uid: string; idToken: string }> {
  try {
    const signedUp = await call<{ localId: string; idToken: string }>("/accounts:signUp", {
      email,
      password,
      returnSecureToken: true,
    })
    // Set the display name (best effort — never fail the create for this).
    await call("/accounts:update", {
      idToken: signedUp.idToken,
      displayName,
    }).catch(() => undefined)
    return { uid: signedUp.localId, idToken: signedUp.idToken }
  } catch (e) {
    throw new FirebaseError(friendlyAuthMessage((e as Error).message))
  }
}

/**
 * Verify a Firebase ID token and return the account it belongs to.
 * `accounts:lookup` validates the token signature at Google — an invalid or
 * expired token returns an error and we reject the session.
 */
export async function verifyFirebaseToken(idToken: string): Promise<FirebaseUser> {
  try {
    const res = await call<{ users: FirebaseUser[] }>("/accounts:lookup", { idToken })
    const user = res.users?.[0]
    if (!user) throw new FirebaseError("Invalid login token")
    return user
  } catch (e) {
    if (e instanceof FirebaseError) throw e
    throw new FirebaseError(friendlyAuthMessage((e as Error).message))
  }
}

/** Delete a freshly-created Firebase user (rollback when local provisioning fails). */
export async function deleteFirebaseUser(idToken: string): Promise<void> {
  await call("/accounts:delete", { idToken }).catch(() => undefined)
}
