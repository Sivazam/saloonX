# SaloonX — Salon Billing PWA — Project Worklog

## Product Overview
**SaloonX** is an ultra-simple salon billing PWA for Indian salons. Staff with zero computer experience must be able to bill in seconds. Admin gets full reports & management.

## Core User Flows
1. **Login**: POS-style — user taps their name tile → enters 4-digit PIN on a big numeric keypad. No typing usernames.
2. **Billing (staff+admin)**: 3-step flow with big buttons:
   - Step 1 Services: category chips + big service cards (name, ₹price, duration). Tap to add to cart. Floating cart bar with total.
   - Step 2 Customer: big numeric keypad to enter 10-digit mobile (or "Skip — Walk-in"). On 10 digits, auto-lookup: returning customer → festive recommendation banner "Returning customer (N visits) — Apply X% off?" with Apply / Skip. Optional name for new customers.
   - Step 3 Payment: bill summary + 3 big buttons: Cash (with quick-tendered chips & change calculator), UPI (shows QR — admin-uploaded image OR auto-generated from UPI ID with amount; plus "Payment Received ✓" button), Card (confirm on machine).
   - Step 4 Success: animated check, receipt card, buttons: Share on WhatsApp (wa.me text receipt), More share (navigator.share), Download PDF, Print, New Bill.
3. **Admin only**: Dashboard (today revenue/bills/avg, payment split, 7-day chart, top services), Transactions (filters, detail, CSV export, PDF export), Services CRUD, Staff CRUD, Customers list, Settings (salon profile, UPI ID + QR upload, GST toggle+%, loyalty rule: visits threshold + discount %, receipt footer).
4. **Staff sees ONLY billing + logout** (no reports/transactions/settings).

## Tech Decisions (sandbox-adapted)
- Next.js 16 App Router, TypeScript, Tailwind 4 + shadcn/ui (New York), framer-motion, lucide-react.
- **Single user-visible route: `/` only!** Entire app = client-side view switching (Zustand store `view` state). All other functionality via `/api/*` routes.
- **Data**: Prisma + SQLite (this sandbox has no Firebase). Data access isolated in API routes so migration to Firebase (App Hosting + Firestore + Storage) later is contained. Custom session auth (PIN-based, node:crypto scrypt hashing, DB-backed session tokens in httpOnly cookies) — swap-able for Firebase Auth.
- PWA: manifest.webmanifest + service worker + icons (already in `public/icons/`).
- Currency: ₹ INR (Intl.NumberFormat en-IN). Bill numbers: `SX-0001`.
- No blue/indigo. Theme: warm rose/deep rosewood primary, cream background, amber accents. Dark mode via next-themes.
- Packages to add: `jspdf`, `jspdf-autotable`, `qrcode` (+`@types/qrcode`).

## File Ownership (parallel-safety contract)
- Task 2 (foundation) owns: `prisma/`, `src/lib/*`, `src/app/api/**`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/store/*`, `src/components/auth/*`, `src/components/shell/*`, `public/*`.
- Task 3-a (billing) owns ONLY: `src/components/billing/**` (replace stubs, same default export names).
- Task 3-b (admin) owns ONLY: `src/components/admin/**` (replace stubs, same default export names).
- Shared contracts (types, API shapes, store) are defined by Task 2 and documented below — Tasks 3-a/3-b MUST NOT change `src/lib/*`, `src/store/*`, `src/app/**` (they only consume them). If a change is truly needed, note it in worklog instead of editing.

---
Task ID: 1
Agent: main (Z.ai Code)
Task: Research salon billing software landscape, define product spec, generate brand assets, set up plan

Work Log:
- Ran 6 web searches on salon billing software (Invoay, MioSalon, GINEX POS, Apna Billbook, Vyapar, Vagaro)
- Key findings: single-screen billing flow, UPI QR + WhatsApp receipt are India table-stakes, loyalty recognition for returning customers, admin/staff role split, reports with CSV/PDF export
- Defined product spec above (3-step billing, PIN login, role gating)
- Generated SaloonX logo via image-generation (deep rose + cream, scissors monogram)
- Created PWA icons: public/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon,icon-1024}.png

Stage Summary:
- Research done; spec locked; brand assets in public/icons/
- Tech: sandbox uses Prisma/SQLite + custom PIN auth instead of Firebase (migration path documented above)
- Ready for Task 2 (foundation)

---
Task ID: 2
Agent: foundation (Z.ai Code)
Task: Foundation — Prisma schema, seed, auth, full API surface, shared libs, theme, PWA, app shell, login, view stubs

Work Log:
- Prisma schema replaced (User/Session/Category/Service/Customer/Transaction/TransactionItem/Settings), pushed with db:push, client generated
- Idempotent seed (`bun run db:seed`): 3 users, settings singleton, 6 categories / 26 services, 6 customers, 45 transactions over last 14 days (7 today), deterministic PRNG
- Custom PIN auth: scrypt hashPin/verifyPin (timingSafeEqual), DB-backed Session, httpOnly cookie `saloonx_session` (30d, lax, path /), requireApiUser() guard with role support
- 16 API route files under src/app/api/** (all force-dynamic, zod-validated, JSON error shape {error}) — old demo src/app/api/route.ts deleted
- Shared libs: types.ts (DTO contracts), api-client.ts (apiGet/apiPost/apiPut/apiDelete), format.ts (INR/en-IN dates), serialize.ts (server DTO mappers + dayStart/dayEnd/dateKey/round2)
- Zustand store src/store/use-app-store.ts exactly per contract (user/hydrated/view/cart/lastBill + actions)
- Theme: globals.css rewritten — warm rose/rosewood primary + cream bg + amber accents, oklch palette, radius 1rem, print CSS (.print-receipt), custom thin scrollbars, subtle rose radial bg, body font-size 15px
- PWA: layout.tsx metadata + viewport (themeColor light #5E1A2C / dark #1D1418), Providers (TanStack staleTime 30s + next-themes class + sonner Toaster top-center), PwaRegister, manifest.webmanifest, sw.js (cache v2)
- App shell: sticky header (logo, settings salon name, theme toggle, user chip w/ role badge + dropdown logout), desktop 240px sidebar w/ framer-motion layoutId active pill, ADMIN mobile bottom nav (Bill/Home/Bills/More w/ vaul drawer), STAFF = billing only, AnimatePresence view transitions, 7 views lazy-loaded via next/dynamic
- POS login view: user tiles (step 1) → 4-digit PIN keypad (step 2) with auto-submit, shake-on-wrong-PIN, sonner feedback, demo PIN footer
- 7 view stubs created (billing/billing-flow.tsx + 6 admin/*-view.tsx) with exact default export names for Tasks 3-a/3-b to replace
- Verified: lint clean, seed idempotent, all endpoints curl-tested incl. 401/403/409 guard rails, browser E2E (login, PIN pad, wrong PIN, logout, nav, dark mode, mobile admin + staff layouts, SW activation + precache), dev.log clean

Stage Summary:
- Foundation complete; Tasks 3-a (billing) and 3-b (admin) can build entirely against the contracts below

## Seed credentials (demo data in db/custom.db)
- Ravi (Owner) — ADMIN — PIN 1234
- Priya — STAFF — PIN 1111
- Amit — STAFF — PIN 2222
- Test bills SX-0046 (Rahul UPI 150), SX-0047 (walk-in CASH 300), SX-0048 (Priya CASH 200) were created during API verification and left in as demo data
- Customers after seed: Rahul Sharma 8 visits, Sneha Patel 2, Vikram Singh 5, Anjali Verma 2, Mohammed Ali 11, Kavita Joshi 6 (loyalty threshold 3 → Rahul/Vikram/Ali/Kavita eligible for 10% off, Sneha/Anjali not)

## API surface (all JSON; errors are `{ "error": "message" }`; auth via httpOnly cookie)
Auth:
- GET /api/auth/users → `{ users: [{ id, name, role }] }` (active only, ADMIN sorted first) — no auth
- POST /api/auth/login `{ userId, pin }` → `{ user: { id, name, role } }` + sets cookie; 401 "Wrong PIN"; pin must be 4 digits
- POST /api/auth/logout → `{ ok: true }` + clears cookie
- GET /api/auth/me → `{ user: { id, name, role } }` or 401
Catalog (any authed):
- GET /api/catalog → `{ categories: CategoryDTO[] }` — sorted by sortOrder then name; services sorted by name; INCLUDES inactive services (billing must filter `active === true`; admin services view uses the flag)
- POST /api/catalog/category (ADMIN) `{ name, sortOrder? }` → `{ category: CategoryDTO }`
- PUT /api/catalog/category (ADMIN) `{ id, name?, sortOrder? }` → `{ category }`; DELETE ?id= → 409 if it has services
- POST /api/catalog/service (ADMIN) `{ name, price, durationMin?, categoryId }` → `{ service: ServiceDTO }`
- PUT /api/catalog/service (ADMIN) `{ id, name?, price?, durationMin?, categoryId?, active? }` → `{ service }` (deactivate via active:false)
- DELETE /api/catalog/service?id= (ADMIN) → 409 "Service is used in past bills — deactivate it instead"
Customers:
- GET /api/customers/lookup?mobile=10digits (any authed) → `{ customer: CustomerDTO | null, recommendation: { eligible, discountPct, visits } | null }` — recommendation is null when customer not found
- GET /api/customers?search=&page=1&limit=50 (ADMIN) → `{ customers: CustomerDTO[], total }` — search matches mobile OR name, sorted lastVisitAt desc; CustomerDTO.lastVisitAt is ISO string | null
Transactions:
- POST /api/transactions (any authed) `{ items: [{ serviceId, qty }], customerMobile?, customerName?, discountPct?, paymentMethod, note? }` → `{ transaction: TransactionDTO, settings: SettingsDTO }` — prices computed server-side from CURRENT service prices; billNo SX-####; customer upserted (visits+1, totalSpend+total, lastVisitAt, name backfilled if null); all atomic in db.$transaction
- GET /api/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD&method=&staffId=&search=&page=1&limit=25 (ADMIN) → `{ data: TransactionDTO[] (with items), total, summary: { revenue, count, avgBill, byMethod: { CASH|UPI|CARD: { amount, count } } } }` — `to` inclusive, newest first, search matches billNo/customerMobile/customerName, default range last 30 days; summary covers the ENTIRE filter (not just page)
- GET /api/transactions/[id] (ADMIN) → `{ transaction: TransactionDTO }`
Stats:
- GET /api/stats?from=&to= (ADMIN) → StatsResponse — default last 7 days incl. today; `daily` zero-fills dates (YYYY-MM-DD local, capped to most recent 90 days of range); `topServices` = top 6 by revenue (count = qty sold, revenue = price×qty); `newCustomers` = first-ever bills in range; `returningBills` = customer bills that are not their first-ever
Staff (ADMIN):
- GET /api/staff → `{ users: StaffDTO[] }` — StaffDTO = { id, name, role, active, billsToday, revenueToday }; never pinHash; ADMIN listed first
- POST /api/staff `{ name, pin (exactly 4 digits), role }` → `{ user: StaffDTO }`
- PUT /api/staff `{ id, name?, pin?, role?, active? }` → `{ user }` — 409 "Cannot demote or deactivate the last active admin"; deactivation deletes sessions
- DELETE /api/staff?id= → 409 "Deactivate instead — this staff has past bills" if referenced; sessions cascade
Settings:
- GET /api/settings (any authed) → SettingsDTO (creates singleton default if missing)
- PUT /api/settings (ADMIN) → SettingsDTO — upiQrImage must start with "data:image/" if present; gstPct/loyaltyDiscountPct 0–100
Export:
- GET /api/export/csv?from=&to=&method= (ADMIN) → text/csv; charset=utf-8 attachment saloonx-transactions.csv with BOM; columns: Bill No, Date, Time, Customer Mobile, Customer Name, Staff, Services ("Name x2; Name2 x1"), Subtotal, Discount %, Discount Amt, GST Amt, Total, Payment Method; default range last 30 days

## File map (Task 2 owned files)
- prisma/schema.prisma, prisma/seed.ts (script `bun run db:seed`)
- src/lib/: auth.ts (hashPin/verifyPin/createSession/getSessionUser/requireApiUser), types.ts (ALL DTOs), api-client.ts, format.ts (formatINR/formatDate/formatDateTime/formatTime/toDateKey), serialize.ts (server DTO mappers), db.ts (log reduced to errors only)
- src/store/use-app-store.ts (EXACT per contract — View, CartItem, cart actions, setUser resets view to 'billing')
- src/app/layout.tsx, page.tsx (hydration → splash → LoginView | AppShell), globals.css
- src/app/api/** (16 route files)
- src/components/auth/login-view.tsx; src/components/shell/{app-shell,providers,pwa-register}.tsx
- public/manifest.webmanifest, public/sw.js
- STUBS for Tasks 3-a/3-b (replace contents, keep default export names): src/components/billing/billing-flow.tsx, src/components/admin/{dashboard,transactions,services,staff,customers,settings}-view.tsx

## What Tasks 3-a / 3-b must know
- Client data access: apiGet/apiPost/apiPut/apiDelete from '@/lib/api-client' — they THROW Error(message) on {error} responses; catch and toast.error(e.message). All DTO types in '@/lib/types'
- TanStack Query is preconfigured (staleTime 30s, retry 1). Existing query keys: ['settings'], ['auth-users'] — reuse ['settings'] for settings data; invent your own for catalog/transactions/stats/customers/staff
- Store: useAppStore — cart via addToCart/setCartQty/clearCart (CartItem { serviceId, name, price, qty }); setLastBill for the success view; setView to navigate; user.role gates UI ('ADMIN' | 'STAFF')
- Print CSS is ready: wrap the receipt in class `print-receipt` and call window.print()
- UPI step: settings.upiQrImage may be a base64 data URL (admin-uploaded) OR null — fall back to generating a QR from settings.upiId + amount with the installed `qrcode` lib
- WhatsApp share: wa.me text receipt; PDF via jspdf + jspdf-autotable (installed, client-side OK)
- Date keys for filters: use toDateKey(new Date()) from '@/lib/format' (local YYYY-MM-DD); API handles day boundaries
- Icons in nav: Billing=Scissors, Dashboard=LayoutDashboard, Transactions=ReceiptText, Services=Sparkles, Staff=UsersRound, Customers=Contact, Settings=Settings2
- View transitions + lazy loading are handled by AppShell — views just render content (own their padding: start with p-4 lg:p-6)
- Billing view receives no props; read user/cart from store. STAFF never sees admin views (shell + API both enforce)
- Charts: recharts installed; theme chart colors --chart-1..5 (rose/amber/emerald/teal/orange)

## Deviations from Task 2 spec (all intentional, documented)
1. Prisma schema: added `service Service? @relation(...)` on TransactionItem — the spec schema as written fails prisma validate (Service.items needs an opposite relation field)
2. Seed visit counts: spec's exact numbers (6/2/4/1/8/3 = 24) conflicted with "45 transactions, ~25% walk-in, aggregates consistent"; tuned to 8/2/5/2/11/6 (34 customer bills + 11 walk-ins = 45, 24% walk-in); loyalty demo still works (4 eligible / 2 not). Seed is deterministic (fixed PRNG)
3. sw.js: .css/.js are NOT cache-first (spec suggested it) — dev assets are unhashed and cache-first served stale code after edits; cache-first is limited to /icons/, .png, .woff2; everything else network-first with cache fallback. CACHE_VERSION v2
4. stats: `daily` capped to most recent 90 days of the requested range (aggregates still cover the FULL range) — prevents absurd array sizes on wide queries while `?from=2020&to=2030` still returns all data
5. staff DELETE: also guards deleting the last active ADMIN (spec only required the transactions 409)
6. Added src/lib/serialize.ts (server-side DTO mappers + date helpers) — needed to keep route files DRY; within Task 2 ownership
7. db.ts: prisma log ['query'] → ['error'] (query logging flooded dev.log)
8. ThemeToggle: CSS-based icon swap (dark: variants) instead of JS mounted-state (react-hooks v6 bans setState-in-effect); header salon name uses <div> not <p> (Skeleton is a div — invalid nesting + hydration warning)
9. transactions GET and export CSV default to last 30 days when from/to omitted; stats defaults to last 7 days
10. Test transactions SX-0046/47/48 kept in demo data (per spec note)

---
Task ID: 3-b
Agent: admin-ui (Z.ai Code)
Task: Admin UI — replace the 6 admin view stubs + shared helpers (range picker, report PDF, UI atoms)

Work Log:
- Replaced all 6 stubs keeping exact default export names; only touched `src/components/admin/**`
- Created shared helpers in the same folder:
  - `ui-atoms.tsx` — initials(), parseDateKey(), useDebouncedValue (400ms), formatAxisINR (k/L axis labels), METHOD_META + MethodBadge (Cash=emerald / UPI=rose / Card=amber), RoleBadge (matches shell), EmptyState, response wrappers CatalogResponse/StaffListResponse/CustomersResponse
  - `range-picker.tsx` — preset chips Today/Yesterday/7d/30d/This Month + Custom popover (two date inputs + Apply, auto-swaps reversed dates). Exports `DateRange`, `computePreset()`, `detectPreset()`. `to` is inclusive (This Month = 1st→today, 7 Days = today−6→today)
  - `report-pdf.ts` — `downloadReportPdf(rows, summary, settings, from, to)`: A4 portrait, salon header + generated timestamp, Revenue/Bills/Avg stat line (from `summary` = whole filter), autoTable (Bill No/Date/Time/Customer/Staff/Method/Discount/Total), footer totals summed from the exported rows, page footers, honest note when rows.length < summary.count, filename `SaloonX-report-{from}-to-{to}.pdf`. All money as "Rs." (no ₹ — jsPDF font limitation)
- DashboardView: KPI grid (Revenue/Bills/Avg/New Customers) with framer-motion count-up (useMotionValue + useTransform rendered as motion.span text — no setState), payment split card with animated share bars (emerald/rose/amber), recharts AreaChart (rose var(--chart-1) + gradient fill) switching to BarChart when range > 31 days, Top Services (rank chips 1–6, animated progress bars cycling chart-1..5) + Staff Performance (avatar initials) side by side, Recent Bills (last 5, same range) with "View all →" → setView('transactions'). Default range 7 Days. Custom rounded tooltip, skeletons, error+retry state
- TransactionsView: sticky (top-16) filter card — RangePicker + method ToggleGroup (All/Cash/UPI/Card) + staff Select (options from ['staff']) + debounced search + Reset; summary strip (Revenue/Bills/Avg + byMethod mini-split); desktop Table + mobile stacked cards; useInfiniteQuery manual pagination with Load more + "Showing X of Y bills"; receipt-style read-only detail Dialog (salon header from ['settings'], items, subtotal/discount/GST/total, method + status badges, receipt footer). CSV via window.open(/api/export/csv?from&to&method) + toast; PDF button disabled-with-tooltip when empty. Default range 30 Days
- ServicesView: category sections (Collapsible, default open) with edit/delete, service rows (name + amber "Inactive" badge, duration, price, active Switch, edit/delete), Add/Edit Service dialog (name/price ₹/duration/category/active — active Switch only on edit since POST has no active field), Add/Edit Category dialog (name + sortOrder), delete AlertDialogs; 409 "deactivate instead" surfaces as toast.error with a "Deactivate" action button that flips the Switch
- StaffView: role explainer note card (amber), staff grid 1/2/3 (rose-gradient avatar initials, "(you)" badge when id === store user, RoleBadge, bills/revenue today, active Switch, Edit/Delete); Add dialog (name, masked 4-digit PIN with digit-only filter, role Select), Edit dialog (optional new PIN "leave blank to keep current"), delete AlertDialog; mutations invalidate ['staff'] + ['auth-users'] (login tiles)
- CustomersView: debounced search, infinite list (50/page, Load more), loyalty rose BadgePercent badge when settings.loyaltyEnabled && visits >= loyaltyVisits (desktop: "Loyalty: N visits", mobile: compact "N"), desktop Table + mobile cards (avatar, name/Unknown, mono mobile, visits, total spend, last visit or Never), empty state with contextual hint
- SettingsView: sticky top-16 header with Save button + amber dirty dot; 5 cards in max-w-3xl — Salon Profile (Store), Payments-UPI (QrCode: upiId + QR upload with canvas downscale to ≤600px JPEG 0.85 data URL, white preview tile, Remove), Taxes (Percent: gstEnabled Switch + gstPct with % suffix, disabled when off), Loyalty (BadgePercent: switch + visits + discount %, live "Apply X% off" helper text), Receipt (ReceiptText footer textarea). Form uses derived state (formState ?? fromSettings(data)) so no setState-in-effect; dirty = JSON diff vs server; save PUTs full object (id omitted), validates gst 0–100 / visits ≥ 1 / discount 0–100 with inline field errors, on success setFormState(fromSettings(saved)) + invalidate ['settings'] (keeps AppShell salon name fresh)
- Verified: `bun run lint` clean; `bunx tsc --noEmit` → zero errors in src/components/admin/**; all 9 admin modules runtime-import OK in bun; downloadReportPdf executed against real DTOs → valid PDF (deleted after test); API shapes re-verified live (stats/staff/customers/transactions/export csv); dev.log clean throughout

Stage Summary:
- All 6 admin views production-ready; parent QA can login as Ravi (PIN 1234) and walk Dashboard → Transactions (filters/exports/detail) → Services/Staff/Customers CRUD → Settings save

Query keys INVENTED here (do not collide):
- `['stats', from, to]` (dashboard)
- `['recent-bills', from, to]` (dashboard last-5 list — separate from the ledger key on purpose)
- `['transactions-list', from, to, method, staffId, search]` (infinite ledger; page only in pageParam)
- `['catalog']` (services view)
- `['staff']` (staff view + transactions staff filter)
- `['customers-list', search]` (infinite)
- Reused as-is: `['settings']` (shell + settings view + transactions detail + customers loyalty), `['auth-users']` (invalidated by staff mutations)

Notes for other tasks / QA:
- View padding: each view renders `p-4 pb-24 lg:p-6 lg:pb-6` per task spec — note AppShell's `<main>` already carries `pb-24 lg:pb-6`, so mobile bottom spacing is doubled (roomy, harmless); flagged in case the orchestrator wants to drop one
- CSV export honors from/to/method only (server contract — no staffId/search params exist); PDF export covers the LOADED rows and prints a "showing X of Y" note if not everything is loaded
- Transaction status from API is "COMPLETED" (not "PAID") — detail dialog renders it verbatim in an emerald badge
- 409 UX: service-delete toast includes a one-tap "Deactivate" action; staff/category 409s show the friendly API message as-is
- RangePicker chip row scrolls horizontally on narrow screens (min-w-0 + overflow-x-auto), Custom chip is a Popover with two native date inputs
- PDF totals row sums exported rows while the header stat line uses the filter summary (both labeled); "Rs." everywhere in PDFs per jsPDF ₹ limitation
- Observed (NOT fixed — Task 2 ownership): `bunx tsc --noEmit` reports pre-existing type errors in `src/app/api/stats/route.ts` and `src/app/api/transactions/route.ts` (Date|null narrowing, items relation typing). Dev server + endpoints work fine (SWC transpile-only), but a future typecheck gate would fail there

---
Task ID: 3-a
Agent: billing-flow (full-stack-developer)
Task: Billing Flow UI — replaced the billing-flow.tsx stub with the full 4-step billing flow (services → customer → payment → success)

Work Log:
- Read Task 2 contracts (types, store, api-client, format, globals.css print CSS, AppShell sticky header h-16/main pb-24) and the vaul Drawer / Dialog / Popover component APIs
- Created src/components/billing/use-keypad.ts — shared keypad hook (digits state, press with maxLength + onFull fired on the press event so auto-lookup at 10 digits is event-driven, no setState-in-effect) + formatMobileDisplay ("98765 43210")
- Created src/components/billing/receipt-pdf.ts — buildReceiptText (WhatsApp *bold* receipt with ₹, conditional discount/GST lines) + downloadReceiptPdf (jsPDF A5 portrait: centered 16pt salon header, 9pt address/phone, dashed separators, item rows, right-aligned totals, footer, "Rs." not "₹", page-overflow guard, saves SaloonX-{billNo}.pdf)
- Created steps/service-select-step.tsx — sticky category chips (All + active-only categories, active = bg-primary), 2/3/4-col grid of cards (name line-clamp-2, price text-lg bold text-primary, Clock duration), whileTap .96, qty>0 → ring-2 ring-primary + primary overlay stepper ([-] at 1 removes), sticky bottom cart bar (spring slide-in, "N items · ₹X") → vaul Drawer with steppers/remove/subtotal/Continue, loading skeletons, error retry, "No services yet — ask admin" empty card
- Created steps/customer-step.tsx — cart chip, big display box (text-3xl tabular, AnimatePresence swap), 3×4 keypad (h-16 sm:h-20, ⌫/0/✓), lookup result cards: new customer (UserPlus + optional name Input), returning customer (avatar initials, visits/spend/last visit), loyalty rose-gradient banner (BadgePercent, Apply {pct}% Off / Skip BIG buttons), applied → emerald chip + Undo X, walk-in skip/undo, sticky Back + Continue (enabled on resolved or walk-in)
- Created steps/payment-step.tsx — summary card (items, Subtotal, emerald Discount row with Pencil → Popover 0/5/10/15/20 chips, GST row only when gstEnabled, Total text-3xl text-primary), three BIG method cards (Banknote/QrCode/CreditCard, h-28 sm:h-32); Cash dialog (Exact/200/500/1000/2000/Custom chips, big change display "Return ₹X" emerald / "Insufficient — ₹X more" destructive, Confirm disabled until covered), UPI dialog (settings.upiQrImage img in white box → else QRCode.toDataURL(upi://pay?pa=…&am=total) generated in effect with setState only in async callbacks per react-hooks v6 rule, skeleton while generating, amber "not configured" fallback that still allows manual confirm), Card dialog (confirm on machine)
- Created steps/success-step.tsx — motion success mark (stroke-draw circle + check path + spring scale + 8 confetti particles in theme colors, no new deps), "Bill Paid" + huge total + "Paid via UPI · SX-0052", print-receipt card (salon name, address/phone, billNo + formatDateTime, items, totals with dashed separators, method + icon, receiptFooter), 2-col action grid: WhatsApp (wa.me/91{mobile}, navigator.share/clipboard fallback for walk-ins), More Share (navigator.share → clipboard + "Receipt copied" toast), Download PDF, Print (window.print), full-width New Bill → resets flow + toast "Ready for next customer"
- Rewrote billing-flow.tsx as orchestrator — step machine with AnimatePresence mode="wait" directional slide, step pills (completed = Check, clickable to go back, hidden on success), ['catalog']/['settings'] queries, keypad + lookup (in-flight ref guard, error toast-free inline state), loyalty decision wiring, POST /api/transactions with double-tap lock + fixed "Saving bill…" overlay, setLastBill + clearCart → step 4, derived empty-cart guard bounces step 2/3 → 1, walk-in continue zeroes discount
- Fixed lint: removed sync setState in UPI QR effect (cache-entry-keyed-by-URI pattern with ref dedupe), removed unused imports/directives
- Verified: bun run lint clean; bunx tsc --noEmit → zero errors in src/components/billing/** (pre-existing api route errors untouched); bun smoke test of buildReceiptText/downloadReceiptPdf/formatMobileDisplay → valid text + 5.3KB PDF; agent-browser E2E as staff Priya: PIN login → add 3 services → cart drawer → keypad 9876543210 → auto-lookup → Rahul loyalty banner → Apply 10% → payment (380 − 38 = 342) → Cash Exact → SX-0049 success → New Bill → walk-in → UPI dialog QR data-URL rendered → SX-0050 → discount Popover 20% override → pill back-nav → mobile (390px) + dark mode + no page errors; keypad buttons 111×64px, method cards 141×128px (≥44px targets)

Stage Summary:
- Files (all in src/components/billing/**): billing-flow.tsx (orchestrator + step pills + saving overlay), use-keypad.ts, receipt-pdf.ts, steps/{service-select-step, customer-step, payment-step, success-step}.tsx
- Flow state lives in the orchestrator (step, keypad digits, lookup results, walkIn, name, discountPct, loyaltyDecision, bill); steps are mostly presentational; cart via useAppStore; amounts previewed client-side (round2) but the server response is authoritative on the receipt
- Notes for parent/QA: two test bills SX-0049 (Rahul, CASH, 10% loyalty, ₹342) and SX-0050 (walk-in, UPI, ₹200) created during E2E and left in as demo data; loyalty Apply only pre-fills discountPct — staff can still override via the payment Popover; on step 2 walk-in continue resets any discount; success step uses the settings returned by POST /api/transactions (always fresh); WhatsApp button for walk-ins falls back to navigator.share/clipboard; mobile step pills show numbers only (labels hidden <sm) — accessible names come from the number/Check span
- Known pre-existing (NOT fixed, Task 2 ownership): tsc errors in src/app/api/{stats,transactions}/route.ts; the dev.log "module not found ./steps/service-select-step" entry was a transient from mid-build (verified compiled clean after the file landed)

---
Task ID: 4
Agent: main (Z.ai Code)
Task: End-to-end QA with agent-browser — full admin + staff journey, bug fixes, visual review

Work Log:
- Verified login: POS user tiles → PIN keypad (wrong PIN shakes + clears, right PIN logs in), session persists across server restarts
- Admin journey: Dashboard (KPIs, payment split, revenue chart, top services, staff perf, recent bills), Transactions (filters, search, summary, load more, detail dialog), CSV export endpoint (200, text/csv, BOM, correct columns), Services/Staff/Customers/Settings all render with live data
- Staff journey (Priya): role gating confirmed — ONLY Billing visible; nav/API both enforce
- Full billing E2E x3: services+cart drawer → returning customer 9876543210 (Rahul, 10 visits) → loyalty banner "recommend 10% off" → Apply → payment summary ₹420−10%=₹378 → CASH (tendered ₹500 → "Return ₹122") → SX-0051 success + receipt card; walk-in + UPI (QR generated from upiId, base64 PNG verified) → SX-0052; walk-in + CARD → SX-0053
- WhatsApp share: opens wa.me/91{mobile} with full formatted receipt text (verified via tab inspection); PDF receipt downloads (SaloonX-SX-0051.pdf, valid); Print uses .print-receipt CSS
- PWA: manifest.webmanifest served (standalone, theme #5E1A2C), sw.js 200, icons 200, SW registered
- Responsive: 390px mobile — no horizontal overflow; dark mode intentional
- VLM design review of 4 key screens: theme praised (rose/cream "warm, professional"); found real bugs (below)
- BUGS FIXED: (1) initials("Ravi (Owner)") rendered "R(" — now filters non-alpha words (login-view.tsx + admin/ui-atoms.tsx); (2) formatINR dropped trailing zero (₹33,734.2) — now min/max fraction digits 2 for non-integers (lib/format.ts); (3) nested <button> hydration error (qty stepper inside card button) — card is now motion.div role=button with keyboard support (service-select-step.tsx); (4) added right-edge fade gradient on category chips row to signal scrollability
- Restarted dev server after it died (EADDRINUSE stale entry in log is historical; server healthy on 3000)
- Final: lint clean, zero page errors, all API 200s

Stage Summary:
- App is FULLY FUNCTIONAL end-to-end: login → billing (3 payment modes + loyalty + walk-in) → share/PDF/print → admin reports/exports → management/settings
- Demo credentials: Ravi (Owner) ADMIN PIN 1234 · Priya STAFF PIN 1111 · Amit STAFF PIN 2222
- Known minor (deferred): Radix Dialog "Missing Description" a11y warnings on some dialogs (cosmetic); single salon scope (no multi-branch); no offline bill queueing
- Suggested next phases: bill void/cancel with admin audit trail, staff-wise commission reports, customer visit history detail, Firebase migration (swap lib/db + auth), Hindi/i18n

---
Task ID: 5 (cron review round 1)
Agent: main (Z.ai Code)
Task: Scheduled review — QA via agent-browser, fix deferred bugs, ship bill void/cancel + customer visit history + styling polish

Current project status / assessment:
- App was stable end-to-end (login, billing x3 payment modes, loyalty, WhatsApp/PDF share, admin dashboard/transactions/exports/management)
- Two deferred debt items from previous rounds: tsc type errors in api/stats + api/transactions routes; doubled mobile bottom padding (AppShell main + views both carried pb-24)

Current goals / completed modifications / verification results:
1. QA: full admin journey re-verified (dashboard KPIs/chart, transactions filters/summary, zero page errors)
2. BUG FIXES:
   - Fixed ALL tsc errors in src/ (null-narrowing on dayStart/dayEnd fallbacks in stats route; Promise.all tuple-inference on items; `let customer = null` annotation) — `bunx tsc --noEmit` now reports ZERO errors in src/
   - Removed doubled pb-24 from AppShell <main> (views own their padding)
3. NEW FEATURE — Bill void/cancel with admin audit trail:
   - Schema: Transaction gains voidedAt / voidedByUserId / voidReason (status now COMPLETED|VOIDED); db:push applied
   - PUT /api/transactions/void (ADMIN): 404/409 guards, atomic $transaction, REVERSES customer aggregates (visits-1, totalSpend-total, lastVisitAt recomputed from remaining completed bills)
   - Revenue integrity: stats, transactions summary, staff today-stats, customer-history totals all exclude VOIDED; ledger keeps voided rows for audit (opacity-60 + red Voided badge + line-through total)
   - UI: detail dialog shows red void-info panel (when/who/reason + exclusion note), admin-only "Void this bill" → confirm dialog with optional reason → invalidates transactions/stats/recent-bills/staff/customers queries
   - CSV export gains Status + Void Reason columns (audit trail intact); PDF export filters voided rows to match revenue summary
   - Verified E2E: voided SX-0045 (₹2,100, reason "Wrong service selected by staff") → revenue 74,154.20→72,054.20, bills 53→52, cash split −2,100, Mohammed Ali visits 11→10, dashboard recent bills shows badge+strikethrough, CSV row says VOIDED
4. NEW FEATURE — Customer visit history drill-down:
   - GET /api/customers/[id] (ADMIN): profile + last 100 bills (voided included for audit) + totals from completed only
   - Customers view rows/cards now clickable → history dialog with avatar header, Bills/Spend/AvgBill chips, per-visit cards (billNo, date, method+status badges, services, staff)
   - Verified: Rahul Sharma → 11 bills, ₹15,162, full visit list
5. STYLING POLISH (mandatory): StatusBadge component (Paid emerald / Voided red+Ban icon) used in ledger, detail dialog, recent bills, customer history; voided rows muted with strikethrough totals; history dialog skeleton loaders; keyboard-accessible clickable rows/cards

Unresolved issues or risks, and priority recommendations for the next phase:
- IMPORTANT ops note: Prisma schema changes require a dev-server restart to reload the generated client — first void attempt 500'd with "Unknown argument voidedAt" until restart (fixed by restart; documented for future rounds)
- Staff bills-today aggregate reverses on void; if a bill is voided on a LATER day than it was created, staff today-stats won't show that reversal (minor accounting nuance, noted)
- Next-phase candidates (priority order): (1) staff-wise commission/percentage report per range, (2) bill reprint/WhatsApp from transactions detail dialog, (3) bill note field in billing flow, (4) Hindi/i18n, (5) Firebase migration when keys available
- Pre-existing non-src tsc errors remain in examples/ + skills/ demo folders (out of scope, untouched)

---
Task ID: 6 (cron review round 2)
Agent: main (Z.ai Code)
Task: Scheduled review — QA via agent-browser, fix bugs (shell initials, keypad overlap on short viewports, keypad stale-closure), ship staff commission system + bill note + receipt re-share from transactions + styling polish

Current project status / assessment:
- App was stable end-to-end after Task 5 (login, billing ×3 payment modes, loyalty, void, customer history, exports)
- QA re-verified: all admin views + billing flow healthy, zero JS errors, zero failed API calls
- Found 3 real bugs (fixed below); all 3 next-phase candidates from Task 5 implemented

Current goals / completed modifications / verification results:
1. QA: agent-browser walkthrough (admin dashboard/transactions/services/staff/customers/settings, billing E2E, staff role gating, dark mode) — zero page errors throughout
2. BUG FIXES:
   - Shell account chip showed "R(" for "Ravi (Owner)" — Task 4's initials fix missed app-shell.tsx; applied the same alpha-word filter + fallback
   - Customer step keypad bottom rows (8/9/0/⌫/✓) were COVERED by the sticky Continue bar on short viewports (bar top 505 < keypad bottom 577 at 1280×577) — unacceptable for non-computer-literate staff. Fixed with height-responsive compaction via Tailwind arbitrary media variants `[@media(max-height:740px)]:` on keypad buttons (h-12), gaps, display box, heading margin, subtitle, step pills (h-9) and steps-container margin. Verified: coveredKeys 0, keypad clears bar by 18px at 577px viewport; normal viewports untouched (media query ≤740px only)
   - Keypad stale-closure bug: useKeypad press() read `digits` from closure — batched/simultaneous presses (fast two-finger taps) dropped digits. Rewrote with digitsRef mirror (setSafe pattern). Same fix applied to the login PIN pad (pinRef). Both verified with synchronous batched programmatic entry
   - Dev server ops: the sandbox kills process groups when a tool call ends — a plain `nohup bun run dev &` does NOT survive; the working recipe after a needed restart (Prisma client reload) is `bash -c '(setsid bun run dev </dev/null >>/tmp/dev-server.out 2>&1 &)'` (double-fork detach). Radix dropdown menus only respond to REAL pointer clicks (agent-browser click), not JS .click() — relevant for future automated QA
3. NEW FEATURE — Staff commission system:
   - Schema: User.commissionPct Float @default(0) (db:push applied; dev server restarted)
   - Staff API: POST/PUT accept commissionPct (0–100, zod-validated); StaffDTO + serialize include it
   - Stats API: topStaff now { userId, name, commissionPct, revenue, bills, commission } — keyed by staffId, names/rates from current user records, revenue × pct
   - Dashboard Staff Performance card: emerald total-commission BadgePercent badge, per-staff "N% commission" line + "+₹X" payout, explainer footnote (only when any rate > 0)
   - Staff view: Commission % field in Add + Edit dialogs (digit/decimal filter, 0–100 validation, %-suffix icon, helper text), emerald chip on grid cards; edit prefills current rate
   - Seed: Priya 10%, Amit 7.5% (demo); verified E2E: dashboard "Commission ₹1,644.38" badge, per-staff rates, PUT API round-trip
4. NEW FEATURE — Bill note (optional, 200 chars):
   - Payment step: collapsed "+ Add note (optional)" dashed chip → amber StickyNote input (autoFocus, Cancel when empty, disabled while submitting); note state owned by billing-flow orchestrator, reset on New Bill
   - POST body gains note (API already accepted it); verified persisted (SX-0055 "Guest requested head massage at home")
   - Displays on: success receipt card (amber chip), WhatsApp receipt text, receipt PDF (wrapped, page-overflow guard), transactions detail dialog (amber StickyNote panel), customer history cards, CSV export (new Note column)
5. NEW FEATURE — Receipt re-share/reprint from transactions detail:
   - 3-button row: WhatsApp (wa.me/91{mobile}, walk-ins → navigator.share → clipboard fallback), Copy (clipboard + toast), PDF (downloadReceiptPdf reuse from billing/receipt-pdf)
   - All disabled for VOIDED bills with explanatory caption; mirrors success-screen logic
6. STYLING POLISH (mandatory):
   - Receipt zigzag "torn edge" (.receipt-teeth ::after in globals.css — dual linear-gradient teeth, theme-aware via var(--card), drop-shadow border tint, hidden in print) on the success receipt card; VLM-verified clean
   - Success hero: soft emerald radial glow behind the check mark
   - Login user tiles: role icon badges (ShieldCheck admin / Scissors staff) on avatar circles, hover lift (-translate-y + border-primary/40 + shadow), demo-PIN footer contrast bump
   - Customer step sticky bar: backdrop-blur + bg-background/80
7. Final verification: `bun run lint` clean; `bunx tsc --noEmit` zero errors in src/; dev.log all 200s; E2E as admin (Ravi) and staff (Priya) with zero page errors; VLM design reviews of login + success + detail screens all positive

Unresolved issues or risks, and priority recommendations for the next phase:
- Sonner toast top-center can momentarily overlap the login logo (transient, cosmetic — noted by VLM; acceptable sonner behavior)
- Commission uses each staff member's CURRENT rate applied to historical range revenue (documented on the dashboard card); no per-bill historical commission snapshot — fine for a small salon, revisit if payouts need audit-proof history
- Staff view "Edit" toast says "Staff updated" also when only commission changed (minor copy nuance)
- Landscape phones <540px height: customer step still needs slight scroll (content 502px + header 64px) — acceptable edge case
- Next-phase candidates (priority order): (1) Hindi/i18n toggle, (2) customer last-visit services hint on billing step 2 (lookup gains lastBill), (3) Firebase migration when keys are available, (4) daily summary WhatsApp to owner (cron-style), (5) offline bill queueing via IndexedDB
- Demo data note: SX-0054 (Rahul, loyalty 10%, cash ₹135) and SX-0055 (walk-in, card ₹150, note) created during this round's E2E and left in as demo data; Priya/Amit commission rates set live via API (10%/7.5%)

---
Task ID: 7 (cron review round 3)
Agent: main (Z.ai Code)
Task: Scheduled review — QA via agent-browser, fix findings, ship 4 new features (custom amount items, last-visit hint, owner WhatsApp summary, Hindi i18n) + styling polish

Current project status / assessment:
- App was fully stable end-to-end after Task 6 (login, billing ×3 payment modes, loyalty, void, customer history, commissions, exports)
- QA re-verified this round: full billing E2E (loyalty → cash with change calc → SX-0056), admin dashboard/transactions/customers, staff role gating (Priya sees only Billing), mobile 390px no-overflow, dark mode, zero JS errors throughout
- One QA finding investigated deeply: rapid keypad taps appeared to "drop" digits — proven NOT a state bug (digitsRef mirror is correct; all clicks eventually process). Root cause: AnimatePresence mode="wait" on the digits display kept the OLD span mounted during exit, so the visible text lagged while state was correct. FIXED by switching to mode="popLayout" (exiting span pops absolute, entering span renders in-flow instantly) + added exit position:'absolute'. Verified: in-flow span shows latest digits immediately after 7 rapid clicks.

Current goals / completed modifications / verification results:
1. NEW FEATURE — Custom Amount / ad-hoc items (real salons constantly bill product sales & negotiated prices):
   - API: POST /api/transactions items now accept a union — {serviceId, qty} (menu) OR {name (1-60), price (₹0.5-100k), qty} (custom); custom items snapshot name+price on the bill with serviceId=null (schema already supported this — zero migration)
   - Store: CartItem gains custom?: boolean; newCustomItemId() generates unique synthetic ids so custom lines never merge; submit maps custom items to {name, price, qty}
   - UI: amber dashed "Custom Amount" card at the end of every service grid → dialog (optional name, ₹ amount input with validation ≥₹0.50, Enter-to-add) → adds to cart; cart drawer + payment summary + receipts show them with an amber "CUSTOM"/"अन्य" badge; CSV/ledger/void/customer-history all render custom items via serviceName as before
   - Verified E2E: dialog → "Hair serum" ₹350 + Haircut ₹150 → 10% loyalty → SX-0058 ₹450 cash; API-level mixed bill SX-0057 (custom 350 + service 1500 = 1850); invalid serviceId still 400s
2. NEW FEATURE — Last-visit services hint (staff can say "same as last time?"):
   - API: GET /api/customers/lookup returns lastVisit {billNo, date, services[] (qty>1 → "Name x2"), total, paymentMethod} from the latest COMPLETED bill; null when not found
   - UI: LastVisitHint component (History icon + date + ₹total + up to 3 service chips + "+N more") inside BOTH returning-customer cards (banner & plain variants); LastVisitDTO added to types
   - Verified: Rahul Sharma → "Last visit · 12 Oct 2026 · ₹5,310" with chips [Haircut (Women)] [Groom Package x2] [Aroma Therapy]
3. NEW FEATURE — Owner daily-summary WhatsApp share:
   - Schema: Settings.ownerMobile String? (db:push applied, server restarted with the setsid recipe); settings PUT validates 10 digits; SettingsView gains "Owner WhatsApp number" field (digit-filtered input) in Salon Profile card
   - Dashboard: emerald "Share Summary" button next to RangePicker — builds a formatted range summary (salon name, revenue, bills, avg, cash/UPI/card split, top 3 services, staff commission, new/returning) → wa.me/91{ownerMobile} (pre-addressed) or wa.me picker when unset
   - Verified: without ownerMobile → api.whatsapp.com with full text; after saving 9876500000 → URL pre-addressed phone=919876500000; settings round-trip persisted
4. NEW FEATURE — Hindi language toggle for staff-facing screens (admin stays English by design):
   - New src/lib/i18n.ts: en/hi dictionaries (~110 keys) covering login + all 4 billing steps (labels, dialogs, toasts, arias); Dict type = typeof en (no as const — literal types broke hi: Dict)
   - Store: lang state + setLang (persists localStorage 'sx-lang', initialized once at store creation; splash/hydration gate prevents SSR mismatch); useT() hook returns the active dict
   - LangToggle component (shell/lang-toggle.tsx): pill button showing the OTHER language (अ/EN), placed top-right on login + next to step pills in billing; all step labels/buttons/dialogs/toasts translated (e.g. "सेवाएं/ग्राहक/पेमेंट", "नकद गिनें और पक्का करें", "पेमेंट मिल गया", "भुगतान पूरा", "10% छूट लगाएं")
   - Verified E2E in Hindi: login screen, service grid + custom card (अन्य रकम), cart drawer (उप-योग), customer step + loyalty banner + last-visit hint (पिछली बार), payment (UPI dialog), success (भुगतान पूरा · SX-0059 ₹135); persistence across logout confirmed; toggle back to EN works
5. STYLING POLISH (mandatory):
   - Category icon tiles: every service card gains a colored icon chip (Scissors/rose for cutting, Zap/amber for shave, Sparkles/emerald for facial, Palette/teal for color, Flower2/orange for spa, Gift for packages, keyword-matched with fallback) — VLM review: "icons rendering clearly, color-coding effective, contrast excellent"
   - Service cards get subtle stagger-in animation (delay capped at 2×0.02s); cart steppers use a cleaner − glyph
   - VLM flagged a "banner overlaps sticky bar" at mid-scroll — programmatically proven to be standard sticky behavior (full scroll clears it; same pattern as the step-1 cart bar); no fix needed
6. Bug fixes: store setLang extra paren (syntax error caught by lint); removed unused STEP_LABELS; i18n literal-type fix
7. Final verification: bun run lint CLEAN; bunx tsc --noEmit ZERO errors in src/ (examples/skills pre-existing only); dev.log all 200s (401s were curl traces); zero page errors; VLM design reviews positive

Unresolved issues or risks, and priority recommendations for the next phase:
- Receipt text/PDF (customer-facing) stays English — standard practice in India, but a Hindi receipt variant is a candidate if users ask
- Custom items use price snapshot at bill time (correct); editing a bill isn't supported (by design — void & rebill)
- Language toggle is per-DEVICE (localStorage) — staff sharing a device share the language; a per-user langPref column is the upgrade path if needed
- Landscape phones <540px height still need slight scroll on customer step (pre-existing, acceptable)
- Next-phase candidates (priority): (1) offline bill queueing via IndexedDB + service-worker sync, (2) expense tracking (rent/supplies) for true P&L, (3) per-user language preference, (4) Firebase migration when keys are available, (5) SMS reminders for customers who haven't visited in 60+ days (lapsed-customer win-back list on Customers view)
- Demo data note: SX-0057 (custom ₹350 + Hair Straightening ₹1500, UPI... actually CASH, Rahul), SX-0058 (Hair serum ₹350 + Haircut ₹150, 10% loyalty, CASH ₹450), SX-0059 (Haircut ₹150, 10% loyalty, UPI ₹135) created during this round's E2E and left in as demo data; ownerMobile set to 9876500000; Priya/Amit session cookies for the WhatsApp-tab reload re-login as needed

---
Task ID: 8 (cron review round 4)
Agent: main (Z.ai Code)
Task: Scheduled review — QA via agent-browser, ship expense tracking with P&L (true salon accounting) + lapsed-customer win-back with WhatsApp reminders + styling polish

Current project status / assessment:
- App stable after round 3 (custom amounts, last-visit hints, owner WhatsApp summary, Hindi i18n) — QA re-verified with zero JS errors
- This round's focus chosen from the round-3 priority list: expense tracking for a true P&L (the original brief was "salon accounting software") + lapsed-customer win-back

Current goals / completed modifications / verification results:
1. NEW FEATURE — Expense tracking (rent, supplies, salaries…):
   - Schema: new Expense model {category, description?, amount, date (the day it occurred — owners can log past expenses), createdByName snapshot}; db:push applied; dev server restarted (setsid recipe)
   - API /api/expenses (ADMIN only — staff gets 401, verified): GET ?from&to&category&page&limit → {data: ExpenseDTO[], total, summary {total, byCategory {amount, count}}} (summary covers the WHOLE filter, 30-day default, date-desc ordering); POST {category enum, description≤120, amount ≥₹0.50, date? YYYY-MM-DD local-day}; PUT partial; DELETE ?id (404 guards)
   - 7 fixed categories: RENT / SUPPLIES / SALARY / UTILITY / MARKETING / MAINTENANCE / OTHER
   - Admin UI: new Expenses view (nav item Wallet icon, desktop sidebar + mobile More drawer; 'expenses' added to store View union). Range picker + category filter chips (scrollable, right-edge fade) + summary card (total, animated per-category bars, entry count) + entry rows (category icon tile, description/date/by, −₹amount, edit/delete) + Add/Edit dialog (category 2-col buttons, big ₹ input with ≥0.50 validation, optional description, date input capped at today, Enter-to-save) + delete AlertDialog; mutations invalidate ['expenses-list'] + ['stats']; empty state with contextual hint
   - Demo data: 5 expenses seeded via API (rent ₹15,000, supplies ₹3,200, salary ₹2,400, electricity ₹1,850, marketing ₹800 → ₹23,250/month)
   - Verified E2E: 30-day view shows all 5 + bars; add "Hair colour tubes" ₹450 (dialog → toast → list) → delete it (confirm dialog → toast); Supplies filter shows 2 entries; PUT round-trip 2400→2600→2400
2. NEW FEATURE — Dashboard P&L strip (revenue − expenses = net profit):
   - /api/stats response gains expenses {total, count, byCategory} aggregated over the SAME range (date-based)
   - ProfitStrip card under the KPI grid: Revenue / −Expenses / Net Profit columns (emerald profit, rose expenses, destructive loss), expense-share-of-revenue proportion bar, Margin %, top-4 category chips, italic hint when no expenses logged; "Manage Expenses" button → expenses view; WhatsApp Share Summary now includes "Expenses: X · *Net profit: Y*" line
   - Verified: 7-day range → ₹35,477.20 − ₹2,400 = ₹33,077.20, margin 93%, Salary chip; VLM review: "excellent… no technical issues… perfect consistency with KPI cards"
3. NEW FEATURE — Lapsed-customer win-back (Customers view):
   - Client-side daysSince(lastVisitAt); lapsed = 60+ days (LAPSED_DAYS constant)
   - Amber "Nd ago" badges (CalendarClock) on desktop table + mobile cards; amber filter chip "N haven't visited 60+ days" (toggle → shows only lapsed, "Showing N" state, empty state "No lapsed customers 🎉"); hint line "Tap 💬 on a row to send a WhatsApp reminder"
   - ReminderButton per lapsed row (stopPropagation so it doesn't open the history dialog): opens wa.me/91{mobile} with a personalized Hindi-English message ("Namaste {name}! We miss you at {salon}…")
   - Demo data: Sneha Patel backdated to 92d, Anjali Verma to 74d (direct prisma update; the seed's visit dates cluster within ~8 days)
   - Verified: chip shows "2 haven't visited 60+ days"; filter shows exactly 2; reminder opens api.whatsapp.com/send?phone=919765432109 with the full message; VLM: "highly visible… strong affordance… no issues"
4. STYLING POLISH (mandatory): category icon tiles on expense rows/summary (Home/Package/UsersRound/Lightbulb/Megaphone/Wrench/TrendingDown with themed soft colors); staggered row animations; VLM feedback applied (chips-row scroll fade + extra summary/list separation)
5. Final verification: bun run lint CLEAN; bunx tsc --noEmit zero errors in src/; dev.log clean; zero page errors through every E2E; mobile 390px fine (More drawer gains Expenses)

Unresolved issues or risks, and priority recommendations for the next phase:
- Expenses have no VOID/audit trail (delete is permanent) — acceptable for small salons; a soft-delete + audit log is the upgrade path
- Expense date is a plain day (no time); the P&L uses the same local day boundaries as transactions — consistent
- Lapsed detection is client-side on the LOADED pages (infinite scroll) — the chip count reflects loaded rows only (fine for salons with < a few hundred customers)
- Reminder message is hard-coded EN+Hindi mix; a settings template is a future option
- Next-phase candidates (priority): (1) offline bill queueing via IndexedDB + SW sync, (2) expense CSV/PDF export + monthly comparison chart, (3) per-user language preference, (4) Firebase migration when keys available, (5) customer birthday reminder list (needs DOB field)
- Demo data note: 5 expenses left in as demo data (see above); Sneha Patel/Anjali Verma lastVisitAt backdated 92d/74d to demo the win-back feature

---
Task ID: 9 (user-requested round — PDF receipt sharing)
Agent: main (Z.ai Code)
Task: User request — "to whatsapp or any other share — it should be like PDF which we are printing, not text". Replaced all text-based receipt sharing with the actual printed-style A5 PDF; QA via agent-browser; fixed a short-viewport skip-button bug found during QA.

Current project status / assessment:
- App was stable after Task 8 (login, billing ×3 payment modes, loyalty, custom amounts, void, customer history, commissions, expenses/P&L, win-back, Hindi i18n)
- Dev server had been killed by the sandbox between rounds — restarted with the setsid recipe (known ops note from Task 6)
- QA performed as admin (Ravi) end-to-end: login → billing (cash ₹200 w/ mobile, walk-in ₹150) → success screen → share actions; transactions detail re-share; Hindi flow; zero page errors throughout

Current goals / completed modifications / verification results:
1. CORE CHANGE — Receipt sharing now delivers the SAME A5 PDF that Print/Download PDF produce (never a text receipt):
   - receipt-pdf.ts refactored: extracted buildReceiptDoc(t,s) (single source of truth); downloadReceiptPdf uses it; NEW receiptPdfFile(t,s) → jsPDF output('blob') wrapped as File (application/pdf); canShareFiles(file) → navigator.canShare({files}) check; buildReceiptShareNote(t,s) → short thank-you note that travels WITH the file (customer name greeting, billNo, ₹total, services, "PDF receipt attached 📄")
   - NEW src/components/billing/receipt-share.ts — shareReceiptPdf(t, s, {whatsapp, L}) with 3 branches:
     a) Mobile (Web Share API Level 2): navigator.share({files:[pdf], title, text}) → native share sheet → picking WhatsApp delivers the PDF as a document attachment
     b) Desktop WhatsApp (customer has mobile): window.open wa.me/91{mobile} with the SHORT note (not the old full text receipt) + downloadReceiptPdf + toast "PDF downloaded — attach it in the WhatsApp chat" (+ billNo · ₹total description)
     c) Desktop generic/walk-in: downloadReceiptPdf + note copied to clipboard + toast "PDF receipt downloaded — send it to your customer"
   - Success screen (success-step.tsx): WhatsApp + More Share now call shareReceiptPdf; removed old buildReceiptText/shareOrCopy text paths
   - Transactions detail (transactions-view.tsx): handleShareWhatsApp → shareReceiptPdf(bill, settings, {whatsapp:true, L:en}); button relabelled "WhatsApp PDF"; captions updated ("Sends the printed-style PDF receipt to the customer's WhatsApp chat." / "Walk-in bill — the PDF downloads so you can send it anywhere."); Copy button intentionally still copies TEXT (explicitly labelled "Copy", useful for pasting anywhere)
   - buildReceiptText remains for the Copy action only
2. STYLING POLISH (mandatory): Success-screen action buttons upgraded to two-line POS-style labels — WhatsApp/More Share get a "PDF receipt" subtitle (emerald-100/80 on the green button, muted on outline), Download PDF/Print get the billNo (e.g. SX-0062) subtitle; i18n key pdfReceiptLabel (en/hi)
3. NEW i18n keys (en + hi): pdfWhatsappHint, pdfShareHint, pdfReceiptLabel
4. BUG FOUND & FIXED DURING QA — customer-step skip button covered by sticky Continue bar on short viewports (agent-browser click failed with "covered by div.sticky.bottom-4"; measured skipBottom 551 vs stickyTop 505 = −46px at 1280×577):
   - Root cause: the "Skip — Walk-in" button was INSIDE the lookup-results wrapper (never :empty → wrapper's mt-5 always occupied 20px) and had no short-viewport compaction; round-6's fix only covered the keypad
   - Fix set (all [@media(max-height:740px)]-gated, normal viewports untouched): skip button moved OUTSIDE the wrapper; wrapper gains empty:hidden (collapses fully when no lookup state) + mt-3; skip gets mt-2/min-h-10; keypad keys h-12→h-11 (44px — still ≥ Apple touch minimum); keypad gap-2→gap-1.5; cart chip py-2→py-1; display box min-h-11→min-h-10; H1 +text-lg; billing-flow root +pt-3! (beats lg:p-6)
   - Verified: clearance −46 → +12px at 577px (programmatic) + VLM review "skip fully visible, keypad fully visible, no overlaps"; 900px tall viewport unchanged (+24 flow clearance, 80px keys); walk-in undo panel state unaffected
5. VERIFICATION (all via agent-browser on headless Chromium, which has NO Web Share API — perfect for desktop-fallback testing):
   - Desktop WhatsApp fallback: wa.me tab opened with phone=917896543210 + short note (VLM confirmed the WhatsApp landing page message bubble); toast "PDF downloaded — attach it in the WhatsApp chat · SX-0061 · ₹200" (VLM-verified); zero JS errors
   - Desktop More Share/walk-in: toast "PDF receipt downloaded — send it to your customer · SX-0062 · ₹150"
   - MOBILE BRANCH SIMULATED by stubbing navigator.canShare/share in-page: navigator.share received a REAL PDF File — {name:"SaloonX-SX-0061.pdf", size:4762, type:"application/pdf"} + note + title "Receipt SX-0061" → on real Android/iOS this hands the actual PDF to WhatsApp as an attachment
   - Hindi E2E (bill SX-0062 walk-in cash): success screen shows व्हाट्सएप/और शेयर + "PDF रसीद" subtitles; exact toast DOM text captured: "PDF रसीद डाउनलोड हो गई — इसे ग्राहक को भेज दें | SX-0062 · ₹150"; language reset to EN afterwards
   - bun run lint CLEAN; bunx tsc --noEmit ZERO errors in src/; dev.log all 200s
6. Ops: dev server restarted once (setsid recipe); agent-browser notes — refs go stale across tab switches (re-snapshot), window.open steals active tab (stub it or accept the landing-page screenshot), sonner toasts live ~4s (capture fast or query [data-sonner-toast])

Unresolved issues or risks, and priority recommendations for the next phase:
- On mobile, Web Share L2 cannot deep-link DIRECTLY into a specific WhatsApp chat (platform limitation) — the share sheet adds one extra tap vs the old wa.me text link; this is the only way to attach a file and is standard POS behaviour
- Toast can transiently overlap the top of the success receipt card (known sonner cosmetic from earlier rounds, unchanged)
- Viewports 741–800px tall still require ~95px of scroll on the customer step (pre-existing; real browsers on 768–900px screens have ~60–80px chrome → mostly inside the ≤740 compaction band)
- jsPDF A5 PDF uses "Rs." (font limitation, unchanged); the share note uses ₹ (fine in WhatsApp)
- Next-phase candidates (priority): (1) offline bill queueing via IndexedDB + SW sync, (2) expense CSV/PDF export + monthly comparison chart, (3) per-user language preference, (4) Firebase migration when keys available, (5) customer birthday reminders (needs DOB field)
- Demo data note: SX-0061 (₹200 cash, new customer 7896543210, no name) and SX-0062 (₹150 walk-in cash) created during this round's E2E and left in as demo data; screenshots in download/ (success-whatsapp-pdf-toast.png, success-more-share-toast.png, txn-whatsapp-attach-toast.png, hindi-success-share-toast.png, customer-step-short-viewport-fixed.png)

---
Task ID: 5 (in progress)
Agent: main (Z.ai Code)
Task: Multi-tenant architecture + design overhaul — schema/lib/API/shell done; billing+admin views next (subagents 6-a/6-b/6-c)

Work Log:
- NEW hierarchy: SUPER_ADMIN (platform, no tenant) → Tenant (franchise: name, logo, active) → Branch (per-city outlet: address, phone, logo?, upiId, upiQrImage, ownerMobile, billPrefix, billCounter, gst*, loyalty*, receiptFooter, active) → ADMIN/STAFF via UserBranch assignments. Customers + menu are FRANCHISE-scoped; prices per-branch via ServiceOverride.
- Schema force-reset + reseeded: 3 franchises (Glow & Go Salons 3 branches Mumbai×2+Bengaluru, UrbanCuts 2 branches Delhi NCR, Blunt & Bronze 1 Hyderabad), 16 price overrides (Bandra premium +15%, Koramangala discounts + 2 disabled services), 96 bills, 30 expenses, branchVisits, new PWA icons from fresh SaloonX logo (seed-assets/*.b64.txt + public/icons/*).
- Logins: Dev (Platform) 9999 · Glow&Go: Ravi 1234 (all 3 branches), Priya 1111 (Andheri), Amit 2222 (Andheri+Bandra), Neha 3333 (Koramangala) · UrbanCuts: Arjun 4444, Kabir 5555, Dev 7777 · Blunt&Bronze: Meera 6666.
- auth.ts: SessionUser now {id,name,role,tenantId,tenantName,tenantLogo,branchId,branches[]}; requireApiBranch() guard for branch-scoped routes; adminBranchScope() resolves reportable branchIds (all franchise branches or ?branchId subset). Sessions carry branchId context; switch-branch updates ALL user sessions.
- API (all rewritten, curl-verified): /api/auth/branches (public tenant tree+logos+superAdmin tile), /api/auth/users?branchId= (branch roster), login {userId,pin,branchId}, me {user,branches,currentBranch}, switch-branch, /api/tenants GET/POST (SUPER_ADMIN; POST creates tenant+firstBranch+admin atomically), /api/tenants/[id] PUT, /api/branches GET/POST + [id] GET/PUT/DELETE (deactivate-if-data), /api/branch GET/PUT (current branch profile+settings; replaces old /api/settings — DELETED), /api/catalog (branch-effective), /api/catalog/franchise (FranchiseMenuResponse with overrides), /api/catalog/override POST/DELETE, service/category CRUD tenant-guarded, /api/transactions POST (atomic per-branch PREFIX-#### numbering via branch.billCounter increment; effective override pricing; franchise-wide customer upsert + branchVisit) GET (franchise-wide or ?branchId, byBranch summary), void (24h, tenant-scoped), /api/stats (branch scope + byBranch), /api/customers + lookup (branch loyalty settings, lastVisit.branchName) + [id] (branchVisits), /api/staff (branchIds/branchNames, assignment CRUD), /api/expenses (branch-scoped, byBranch), /api/export/csv (Branch column).
- Store: setSession({user,branches,currentBranch}) (setUser REMOVED), setCurrentBranch, View += 'branches' | 'tenants', defaultView: SUPER_ADMIN→'tenants' else 'billing'. Branch switch clears cart + removeQueries.
- Design overhaul (anti-AI-slop): globals.css refined (radius 0.75rem, warm paper neutrals, flatter surfaces, .tnum tabular money, .micro labels, .hairline cards, focus-visible ring); login redesigned as 3-step (branch picker grouped by franchise w/ logo chips + city search → user tiles → PIN pad); app-shell redesigned (franchise logo chip + branch switcher dropdown, role nav, RoleBadge incl Platform).
- i18n: added chooseBranch/chooseBranchHint/backToBranches/searchBranch/noBranches/branchesWord/branchWord/workingAt/changeBranch (en+hi), demoFooter now lists Platform PIN 9999.
- BUG FIXED: seed never persisted branch.billCounter → live bills collided with seeded billNo unique (P2002). Seed now persists counters; DB repaired (GG1=19, GG2=18, GG3=15, UC1=15, UC2=15, BB=14).
- Verified via curl: login flows (Ravi@Andheri + switch→Bandra), Bandra override prices (Haircut Men ₹180 vs ₹150, Straightening ₹1800 vs ₹1500), GST branch billing (₹180+18%=₹212.4 → GG2-0019), per-branch numbering, /api/tenants platform stats (3 tenants, 6 branches, ₹157,681.60/30d). Smoke-test bills deleted.

Stage Summary — CONTRACTS for Tasks 6-a/6-b/6-c (do not break these):
- types.ts: SettingsDTO REMOVED → use BranchProfileDTO from GET /api/branch. AppUser {id,name,role,tenantId,tenantName,tenantLogo}. MeResponse {user,branches,currentBranch}. CatalogResponse {branchId,categories}. TransactionsResponse {data,total,branches,summary:{...,byBranch[]}}. StatsResponse has byBranch: {branchId,name,revenue,bills}[]. ExpenseDTO has branchId/branchName. StaffDTO has branchIds/branchNames. CustomerDTO has homeBranchName?/branchCount?. New DTOs: BranchRef, BranchProfileDTO, BranchAdminDTO, TenantDTO, TenantsResponse, FranchiseMenuResponse, ServiceOverrideDTO, FranchiseServiceDTO/Category.
- POST /api/transactions → { transaction, branch: BranchProfileDTO } (branch = fresh current branch; use it for receipt/settings on success screen).
- store: useAppStore now exposes setSession (NOT setUser), branches, currentBranch, setCurrentBranch. useT() unchanged.
- Design: use .tnum for money/counts, .micro for uppercase labels, .hairline for flat cards, rounded-xl/2xl max, border + minimal shadow, NO gradients on buttons/cards, emerald reserved for money-positive/success, primary rosewood only.
- i18n: ONLY Task 6-a may add keys (en+hi both) for billing UI; admin views stay English.

---
Task ID: 6 (6-a + 6-b + 6-c combined)
Agent: main (Z.ai Code — subagent system was DOWN with upstream error 1214, so all views were implemented directly)
Task: Branch-aware billing + admin views + PDF summary report + super-admin console + Branches manager + design overhaul completion

Work Log:
- 6-a Billing (branch-aware): billing-flow switched settings→branch (GET /api/branch, POST /api/transactions now returns {transaction, branch}); PaymentStep takes BranchProfileDTO (UPI QR + GST from branch); SuccessStep receipt card shows branch logo??tenant logo + branch name + franchise micro-line + address/phone; receipt-pdf.ts A5 doc now draws logo (PNG via addImage try/catch), branch identity, franchise name, per-branch GST rows; receipt-share.ts same 3-branch strategy (Web Share L2 → wa.me+download → download+clipboard) with branch branding; buildReceiptText kept for Copy. customer-step LastVisitHint gained branchName chip. New i18n keys: chooseBranch/backToBranches/searchBranch/workingAt etc (en+hi), demoFooter lists Platform PIN 9999.
- 6-b Admin: report-pdf.ts — ledger export gained Branch column + branch header/logo + branch billPrefix filename; NEW buildSummaryReportDoc/summaryReportFile/downloadSummaryReportPdf + ReportContext {name, logo, tenantName} (franchise-wide or branch-scoped branding) rendering KPI table (Revenue/Bills/Avg/New customers/Returning/Expenses/Net profit), payment split, per-branch revenue table (byBranch), top services, staff performance w/ commission, logo + page footers. dashboard-view: Share Report (primary) generates the PDF → Web Share L2 when canShare, else downloads + toast "Summary report downloaded"; secondary WhatsApp button posts a SHORT NOTE + "Full PDF report follows 📄" to branch.ownerMobile; branch scope chips (All/Andheri/Bandra/Koramangala) drive stats+recent queries + BranchSplitCard; KPI cards .hairline/.tnum/.micro. services-view → Menu & Prices: FranchiseMenuResponse matrix — per-service expandable Branch pricing panel (price input commits on blur, empty/equals-default → DELETE override → inherits; availability Switch per branch; reset button; "N custom prices" badge + per-service "custom" badges). staff-view: branch assignment BranchPicker (module-level component, checkboxes w/ city) in add/edit dialogs; POST/PUT staff accept branchIds; branch chips under each staff row. customers-view: loyalty from branch profile, homeBranchName+branchCount chips. expenses-view: branch filter Select + branch line on rows + branch picker in dialog (ExpenseFormState.branchId); PUT /api/expenses RE-ADDED (branch-scoped edit+move) since the old UI edits expenses. settings-view → Branch Settings for CURRENT branch: profile/logo upload (client-resized PNG), UPI ID + QR upload, owner WhatsApp, GST + loyalty rules, receipt footer + live preview, sticky save bar with dirty state; branch identity header w/ billPrefix chip. transactions-view: Branch column (desktop+mobile), branch filter Select from response.branches, CSV/PDF carry branchId, dialog re-share uses branch profile.
- 6-c Views: tenants-view (platform console): 4 KPI cards (revenue/bills/franchises+branches/staff+new customers), franchise cards (logo chip, Active/Paused, N branches · M cities · K staff, revenue 30d big tnum, expandable branch table, Pause/Resume with confirm dialog), New Franchise 3-section onboarding dialog (franchise name+logo upload → first branch incl unique billPrefix w/ auto-suggest + UPI → admin name+4-digit PIN); POST /api/tenants atomic; pause drops sessions (server). branches-view (franchise admin): BranchAdminDTO cards (logo, city+address, prefix chip, GST badge, staff count, revenue/bills 30d, Manage + Deactivate), Add Branch dialog (full profile + unique prefix + grant-access multi-select from /api/staff), Manage dialog loads GET /api/branches/[id] full profile (sections: Profile/Payments/Billing rules/Receipt+numbering, logo+QR uploads, save via PUT), DELETE flows deactivate-with-data vs delete-empty with explicit confirm copy.
- ui-atoms: CatalogResponse removed (now in lib/types), RoleBadge gained SUPER_ADMIN "Platform" variant.
- BUGS FIXED during this phase: (1) seed never persisted branch.billCounter → live bills collided with seeded billNo unique (P2002) — seed now writes counters, DB repaired; (2) PUT /api/expenses had been dropped in the API rewrite (old UI edit-expense flow needed it) — restored with tenant guard + branch-move support; (3) staff-view BranchPicker was defined inside the component (react-hooks/static-components + parse imbalance) — moved to module level, fixed a stray brace; (4) transactions-view had leftover settings references in dialog captions/buttons — all switched to branch.
- QA via agent-browser (headless Chromium): FULL E2E verified — login branch picker (3 franchises grouped + logos + Platform tile) → Andheri roster → Ravi PIN 1234 → shell w/ franchise chip + branch switcher; billing E2E: Haircut(₹150)+Blow Dry(₹200)=₹350 → keypad 9876543210 → Rahul recognized (8 visits, "recommend 10% off", last-visit ₹420 @ Bandra chip) → Apply → Continue → summary ₹350−10%=₹315 → Cash → tendered ₹500 → "Return ₹185" → Confirm → GG1-0020 success + receipt card (branch name + franchise + address + items + discount); New Bill reset. Dashboard: "Last 7 days · All branches · 28 bills", branch chips, BranchSplitCard (Andheri ₹21,967/14 · Bandra ₹12,431.30/9 · Koramangala ₹5,000/5), Share Report → real 92KB PDF verified via pdftotext ("Glow & Go Salons — Business Summary — Revenue Rs. 39,398.3 …") + toast; Menu & Prices: Haircut (Men) panel shows Andheri "Inherits ₹150" + Bandra/Koramangala "Custom price" + resets + availability switches; Staff: per-person branch chips (Amit→Andheri+Bandra, Neha→Koramangala) + today stats; Transactions: branch filter + branch cells; Branches view: 3 cards w/ prefix chips + GST badge + Manage dialog fully populated; header branch switcher → Bandra → billing catalog shows OVERRIDE prices live (Haircut ₹180, Straightening ₹1,800); logout → Dev PIN 9999 → Platform console: KPIs ₹1,56,284.20 · 97 bills (matches DB exactly), franchise cards w/ revenue, New Franchise E2E created "QA Test Franchise" (toast + card appeared) then removed via cleanup script.
- QA ops note: rapid 4× clicks on the same PIN-pad digit ref RACED the auto-submit (server returned 401 for a partial PIN and the UI bounced) — with sleep 0.4 between clicks it works 100%; curl proves the login/me chain correct — automation artifact, not an app bug. Also: agent-browser refs go stale across ANY re-render (framer-motion screens re-render often) — always re-snapshot before every click.
- Verification: bunx tsc --noEmit → ZERO errors in src/; bun run lint → 0 errors 0 warnings (after --fix removed stale eslint-disable comments); dev.log clean (only documented historical P2002s from before the counter fix + intentional 401/403s).

Stage Summary:
- MULTI-TENANT MVP COMPLETE AND BROWSER-VERIFIED: Super Admin (Dev/9999) → 3 seeded franchises (Glow & Go 3 branches w/ Bandra premium overrides + Koramangala discounts/disabled services, UrbanCuts 2, Blunt & Bronze 1 GST boutique) → franchise admins (Ravi/1234 all-branches, Arjun/4444, Meera/6666) → staff with per-branch assignments (Priya/1111 Andheri, Amit/2222 Andheri+Bandra, Neha/3333 Koramangala, Kabir/5555, Dev/7777).
- USER'S THREE ASKS ALL DELIVERED: (1) multi-tenant hierarchy with per-franchise logos/names/menus + per-branch price overrides/availability/profiles/settings ✓; (2) design de-slop — refined tokens (12px radius, warm paper neutrals, .tnum/.micro/.hairline, flat surfaces, no gradient chips/buttons), new SaloonX logo + franchise logos everywhere (login groups, shell header, receipts, PDFs, platform console) ✓; (3) Share Summary is now a real PDF report (logo + KPIs + payment split + per-branch table + top services + staff performance) shared as a FILE via Web Share L2 on mobile, download+note fallback on desktop — never plain text ✓.
- Demo data note: QA created GG1-0020 (Rahul, ₹315, 10% loyalty off, cash) — left in as a realistic live-bill example. All QA screenshots in download/qa-1..9.

---
Task ID: 10 (Firebase-migration recovery + approval UI + shift handover reports + customer birthdays)
Agent: main (Z.ai Code)
Task: Resumed after context loss mid-Firebase-migration. Assessed project state via agent-browser QA, fixed the broken/half-finished migration artifacts, completed the branch-approval feature, then shipped two new features (staff shift handover PDF reports + customer birthday reminders) with full E2E verification.

Current project status / assessment:
- The previous round (interrupted, never logged) had migrated auth from PIN to Firebase email/password: schema (User.email+firebaseUid, Branch.approved/approvedAt), deleted /api/auth/login|branches|users, added /api/auth/firebase-session + src/lib/firebase.ts + firebase-rest.ts + prisma/firebase-seed-helper.ts, rewrote login-view (split-screen email/password + branch picker) — the chain WORKS against the real Firebase project "saloonxpro" (ravi@glowgo.example / saloon123 verified end-to-end via curl AND browser).
- Found broken on arrival: (1) dev server had a stale Prisma client → /api/auth/me + firebase-session 500'd ("Unknown field approved") — fixed by the documented setsid restart; (2) prisma/seed.ts had leftover type errors (never-inferred users[], pin: fields on UrbanCuts staff); (3) New Franchise dialog still sent admin PIN but the API requires email+password → creation would 500; (4) DB had HALF-SEEDED data — UrbanCuts had 0 users/0 customers/0 txns and Blunt & Bronze tenant was MISSING entirely (seed crashed mid-run when the previous context died). Fixed by force-reset + full reseed.
- QA on arrival (agent-browser): Firebase login → branch picker → billing E2E (customer lookup, 10% loyalty, cash + change, PDF receipt share) → dashboard → staff → branches → platform console — zero page errors.

Current goals / completed modifications / verification results:
1. BUGFIX — New Franchise dialog (platform console): PIN fields replaced with Admin name + Email (their login) + Password (min 6) matching POST /api/tenants {admin:{name,email,password}}; prefix auto-suggest now keys off adminEmail; success toast shares the login email. E2E VERIFIED: created "QA Chain" + branch + admin through the UI → real Firebase login for qa-owner@testchain.example worked (curl-verified) → then cleaned up (deleted tenant; Firebase test account left, harmless).
2. RESEED (full, richer): 3 tenants · 7 branches · 9 users · 47 services · 96 txns · 11 customers (WITH birthdays) · 16 overrides · 30 expenses. Logins (password saloon123 for ALL): dev@saloonx.example (Platform) · ravi@glowgo.example (G&G admin, 3 branches) · priya@/amit@/neha@glowgo.example · arjun@urbancuts.example (admin) · kabir@/dhruv@urbancuts.example · meera@bluntbronze.example (B&B admin). Seed now includes "Glow & Go — Powai" as a PENDING-approval branch (approved=false) to demo the approval queue, and customers carry birthday "MM-DD" strings.
3. FEATURE COMPLETED — Branch approval workflow (backend existed from the interrupted round; UI was missing):
   - Platform console (tenants-view): amber "Branch approvals" queue section (count badge, tenant/branch/city/prefix/requested-date per row) with Approve (PUT /api/branches/[id] {approved:true}) / Decline (DELETE) buttons. VERIFIED: queue showed Powai → Approve → toast "Branch approved" → queue empties → Powai appears in Glow & Go's live branch table.
   - Branches view (franchise admin): amber "Awaiting approval" badge (Clock3 icon) on pending branch cards; Add Branch dialog now explains "New branches go live after a one-time platform review…"; success toast says "requested … the platform reviews new branches before they go live."
4. NEW FEATURE — Staff shift handover reports (交接班报告):
   - API GET /api/staff/shift?staffId=&date= (ADMIN: any franchise staff; STAFF: always self): bills list + payment split (CASH/UPI/CARD count+amount) + revenue/discounts/avg/commission (revenue×pct) + cashCollected (the handover number) + first/last bill times. Verified: Priya → 3 bills ₹3,560, commission ₹356, UPI 3/3.
   - report-pdf.ts: buildShiftReportDoc (A4: headline tiles CASH TO HAND OVER / TOTAL COLLECTED / COMMISSION, payment split table, bill-by-bill table with totals footer, signature strip "staff — Manager/Owner", per-page footers) + shiftReportFile (Web Share L2 File) + downloadShiftReportPdf.
   - NEW shift-report-dialog.tsx (shared): summary tiles (cash emerald), animated payment-split bars, scrollable bill list (billNo · time · customer · branch · method chip · total), Share PDF (native share sheet on mobile, download+toast on desktop) + Download. Empty state "No bills yet today".
   - Mounted: staff-view per-row Clock3 button (admin views anyone) + app-shell account menu "My shift today" (ADMIN+STAFF self view). Super-admin sidebar blurb updated (no more PIN mention).
   - VERIFIED: Ravi's own shift (4 bills ₹11,197, cash ₹3,245) → downloaded Shift-Ravi-(Owner)-2026-10-12.pdf → pdftotext confirms headline numbers; Priya's dialog shows COMMISSION tile; mobile 390px dialog OK.
5. NEW FEATURE — Customer birthday reminders (顾客生日提醒):
   - Schema: Customer.birthday String? ("MM-DD"); db:push + full reseed (Rahul 10-12 TODAY, Sneha 10-15, Mohammed Ali 10-18, Sana 10-14, Rohan 10-17 among others).
   - API: GET /api/customers?birthdaysWithin=7 → sorted BirthdayCustomerDTO[] (name/mobile/birthday/daysUntil/homeBranch/lastVisit); NEW PUT /api/customers/[id] {name?, birthday?} with MM-DD validation + null-clear; CustomerDTO gains birthday (flows through list + lookup automatically).
   - Dashboard: "Birthdays this week" card (Cake icon, date-tile per row, TODAY 🎉 pill, "in Nd", home branch, emerald WhatsApp "Wish" button → wa.me with personalized greeting; empty-state hint; Customers shortcut).
   - Customers view: BirthdayBadge chips on desktop table + mobile cards (rose "Today 🎉"/"in Nd" within 7d, muted date chip beyond); history dialog gains a birthday editor row (chip → inline DD-MM input with auto-dash, Save/Cancel/Remove, Enter-to-save) that updates LIVE after save (dialog now prefers the fresh history-fetch profile over the stale row prop — bug found & fixed during QA).
   - Billing customer step (i18n en+hi): "🎂 Birthday today — wish them! / Birthday tomorrow / Birthday in {n} days" rose chip on the recognised-customer card (both loyalty-banner and plain states). Also replaced the old gradient loyalty banner with solid bg-primary (de-slop rule).
   - VERIFIED: dashboard card lists Rahul TODAY + Wish button opens wa.me/919876543210 with the full greeting; billing hint shows for Rahul; dialog edit 12-10→25-12→12-10 round-trips with toasts; mobile card OK.
6. Full regression E2E (desktop 1440×900 + mobile 390×844): Firebase login → Andheri → bill GG1-0020 (Rahul, birthday hint + 10% off, cash, success + PDF receipt buttons) → dashboard (birthdays + Share Report) → customers (badges + editor) → staff (shift buttons) → account menu My shift → platform console (approvals + New Franchise email/pw + create E2E). bunx tsc --noEmit ZERO errors in src/; bun run lint CLEAN; dev.log all 200s; zero page errors.

Unresolved issues or risks, and priority recommendations for the next phase:
- The old QA bill GG1-0061/0062 etc. are gone (force-reset reseed) — GG1-0020 from this round's QA remains as the live-bill demo. Bill counters were reset accordingly by the seed.
- Firebase test accounts from QA rounds (qa-owner@testchain.example) linger in the real Firebase project — harmless; a nightly Firebase cleanup script is the production answer.
- Branch approval has no notification to the franchise admin when approved (they discover it in Branches view) — a toast/announcement system is the future polish.
- Shift report is per-day only (no date picker in UI — API supports ?date=) and cash-to-hand-over ignores cash expenses/petty cash; acceptable v1.
- Birthday has no year (intentional — salons rarely know it); no birthday-campaign analytics (how many wishes → visits).
- agent-browser gotcha THIS round: snapshot refs print WITHOUT the @ prefix in this version ([ref=e86]) — extract with pattern 'e[0-9]+' and click with '@e86'; rapid digit-dial needs ~0.35s between clicks; HMR rebuilds (from file edits during an open session) invalidate stale refs — re-snapshot before every click; two Continue buttons exist on the billing services step — the SECOND ref (after "Your bill") is the desktop one that works.
- Next-phase candidates (priority): (1) offline bill queueing via IndexedDB + SW background sync, (2) expense CSV/PDF export + month-over-month comparison chart, (3) per-user language preference persisted server-side, (4) tenant-level cross-branch comparison report for platform console (byBranch data already aggregated), (5) birthday campaign analytics, (6) approval notifications.

---
Task ID: 11 (expenses filter fix + expense CSV/PDF exports + monthly profit-trend chart + richer 5-month seed)
Agent: main (Z.ai Code)
Task: Scheduled review — QA'd the app post-Task-10, found and fixed a silent expenses-filter regression, then shipped the worklog's next-priority features: expense exports + the monthly P&L trend. Rebuilt the seed to carry 5 months of believable history so the trend chart tells a growth story.

Current project status / assessment:
- App stable after Task 10 (Firebase auth, branch approvals, shift handover, birthdays). Smoke QA on arrival: dashboard/expenses/billing/platform console all rendered, zero page errors.
- REGRESSION FOUND: the Expenses view's range chips (Today/7 Days/30 Days…) and category chips did NOTHING — the UI sent ?from&to&category but the multi-tenant API rewrite of /api/expenses only read branchId/page/limit. Any filter combination returned ALL expenses (15 entries ₹55,996 shown for every range). The dashboard P&L strip was unaffected (it aggregates via /api/stats with its own date filter).

Current goals / completed modifications / verification results:
1. BUGFIX — /api/expenses GET now applies ?from/?to (on the expense's own day, via dayStart/dayEnd) and ?category (validated against the 7-category enum). ONE shared `where` predicate now drives the data rows, the count AND the summary, so all three always agree. curl-verified: all → 15/₹55,996.05; today → 0/₹0; ?category=SUPPLIES → 3/₹11,463.90 (summary byCategory keys narrow to SUPPLIES only). Browser-verified: "Today" chip → "0 entries −₹0" + empty state; "30 Days" → 15/₹55,996.05; "Rent" chip → 3/₹28,262.90.
2. NEW FEATURE — Expense exports (worklog priority #2, first half):
   - GET /api/export/expenses (CSV): same from/to/category/branchId filters as the view; columns Date, Category, Description, Amount, Branch, Entered by, Logged at; BOM+quoted cells like the transactions CSV. VERIFIED: with Rent chip + 30 days active, the downloaded CSV contained ONLY rent rows (branch names intact).
   - report-pdf.ts: NEW buildExpenseReportDoc/downloadExpenseReportPdf — A4 ledger: franchise logo+name header, range label (incl. active category), KPI strip (TOTAL EXPENSES / ENTRIES / TOP CATEGORY), category breakdown table with totals footer, full row table (Date/Branch/Category/Description/Entered by/Amount). BUG FOUND DURING QA: first version passed `${e.date}T00:00:00` to formatDate but ExpenseDTO.date is a full ISO string → jsPDF "Invalid time value" (caught via toast in QA); fixed by passing e.date directly. VERIFIED: pdftotext shows "Rent · 13 Sept – 12 Oct 2026" header, ₹28,262.9/3 KPIs, category table.
   - Expenses view: CSV + PDF outline buttons in the header (Download/FileText icons, spinner while working, disabled during load); exports apply the ACTIVE range+category+branch filters; PDF fetches limit=200 and uses the franchise/branch name + logo branding; success toasts carry entry-count + total.
3. NEW FEATURE — Monthly profit trend (worklog priority #2, second half):
   - GET /api/stats/monthly?months=6&branchId= (ADMIN, adminBranchScope-scoped): last N calendar months (2–12) of {ym, label, revenue, expenses, profit, bills}; transactions grouped by createdAt month (COMPLETED only), expenses by their own date month; zero-filled from the first month so the axis is continuous. JS-side aggregation (~300 rows max) — no raw SQL date-truncation needed.
   - Dashboard: NEW "Profit trend" card under the revenue chart — recharts ComposedChart with revenue bars (chart-1 rosewood) + expenses bars (chart-2 amber) + profit Line (chart-3 emerald, 2.5px), rounded bar tips, custom TrendTooltip (revenue/expenses/profit with sign-coloured profit), Avg-profit/mo pill in the header, manual legend chips, skeleton while loading; respects the branch-scope chips (query key includes scope).
   - VERIFIED: 6 bars+line pairs on desktop AND mobile 390px (12 rectangles counted via DOM); tooltip renders all three values; branch scope switching refetches.
4. SEED REBUILD — 5 months of believable history (so the trend chart isn't 4 empty months):
   - Transactions now spread across ~150 days: customer bills keep their first ~2 visits recent (lively today/7d/30d dashboards) with older visits at dayOffset 15–150; walk-ins 45% recent / 55% spread; "lively today" guarantee unchanged. txnCounts raised: Glow & Go 48→120, UrbanCuts 26→80, B&B 12→60 → 264 seeded bills total.
   - Expenses now recur MONTHLY for the last 6 months per branch with category weights (rent .20, salary .10, supplies .08, utility .05, marketing .035, maintenance .035 of the franchise budget) — full weight for the current month, 60% for older months (ramping-salon realism); current-month dates capped at today; SALARY category now demoed too. 216 expenses total (was 30).
   - Resulting 6-month G&G story (verified via API): May −₹11.4k (just opened) → Jun −₹0.8k (breakeven) → Jul +₹7.6k (turned profitable) → Aug −₹2.4k (monsoon dip) → Sep +₹6.1k → Oct +₹51.2k (current). Bill counters re-persisted; live billing continued seamlessly (QA bill GG1-0044 = seeded 43 + 1).
5. Regression E2E after reseed (desktop 1440×900 + mobile 390×844): login as Dev → platform console approvals queue shows 1 pending (Powai — left PENDING intentionally as the approval-flow demo); login as Ravi → Andheri → billing E2E cash walk-in ₹300 (GG1-0044, PDF receipt buttons present) → dashboard (P&L strip + birthdays + Profit trend all present) → expenses (filters + CSV + PDF verified). bunx tsc --noEmit ZERO errors; bun run lint CLEAN; dev.log all 200s; zero page errors.

Unresolved issues or risks, and priority recommendations for the next phase:
- QA-automation gotcha (documented for future rounds, NOT an app bug): (1) a11y snapshot lines for required fields print `[required, ref=eNNN]` — ref-extraction patterns like `rg -F 'textbox "EMAIL" [ref='` silently fail / cross-match; use `rg 'textbox \"EMAIL\"'` and take the last e-number, and VERIFY with a DOM eval before submitting forms; (2) repeated agent-browser fills during re-render storms CONCATENATE into the input instead of clearing ("ravi@glowgo.examplesaloon123" caused a bogus INVALID_LOGIN_CREDENTIALS) — clear via native-value-setter eval then re-snapshot; (3) a stray dialog (Escape-dismissable) can cover the billing flow after failed interactions.
- Expense PDF/CSV exports cap at 200 rows per export (single fetch) — fine for salons; pagination-aware export is the upgrade path.
- /api/stats/monthly aggregates in JS — fine at salon volume (<10k bills); needs groupBy/raw-SQL if a franchise ever crosses ~50k bills.
- The May bar shows a loss because May revenue is partial (bills only spread back to day-150) while expenses cover the whole month — reads believably as "opened mid-May".
- Next-phase candidates (priority): (1) OFFLINE bill queueing via IndexedDB + service-worker background sync (the marquee PWA feature left), (2) per-user language preference persisted server-side, (3) tenant-level cross-branch comparison report for the platform console (byBranch already aggregated per franchise), (4) approval notification when a branch goes live, (5) birthday-campaign analytics (wishes sent → visits won), (6) day-of-week/hour heat analysis for staffing.

---
Task ID: 12 (offline bill queue + busy-hours heatmap + platform franchise comparison)
Agent: main (Z.ai Code)
Task: Arrived to a stable app (Task 11 had just shipped expense exports + profit trend). Ran agent-browser regression QA on all three roles, then shipped the worklog's top-priority features: (1) OFFLINE BILL QUEUEING — the marquee PWA feature, (2) business-hours heatmap, (3) cross-franchise comparison report for the platform console.

Current project status / assessment:
- App stable on arrival. Smoke QA: Ravi login → billing E2E (GG1-0045 cash walk-in, zero page errors), dashboard cards (P&L strip, birthdays, profit trend), expenses filters — all healthy. No bugs found pre-feature work.
- ONE bug found during feature QA (own mistake): the offline banner prop `pendingSync={Boolean(pendingQueueBill)}` was missing from the SuccessStep render call (first MultiEdit had failed halfway) — banner silently absent; fixed and re-verified with a second offline bill.
- Environment gotcha that COST TIME this round: after `prisma db push` adds new columns, the RUNNING Next dev server keeps the old Prisma client module in memory → "Unknown argument clientRequestId" 500s. Fix: `bunx prisma generate` + `touch next.config.ts` to force a full server restart. Do this ANY time the schema changes while dev is running.

Current goals / completed modifications / verification results:
1. NEW FEATURE — Offline bill queue (IndexedDB + idempotent sync):
   - Schema: Transaction.clientRequestId String? @unique (idempotency key) + clientCreatedAt DateTime? (true payment time). Additive push, no reseed needed.
   - API POST /api/transactions: accepts clientRequestId + clientCreatedAt. Existing clientRequestId → returns the ORIGINAL transaction with duplicate:true (idempotent retry, never double-bills). clientCreatedAt becomes the bill's createdAt. VERIFIED via direct API: same key POSTed twice → same bill GG1-0046, createdAt honored at 08:30Z; test bill then voided for cleanup.
   - src/lib/offline-queue.ts (NEW): hand-rolled IndexedDB wrapper (db "saloonx-offline", store "bill-queue", keyPath clientRequestId — queue survives reloads), sync engine (network error → keep & stop; server 400/4xx → keep with lastError + attempts counter; success → delete), QUEUE_EVENT CustomEvent bus, installAutoSync() (online-event sync + 30s gentle retry while queue non-empty).
   - billing-flow: confirmPayment checks navigator.onLine first → offline path saveOffline() enqueues + builds a local preview TransactionDTO (OFFLINE-XXXX billNo, GST math from branch profile, true local time) → success screen with amber "Saved on this device / will sync itself" banner (CloudOff icon, pulsing amber dot). TypeError "Failed to fetch" mid-request also falls back to the queue.
   - src/components/shell/sync-indicator.tsx (NEW): header indicator (amber CloudOffline / spinning sync / green Signal states) + count badge (destructive red when a bill has lastError) + popover queue manager (₹tile, item summary, method, time, per-bill Discard, Sync now, reassurance footer). Auto-toast "Synced N offline bills" when the queue drains while popover closed.
   - i18n: savedOffline / savedOfflineHint (en+hi).
   - E2E VERIFIED (agent-browser with navigator.onLine property-hijack): offline ₹150 haircut → OFFLINE-833D preview + banner + badge "Offline — 1 bills queued" → popover shows the queued bill → restore online → installAutoSync fires automatically → bill lands as GG1-0047 with the original clientCreatedAt; second offline bill synced as GG1-0048 after a page RELOAD (queue persisted in IndexedDB across reloads ✓).
2. NEW FEATURE — Busy hours heatmap (dashboard staffing planner):
   - GET /api/stats/hours?from&to&branchId (ADMIN, adminBranchScope): 7 dow (Mon=0) × 14 hourly buckets (8:00–22:00, out-of-range clamps into edges) of {bills, revenue} + dowTotals + hourTotals + peak + totals. VERIFIED: cells/dow/hour sums all equal totalBills (82 bills Aug 15–Oct 12).
   - src/components/admin/busy-hours-card.tsx (NEW): rosewood-intensity grid (sqrt-scaled opacity), hover tooltip (N bills · ₹) + cell magnify, peak cell amber ring + "🔥 Peak Mon 10a–11a · 4 bills" chip, per-day total rail right + busiest-day highlighting, hour-totals rail bottom, Less→More gradient legend, "Busiest day"/"Rush hour" footnotes, horizontal scroll on mobile (min-w-560, page never overflows). Respects the dashboard range picker + branch-scope chips (query key includes scope).
   - VLM visual review of a live screenshot: grid clean/readable, labels visible, gradient varies light-pink→deep-magenta, zero glitches.
3. NEW FEATURE — Franchise comparison (platform console):
   - GET /api/stats/platform (SUPER_ADMIN): per-franchise rolling-30d revenue, prior-30d revenue, growthPct (null when no baseline), bills, avgBill, revenuePerBranch, activeBranchCount + 6-month monthly series. All-tenant JS aggregation over one findMany.
   - src/components/admin/franchise-compare-card.tsx (NEW): league table with rank medals (#1 solid primary circle), growth badges (emerald ↗ / rose ↘ / muted "new"), per-franchise 6-month SVG sparkline (area fill + last-point dot), animated share bars (staggered), "44% of platform" shares, platform-total footnote with aggregate growth + revenue-per-branch, CSV export (BOM + quoted cells).
   - VERIFIED: card renders with real data (Blunt & Bronze ₹1,00,813 #1 / Glow & Go ₹93,404 #2 / UrbanCuts ₹33,311 #3; platform +476%); CSV button present. VLM reconstructed the layout faithfully from the screenshot (all elements legible).
4. Final regression: online billing E2E after all edits (GG1-0049 CARD ₹100, zero page errors), dashboard heatmap renders (98 cells), dev.log all 200s, `bunx tsc --noEmit` ZERO errors in src/, `bun run lint` CLEAN, mobile-width check: heatmap scrolls internally, page does not overflow horizontally.

Unresolved issues or risks, and priority recommendations for the next phase:
- Offline-queue sync is BEST-EFFORT single-device: a bill queued on phone A never syncs from phone B. Fine for a single-POS salon; multi-device dedupe is a server-side reconciliation problem (out of scope).
- Offline preview receipts print "OFFLINE-XXXX" numbers — the real billNo only exists after sync. Customers who keep the offline receipt can't quote it for the books; acceptable v1 (salons hand the paper till sync completes).
- Server-rejected queued bills (e.g. service deleted meanwhile) park with lastError forever until manually discarded — the popover exposes Discard, but no in-app notification beyond the red badge.
- /api/stats/hours clamps to 8:00–22:00 — a 24h salon would need bucket widening (trivial: HOUR_MIN/MAX constants).
- agent-browser gotchas THIS round: (1) Radix dropdown menus do NOT open via synthetic el.click() — always use agent-browser click @ref after a fresh snapshot; (2) agent-browser open --viewport-size flag did NOT apply (1280x577) — use CSS forcing + scrollWidth checks for mobile-width assertions; (3) HMR after billing-flow edits can throw a transient "client-side exception" on the open page — just reload, it's the hot-swap not the code; (4) VLM review sometimes hallucinates a full HTML reconstruction instead of answering the question — its reconstruction still proves what was visually legible; re-prompt with a shorter question for a normal review.
- Next-phase candidates (priority): (1) approval notification/announcement banner when a branch goes live (franchise admins currently discover it silently), (2) per-user language preference persisted server-side (lang is localStorage-only today), (3) birthday-campaign analytics (wishes sent → visits won), (4) shift-report date picker in the UI (API already supports ?date=), (5) queued-bill export/print for the offline paper trail.

---
Task ID: 13 (announcements system + language persistence + shift date picker + birthday wish tracking + mobile overflow fixes)
Agent: main (Z.ai Code)
Task: Arrived to a stable app (Task 12 shipped offline queue + heatmap + franchise comparison). Ran full 3-role regression QA, then shipped the worklog's top-priority features: (1) ANNOUNCEMENTS / NOTIFICATIONS SYSTEM — the branch-approval notification gap, (2) per-user language persistence server-side, (3) shift-report date picker, (4) birthday wish tracking. Also found and fixed a REAL mobile overflow bug in the Branches view.

Current project status / assessment:
- App stable on arrival. QA sweep (all PASSED, zero page errors): Ravi (ADMIN) dashboard KPIs/2 recharts/98 heatmap cells/no overflow + billing E2E cash walk-in GG1-0050; Dev (SUPER_ADMIN) platform console (franchise comparison +476.8%, 1 pending approval); Priya (STAFF) nav restricted to Billing only + My shift menu. VLM review of dashboard: cohesive, no broken layouts (its "clipped chart" notes were screenshot-viewport artifacts — Payment Split card verified scrollH=clientH).
- QA-automation gotchas THIS round (documented for future rounds): (1) after HMR, the login form IGNORES eval native-setter fills (values look set but React state stays empty → submits "" → auth/invalid-email). Use `agent-browser click @ref` then `keyboard type` for the login form post-HMR. (2) `agent-browser set viewport 390 844` is the working way to resize (plain `viewport` is not a command). (3) MultiEdit is NOT always atomic — a failed batch can leave earlier edits applied; re-read the file after any MultiEdit failure. (4) `window.open(...,'_blank')` from a headless page NAVIGATES the current tab to wa.me — reopen localhost and continue after testing Wish buttons.

Current goals / completed modifications / verification results:
1. NEW FEATURE — Announcements & notifications (the approval-notification gap, worklog priority #1):
   - Schema: Announcement {tenantId?, kind, title, body, createdAt} + AnnouncementRead {announcementId, userId, readAt, @@unique} — per-user read receipts; tenantId null = platform-console-only. User.lang also added (see #2). Additive db:push (no reseed).
   - API: GET /api/announcements (ADMIN/STAFF → their franchise's; SUPER_ADMIN → tenantId-null; per-user unread flags + count, take 30). POST /api/announcements/read {ids} — batch mark-read, idempotent (SQLite createMany has NO skipDuplicates type support — pre-filter existing receipts instead, that was the one tsc error caught).
   - Triggers wired into existing routes: PUT /api/branches/[id] {approved:true} (false→true transition) → "🎉 {branch} is live!" announcement to the branch's tenant; {active:false} pause → BRANCH_PAUSED note; DELETE of a PENDING branch by SUPER_ADMIN → BRANCH_DECLINED; POST /api/tenants → WELCOME note inside the creation transaction. All best-effort (never block the parent operation).
   - UI: NEW src/components/shell/announcements-bell.tsx — (a) header bell button (next to SyncIndicator, all roles) with animated unread badge (destructive pill, "9+" cap), (b) popover feed: kind-colored icon chips (PartyPopper/Branch live emerald, CircleSlash/Declined rose, Building2/Paused amber, Megaphone/Welcome primary, Info/Notice muted), title + full body (line-clamp removed after VLM caught mid-word cuts), timeAgo ("just now/5m/3h/2d/4 Mar"), unread dot + primary-tinted row, per-row "Mark read" + header "Mark all read" (spinner), skeleton + empty states, gentle polling (refetchInterval 60s), (c) AnnouncementBanner — slim emerald celebration strip UNDER the header for a fresh (≤7 days old, freshness guard added after QA caught an 84-day-old Bandra approval stealing the banner) unread BRANCH_APPROVED: pulsing dot, title (truncate) + body (line-clamp-2), ADMIN "View branches" button (navigates + marks read), X dismiss = mark read; banner text is a button that dispatches 'sx:open-announcements' CustomEvent → bell opens its popover. Both components share one react-query key (deduped).
   - format.ts: NEW timeAgo(). Seed: +5 announcements (G&G welcome/Bandra-live/festive-info, UrbanCuts welcome, B&B welcome, back-dated 2–160 days) — inserted into the LIVE db via one-off script (no reseed; seed.ts also updated for future full reseeds).
   - E2E VERIFIED: seeded bell shows "3 new" for Priya → popover list + mark-all-read clears badge (API unread:0). Dev approves Powai in platform console → announcement row created (verified via Prisma) → Ravi login: banner "Glow & Go — Powai is live! 🎉" + bell "4 new" → "View branches" navigates to Branches + Powai in list + banner dismissed. VLM review: banner "well-designed, high readability, clear actionable button". Mobile 390px: banner renders, no overflow, body wraps 2 lines (VLM pass), tap opens popover.
2. NEW FEATURE — Per-user language persistence (worklog priority #2):
   - Schema: User.lang ("en"|"hi"|null). GET /api/auth/me now returns profile lang; NEW PUT /api/auth/me {lang} persists it.
   - LangToggle: toggling while signed in fire-and-forgets PUT to the profile (login-screen toggles stay localStorage-only — no session yet). Store setSession: fresh device (no LANG_STORAGE_KEY) ADOPTS the profile language (and caches it locally); a device with an explicit local choice always keeps it.
   - VERIFIED end-to-end: Priya toggles हिंदी → User.lang='hi' in db → logout + localStorage.clear + reload (fresh-device simulation, login page renders EN) → login → billing UI auto-हिंदी ("सेवाएं"). Cross-device sync works.
3. NEW FEATURE — Shift-report date picker (worklog priority #4; API ?date= existed since Task 10):
   - shift-report-dialog: ◀ ▶ day steppers (next disabled at today) + center chip showing friendlyDate ("Today/Yesterday/Mon, 5 Oct") with an invisible native date input overlay for calendar jumps (max=today) + "Back to today" chip when off-today; date resets to today on every dialog open / staff switch (React "adjust state during render" pattern — lint rejected the useEffect version); query keyed ['shift-report', staff, date]; empty state says "No bills — {date}".
   - VERIFIED: Priya today (2 bills ₹2,650, cash ₹1,150) → Yesterday (1 bill ₹990 UPI) → calendar jump 2026-10-05 → "No bills — Mon, 5 Oct" empty state.
4. NEW FEATURE — Birthday wish tracking (worklog priority #3, first slice):
   - Schema: Customer.lastWishAt. PUT /api/customers/[id] accepts {wishSent:true} → lastWishAt=now. BirthdayCustomerDTO + the ?birthdaysWithin=7 query return lastWishAt.
   - Dashboard Wish button: opens wa.me greeting as before AND fire-and-forget records the wish + optimistic "Wished ✓" state (Check icon, softer emerald) for 14 days (covers early wishes), then reverts to "Wish". Re-clickable to send again.
   - VERIFIED: Rahul (TODAY 🎉) Wish click → wa.me tab opened with full greeting + lastWishAt set (API check) → button shows "Wished" with aria-label "already sent — send again".
5. BUGFIX — Branches view mobile horizontal overflow (REAL bug found via 390px viewport QA, never caught in Tasks 10–12):
   - Symptom: documentElement.scrollWidth 683 at 390px viewport (293px overflow).
   - Three stacked root causes fixed in branches-view.tsx: (a) branch-name <p truncate> lacked min-w-0/max-w-full (flex item wouldn't shrink), (b) address line's truncate (white-space:nowrap) gave the card a 453px intrinsic min-content that propagated through the flex row → grid auto-track (fixed: address now wraps via break-words with icon alignment mt-0.5), (c) the card (grid item) lacked min-w-0 so the grid track couldn't shrink below card min-content.
   - Card layout restructured for mobile (VLM-driven polish): flex-wrap row — mobile stacks [logo+revenue (order-1)] then [full-width name+address (order-2, basis-full)], desktop keeps the classic 3-column row (sm: order/basis reset). VLM before: "names aggressively truncated, hard to distinguish"; after: "fully readable, sensible revenue placement, no layout issues".
   - VERIFIED: 683 → 457 → 390 scrollWidth across the three fixes; final overflow:false at 390px and 1280px; VLM pass on both.
6. Final regression: online billing E2E after all edits (GG1-0051 cash walk-in ₹150, PDF receipt buttons present), clean reload = zero console errors ("Broken trigger flowlet chain!" seen once is an HMR-only framer-motion artifact — absent on clean loads), bunx tsc --noEmit ZERO errors in src/, bun run lint CLEAN, dev.log all 200s (only expected 401s on pre-login /api/auth/me).

Unresolved issues or risks, and priority recommendations for the next phase:
- Announcements have no deep-links per kind beyond BRANCH_APPROVED→Branches (BRANCH_PAUSED could link too); no unread count on the platform console for SUPER_ADMIN platform-wide notes (none exist yet — only the empty state shows).
- The bell polls every 60s — fine at salon scale; no push (PWA push notification via Firebase Cloud Messaging is the production upgrade).
- Wish tracking counts "sends", not "opens/visits won" — the campaign-analytics slice (wishes → visits within 14d after birthday) is the natural next step now that lastWishAt data accumulates.
- Language persistence: device-local choice always wins after first adoption (deliberate); no in-UI indicator that language follows the account.
- The branch card mobile pattern (order/basis) is only applied to Branches view — other views with logo+text+number rows (Customers cards?) may benefit from the same audit; none failed the 390px overflow check this round, but only Branches/Bell/Banner/Dashboard/Billing were tested at 390.
- Next-phase candidates (priority): (1) birthday campaign analytics (wishes sent vs visits won — data now accumulating), (2) PWA push notifications for approvals (FCM), (3) offline queued-bill paper-trail print/export, (4) tenant-level cross-branch comparison report INSIDE a franchise (the franchise-compare card is platform-only today), (5) approval-request flow: admin submits a NEW branch → platform gets a bell notification too (currently only the platform console queue).

---
Task ID: 14 (birthday campaign analytics + in-franchise branch insights + offline paper trail + profit-trend mobile fix)
Agent: main (Z.ai Code)
Task: Scheduled review — read the worklog, ran a full 3-role agent-browser QA sweep (found the app STABLE, zero bugs pre-feature), then shipped the worklog's top three next-phase features: (1) Birthday campaign analytics, (2) Branch insights league table inside the franchise, (3) offline queued-bill paper trail. Also found + fixed a REAL pre-existing mobile overflow in the Profit-trend card during QA.

Current project status / assessment:
- App fully stable on arrival: Ravi (ADMIN) dashboard/charts/heatmap + billing E2E GG1-0052 cash walk-in; Dev (SUPER_ADMIN) platform console + franchise comparison; Priya (STAFF) restricted nav + shift report date picker; dev.log all 200s; tsc/lint clean.
- Login gotcha rediscovered: the password is "saloon123" (Firebase email+password), the 4-digit PINs are only for the PIN-pad step after branch/user selection. Platform entry = dev@saloonx.example + saloon123.
- After features shipped: full re-verification passed (see below).

Current goals / completed modifications / verification results:
1. NEW FEATURE — Birthday campaign analytics (worklog priority #1, full slice):
   - API GET /api/stats/birthdays?months=6 (ADMIN): per-customer birthday occurrences in the window → wished (tracked lastWishAt within ±14d/10d of the occurrence) → visit won (completed bill within 14d AFTER the birthday) → revenue won. Monthly zero-filled buckets {ym,label,eligible,wished,visits,revenue} + totals {conversionPct, avgTicket} + missed list (birthday passed, NOT wished, sorted by totalSpend, top 6).
   - UI src/components/admin/birthday-campaign-card.tsx (NEW, rendered under BirthdaysCard): animated 4-step funnel (birthdays known → wishes sent → came back → revenue won, widths proportional to conversion), conversion badge (emerald ≥40% / amber ≥20%), monthly mini-chart (dashed eligible outline + primary wished fill + emerald "N✓" visit markers + 3-item legend), "Missed — highest spenders nobody wished" list with per-row WhatsApp "Win back" button (opens wa.me with a 15%-off make-up offer message), honest methodology footnote. Skeleton + empty states included.
   - SEED DATA: prisma/patch-birthday-campaign.ts (NEW one-off, idempotent by mobile) injected 11 demo customers across the 3 franchises (G&G 8: Pooja/Arjun/Divya/Nikhil won, Farhan/Aisha wished-no-visit, Meera/Sameer missed; UrbanCuts 2; B&B 1) with wishes, birthday-visit bills ("Birthday treat 🎂" note), baseline visits, refreshed aggregates + branchVisits. seed.ts gained the same logic generically (65% wished / 55% of those won) + the new customers in its lists, so future full reseeds reproduce the funnel.
   - VERIFIED: card renders "Last 6 months · 7 wishes sent · 5 came back within 14 days", 71% convert badge, ₹5,978.82 revenue won, May–Oct chart with visit markers, Meera Iyer + Sameer Kulkarni in missed list; Win-back click navigates to wa.me with the full offer text; VLM review: "visual quality high, no truncation/overlap, hierarchy effective".
2. NEW FEATURE — Branch insights league table (worklog priority #4, in-franchise):
   - API GET /api/stats/branches-compare?from&to (ADMIN, franchise-wide by design — ignores scope chips): per approved+active branch revenue/bills/avgBill/expenses/profit/newCustomers (first-ever-visit matching)/staffCount (UserBranch count)/sharePct + growthPct vs prior equal-length window; franchise totals footer.
   - UI src/components/admin/branch-insights-card.tsx (NEW): rank medals (gold/silver/bronze gradients), Crown on #1, city + "GG1 bills" line, growth badges (emerald ↗ / rose ↘ / muted "new"), animated share bars with % chip, rank-coloured side rail, stat chips (profit ±, staff, new, costs), footer insight sentence ("Andheri West leads with 48% of revenue · watch … (profit −₹…)") + "N losing money" header badge. Renders INSTEAD of the old simple BranchSplitCard when compare data is present (fallback retained).
   - VERIFIED: card renders "4 branches · franchise ₹29,270.86 profit", Andheri ₹24,890.10/48%/+1121%, Bandra ₹17,023.86/33%, stat chips all present; VLM review: "exceptionally clean, no truncation or overlap, precise alignment".
3. NEW FEATURE — Offline queued-bill paper trail (worklog priority #3):
   - src/lib/offline-queue.ts: NEW queuedBillToPreview(bill, branch, staffName) — rebuilds the TransactionDTO preview (OFFLINE-XXXX billNo, GST math, true local time) from the queued payload.
   - sync-indicator.tsx: per-bill Printer button (always visible, primary hover) → downloadReceiptPdf of the SAME A5 branded receipt the success screen produced (branch logo/address/footer), success toast "Offline receipt PDF downloaded — OFFLINE-XXXX · ₹N"; "Download all N receipts" header button; paper-trail footer note. Branch profile via cached react-query ['branch'].
   - E2E VERIFIED: offline ₹150 cash → OFFLINE-2F34 + popover shows per-bill Print + Download-all → click → toast + PDF generated → reload restores online → auto-sync lands GG3-0047 with clientCreatedAt honored (11:47) → bill visible in Transactions view.
4. BUGFIX — Profit-trend card mobile overflow (REAL pre-existing bug, present since Task 11, caught by this round's 390px sweep): header row (Avg-profit pill + REVENUE/EXPENSES/PROFIT legend, nowrap) forced 385px min-content → page scrollWidth 418 at 390px viewport. Fixed with flex-wrap + gap-y-1.5 + min-w-0 on both the pill row and legend (legend chips now wrap gracefully). VERIFIED: 418 → 390, overflow=false on dashboard AND billing at 390px; desktop unaffected.
5. Patch-script robustness: first version picked branches by index including unstaffed Powai → Arjun/Sameer got customers with 0 bills (orphaned); fixed by filtering to staffed branches, deleted the 2 orphans, re-ran; also made the aggregate/branchVisit refresh loop idempotent (check-existing before create) after a P2002 duplicate crash. Final state verified consistent (visits/spend/wishes all correct for 14 G&G customers).
6. Final regression: desktop dashboard shows all cards (KPIs, Revenue, Payment Split, Profit trend, Busy Hours, Branch insights, Top services/staff, P&L, Birthdays, Birthday campaigns, Recent bills); mobile 390px overflow=false; transactions view shows synced GG3-0047; bunx tsc --noEmit ZERO errors in src/; bun run lint CLEAN; dev.log all 200s (new routes /api/stats/birthdays + /api/stats/branches-compare answering 200); zero page console errors.

Unresolved issues or risks, and priority recommendations for the next phase:
- Birthday analytics approximates with the SINGLE tracked lastWishAt per customer (multiple wishes per year would need a wish-event log); the card's footnote says so. A WishEvent model is the upgrade path.
- Branch-compare growth badges can show eye-popping numbers (+1121%) when the prior window was nearly empty — mathematically right, cosmetically loud; consider capping the display at ±999%.
- "Download all receipts" fires one PDF per bill (separate downloads); a single merged multi-page PDF would be nicer for a big queue.
- Branch insights card only renders when viewing "All branches" scope (by design) — per-branch sessions never see it; fine.
- agent-browser gotchas THIS round: (1) Object.defineProperty(navigator,'onLine',{get}) WITHOUT configurable:true bricks the property for the page — always pass configurable:true, or just RELOAD to restore (queue survives in IndexedDB; installAutoSync then syncs immediately). (2) Stale refs after re-renders are STILL the #1 click hazard — a click intended for "Andheri West" landed on Koramangala (session bound there; QA-only issue, app correct). ALWAYS re-snapshot right before clicking branch/user tiles. (3) after HMR the login form ignores eval native-setter fills; use click@ref + keyboard type. (4) The seed's customer-bill hours use server-local (UTC) time while the browser runs IST — offline bills created "now" sort below same-day seeded bills in createdAt-desc order (harmless).
- Next-phase candidates (priority): (1) PWA push notifications via FCM for approvals + synced-queue alerts (the marquee gap left), (2) WishEvent log for exact multi-wish campaign analytics + birthday-campaign CSV/PDF export, (3) approval-request flow: franchise admin submits a NEW branch → platform bell notification, (4) merged offline-queue PDF (single doc), (5) cap growth-badge display at ±999%, (6) per-branch drill-down from the insights league table (click a row → scoped dashboard).

---
Task ID: GIT-1
Agent: main (Z.ai Code)
Task: User demanded: "immediately check in whole code to GitHub right away"

Work Log:
- Read worklog.md tail: project was feature-complete & stable (birthday campaigns, branch insights league table, offline queue paper trail all verified in prior rounds).
- `git status` audit found: repo had full local history but NO remote; 4 ESSENTIAL untracked source dirs (src/app/api/auth/login, auth/users, auth/branches, settings) + 4 seed logo PNGs were NEVER committed by previous rounds; tool-results/ junk and .zscripts/dev.pid runtime state present.
- Credential sweep (exhaustive): no `gh` CLI, no GITHUB_*/GH_* env vars, no ~/.git-credentials, no ~/.ssh, no ~/.config/gh, `git credential fill` for github.com returns empty → NO GitHub credentials exist in this environment; github.com network IS reachable (200).
- Hardened .gitignore: /tool-results/, .zscripts/dev.pid + *.pid, /upload/, *.bundle.
- `git rm --cached .zscripts/dev.pid` (runtime state untracked).
- Created README.md (badges, highlights, tech stack, quick start, demo credentials, project structure, multi-tenant model) — then corrected it against actual code: login is 3-step Firebase email+password (saloon123) → name tile → PIN; accurate seeded emails (dev@saloonx.example, ravi@glowgo.example, …); seed provisions Firebase Auth via public REST idempotently, no env needed.
- Commits: c86fe14 (missing API routes + logos + README + gitignore), 4ffe640 (bundle ignore), 84c9f67 (README accuracy fix). Working tree CLEAN, 264 tracked files.
- Installed gh CLI v2.63.2 → ~/.local/bin/gh (verified working) so push is instant once a token exists.
- Created /home/z/my-project/saloonx-backup.bundle (7.2MB, FULL history, `git bundle --all`) as an off-git safety artifact.
- Verified dev server healthy (dev.log all 200s; /api/auth/me 401s are expected unauthenticated checks).

Stage Summary:
- ENTIRE codebase is committed locally on branch main (HEAD 84c9f67, clean tree) — nothing is at risk anymore.
- PUSH TO GITHUB IS BLOCKED on credentials: the sandbox has no GitHub token/SSH/gh auth. gh CLI is pre-installed and ready.
- TO PUSH (next agent / user): (1) user provides a GitHub PAT (classic, `repo` scope) in chat or as env var; (2) then `echo $TOKEN | ~/.local/bin/gh auth login --with-token && ~/.local/bin/gh repo create saloonx --private --source=. --push` (or add existing remote: `git remote add origin https://x-access-token:<TOKEN>@github.com/<user>/saloonx.git && git push -u origin main`). Fallback: the full repo also exists as saloonx-backup.bundle.
- Do NOT commit: tool-results/, *.pid, *.bundle, upload/, .env (all now gitignored).
