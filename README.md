# SaloonX — Salon Billing PWA

An ultra-simple, multi-tenant salon billing Progressive Web App built for Indian salons. Staff with zero computer experience can bill a customer in seconds; admins get full reports, catalog/staff/customer management, and exportable analytics.

![Stack](https://img.shields.io/badge/Next.js%2016-App%20Router-black) ![DB](https://img.shields.io/badge/Prisma-SQLite-blue) ![Lang](https://img.shields.io/badge/TypeScript-strict-blue)

## Highlights

- **Login** — Firebase email + password, then a one-tap branch picker for multi-branch staff.
- **3-step billing flow** — services → customer (mobile keypad + returning-customer recognition & festive discount recommendation) → payment (Cash with quick-tender chips & change calculator, UPI QR with amount, Card).
- **Receipts** — WhatsApp share (PDF), native share, PDF download, print.
- **Reports** — dashboard with revenue/bills/avg, payment split, trend charts, top services; transactions with filters; CSV & PDF exports; monthly profit trend.
- **Multi-tenant** — Platform (Super Admin) → Brands → Branches → Staff. Branch-level price overrides, per-branch bill numbering, tenant-scoped customers, tenant-level consolidated reports.
- **PWA** — installable, offline-friendly shell, works great on cheap Android phones.
- **Bilingual** — English / Hindi UI.

## Tech Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) + Framer Motion |
| State | Zustand + TanStack Query |
| DB | Prisma ORM + SQLite |
| PDF | jsPDF + jspdf-autotable |
| QR | qrcode |
| Validation | Zod |

## Quick Start

```bash
bun install
bun run db:push        # create SQLite schema
bun run db:seed        # seed demo brands/staff/data (idempotent)
bun run dev            # start on http://localhost:3000
```

Create `.env` with:

```
DATABASE_URL=file:/absolute/path/to/db/custom.db
```

## Demo Credentials (after seed)

Login is **Firebase email + password**, then multi-branch users pick their branch from a tile picker.

Password for **every** account: `saloon123`

| Role | Brand | Email |
| --- | --- | --- |
| Super Admin | Platform Console | `dev@saloonx.example` |
| Admin | Glow & Go | `ravi@glowgo.example` |
| Staff | Glow & Go | `priya@` / `amit@` / `neha@glowgo.example` |
| Admin | UrbanCuts | `arjun@urbancuts.example` |
| Staff | UrbanCuts | `kabir@` / `dev@urbancuts.example` |
| Admin | Blunt & Bronze | `meera@bluntbronze.example` |

Seed data: 3 brands (+1 pending-approval branch for the platform approval flow), 96+ transactions, 16 service price overrides, 30 expenses, 5 months of history, birthday-campaign demo customers. The seed provisions real Firebase Auth accounts (idempotent) and falls back to local-only users if Firebase is unreachable.

## QR Menu (customer-facing)

Every branch has a public menu at `/?menu=<branch-slug>` (e.g. `glow-and-go-salons-andheri-west`) — the link behind the QR code the admin prints from the **QR Menu** page. Guests who scan it get a mobile-first, Swiggy-style experience: ink hero with the salon brand, live search, category tiles with hand-drawn icons (mustache, scissors, lotus…), a floating category dock, branch-specific prices with strikethrough MRP offers, "most loved" services from real bills, WhatsApp booking, and an optional first-visit discount signup (guest registers name + mobile → coupon code). At billing, entering that mobile shows the offer banner with the code — the discount applies in one tap and redeems itself on the bill.

## Project Structure

```
prisma/            schema.prisma + idempotent seed.ts
src/app/           App Router pages (login, billing, admin, super-admin console)
src/app/api/       REST endpoints (auth, catalog, transactions, stats, customers,
                   staff, expenses, settings, tenants, branches, export, csv)
src/components/    shadcn/ui primitives + feature components
src/lib/           db client, auth guards (requireApiUser/requireApiBranch), i18n, utils
public/            PWA manifest, service worker, icons
db/                SQLite database file
```

## Multi-Tenant Model

- `SUPER_ADMIN` manages brands/tenants from a platform console.
- `ADMIN` manages their brand: services (with branch price overrides), staff, customers, settings (UPI ID, QR image, GST, loyalty rule, receipt footer), full reports.
- `STAFF` sees billing only.
- Sessions are pinned to a single branch; data is isolated per tenant (customers unique per `[tenantId, mobile]`, bills numbered per branch via `billPrefix + billCounter`).

## Notes

- The app targets Indian salon workflows: ₹ currency, UPI QR payments, WhatsApp receipt delivery, festive-returning-customer discounts, Hindi/English toggle.
- API guards: `requireApiUser(roles?)` / `requireApiBranch(roles?)` (Super Admin is rejected from tenant-scoped endpoints).

## Production Hardening (v0.3)

- **Tenant isolation** — void + reporting/export endpoints are strictly franchise-scoped; an empty branch scope returns empty data, never another tenant's ledger.
- **Rate limiting** — in-memory sliding-window limiter on login token exchange, public QR-menu lead signup and bill creation (`src/lib/rate-limit.ts`).
- **Billing integrity** — concurrent offline-sync duplicates replay the winner's bill (P2002 → replay) instead of a 500; offline `clientCreatedAt` is clamped to the last 7 days; bill item count capped at 100.
- **GST-ready receipts** — optional per-branch GSTIN (Settings → GST), receipts print customer name/mobile, GSTIN and a CGST/SGST split.
- **Performance** — Prisma indexes on Transaction / Expense / Session / MenuLead hot paths.
- **Legacy routes removed** — pre-Firebase PIN login, public staff rosters and the old singleton settings API are gone.
- **PWA UX** — UPI QR failure state with retry, offline-queue dead-letter after 10 attempts (with confirm-guarded discard), refresh-safe cart, adaptive cash quick-tender chips, pinch-zoom allowed for accessibility.
- **Deployment knobs** — set `NEXT_PUBLIC_SHOW_DEMO_HINTS=false` to hide demo credentials on the login screen; cookies set `secure` automatically in production (`FORCE_SECURE_COOKIES=1` to force behind a TLS proxy).
