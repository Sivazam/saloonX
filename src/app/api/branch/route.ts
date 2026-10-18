import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiBranch } from "@/lib/auth"
import { toBranchProfileDTO } from "@/lib/serialize"
import { DATA_URL_IMAGE_REGEX } from "@/lib/utils"

export const dynamic = "force-dynamic"

/** GET: the current session's branch (with franchise identity) — powers billing,
 *  receipts and the admin Settings view. */
export async function GET() {
  const auth = await requireApiBranch()
  if (!auth.user) return auth.response
  return NextResponse.json({ branch: toBranchProfileDTO(auth.branch) })
}

const updateSchema = z.object({
  name: z.string().trim().min(2, "Branch name is too short").max(60).optional(),
  city: z.string().trim().min(2, "City is required").max(40).optional(),
  address: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  logo: z.string().regex(DATA_URL_IMAGE_REGEX, "Logo must be a PNG/JPEG/WebP data URL").max(400_000).optional().nullable(),
  upiId: z.string().trim().max(80).optional().nullable(),
  upiQrImage: z.string().regex(DATA_URL_IMAGE_REGEX, "UPI QR must be a PNG/JPEG/WebP data URL").max(600_000).optional().nullable(),
  ownerMobile: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Owner WhatsApp must be 10 digits")
    .optional()
    .nullable(),
  gstEnabled: z.boolean().optional(),
  gstPct: z.number().min(0).max(100).optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN")
    .optional()
    .nullable(),
  loyaltyEnabled: z.boolean().optional(),
  loyaltyVisits: z.number().int().min(1).max(100).optional(),
  loyaltyDiscountPct: z.number().min(0).max(100).optional(),
  receiptFooter: z.string().trim().max(200).optional().nullable(),
  menuOfferPct: z.number().int().min(0).max(100).optional(),
  menuTagline: z.string().trim().max(120).optional().nullable(),
})

/** PUT (ADMIN): update the profile/settings of the CURRENT branch only. */
export async function PUT(request: Request) {
  const auth = await requireApiBranch(["ADMIN"])
  if (!auth.user) return auth.response

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }
  const d = parsed.data

  const branch = await db.branch.update({
    where: { id: auth.branch.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.city !== undefined ? { city: d.city } : {}),
      ...(d.address !== undefined ? { address: d.address } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      ...(d.logo !== undefined ? { logo: d.logo } : {}),
      ...(d.upiId !== undefined ? { upiId: d.upiId } : {}),
      ...(d.upiQrImage !== undefined ? { upiQrImage: d.upiQrImage } : {}),
      ...(d.ownerMobile !== undefined ? { ownerMobile: d.ownerMobile } : {}),
      ...(d.gstEnabled !== undefined ? { gstEnabled: d.gstEnabled } : {}),
      ...(d.gstPct !== undefined ? { gstPct: d.gstPct } : {}),
      ...(d.gstin !== undefined ? { gstin: d.gstin } : {}),
      ...(d.loyaltyEnabled !== undefined ? { loyaltyEnabled: d.loyaltyEnabled } : {}),
      ...(d.loyaltyVisits !== undefined ? { loyaltyVisits: d.loyaltyVisits } : {}),
      ...(d.loyaltyDiscountPct !== undefined ? { loyaltyDiscountPct: d.loyaltyDiscountPct } : {}),
      ...(d.receiptFooter !== undefined ? { receiptFooter: d.receiptFooter } : {}),
      ...(d.menuOfferPct !== undefined ? { menuOfferPct: d.menuOfferPct } : {}),
      ...(d.menuTagline !== undefined ? { menuTagline: d.menuTagline } : {}),
    },
    include: { tenant: true },
  })

  return NextResponse.json({ branch: toBranchProfileDTO(branch) })
}
