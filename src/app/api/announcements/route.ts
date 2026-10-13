import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiUser } from "@/lib/auth"
import type { AnnouncementsResponse, AnnouncementDTO } from "@/lib/types"

export const dynamic = "force-dynamic"

/**
 * GET /api/announcements
 *
 * The signed-in user's announcement feed (bell menu):
 * - ADMIN/STAFF: announcements scoped to their franchise (branch approved /
 *   paused, welcome, festive notes from the platform).
 * - SUPER_ADMIN: platform-console announcements (tenantId is null).
 * `unread` = announcements the user has no read receipt for.
 */
export async function GET() {
  const auth = await requireApiUser()
  if (!auth.user) return auth.response

  const isSuper = auth.user.role === "SUPER_ADMIN"
  const where = isSuper ? { tenantId: null } : { tenantId: auth.user.tenantId }

  const rows = await db.announcement.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { reads: { where: { userId: auth.user.id }, select: { id: true } } },
  })

  const announcements: AnnouncementDTO[] = rows.map((a) => ({
    id: a.id,
    kind: a.kind as AnnouncementDTO["kind"],
    title: a.title,
    body: a.body,
    createdAt: a.createdAt.toISOString(),
    unread: a.reads.length === 0,
  }))

  const body: AnnouncementsResponse = {
    announcements,
    unread: announcements.filter((a) => a.unread).length,
  }
  return NextResponse.json(body)
}
