/**
 * SaloonX seed — multi-tenant demo data (idempotent).
 * Run: bun prisma/seed.ts  (or bun run db:seed)
 *
 * Identity: Firebase Auth (email/password). Every seeded user gets a REAL
 * Firebase account (created via the Identity Toolkit REST API); the demo
 * password for all accounts is `saloon123`. Hierarchy: SUPER_ADMIN (platform)
 * → Tenant (franchise: name, logo, active) → Branch (per-city outlet) →
 * ADMIN/STAFF via UserBranch assignments. Customers + menu are FRANCHISE-scoped;
 * prices per-branch via ServiceOverride.
 */
import { readFileSync } from "fs"
import { db } from "../src/lib/db"
import { ensureFirebaseUser } from "./firebase-seed-helper"

const DEMO_PASSWORD = "saloon123"

// Deterministic PRNG so reseeding produces the same demo data.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260214)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
const round2 = (n: number) => Math.round(n * 100) / 100

function pickMethod(): "CASH" | "UPI" | "CARD" {
  const r = rand()
  if (r < 0.45) return "UPI"
  if (r < 0.8) return "CASH"
  return "CARD"
}

const asset = (name: string) => {
  try {
    return readFileSync(`${process.cwd()}/seed-assets/${name}.b64.txt`, "utf-8").trim()
  } catch {
    return null
  }
}

// ─── Catalogs per franchise ──────────────────────────────────────────────────

type CatalogSpec = { name: string; services: [string, number, number][] }[]

const GLOW_CATALOG: CatalogSpec = [
  {
    name: "Hair Cutting & Styling",
    services: [
      ["Haircut (Men)", 150, 30],
      ["Haircut (Women)", 300, 45],
      ["Hair Wash & Blow Dry", 200, 25],
      ["Kids Haircut", 100, 20],
      ["Layer Cut", 350, 45],
      ["Hair Straightening", 1500, 90],
    ],
  },
  {
    name: "Shaving & Beard",
    services: [
      ["Clean Shave", 80, 15],
      ["Beard Trim & Shape", 120, 20],
      ["Royal Shave", 180, 25],
      ["Beard Spa", 250, 30],
    ],
  },
  {
    name: "Facial & Cleanup",
    services: [
      ["Fruit Facial", 500, 45],
      ["Gold Facial", 800, 60],
      ["De-Tan Cleanup", 350, 30],
      ["Men's Cleanup", 300, 30],
    ],
  },
  {
    name: "Hair Color",
    services: [
      ["Root Touch-up", 400, 40],
      ["Full Head Color", 1200, 90],
      ["Highlights", 2000, 120],
      ["Grey Coverage", 900, 75],
    ],
  },
  {
    name: "Head Massage & Spa",
    services: [
      ["Head Massage", 200, 20],
      ["Champi (Oil Massage)", 250, 30],
      ["Shoulder Massage", 300, 25],
      ["Aroma Therapy", 600, 45],
    ],
  },
  {
    name: "Packages",
    services: [
      ["Haircut + Beard", 250, 40],
      ["Haircut + Facial", 700, 70],
      ["Groom Package", 2500, 150],
      ["Monthly Combo", 999, 120],
    ],
  },
]

const URBAN_CATALOG: CatalogSpec = [
  {
    name: "Cuts",
    services: [
      ["Signature Cut", 250, 30],
      ["Skin Fade", 300, 35],
      ["Buzz Cut", 150, 15],
      ["Kids Cut", 120, 20],
    ],
  },
  {
    name: "Beard & Shave",
    services: [
      ["Beard Sculpt", 180, 25],
      ["Hot Towel Shave", 220, 30],
      ["Beard Colour", 350, 40],
    ],
  },
  {
    name: "Grooming",
    services: [
      ["Hair Tattoo", 100, 15],
      ["Scalp Therapy", 450, 40],
      ["Dandruff Treatment", 550, 45],
    ],
  },
  {
    name: "Packages",
    services: [
      ["Cut + Beard", 400, 55],
      ["The Full Works", 999, 90],
    ],
  },
]

const BRONZE_CATALOG: CatalogSpec = [
  {
    name: "Style Studio",
    services: [
      ["Designer Haircut", 650, 60],
      ["Balayage", 4500, 180],
      ["Keratin Treatment", 3500, 150],
      ["Blowout", 500, 40],
    ],
  },
  {
    name: "Skin & Face",
    services: [
      ["Hydra Facial", 2200, 75],
      ["Vitamin C Glow", 1500, 60],
      ["Men's Express Glow", 900, 40],
    ],
  },
  {
    name: "Rituals",
    services: [
      ["Aroma Head Ritual", 800, 40],
      ["Shoulder De-stress", 950, 45],
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SeededService {
  id: string
  name: string
  price: number
  categoryId: string
}

interface SeededBranch {
  id: string
  name: string
  prefix: string
  counter: number
  gstEnabled: boolean
  gstPct: number
  /** effective menu for this branch: serviceId -> { price, active } */
  effective: Map<string, { price: number; active: boolean }>
  users: string[] // user ids that work here
}

async function seedTenant(opts: {
  name: string
  logo: string | null
  catalog: CatalogSpec
  branches: {
    name: string
    city: string
    address: string
    phone: string
    upiId: string
    prefix: string
    gstEnabled?: boolean
    footer: string
    ownerMobile?: string
    /** service name -> override price (franchise default otherwise) */
    priceOverrides?: Record<string, number>
    /** service names unavailable at this branch */
    disabled?: string[]
  }[]
  staff: { name: string; email: string; role: "ADMIN" | "STAFF"; branchIdx: number[]; commissionPct?: number }[]
  customers: [string, string | null, number, string?][] // mobile, name, bills, birthday (MM-DD)
  txnCount: number
  todayMin: number
  expenseBudget?: number
}) {
  const tenant = await db.tenant.create({ data: { name: opts.name, logo: opts.logo } })

  // Franchise menu
  const services: SeededService[] = []
  for (let i = 0; i < opts.catalog.length; i++) {
    const spec = opts.catalog[i]
    const category = await db.category.create({ data: { tenantId: tenant.id, name: spec.name, sortOrder: i } })
    for (const [name, price, durationMin] of spec.services) {
      const svc = await db.service.create({
        data: { tenantId: tenant.id, name, price, durationMin, categoryId: category.id },
      })
      services.push({ id: svc.id, name: svc.name, price: svc.price, categoryId: category.id })
    }
  }

  // Branches + overrides
  const branches: SeededBranch[] = []
  for (const b of opts.branches) {
    const branch = await db.branch.create({
      data: {
        tenantId: tenant.id,
        name: b.name,
        city: b.city,
        address: b.address,
        phone: b.phone,
        upiId: b.upiId,
        ownerMobile: b.ownerMobile ?? null,
        billPrefix: b.prefix,
        gstEnabled: b.gstEnabled ?? false,
        gstPct: b.gstEnabled ? 18 : 0,
        receiptFooter: b.footer,
        // Seeded branches are already live — approved by the platform.
        approved: true,
        approvedAt: new Date(),
      },
    })
    const effective = new Map<string, { price: number; active: boolean }>()
    for (const s of services) {
      const op = b.priceOverrides?.[s.name]
      const off = b.disabled?.includes(s.name) ?? false
      effective.set(s.id, { price: op ?? s.price, active: !off })
      if (op !== undefined || off) {
        await db.serviceOverride.create({
          data: { serviceId: s.id, branchId: branch.id, price: op ?? null, active: off ? false : null },
        })
      }
    }
    branches.push({ id: branch.id, name: b.name, prefix: b.prefix, counter: 0, gstEnabled: b.gstEnabled ?? false, gstPct: b.gstEnabled ? 18 : 0, effective, users: [] })
  }

  // Staff + branch access — each gets a REAL Firebase login (password: saloon123)
  const users: { id: string; name: string }[] = []
  for (const s of opts.staff) {
    const uid = await ensureFirebaseUser({ email: s.email, password: DEMO_PASSWORD, name: s.name })
    const u = await db.user.create({
      data: {
        name: s.name,
        email: s.email,
        firebaseUid: uid ?? `pending:${s.email}`,
        role: s.role,
        tenantId: tenant.id,
        commissionPct: s.commissionPct ?? (s.role === "STAFF" ? 10 : 0),
      },
    })
    users.push(u)
  }
  for (let i = 0; i < users.length; i++) {
    const s = opts.staff[i]
    for (const bi of s.branchIdx) {
      await db.userBranch.create({ data: { userId: users[i].id, branchId: branches[bi].id } })
      branches[bi].users.push(users[i].id)
    }
  }

  // Customers (franchise-wide — recognised at any branch)
  const customers: { id: string; mobile: string; name: string | null; bills: number }[] = []
  for (const [mobile, name, bills, birthday] of opts.customers) {
    const c = await db.customer.create({ data: { tenantId: tenant.id, mobile, name, birthday: birthday ?? null } })
    customers.push({ id: c.id, mobile, name, bills })
  }

  // ── Transactions ──
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  interface Planned {
    dayOffset: number
    hour: number
    minute: number
    branchIdx: number
    staffIdx: number
    customer: { id: string; mobile: string; name: string | null } | null
  }
  const planned: Planned[] = []
  const add = (dayOffset: number, branchIdx: number, customer: Planned["customer"]) => {
    const branch = branches[branchIdx]
    planned.push({
      dayOffset,
      hour: randInt(10, 20),
      minute: randInt(0, 59),
      branchIdx,
      staffIdx: branch.users.length > 0 ? randInt(0, branch.users.length - 1) : 0,
      customer,
    })
  }

  // Customer bills: the first couple of visits land in the recent window
  // (lively dashboards), older visits spread back over ~5 months so the
  // monthly profit-trend chart has real history. Big franchises distribute
  // across branches.
  const dayOffsets = Array.from({ length: 14 }, (_, i) => 13 - i)
  let seq = 0
  for (const c of customers) {
    const days = [...dayOffsets]
    for (let v = 0; v < c.bills; v++) {
      const dayOffset =
        v === 0 && c.bills > 3
          ? 0
          : v < 2 || c.bills <= 3
            ? days.splice(randInt(0, days.length - 1), 1)[0] ?? randInt(1, 13)
            : randInt(15, 150)
      const branchIdx = randInt(0, branches.length - 1)
      add(dayOffset, branchIdx, { id: c.id, mobile: c.mobile, name: c.name })
      seq++
    }
  }
  // Walk-ins to reach the target count — ~45% in the recent window, the
  // rest across the 5-month history (the trend chart needs them).
  for (let w = seq; w < opts.txnCount; w++) {
    add(rand() < 0.45 ? randInt(0, 13) : randInt(15, 150), randInt(0, branches.length - 1), null)
  }
  // Guarantee a lively "today" at the first branch (dashboard default)
  const todayCount = () => planned.filter((p) => p.dayOffset === 0 && p.branchIdx === 0).length
  for (let i = todayCount(); i < opts.todayMin; i++) {
    const c = rand() < 0.6 ? pick(customers) : null
    add(0, 0, c ? { id: c.id, mobile: c.mobile, name: c.name } : null)
  }

  planned.sort((a, b) =>
    a.dayOffset === b.dayOffset ? a.hour * 60 + a.minute - (b.hour * 60 + b.minute) : b.dayOffset - a.dayOffset,
  )

  for (const p of planned) {
    const branch = branches[p.branchIdx]
    branch.counter += 1
    const billNo = `${branch.prefix}-${String(branch.counter).padStart(4, "0")}`

    const createdAt = new Date(startOfToday)
    createdAt.setDate(createdAt.getDate() - p.dayOffset)
    createdAt.setHours(p.hour, p.minute, randInt(0, 59), 0)

    // Only services that are ACTIVE at this branch, billed at the branch price
    const menu = services.filter((s) => branch.effective.get(s.id)?.active)
    const itemCount = randInt(1, 3)
    const chosen: { id: string; name: string; price: number; qty: number }[] = []
    const usedIds = new Set<string>()
    for (let i = 0; i < itemCount && menu.length > 0; i++) {
      const svc = pick(menu)
      if (usedIds.has(svc.id)) continue
      usedIds.add(svc.id)
      chosen.push({ id: svc.id, name: svc.name, price: branch.effective.get(svc.id)!.price, qty: rand() < 0.15 ? 2 : 1 })
    }

    const subtotal = round2(chosen.reduce((s, it) => s + it.price * it.qty, 0))
    const discountPct = p.customer !== null && rand() < 0.3 ? 10 : 0
    const discountAmount = round2((subtotal * discountPct) / 100)
    const gstAmount = branch.gstEnabled ? round2(((subtotal - discountAmount) * branch.gstPct) / 100) : 0
    const total = round2(subtotal - discountAmount + gstAmount)

    const staffUser = users.find((u) => u.id === branch.users[p.staffIdx]) ?? users[0]
    if (!staffUser) continue

    await db.transaction.create({
      data: {
        billNo,
        tenantId: tenant.id,
        branchId: branch.id,
        branchName: branch.name,
        customerId: p.customer?.id ?? null,
        customerMobile: p.customer?.mobile ?? null,
        customerName: p.customer?.name ?? null,
        staffId: staffUser.id,
        staffName: staffUser.name,
        subtotal,
        discountPct,
        discountAmount,
        gstPct: branch.gstEnabled ? branch.gstPct : 0,
        gstAmount,
        total,
        paymentMethod: pickMethod(),
        status: "COMPLETED",
        createdAt,
        items: {
          create: chosen.map((it) => ({ serviceId: it.id, serviceName: it.name, price: it.price, qty: it.qty })),
        },
      },
    })
  }

  // Persist per-branch bill counters so live billing continues after the seeded numbers.
  for (const branch of branches) {
    await db.branch.update({ where: { id: branch.id }, data: { billCounter: branch.counter } })
  }

  // ── Birthday-campaign history ──
  // For every customer whose birthday occurred in the last ~6 months:
  // ~65% were WhatsApp-wished (lastWishAt ≈ 2d before the birthday), and of
  // those ~55% came back within 14 days (a birthday-visit bill). Gives the
  // dashboard's Birthday-campaigns analytics card a real funnel on day one.
  const staffedBranches = branches.filter((b) => b.users.length > 0)
  for (const c of customers) {
    const bd = opts.customers.find(([mobile]) => mobile === c.mobile)?.[3]
    if (!bd || staffedBranches.length === 0) continue
    const [mm, dd] = bd.split("-").map(Number)
    let occ = new Date(startOfToday.getFullYear(), mm - 1, dd)
    if (occ > startOfToday) occ = new Date(startOfToday.getFullYear() - 1, mm - 1, dd)
    const daysAgo = Math.round((startOfToday.getTime() - occ.getTime()) / 86_400_000)
    if (daysAgo > 200) continue

    if (rand() < 0.65) {
      await db.customer.update({
        where: { id: c.id },
        data: { lastWishAt: new Date(occ.getTime() - randInt(1, 3) * 86_400_000) },
      })
      if (rand() < 0.55) {
        // Winning visit — a real bill a few days after the birthday.
        const branch = staffedBranches[randInt(0, staffedBranches.length - 1)]
        const staffUser = users.find((u) => branch.users.includes(u.id))
        if (!staffUser) continue
        const menu = services.filter((s) => branch.effective.get(s.id)?.active)
        if (menu.length === 0) continue
        const svc = pick(menu)
        const price = branch.effective.get(svc.id)!.price
        branch.counter += 1
        const billNo = `${branch.prefix}-${String(branch.counter).padStart(4, "0")}`
        const createdAt = new Date(occ.getTime() + randInt(1, 12) * 86_400_000 + randInt(10, 18) * 3_600_000)
        const subtotal = round2(price * (rand() < 0.2 ? 2 : 1))
        const gstAmount = branch.gstEnabled ? round2((subtotal * branch.gstPct) / 100) : 0
        await db.transaction.create({
          data: {
            billNo,
            tenantId: tenant.id,
            branchId: branch.id,
            branchName: branch.name,
            customerId: c.id,
            customerMobile: c.mobile,
            customerName: c.name,
            staffId: staffUser.id,
            staffName: staffUser.name,
            subtotal,
            discountPct: 0,
            discountAmount: 0,
            gstPct: branch.gstEnabled ? branch.gstPct : 0,
            gstAmount,
            total: round2(subtotal + gstAmount),
            paymentMethod: pickMethod(),
            note: "Birthday treat 🎂",
            status: "COMPLETED",
            createdAt,
            items: { create: [{ serviceId: svc.id, serviceName: svc.name, price, qty: subtotal / price > 1.8 ? 2 : 1 }] },
          },
        })
      }
    }
  }
  // Persist counters again (birthday visits may have bumped them).
  for (const branch of branches) {
    await db.branch.update({ where: { id: branch.id }, data: { billCounter: branch.counter } })
  }

  // Recompute customer aggregates + branch-visit colour
  for (const c of customers) {
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
    const byBranch = new Map<string, { name: string; at: Date }>()
    for (const t of txns) {
      const cur = byBranch.get(t.branchId)
      if (!cur || t.createdAt < cur.at) byBranch.set(t.branchId, { name: t.branchName, at: t.createdAt })
    }
    for (const [branchId, info] of byBranch) {
      await db.branchVisit.create({ data: { customerId: c.id, branchId, branchName: info.name, visitedAt: info.at } })
    }
  }

  // ── Expenses (per branch, recurring monthly for the last 5 months) ──
  // The current month carries the full baseline; older months ~60% of it
  // (ramping salon) — keeps every month on the trend chart believable.
  const budget = opts.expenseBudget ?? 0
  if (budget > 0) {
    const kinds: { category: string; description: string; weight: number }[] = [
      { category: "RENT", description: "Monthly rent", weight: 0.2 },
      { category: "SALARY", description: "Stylist salaries & payouts", weight: 0.1 },
      { category: "SUPPLIES", description: "Shampoo, colour & consumables", weight: 0.08 },
      { category: "UTILITY", description: "Electricity & water", weight: 0.05 },
      { category: "MARKETING", description: "Local Instagram ads", weight: 0.035 },
      { category: "MAINTENANCE", description: "Chair & dryer servicing", weight: 0.035 },
    ]
    for (let bi = 0; bi < branches.length; bi++) {
      const share = branches.length > 1 ? (bi === 0 ? 0.5 : 0.5 / (branches.length - 1)) : 1
      for (let m = 5; m >= 0; m--) {
        const monthStart = new Date(startOfToday.getFullYear(), startOfToday.getMonth() - m, 1)
        const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate()
        const monthWeight = m === 0 ? 1 : 0.6
        for (const k of kinds) {
          // Never in the future: cap the current month at today.
          const maxDay = m === 0 ? startOfToday.getDate() : daysInMonth
          const day = Math.max(1, Math.min(randInt(2, Math.max(2, daysInMonth - 2)), maxDay))
          const date = new Date(monthStart)
          date.setDate(day)
          await db.expense.create({
            data: {
              branchId: branches[bi].id,
              category: k.category,
              description: k.description,
              amount: round2(budget * k.weight * share * monthWeight * (0.85 + rand() * 0.3)),
              date,
              createdByName: opts.staff[0].name,
            },
          })
        }
      }
    }
  }

  return { tenant, branches, users, services, customers }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const existing = await db.tenant.count()
  const existingUsers = await db.user.count()
  if (existing > 0 || existingUsers > 0) {
    console.log("Database already seeded — skipping.")
    return
  }

  console.log("Seeding SaloonX multi-tenant demo data…")

  // Platform super admin (the developer) — real Firebase login
  const devUid = await ensureFirebaseUser({ email: "dev@saloonx.example", password: DEMO_PASSWORD, name: "Dev (Platform)" })
  await db.user.create({
    data: {
      name: "Dev (Platform)",
      email: "dev@saloonx.example",
      firebaseUid: devUid ?? "pending:dev@saloonx.example",
      role: "SUPER_ADMIN",
    },
  })

  // ── Franchise 1: Glow & Go Salons — 3 branches, 2 cities �──
  await seedTenant({
    name: "Glow & Go Salons",
    logo: asset("glowgo"),
    catalog: GLOW_CATALOG,
    branches: [
      {
        name: "Glow & Go — Andheri West",
        city: "Mumbai",
        address: "Shop 4, Lokhandwala Complex, Andheri West, Mumbai 400053",
        phone: "+91 98765 10001",
        upiId: "glowgo.andheri@okhdfcbank",
        ownerMobile: "9876500001",
        prefix: "GG1",
        footer: "Thank you for visiting Glow & Go! Follow @glowandgo on Instagram.",
      },
      {
        name: "Glow & Go — Bandra",
        city: "Mumbai",
        address: "Unit 7, Waterfield Road, Bandra West, Mumbai 400050",
        phone: "+91 98765 10002",
        upiId: "glowgo.bandra@okicici",
        ownerMobile: "9876500002",
        prefix: "GG2",
        gstEnabled: true,
        footer: "Glow & Go Bandra — GST invoices available on request.",
        // Premium location: ~15% up on hair services, a few others tweaked
        priceOverrides: {
          "Haircut (Men)": 180,
          "Haircut (Women)": 350,
          "Layer Cut": 400,
          "Hair Wash & Blow Dry": 250,
          "Hair Straightening": 1800,
          "Full Head Color": 1400,
          "Gold Facial": 950,
          "Groom Package": 2900,
        },
      },
      {
        name: "Glow & Go — Koramangala",
        city: "Bengaluru",
        address: "90 Feet Road, 4th Block, Koramangala, Bengaluru 560034",
        phone: "+91 98765 10003",
        upiId: "glowgo.koramangala@okaxis",
        ownerMobile: "9876500003",
        prefix: "GG3",
        footer: "Glow & Go Koramangala — see you again soon!",
        priceOverrides: { "Haircut (Men)": 160, "Fruit Facial": 450, "Head Massage": 180 },
        disabled: ["Hair Straightening", "Royal Shave"], // specialist services only at Mumbai branches
      },
    ],
    staff: [
      { name: "Ravi (Owner)", email: "ravi@glowgo.example", role: "ADMIN", branchIdx: [0, 1, 2] },
      { name: "Priya", email: "priya@glowgo.example", role: "STAFF", branchIdx: [0], commissionPct: 10 },
      { name: "Amit", email: "amit@glowgo.example", role: "STAFF", branchIdx: [0, 1], commissionPct: 7.5 },
      { name: "Neha", email: "neha@glowgo.example", role: "STAFF", branchIdx: [2], commissionPct: 10 },
    ],
    customers: [
      ["9876543210", "Rahul Sharma", 8, "10-12"],
      ["9812345678", "Sneha Patel", 2, "10-15"],
      ["9900112233", "Vikram Singh", 5, "11-03"],
      ["9765432109", "Anjali Verma", 2, "03-21"],
      ["9845012345", "Mohammed Ali", 11, "10-18"],
      ["9922334455", "Kavita Joshi", 6, "12-01"],
      // Birthday-campaign history (wishes + winning visits are seeded by the
      // campaign step in seedTenant — birthdays spread across the last 6 months).
      ["9820011221", "Pooja Nair", 2, "05-20"],
      ["9820011222", "Arjun Deshmukh", 3, "06-08"],
      ["9820011223", "Divya Menon", 2, "09-11"],
      ["9820011224", "Farhan Sheikh", 2, "08-02"],
      ["9820011225", "Meera Iyer", 3, "07-15"],
      ["9820011226", "Sameer Kulkarni", 2, "09-25"],
      ["9820011227", "Nikhil Rao", 1, "08-27"],
      ["9820011228", "Aisha Khan", 1, "09-25"],
    ],
    txnCount: 120,
    todayMin: 7,
    expenseBudget: 60000,
  })

  // ── Franchise 2: UrbanCuts — 2 branches, Delhi NCR ──
  await seedTenant({
    name: "UrbanCuts",
    logo: asset("urbancuts"),
    catalog: URBAN_CATALOG,
    branches: [
      {
        name: "UrbanCuts — Connaught Place",
        city: "New Delhi",
        address: "N-14, First Floor, Connaught Place, New Delhi 110001",
        phone: "+91 98111 20001",
        upiId: "urbancuts.cp@paytm",
        ownerMobile: "9811100001",
        prefix: "UC1",
        footer: "UrbanCuts CP — walk-ins welcome till 9 PM.",
      },
      {
        name: "UrbanCuts — Sector 29",
        city: "Gurugram",
        address: "SCO 22, Sector 29 Market, Gurugram 122001",
        phone: "+91 98111 20002",
        upiId: "urbancuts.s29@ybl",
        ownerMobile: "9811100002",
        prefix: "UC2",
        footer: "UrbanCuts Sector 29 — see you soon!",
        priceOverrides: { "Signature Cut": 300, "Skin Fade": 350, "Cut + Beard": 450 },
      },
    ],
    staff: [
      { name: "Arjun (Owner)", email: "arjun@urbancuts.example", role: "ADMIN", branchIdx: [0, 1] },
      { name: "Kabir", email: "kabir@urbancuts.example", role: "STAFF", branchIdx: [0], commissionPct: 12 },
      { name: "Dev", email: "dev@urbancuts.example", role: "STAFF", branchIdx: [1], commissionPct: 12 },
    ],
    customers: [
      ["9899988888", "Ishan Gupta", 6, "01-26"],
      ["9811122233", "Rohan Mehta", 3, "10-17"],
      ["9873211234", "Aditya Rao", 4, "07-09"],
      ["9899977771", "Neha Kapoor", 2, "06-21"],
      ["9899977772", "Kunal Verma", 2, "08-15"],
    ],
    txnCount: 80,
    todayMin: 4,
    expenseBudget: 40000,
  })

  // ── Franchise 3: Blunt & Bronze — 1 boutique branch, Hyderabad ──
  await seedTenant({
    name: "Blunt & Bronze",
    logo: asset("bronzeblunt"),
    catalog: BRONZE_CATALOG,
    branches: [
      {
        name: "Blunt & Bronze — Jubilee Hills",
        city: "Hyderabad",
        address: "Road No. 36, Jubilee Hills, Hyderabad 500033",
        phone: "+91 99666 30001",
        upiId: "bluntbronze.jh@okaxis",
        ownerMobile: "9966600001",
        prefix: "BB",
        gstEnabled: true,
        footer: "Blunt & Bronze — luxury you can feel.",
      },
    ],
    staff: [{ name: "Meera (Owner)", email: "meera@bluntbronze.example", role: "ADMIN", branchIdx: [0] }],
    customers: [
      ["9966554433", "Sana Reddy", 4, "10-14"],
      ["9959887766", "Tarun Kapoor", 2, "05-30"],
      ["9812345601", "Riya Malhotra", 1, "07-28"],
    ],
    txnCount: 60,
    todayMin: 3,
    expenseBudget: 30000,
  })

  // ── Demo of the branch-approval workflow ──
  // Ravi (franchise admin) just opened a 4th outlet; it stays invisible to
  // billing until the super admin approves it.
  const glowTenant = await db.tenant.findFirst({ where: { name: "Glow & Go Salons" } })
  if (glowTenant) {
    await db.branch.create({
      data: {
        tenantId: glowTenant.id,
        name: "Glow & Go — Powai",
        city: "Mumbai",
        address: "Galleria Mall, Powai, Mumbai 400076",
        phone: "+91 98765 10004",
        upiId: "glowgo.powai@okhdfcbank",
        billPrefix: "GG4",
        approved: false, // ← awaiting super admin approval
      },
    })
  }

  const counts = {
    tenants: await db.tenant.count(),
    branches: await db.branch.count(),
    users: await db.user.count(),
    services: await db.service.count(),
    transactions: await db.transaction.count(),
    customers: await db.customer.count(),
    overrides: await db.serviceOverride.count(),
    expenses: await db.expense.count(),
    announcements: await db.announcement.count(),
  }

  // ── Announcement feed demo (bell menu) ──
  // Historic notes (welcome / branch approvals) + one fresh platform notice so
  // every role sees a populated bell; approving Powai in the platform console
  // then generates a live BRANCH_APPROVED banner during demos.
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)
  const urbanTenant = await db.tenant.findFirst({ where: { name: "UrbanCuts" } })
  const bbTenant = await db.tenant.findFirst({ where: { name: "Blunt & Bronze" } })
  if (glowTenant) {
    await db.announcement.createMany({
      data: [
        {
          tenantId: glowTenant.id,
          kind: "WELCOME",
          title: "Welcome to SaloonX, Glow & Go Salons! ✂️",
          body: "Your first branch is live and ready to bill. Add services under Menu & Prices, invite staff under Staff, and set your UPI ID in Settings so QR payments work.",
          createdAt: daysAgo(160),
        },
        {
          tenantId: glowTenant.id,
          kind: "BRANCH_APPROVED",
          title: "Glow & Go — Bandra is live! 🎉",
          body: "The platform approved Glow & Go — Bandra (Mumbai). Bills there start at GG2-0001 — assign staff from Menu → Staff if you haven't already.",
          createdAt: daysAgo(84),
        },
        {
          tenantId: glowTenant.id,
          kind: "INFO",
          title: "Festive season price kit is here 🪔",
          body: "Diwali is around the corner — the platform added ready-made festive packages (Haircut + Facial combos) you can enable per branch under Menu & Prices. Great for upselling during the rush.",
          createdAt: daysAgo(2),
        },
      ],
    })
  }
  if (urbanTenant) {
    await db.announcement.create({
      data: {
        tenantId: urbanTenant.id,
        kind: "WELCOME",
        title: "Welcome to SaloonX, UrbanCuts! ✂️",
        body: "Connaught Place is live and ready to bill. Add services, invite staff and set your UPI ID to unlock QR payments.",
        createdAt: daysAgo(120),
      },
    })
  }
  if (bbTenant) {
    await db.announcement.create({
      data: {
        tenantId: bbTenant.id,
        kind: "WELCOME",
        title: "Welcome to SaloonX, Blunt & Bronze! ✂️",
        body: "Jubilee Hills is live and ready to bill. GST is enabled on your profile — receipts print tax-inclusive by default.",
        createdAt: daysAgo(95),
      },
    })
  }

  counts.announcements = await db.announcement.count()
  console.log("Seed complete:", counts)
  console.log("")
  console.log("Firebase Auth logins (password for every account: saloon123)")
  console.log("  Platform  — dev@saloonx.example")
  console.log("  Glow & Go — ravi@glowgo.example (admin, 3 branches) · priya@ · amit@ · neha@")
  console.log("  UrbanCuts — arjun@urbancuts.example (admin) · kabir@ · dhruv@")
  console.log("  B&B       — meera@bluntbronze.example (admin)")
  console.log("  Note: 'Glow & Go — Powai' is seeded PENDING approval (super admin approves it).")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
