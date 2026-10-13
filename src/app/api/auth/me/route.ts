import { NextResponse } from "next/server"
import { z } from "zod"
import { getSessionUser, requireApiUser } from "@/lib/auth"
import { db } from "@/lib/db"
import type { MeResponse } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: { lang: true },
  })

  const currentBranch =
    user.branches.find((b) => b.id === user.branchId) ?? null

  const body: MeResponse = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as MeResponse["user"]["role"],
      tenantId: user.tenantId,
      tenantName: user.tenantName,
      tenantLogo: user.tenantLogo,
      lang: (profile?.lang as "en" | "hi" | null) ?? null,
    },
    branches: user.branches,
    currentBranch,
  }
  return NextResponse.json(body)
}

const langSchema = z.object({
  lang: z.enum(["en", "hi"]),
})

/**
 * PUT /api/auth/me  { lang: "en" | "hi" }
 *
 * Persists the staff-facing UI language on the user's profile so it follows
 * them across devices (the toggle also keeps a localStorage copy for instant
 * paint before login).
 */
export async function PUT(request: Request) {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  const parsed = langSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "lang must be \"en\" or \"hi\"" }, { status: 400 })
  }

  await db.user.update({
    where: { id: auth.user.id },
    data: { lang: parsed.data.lang },
  })

  return NextResponse.json({ ok: true, lang: parsed.data.lang })
}
