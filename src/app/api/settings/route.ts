import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import { toSettingsDTO } from "@/lib/serialize"

export const dynamic = "force-dynamic"

async function getOrCreateSettings() {
  return db.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  })
}

export async function GET() {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  const settings = await getOrCreateSettings()
  return NextResponse.json(toSettingsDTO(settings))
}

const updateSchema = z.object({
  salonName: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(24).nullable().optional(),
  ownerMobile: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Owner mobile must be exactly 10 digits")
    .nullable()
    .optional(),
  upiId: z.string().trim().max(80).nullable().optional(),
  upiQrImage: z
    .string()
    .refine((v) => v.startsWith("data:image/"), "QR image must be a base64 data URL")
    .nullable()
    .optional(),
  gstEnabled: z.boolean().optional(),
  gstPct: z.number().min(0).max(100).optional(),
  loyaltyEnabled: z.boolean().optional(),
  loyaltyVisits: z.number().int().min(1).max(1000).optional(),
  loyaltyDiscountPct: z.number().min(0).max(100).optional(),
  receiptFooter: z.string().trim().max(200).nullable().optional(),
})

export async function PUT(request: Request) {
  const auth = await requireApiUser(["ADMIN"])
  if (!auth.user) return auth.response

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  }

  await getOrCreateSettings()
  const settings = await db.settings.update({
    where: { id: "singleton" },
    data: parsed.data,
  })
  return NextResponse.json(toSettingsDTO(settings))
}
