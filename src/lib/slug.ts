import { db } from "@/lib/db"

/** Slugify "Glow & Go — Andheri West" → "glow-and-go-andheri-west" style. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

/** Deterministic tenant+locality slug, suffixed until platform-unique.
 *  Shared by branch creation, franchise onboarding (first branch) and the
 *  backfill-on-edit path — every branch must be reachable at /?menu=<slug>. */
export async function uniqueMenuSlug(
  tenantName: string,
  branchName: string,
  city?: string | null,
): Promise<string> {
  const locality = branchName.includes("—") ? branchName.split("—").pop()!.trim() : branchName
  const base = slugify(`${tenantName}-${locality || city || "salon"}`) || "salon"
  let slug = base
  for (let i = 0; i < 20; i++) {
    const clash = await db.branch.findUnique({ where: { menuSlug: slug }, select: { id: true } })
    if (!clash) return slug
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`
  }
  return `${base}-${Date.now().toString(36)}`
}
