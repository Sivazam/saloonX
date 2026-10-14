import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { toBranchProfileDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

const PREFIX_RE = /^[A-Za-z0-9]{1,5}$/

const updateSchema = z.object({
  name: z.string().trim().min(2, "Branch name is too short").max(60).optional(),
  city: z.string().trim().min(2, "City is required").max(40).optional(),
  address: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  logo: z.string().startsWith("data:image/").max(400_000).optional().nullable(),
  upiId: z.string().trim().max(80).optional().nullable(),
  upiQrImage: z.string().startsWith("data:image/").max(600_000).optional().nullable(),
  ownerMobile: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Owner WhatsApp must be 10 digits")
    .optional()
    .nullable(),
  billPrefix: z
    .string()
    .trim()
    .regex(PREFIX_RE, "Bill prefix must be 1–5 letters/digits")
    .transform((s) => s.toUpperCase())
    .optional(),
  gstEnabled: z.boolean().optional(),
  gstPct: z.number().min(0).max(100).optional(),
  loyaltyEnabled: z.boolean().optional(),
  loyaltyVisits: z.number().int().min(1).max(100).optional(),
  loyaltyDiscountPct: z.number().min(0).max(100).optional(),
  receiptFooter: z.string().trim().max(200).optional().nullable(),
  menuOfferPct: z.number().int().min(0).max(100).optional(),
  menuTagline: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
  /** SUPER_ADMIN only — approves a branch to go live. */
  approved: z.boolean().optional(),
})

async function loadBranch(id: string) {
  return db.branch.findUnique({ where: { id }, include: { tenant: true } })
}

function canManage(role: string, branchTenantId: string, userTenantId: string | null) {
  return role === "SUPER_ADMIN" || (role === "ADMIN" && branchTenantId === userTenantId)
}

/**
 * GET: full branch profile (for the admin branch editor).
 * ADMIN sees only their own franchise's branches; SUPER_ADMIN sees any.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const { id } = await params
  const branch = await loadBranch(id)
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  if (!canManage(auth.user.role, branch.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this branch" }, { status: 403 })
  }
  return NextResponse.json({ branch: toBranchProfileDTO(branch) })
}

/** PUT: update a branch profile / billing settings / pause it. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const { id } = await params
  const branch = await loadBranch(id)
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  if (!canManage(auth.user.role, branch.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this branch" }, { status: 403 })
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const d = parsed.data

  if (d.approved !== undefined && auth.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only the platform can approve branches" }, { status: 403 })
  }
  if (d.billPrefix && d.billPrefix !== branch.billPrefix) {
    const taken = await db.branch.findFirst({ where: { billPrefix: d.billPrefix, id: { not: id } } })
    if (taken) {
      return NextResponse.json({ error: `Bill prefix ${d.billPrefix} is already used — pick another` }, { status: 409 })
    }
  }

  const updated = await db.branch.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.city !== undefined ? { city: d.city } : {}),
      ...(d.address !== undefined ? { address: d.address } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      ...(d.logo !== undefined ? { logo: d.logo } : {}),
      ...(d.upiId !== undefined ? { upiId: d.upiId } : {}),
      ...(d.upiQrImage !== undefined ? { upiQrImage: d.upiQrImage } : {}),
      ...(d.ownerMobile !== undefined ? { ownerMobile: d.ownerMobile } : {}),
      ...(d.billPrefix !== undefined ? { billPrefix: d.billPrefix } : {}),
      ...(d.gstEnabled !== undefined ? { gstEnabled: d.gstEnabled } : {}),
      ...(d.gstPct !== undefined ? { gstPct: d.gstPct } : {}),
      ...(d.loyaltyEnabled !== undefined ? { loyaltyEnabled: d.loyaltyEnabled } : {}),
      ...(d.loyaltyVisits !== undefined ? { loyaltyVisits: d.loyaltyVisits } : {}),
      ...(d.loyaltyDiscountPct !== undefined ? { loyaltyDiscountPct: d.loyaltyDiscountPct } : {}),
      ...(d.receiptFooter !== undefined ? { receiptFooter: d.receiptFooter } : {}),
      ...(d.menuOfferPct !== undefined ? { menuOfferPct: d.menuOfferPct } : {}),
      ...(d.menuTagline !== undefined ? { menuTagline: d.menuTagline } : {}),
      ...(d.active !== undefined ? { active: d.active } : {}),
      ...(d.approved !== undefined
        ? { approved: d.approved, approvedAt: d.approved ? new Date() : null }
        : {}),
      // gstEnabled=false ⇒ GST amount on new bills becomes 0 regardless of gstPct.
    },
    include: { tenant: true },
  })

  if (d.active === false) {
    await db.session.deleteMany({ where: { branchId: id } })
  }

  // ── Announcements (best-effort; failures never block the update) ──
  try {
    // Branch went live: celebrate with the whole franchise.
    if (d.approved === true && !branch.approved) {
      await db.announcement.create({
        data: {
          tenantId: updated.tenantId,
          kind: "BRANCH_APPROVED",
          title: `${updated.name} is live! 🎉`,
          body: `The platform approved ${updated.name}${updated.city ? ` (${updated.city})` : ""}. Bills there start at ${updated.billPrefix}-0001 — assign staff from Menu → Staff if you haven't already.`,
        },
      })
    }
    // Branch paused: everyone in the franchise should know why billing stopped.
    if (d.active === false && branch.active) {
      await db.announcement.create({
        data: {
          tenantId: updated.tenantId,
          kind: "BRANCH_PAUSED",
          title: `${updated.name} is paused`,
          body: `${updated.name} was paused${auth.user.role === "SUPER_ADMIN" ? " by the platform" : ""}. Its history stays safe for reports, but no new bills can be made there until it is reactivated.`,
        },
      })
    }
  } catch {
    /* announcements are best-effort */
  }

  return NextResponse.json({ branch: toBranchProfileDTO(updated) })
}

/**
 * DELETE: hard-delete only when the branch has no data at all; otherwise
 * recommend (and perform) a deactivate. SUPER_ADMIN may force-delete empty
 * branches anywhere; ADMIN only inside their franchise.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(["ADMIN", "SUPER_ADMIN"])
  if (!auth.user) return auth.response

  const { id } = await params
  const branch = await loadBranch(id)
  if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 })
  if (!canManage(auth.user.role, branch.tenantId, auth.user.tenantId)) {
    return NextResponse.json({ error: "No access to this branch" }, { status: 403 })
  }

  const [txnCount, expenseCount, staffCount] = await Promise.all([
    db.transaction.count({ where: { branchId: id } }),
    db.expense.count({ where: { branchId: id } }),
    db.userBranch.count({ where: { branchId: id } }),
  ])

  if (txnCount === 0 && expenseCount === 0 && staffCount === 0) {
    // Declining a PENDING branch is a delete — tell the franchise why it vanished.
    if (!branch.approved && auth.user.role === "SUPER_ADMIN") {
      await db.announcement
        .create({
          data: {
            tenantId: branch.tenantId,
            kind: "BRANCH_DECLINED",
            title: `${branch.name} was declined`,
            body: `The platform declined the new branch "${branch.name}"${branch.city ? ` (${branch.city})` : ""}. Check the branch details in Menu → Branches and submit it again, or reach out to the platform team.`,
          },
        })
        .catch(() => undefined)
    }
    await db.branch.delete({ where: { id } }) // overrides cascade
    return NextResponse.json({ ok: true, deleted: true })
  }

  if (!branch.active) {
    return NextResponse.json(
      { error: "Branch already deactivated — it keeps its history for reports" },
      { status: 409 },
    )
  }

  await db.branch.update({ where: { id }, data: { active: false } })
  await db.session.deleteMany({ where: { branchId: id } })
  return NextResponse.json({
    ok: true,
    deleted: false,
    note: "Branch has past activity — deactivated instead (history preserved)",
  })
}
