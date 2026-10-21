/**
 * One-off patch (billing engine v1.1): backfill TransactionPayment rows for
 * every legacy bill created before split payments existed. Idempotent —
 * re-running is a no-op (only bills with ZERO payment rows are touched).
 *
 * Also repairs tenant-level Branch.billPrefix collisions in case the
 * @@unique([tenantId, billPrefix]) constraint could not be applied by
 * db:push on a dirty database (suffixes the later branch with a counter).
 *
 *   bun prisma/patch-backfill-payments.ts
 */
import { db } from "../src/lib/db"

const round2 = (n: number) => Math.round(n * 100) / 100

async function fixBranchPrefixCollisions(): Promise<number> {
  // Group branches by (tenantId, billPrefix); any group > 1 needs repair.
  const branches = await db.branch.findMany({
    orderBy: { createdAt: "asc" }, // earliest branch keeps the prefix
    select: { id: true, tenantId: true, billPrefix: true },
  })
  const seen = new Set<string>()
  const fixes: { id: string; billPrefix: string }[] = []
  for (const b of branches) {
    const key = `${b.tenantId}:${b.billPrefix}`
    if (seen.has(key)) {
      // Find a free suffix within this tenant.
      let n = 2
      while (branches.some((x) => x.tenantId === b.tenantId && x.billPrefix === `${b.billPrefix}-${n}`)) {
        n += 1
      }
      fixes.push({ id: b.id, billPrefix: `${b.billPrefix}-${n}` })
    } else {
      seen.add(key)
    }
  }
  for (const f of fixes) {
    await db.branch.update({ where: { id: f.id }, data: { billPrefix: f.billPrefix } })
    console.log(`  branch ${f.id}: billPrefix collision → renamed to ${f.billPrefix}`)
  }
  return fixes.length
}

async function backfillPayments(): Promise<number> {
  // Bills with no payment rows — computed via the relation, so re-runs and
  // concurrent creates are naturally excluded.
  const orphans = await db.transaction.findMany({
    where: { payments: { none: {} } },
    select: {
      id: true,
      paymentMethod: true,
      total: true,
      tipAmount: true,
      branchId: true,
      tenantId: true,
      createdAt: true,
    },
  })

  for (const t of orphans) {
    // A legacy single-method bill settled its whole (ex-tip) total via one
    // method. tipAmount defaults to 0 on legacy rows after the migration.
    await db.transactionPayment.create({
      data: {
        transactionId: t.id,
        method: t.paymentMethod === "SPLIT" ? "CASH" : t.paymentMethod, // defensive: legacy rows are never SPLIT
        amount: round2(t.total - t.tipAmount),
        branchId: t.branchId,
        tenantId: t.tenantId,
        createdAt: t.createdAt,
      },
    })
  }
  return orphans.length
}

async function main() {
  console.log("→ checking branch billPrefix collisions…")
  const fixes = await fixBranchPrefixCollisions()
  console.log(`  ${fixes === 0 ? "none found" : `${fixes} fixed`}`)

  console.log("→ backfilling TransactionPayment rows…")
  const count = await backfillPayments()
  console.log(`  ${count === 0 ? "nothing to do (already backfilled)" : `${count} bills backfilled`}`)

  // Verify: every transaction must now have ≥ 1 payment row.
  const stillOrphan = await db.transaction.count({ where: { payments: { none: {} } } })
  const paymentRows = await db.transactionPayment.count()
  const transactions = await db.transaction.count()
  console.log(`✓ ${paymentRows} payment rows across ${transactions} transactions · orphans remaining: ${stillOrphan}`)
  if (stillOrphan > 0) {
    console.error("✗ FAILED — some transactions still have no payment rows")
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
