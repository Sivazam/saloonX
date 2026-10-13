import { NextResponse } from "next/server"
import { z } from "zod"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

const readSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
})

/**
 * POST /api/announcements/read  { ids: string[] }
 *
 * Batch-mark announcements as read for the signed-in user. Only announcements
 * the user is allowed to see (their franchise, or platform-wide for
 * SUPER_ADMIN) can be marked — foreign ids are silently ignored.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  const parsed = readSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const visible = await db.announcement.findMany({
    where: {
      id: { in: parsed.data.ids },
      OR:
        auth.user.role === "SUPER_ADMIN"
          ? [{ tenantId: null }]
          : [{ tenantId: auth.user.tenantId }],
    },
    select: { id: true },
  })

  if (visible.length > 0) {
    // Idempotent: keep only announcements this user hasn't already read
    // (re-tapping "mark all read" is a no-op).
    const alreadyRead = await db.announcementRead.findMany({
      where: { userId: auth.user.id, announcementId: { in: visible.map((a) => a.id) } },
      select: { announcementId: true },
    })
    const readSet = new Set(alreadyRead.map((r) => r.announcementId))
    const fresh = visible.filter((a) => !readSet.has(a.id))
    if (fresh.length > 0) {
      await db.announcementRead.createMany({
        data: fresh.map((a) => ({ announcementId: a.id, userId: auth.user.id })),
      })
    }
  }

  return NextResponse.json({ ok: true, marked: visible.length })
}
