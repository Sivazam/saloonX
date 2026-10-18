import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { SESSION_COOKIE, createSession } from "@/lib/auth"
import { verifyFirebaseToken } from "@/lib/firebase-rest"
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  /** Firebase Auth ID token from the client SDK (signInWithEmailAndPassword). */
  idToken: z.string().min(50, "Missing login token"),
})

/**
 * POST: exchange a verified Firebase ID token for a SaloonX session cookie.
 * The token is verified AT GOOGLE (accounts:lookup); we then bind the session
 * to the matching local user — Firebase never stores roles/branches, the DB
 * is the source of truth for permissions. Staff get their first operable
 * branch as the starting POS context (multi-branch users switch in-app).
 */
export async function POST(request: Request) {
  // Brute-force guard: 10 login exchanges per IP per 5 minutes.
  const rl = rateLimit(`login:${clientIp(request)}`, 10, 5 * 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfter)

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  // 1) Verify the token cryptographically at Google.
  let fbUser
  try {
    fbUser = await verifyFirebaseToken(parsed.data.idToken)
  } catch {
    return NextResponse.json({ error: "Your login session expired — please sign in again" }, { status: 401 })
  }

  // 2) Find the local account (by Firebase UID, falling back to email for
  //    rows provisioned before their first Firebase sign-in).
  const include = {
    tenant: { select: { id: true, name: true, logo: true, active: true } },
    branches: { include: { branch: { select: { id: true, name: true, city: true, active: true, approved: true } } } },
  }
  let user = await db.user.findUnique({ where: { firebaseUid: fbUser.localId }, include })
  if (!user) {
    user = await db.user
      .findUnique({ where: { email: fbUser.email }, include })
      .catch(() => null)
    if (user) {
      // Backfill the uid binding for next time.
      await db.user.update({ where: { id: user.id }, data: { firebaseUid: fbUser.localId } }).catch(() => {})
    }
  }

  if (!user) {
    // Deliberately vague — never confirm whether an email has an account.
    return NextResponse.json(
      { error: "Sign-in failed — this account may not exist yet. Ask your franchise admin to add you." },
      { status: 403 },
    )
  }
  if (!user.active) {
    return NextResponse.json({ error: "This account has been disabled" }, { status: 403 })
  }
  if (user.tenantId && !user.tenant?.active) {
    return NextResponse.json({ error: "This franchise is currently paused" }, { status: 403 })
  }

  // 3) Resolve the branch context: first APPROVED, active branch the user
  //    can operate (null for the platform super admin).
  const operable = user.branches
    .filter((ub) => ub.branch.active && ub.branch.approved)
    .map((ub) => ({ id: ub.branch.id, name: ub.branch.name, city: ub.branch.city }))

  if (user.role !== "SUPER_ADMIN" && operable.length === 0) {
    return NextResponse.json(
      { error: "No branch assigned to you yet — ask your franchise admin" },
      { status: 403 },
    )
  }

  const branchId = user.role === "SUPER_ADMIN" ? null : operable[0].id
  const { token, expiresAt } = await createSession(user.id, branchId)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIES === "1",
    path: "/",
    expires: expiresAt,
  })
  return response
}
