# SaloonX — Salon Billing PWA

An ultra-simple, multi-tenant salon billing Progressive Web App built for Indian salons. Staff with zero computer experience can bill a customer in seconds; admins get full reports, catalog/staff/customer management, and exportable analytics.

![Stack](https://img.shields.io/badge/Next.js%2016-App%20Router-black) ![DB](https://img.shields.io/badge/Prisma-SQLite-blue) ![Lang](https://img.shields.io/badge/TypeScript-strict-blue)

## Highlights

- **POS-style login** — Firebase email + password, then tap your name tile and enter a 4-digit PIN on a big keypad. Nothing to type on the shop floor.
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

Login is a 3-step POS-style flow: **Firebase email + password** → **tap your name tile** (branch/user picker) → **4-digit PIN** on a big keypad. No usernames to type on the shop floor.

Password for **every** account: `saloon123`

| Role | Brand | Email | PIN |
| --- | --- | --- | --- |
| Super Admin | Platform Console | `dev@saloonx.example` | `9999` |
| Admin | Glow & Go | `ravi@glowgo.example` | `1234` |
| Staff | Glow & Go | `priya@` / `amit@` / `neha@glowgo.example` | `1111` / `2222` / `3333` |
| Admin | UrbanCuts | `arjun@urbancuts.example` | `4444` |
| Staff | UrbanCuts | `kabir@` / `dev@urbancuts.example` | `5555` / `7777` |
| Admin | Blunt & Bronze | `meera@bluntbronze.example` | `6666` |

Seed data: 3 brands (+1 pending-approval branch for the platform approval flow), 96 transactions, 16 service price overrides, 30 expenses, 5 months of history, birthday-campaign demo customers. The seed provisions real Firebase Auth accounts (idempotent) and falls back to local-only users if Firebase is unreachable.

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
