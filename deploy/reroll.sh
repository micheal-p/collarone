#!/usr/bin/env bash
# Re-roll a deploy that never landed.
#
# The failure this exists for: the push reaches GitHub, CI goes green or simply
# never gets to the deploy step, and the site keeps serving the previous bundle.
# The cause is the RUNNER's IP being refused by the VPS on port 22 — not the
# server, which answers fine from a developer machine. A different runner
# usually has a different IP, so an empty commit is the whole fix.
#
# Usage:  ./deploy/reroll.sh            # push an empty commit, then watch
#         ./deploy/reroll.sh --check    # just tell me if prod is current
#
# "Current" means the bundle named in the live HTML matches a local build of
# HEAD. Vite content hashes make that an exact test, not an approximation.
set -euo pipefail

SITE="${SITE:-https://collarone.app}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

live_bundle() { curl -s --max-time 15 "$SITE/" | grep -o 'assets/index-[^"]*\.js' | head -1; }
local_bundle() {
  # -t (newest first), NOT alphabetical: vite.config.js keeps previous builds in
  # dist now, so there are several index-*.js and the newest is the one HEAD
  # produced. Sorting by name here silently compared prod against an old build
  # and reported "current" when it was two commits behind.
  ls -t "$ROOT/client/dist/assets" 2>/dev/null | grep -o 'index-[^.]*\.js' | head -1
}

LOCAL="$(local_bundle)"
if [ -z "$LOCAL" ]; then
  echo "No local build found. Run: npm run build --workspace client" >&2
  exit 1
fi

echo "local build of HEAD : $LOCAL"
echo "live                : $(live_bundle)"

if [ "$(live_bundle)" = "assets/$LOCAL" ]; then
  echo "✓ production is current"
  exit 0
fi

if [ "${1:-}" = "--check" ]; then
  echo "✗ production is BEHIND (run without --check to re-roll)"
  exit 1
fi

echo "==> Pushing an empty commit to get a fresh runner"
git -C "$ROOT" commit --allow-empty -m "Re-roll deploy ($(git -C "$ROOT" rev-parse --short HEAD))"
git -C "$ROOT" push origin HEAD

echo "==> Watching for the new bundle (up to 8 minutes)"
for i in $(seq 1 32); do
  sleep 15
  if [ "$(live_bundle)" = "assets/$LOCAL" ]; then
    echo "✓ deployed after $((i * 15))s — live now serves $LOCAL"
    exit 0
  fi
done

echo "✗ still not deployed after 8 minutes." >&2
echo "  The runner IP is likely blocked again. Deploy from here instead:" >&2
echo "    ./deploy/deploy.sh" >&2
exit 1
