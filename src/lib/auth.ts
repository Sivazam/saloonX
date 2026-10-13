import { randomBytes } from "crypto"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { BranchRef } from "@/lib/types"

export const SESSION_COOKIE = "saloonx_session"
const SESSION_DAYS = 30

export interface SessionUser {
  id: string
  name: string
  email: string
  role: string // "SUPER_ADMIN" | "ADMIN" | "STAFF"
  tenantId: string | null
  tenantName: string | null
  tenantLogo: string | null
  /** Current POS branch context (null for SUPER_ADMIN sessions). */
  branchId: string | null
  branches: BranchRef[] // APPROVED, active branches this user can operate
}

/** Create a DB session row for a user (optionally bound to a branch context) and return the opaque token. */
export async function createSession(userId: string, branchId: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.session.create({ data: { token, userId, branchId, expiresAt } })
  return { token, expiresAt }
}

/**
 * Resolve the current user from the `saloonx_session` cookie, including tenant
 * identity and accessible branches. Opportunistically deletes expired sessions.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          tenant: { select: { id: true, name: true, logo: true, active: true } },
          branches: { include: { branch: { select: { id: true, name: true, city: true, active: true, approved: true } } } },
        },
      },
    },
  })

  if (!session) return null

  if (session.expiresAt <= new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  if (!session.user.active) return null
  // A paused franchise has no operating staff sessions.
  if (session.user.tenantId && !session.user.tenant?.active) return null

  // Only APPROVED + active branches are operable.
  const branchRefs: BranchRef[] = session.user.branches
    .filter((ub) => ub.branch.active && ub.branch.approved)
    .map((ub) => ({ id: ub.branch.id, name: ub.branch.name, city: ub.branch.city }))

  // The stored branch context must still be one the user can operate.
  const branchId =
    session.branchId && branchRefs.some((b) => b.id === session.branchId) ? session.branchId : null

  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    tenantId: session.user.tenantId,
    tenantName: session.user.tenant?.name ?? null,
    tenantLogo: session.user.tenant?.logo ?? null,
    branchId,
    branches: branchRefs,
  }
}

export type ApiAuth =
  | { user: SessionUser; response?: undefined }
  | { user?: undefined; response: NextResponse }

/**
 * Guard for route handlers. Usage:
 *   const auth = await requireApiUser()                  // any active user
 *   const auth = await requireApiUser(["ADMIN"])         // role gate
 *   if (!auth.user) return auth.response
 */
export async function requireApiUser(roles?: string[]): Promise<ApiAuth> {
  const user = await getSessionUser()
  if (!user) {
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) }
  }
  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return { response: NextResponse.json({ error: "Not authorized" }, { status: 403 }) }
  }
  return { user }
}

export type BranchAuth =
  | { user: SessionUser; branch: NonNullable<Awaited<ReturnType<typeof getBranchRecord>>>; response?: undefined }
  | { user?: undefined; branch?: undefined; response: NextResponse }

async function getBranchRecord(branchId: string) {
  return db.branch.findUnique({
    where: { id: branchId },
    include: { tenant: { select: { id: true, name: true, logo: true, active: true } } },
  })
}

/**
 * Guard for branch-scoped route handlers: any authed user EXCEPT super admin,
 * with a valid current branch context on their session. Returns the branch
 * (with tenant) for scoping queries. Unapproved branches can never bill.
 *   const auth = await requireApiBranch()        // billing, catalog, lookup…
 *   const auth = await requireApiBranch("ADMIN") // branch management writes
 */
export async function requireApiBranch(roles?: string[]): Promise<BranchAuth> {
  const auth = await requireApiUser(roles)
  if (!auth.user) return { response: auth.response }
  const user = auth.user

  if (user.role === "SUPER_ADMIN") {
    return { response: NextResponse.json({ error: "Super admin operates the platform, not a branch" }, { status: 403 }) }
  }
  if (!user.branchId) {
    return { response: NextResponse.json({ error: "No branch selected" }, { status: 400 }) }
  }
  const branch = await getBranchRecord(user.branchId)
  if (!branch || !branch.active || !branch.approved || !branch.tenant.active) {
    return { response: NextResponse.json({ error: "Branch unavailable" }, { status: 403 }) }
  }
  return { user, branch }
}

/**
 * Resolve the set of branch ids an ADMIN may report across:
 * - a specific `branchId` query param (must be accessible), or
 * - every APPROVED, active branch of their franchise.
 * STAFF never reaches this helper (reporting routes are ADMIN-gated).
 */
export async function adminBranchScope(
  user: SessionUser,
  requestedBranchId?: string | null,
): Promise<{ branchIds: string[] | null; error?: string }> {
  if (requestedBranchId) {
    const ok = user.branches.some((b) => b.id === requestedBranchId)
    if (!ok) return { branchIds: null, error: "No access to this branch" }
    return { branchIds: [requestedBranchId] }
  }
  if (user.tenantId) {
    const branches = await db.branch.findMany({
      where: { tenantId: user.tenantId, active: true, approved: true },
      select: { id: true },
    })
    return { branchIds: branches.map((b) => b.id) }
  }
  return { branchIds: [] }
}
