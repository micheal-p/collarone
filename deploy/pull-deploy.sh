#!/usr/bin/env bash
# Pull-based deploy — the box updates ITSELF from GitHub. Deployment no longer
# depends on GitHub Actions being able to SSH in (the box firewall keeps
# dropping GitHub's datacenter runner IPs on port 22, which is what makes the
# Actions "deploy" job fail intermittently). A systemd timer runs this every
# ~2 minutes; it's a fast no-op unless origin/main has moved.
#
# The repo is public, so `git fetch` needs no credentials. The server .env
# (secrets) is gitignored and never touched.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/collarone/app}"
cd "$APP_DIR"

git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
[ "$LOCAL" = "$REMOTE" ] && exit 0   # nothing new — done

echo "==> New commit ${REMOTE:0:8} — deploying"
git reset --hard origin/main

# Same typecheck gate as CI — belt-and-suspenders; CI already gates pushes.
npm ci --workspace client
npm run typecheck --workspace client
npm ci --prefix server

grep '^VITE_' .env > client/.env      # bake build-time vars from the server .env
npm run build --workspace client

chown -R collarone:collarone "$APP_DIR"
systemctl restart collarone-api
nginx -t && systemctl reload nginx
echo "Deployed $(git rev-parse --short HEAD) at $(date -u +%FT%TZ)"
