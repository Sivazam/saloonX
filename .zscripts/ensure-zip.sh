#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────
# ensure-zip.sh — self-heal public/zipper.zip (the login-page source download)
#
# Why: zipper.zip is intentionally gitignored (never committed), so sandbox VM
# resets / `git clean` style restores wipe it. The sandbox supervisor starts
# the dev server with `bun run dev` on every boot, and package.json wires this
# script as the `predev` hook — so the zip regenerates automatically within
# seconds of any reset. It is a fast no-op whenever the zip already exists.
#
# What goes in the zip: every git-TRACKED file (exact repo tree — so unzipping
# and pushing causes no phantom deletions) PLUS the full .git directory
# (history + branches), so the recipient can push to GitHub directly.
# Secrets (.env) are gitignored and therefore excluded by construction.
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR" || exit 0
ZIP="$PROJECT_DIR/public/zipper.zip"

# Fast path: already present.
[ -f "$ZIP" ] && exit 0

# Only meaningful in a full git checkout with the tools available.
command -v git    >/dev/null 2>&1 || exit 0
command -v zip    >/dev/null 2>&1 || exit 0
command -v rsync  >/dev/null 2>&1 || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

echo "[ensure-zip] public/zipper.zip missing — regenerating full-source bundle…"

TMP="$(mktemp -d)" || exit 0
trap 'rm -rf "$TMP"' EXIT

# Stage exactly the tracked tree…
git ls-files -z | rsync -a --from0 --files-from=- . "$TMP"/ || exit 0
# …plus the repository history so the archive is push-ready.
cp -a .git "$TMP/.git" 2>/dev/null || true

mkdir -p public
rm -f "$ZIP"
if (cd "$TMP" && zip -r -q "$ZIP" .); then
  echo "[ensure-zip] done — $(du -h "$ZIP" | cut -f1) at public/zipper.zip"
fi

# Never block server startup over a download bundle.
exit 0
