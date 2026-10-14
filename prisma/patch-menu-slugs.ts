/**
 * One-off patch: backfill Branch.menuSlug (+ demo menuTaglines) for branches
 * created before the QR-menu feature. Idempotent — only touches null slugs.
 *
 *   bun prisma/patch-menu-slugs.ts
 */
import { db } from "../src/lib/db"

/** "Glow & Go Salons" → "glow-and-go-salons" */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

/** Demo taglines keyed by branch name (falls back to null — the public menu
 *  generates a sensible line when the tagline is missing). */
const TAGLINES: Record<string, string> = {
  "Andheri West": "Andheri's friendliest family salon — walk out glowing.",
  Bandra: "Bandra's style HQ for hair, skin & everything in between.",
  Powai: "Lakeside grooming in Powai — quick, clean, caring.",
  "Koramangala": "Koramangala's sharpest fades since 2019.",
  "Indiranagar": "Indiranagar's easy-going chair — no fuss, all finish.",
  "Jubilee Hills": "Hyderabad's luxury ritual studio — bronze by name, bias by nature.",
}

async function main() {
  const branches = await db.branch.findMany({
    include: { tenant: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  })
  console.log(`Found ${branches.length} branches`)

  const used = new Set<string>()
  for (const b of branches) {
    if (b.menuSlug) {
      used.add(b.menuSlug)
      continue
    }
    // Prefer the locality in the branch name ("Brand — Andheri West") over the
    // city, so sister branches in one city still get distinct, pretty slugs.
    const locality = b.name.includes("—") ? b.name.split("—").pop()!.trim() : b.name
    let slug = slugify(`${b.tenant.name}-${locality}`) || slugify(`${b.tenant.name}-${b.city ?? ""}`)
    if (!slug || used.has(slug)) slug = `${slug || "salon"}-${b.id.slice(-4).toLowerCase()}`
    while (used.has(slug)) slug = `${slug}-${b.id.slice(-4).toLowerCase()}`
    used.add(slug)
    await db.branch.update({
      where: { id: b.id },
      data: {
        menuSlug: slug,
        ...(b.menuTagline ? {} : { menuTagline: TAGLINES[b.name] ?? TAGLINES[b.city ?? ""] ?? null }),
      },
    })
    console.log(`  ✓ ${b.tenant.name} / ${b.name} → /?menu=${slug}`)
  }

  console.log("Patch complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
