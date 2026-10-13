/**
 * One-off patch: birthday campaign history for the LIVE database.
 *
 * Adds demo customers whose birthdays fell across the last ~6 months with
 * tracked WhatsApp wishes (lastWishAt) and, for the lucky ones, a salon
 * visit within 14 days after the birthday — so the dashboard's new
 * "Birthday campaigns" analytics card tells a real story on first render.
 *
 * IDEMPOTENT: customers are keyed on (tenantId, mobile) — re-running is safe.
 * Run: bun run prisma/patch-birthday-campaign.ts
 */
import { db } from "../src/lib/db"

const round2 = (n: number) => Math.round(n * 100) / 100
const METHODS = ["CASH", "UPI", "UPI", "CARD"] as const

interface CampaignSpec {
  mobile: string
  name: string
  birthday: string // MM-DD whose latest occurrence is inside the window
  /** Wish tracked this many days BEFORE the birthday (null = never wished). */
  wishDaysBefore: number | null
  /** Visit this many days AFTER the birthday (null = never came). */
  visitDaysAfter: number | null
  /** Extra baseline bills spread over recent months. */
  baselineBills: number
  /** Rough per-bill value for baseline + birthday visit. */
  billValue: number
}

const GLOW_GO: CampaignSpec[] = [
  // Won conversions — wished, came back, paid
  { mobile: "9820011221", name: "Pooja Nair", birthday: "05-20", wishDaysBefore: 2, visitDaysAfter: 4, baselineBills: 2, billValue: 1100 },
  { mobile: "9820011222", name: "Arjun Deshmukh", birthday: "06-08", wishDaysBefore: 3, visitDaysAfter: 2, baselineBills: 3, billValue: 900 },
  { mobile: "9820011223", name: "Divya Menon", birthday: "09-11", wishDaysBefore: 2, visitDaysAfter: 5, baselineBills: 2, billValue: 1900 },
  { mobile: "9820011227", name: "Nikhil Rao", birthday: "08-27", wishDaysBefore: 1, visitDaysAfter: 6, baselineBills: 1, billValue: 700 },
  // Wished but didn't come — the "worked harder" bucket
  { mobile: "9820011224", name: "Farhan Sheikh", birthday: "08-02", wishDaysBefore: 3, visitDaysAfter: null, baselineBills: 2, billValue: 1300 },
  { mobile: "9820011228", name: "Aisha Khan", birthday: "09-25", wishDaysBefore: 2, visitDaysAfter: null, baselineBills: 1, billValue: 850 },
  // Missed entirely — nobody wished, nobody came (missed-opportunity list)
  { mobile: "9820011225", name: "Meera Iyer", birthday: "07-15", wishDaysBefore: null, visitDaysAfter: null, baselineBills: 3, billValue: 1600 },
  { mobile: "9820011226", name: "Sameer Kulkarni", birthday: "09-25", wishDaysBefore: null, visitDaysAfter: null, baselineBills: 2, billValue: 950 },
]

const URBANCUTS: CampaignSpec[] = [
  { mobile: "9899977771", name: "Neha Kapoor", birthday: "06-21", wishDaysBefore: 2, visitDaysAfter: 3, baselineBills: 2, billValue: 800 },
  { mobile: "9899977772", name: "Kunal Verma", birthday: "08-15", wishDaysBefore: null, visitDaysAfter: null, baselineBills: 2, billValue: 650 },
]

const BLUNT_BRONZE: CampaignSpec[] = [
  { mobile: "9812345601", name: "Riya Malhotra", birthday: "07-28", wishDaysBefore: 2, visitDaysAfter: 4, baselineBills: 1, billValue: 3200 },
]

/** Latest occurrence of MM-DD strictly before today (for in-window birthdays). */
function lastOccurrence(mmdd: string, today: Date): Date {
  const [mm, dd] = mmdd.split("-").map(Number)
  let occ = new Date(today.getFullYear(), mm - 1, dd)
  if (occ > today) occ = new Date(today.getFullYear() - 1, mm - 1, dd)
  return occ
}

async function upsertCampaignHistory(tenantName: string, specs: CampaignSpec[]) {
  const tenant = await db.tenant.findFirst({ where: { name: tenantName } })
  if (!tenant) {
    console.log(`!! tenant "${tenantName}" not found — skipped`)
    return
  }
  const branches = await db.branch.findMany({
    where: { tenantId: tenant.id, approved: true, active: true },
    include: { users: { include: { user: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "asc" },
  })
  const services = await db.service.findMany({
    where: { tenantId: tenant.id },
    include: { overrides: true },
    orderBy: { price: "asc" },
  })
  if (branches.length === 0 || services.length === 0) return

  const today = new Date()
  today.setHours(23, 59, 59, 0)
  let createdCustomers = 0
  let createdBills = 0

  for (const spec of specs) {
    // Idempotency: skip if this mobile already exists in the tenant.
    const existing = await db.customer.findFirst({ where: { tenantId: tenant.id, mobile: spec.mobile } })
    if (existing) {
      console.log(`   = ${spec.name} already present — skipped`)
      continue
    }

    const occ = lastOccurrence(spec.birthday, today)
    const daysAgo = Math.round((today.getTime() - occ.getTime()) / 86_400_000)
    if (daysAgo > 200) continue // out of any sane window

    const c = await db.customer.create({
      data: { tenantId: tenant.id, mobile: spec.mobile, name: spec.name, birthday: spec.birthday },
    })
    createdCustomers += 1

    // Branch: rotate deterministically by mobile sum so each campaign customer
    // has a believable "home" branch — but ONLY among staffed branches (Powai
    // has no staff yet; bills there would be orphaned).
    const staffed = branches.filter((b) => b.users.length > 0)
    if (staffed.length === 0) continue
    const branch = staffed[spec.mobile.split("").reduce((s, ch) => s + Number(ch), 0) % staffed.length]
    const staff = branch.users[0]?.user
    if (!staff) continue

    // Effective price for a service at this branch (override-aware).
    const priceAt = (svcId: string, base: number) => {
      const ov = services.find((s) => s.id === svcId)?.overrides.find((o) => o.branchId === branch.id)
      if (!ov) return base
      return ov.price ?? base
    }
    const activeAt = (svcId: string) => {
      const ov = services.find((s) => s.id === svcId)?.overrides.find((o) => o.branchId === branch.id)
      return ov ? ov.active ?? true : true
    }
    const menu = services.filter((s) => activeAt(s.id))
    // Pick a service nearest to the target bill value.
    const pickService = () =>
      menu.reduce((best, s) =>
        Math.abs(priceAt(s.id, s.price) - spec.billValue) < Math.abs(priceAt(best.id, best.price) - spec.billValue) ? s : best,
      )

    const bills: { when: Date; note?: string }[] = []
    // Birthday-winning visit (or not)
    if (spec.visitDaysAfter !== null) {
      bills.push({
        when: new Date(occ.getTime() + spec.visitDaysAfter * 86_400_000 + 6 * 3_600_000),
        note: "Birthday treat 🎂",
      })
    }
    // Baseline visits before the birthday (they are regulars after all)
    for (let i = 0; i < spec.baselineBills; i++) {
      const offset = daysAgo + 30 + i * 45
      bills.push({ when: new Date(today.getTime() - offset * 86_400_000 + 11 * 3_600_000) })
    }

    for (const b of bills) {
      if (b.when > today) continue
      branch.billCounter += 1
      const billNo = `${branch.billPrefix}-${String(branch.billCounter).padStart(4, "0")}`
      const svc = pickService()
      const price = priceAt(svc.id, svc.price)
      const qty = spec.billValue > price * 1.8 ? 2 : 1
      const subtotal = round2(price * qty)
      const discountPct = 0
      const gstAmount = branch.gstEnabled ? round2((subtotal * branch.gstPct) / 100) : 0
      const total = round2(subtotal + gstAmount)
      await db.transaction.create({
        data: {
          billNo,
          tenantId: tenant.id,
          branchId: branch.id,
          branchName: branch.name,
          customerId: c.id,
          customerMobile: c.mobile,
          customerName: c.name,
          staffId: staff.id,
          staffName: staff.name,
          subtotal,
          discountPct,
          discountAmount: 0,
          gstPct: branch.gstEnabled ? branch.gstPct : 0,
          gstAmount,
          total,
          paymentMethod: METHODS[branch.billCounter % METHODS.length],
          note: b.note ?? null,
          status: "COMPLETED",
          createdAt: b.when,
          items: { create: [{ serviceId: svc.id, serviceName: svc.name, price, qty }] },
        },
      })
      createdBills += 1
    }

    // Tracked wish (2-3 days before the birthday occurrence).
    if (spec.wishDaysBefore !== null) {
      await db.customer.update({
        where: { id: c.id },
        data: { lastWishAt: new Date(occ.getTime() - spec.wishDaysBefore * 86_400_000) },
      })
    }

    console.log(
      `   + ${spec.name.padEnd(16)} bday ${spec.birthday} (${daysAgo}d ago) · wished=${spec.wishDaysBefore !== null ? `✓ ${spec.wishDaysBefore}d before` : '—'} · visit=${spec.visitDaysAfter !== null ? `✓ +${spec.visitDaysAfter}d` : '—'} · ${bills.length} bills @ ${branch.name.split("—")[1]?.trim() ?? branch.name}`,
    )
  }

  // Persist the bumped bill counters + refresh customer aggregates.
  for (const branch of branches) {
    await db.branch.update({ where: { id: branch.id }, data: { billCounter: branch.billCounter } })
  }
  for (const spec of specs) {
    const c = await db.customer.findFirst({ where: { tenantId: tenant.id, mobile: spec.mobile } })
    if (!c) continue
    const txns = await db.transaction.findMany({
      where: { customerId: c.id },
      select: { total: true, createdAt: true, branchId: true, branchName: true },
    })
    await db.customer.update({
      where: { id: c.id },
      data: {
        visits: txns.length,
        totalSpend: round2(txns.reduce((s, t) => s + t.total, 0)),
        lastVisitAt: txns.length ? txns.reduce((m, t) => (t.createdAt > m ? t.createdAt : m), txns[0].createdAt) : null,
      },
    })
    // Idempotent: only create BranchVisit rows that don't exist yet.
    const existing = await db.branchVisit.findMany({ where: { customerId: c.id }, select: { branchId: true } })
    const seen = new Set(existing.map((v) => v.branchId))
    const byBranch = new Map<string, { name: string; at: Date }>()
    for (const t of txns) {
      const cur = byBranch.get(t.branchId)
      if (!cur || t.createdAt < cur.at) byBranch.set(t.branchId, { name: t.branchName, at: t.createdAt })
    }
    for (const [branchId, info] of byBranch) {
      if (seen.has(branchId)) continue
      await db.branchVisit.create({ data: { customerId: c.id, branchId, branchName: info.name, visitedAt: info.at } })
    }
  }
  console.log(`   → ${createdCustomers} customers, ${createdBills} bills injected into ${tenantName}`)
}

async function main() {
  console.log("Birthday campaign patch — live DB\n")
  await upsertCampaignHistory("Glow & Go Salons", GLOW_GO)
  await upsertCampaignHistory("UrbanCuts", URBANCUTS)
  await upsertCampaignHistory("Blunt & Bronze", BLUNT_BRONZE)
  console.log("\nDone.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .then(() => process.exit(0))
