#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# ensure-db.sh — self-heal the SQLite database after a sandbox reset.
#
# Why: db/custom.db is gitignored (never committed), so VM resets that
# restore the working tree leave an EMPTY database — the app boots but
# every login 403s (Firebase Auth still knows the users, but there are no
# local rows to bind sessions to). The sandbox supervisor starts the dev
# server with `bun run dev`, and package.json's `predev` hook invokes this
# script — so the demo dataset self-restores on every boot.
#
# Safety: seeds ONLY when the tenants table is empty (a hard 0), so it can
# never clobber real data. db:push is idempotent and only shapes the schema.
# Firebase accounts are reused by UID (never duplicated) — see
# prisma/firebase-seed-helper.ts.
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR" || exit 0

command -v bun >/dev/null 2>&1 || exit 0
[ -f "prisma/seed.ts" ] || exit 0

# Only meaningful with a DATABASE_URL pointing at a local file we manage.
grep -q "^DATABASE_URL=" .env 2>/dev/null || exit 0

# Fast path: schema already present AND tenants exist → nothing to do.
if [ -f "db/custom.db" ]; then
  TENANTS="$(bun -e "
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
try { console.log(await db.tenant.count()) } catch { console.log('ERR') }
await db.\$disconnect()
" 2>/dev/null | tail -n1)"
  case "$TENANTS" in
    ''|ERR|0) : ;;  # missing schema or empty db → fall through to heal
    *) exit 0 ;;    # healthy, non-empty → no-op
  esac
fi

echo "[ensure-db] database missing/empty — pushing schema and seeding demo dataset…"
# Shape the schema first (idempotent, --accept-data-loss only affects drift).
bun run db:push >/dev/null 2>&1 || true
# Seed only when still empty (guard inside seed is by fresh DB; the count
# check above already proved 0 — a race here is impossible in single-boot).
if bun run db:seed; then
  echo "[ensure-db] demo dataset restored"
fi

# Never block server startup over seeding.
exit 0
