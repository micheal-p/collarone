#!/usr/bin/env bash
# Deploy collarone to the VPS. Ships code over rsync (the GitHub repo is
# private and keyed to developer machines, not the server) then rebuilds
# and restarts the service remotely.
#
# Requires SSH access to the server already set up (key-based auth
# recommended; the initial deploy used password auth via sshpass while
# a key was provisioned). The server-side /opt/collarone/app/.env is
# managed separately on the box and is never touched by this script.
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-72.61.156.142}"
REMOTE_USER="${REMOTE_USER:-root}"
APP_DIR="${APP_DIR:-/opt/collarone/app}"
SSH="ssh ${REMOTE_USER}@${REMOTE_HOST}"

echo "==> Syncing code to ${REMOTE_HOST}:${APP_DIR}"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.env' \
  --exclude '**/.env' \
  client server package.json package-lock.json \
  "${REMOTE_USER}@${REMOTE_HOST}:${APP_DIR}/"

BUILD_ID="$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --short HEAD 2>/dev/null || echo unknown)-$(date -u +%Y%m%d%H%M)"

echo "==> Installing dependencies + building on the server (build ${BUILD_ID})"
$SSH bash -s <<EOF
set -euo pipefail
cd "${APP_DIR}"

# What /api/health reports. The repo's .git is deliberately not rsynced, so the
# sha has to come from the machine that ran this script.
printf '%s\n' "${BUILD_ID}" > "${APP_DIR}/BUILD_ID"

npm ci --workspace client
npm ci --prefix server

# Bake VITE_* build-time vars from the server's .env into client/.env
grep '^VITE_' .env > client/.env

npm run build --workspace client

# Vite no longer empties dist (see client/vite.config.js), so a tab still
# holding the previous index.html can finish loading its chunks instead of
# getting nginx's 404 page and parsing <html> as JavaScript. Prune what's
# genuinely old so the directory can't grow forever — 7 days is far longer
# than any real tab stays open, and content hashes mean a stale file is never
# served to a current client.
find "${APP_DIR}/client/dist/assets" -type f -mtime +7 -delete 2>/dev/null || true

chown -R collarone:collarone "${APP_DIR}"
systemctl restart collarone-api

# ---- index.html must never be cached -------------------------------------
# The hashed assets are immutable and cached for a year, which is right. The
# HTML that NAMES them must be the opposite: if a browser holds an old
# index.html it keeps asking for chunks by their old hashes, and after a
# deploy those are gone. That is the "Unexpected token '<'" flood — nginx
# answers with its 404 page and the browser parses <html> as JavaScript.
#
# The snippet is written here and wired in below. It is inert on its own, so
# the wiring is what makes it take effect — and both steps are guarded by
# nginx -t with a restore, because a deploy must never be able to take the
# site down over a cache header.
mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/collarone-cache.conf <<'NGINX'
# managed by deploy/deploy.sh — edit there, not here
location = /index.html {
    add_header Cache-Control "no-cache, must-revalidate" always;
    expires -1;
}
location = /service-worker.js {
    add_header Cache-Control "no-cache, must-revalidate" always;
    expires -1;
}
NGINX

# Wire the snippet into the site config, once. Idempotent: it only edits a
# file that doesn't already reference the snippet, and it keeps a timestamped
# backup so a bad edit can be put straight back. The include goes into EVERY
# server block in that file — landing in a port-80 redirect block as well is
# harmless (a location that never matches), whereas guessing "the first block"
# would silently wire it into the redirect and do nothing at all.
CONF=\$(grep -rl 'collarone' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | head -1)
if [ -n "\$CONF" ] && ! grep -q 'collarone-cache.conf' "\$CONF"; then
  BACKUP="\$CONF.pre-cache-header.\$(date +%s)"
  cp "\$CONF" "\$BACKUP"
  sed -i 's|^\([[:space:]]*\)server[[:space:]]*{|\1server {\n\1    include snippets/collarone-cache.conf;|' "\$CONF"
  if nginx -t 2>/dev/null; then
    echo "Wired snippets/collarone-cache.conf into \$CONF"
  else
    cp "\$BACKUP" "\$CONF"
    echo "WARNING: including the cache snippet broke nginx -t; restored \$CONF from backup" >&2
  fi
fi

# Only reload if the whole config still parses. If it doesn't, pull the
# snippet back out and leave nginx exactly as it was.
if nginx -t 2>/dev/null; then
  systemctl reload nginx
else
  rm -f /etc/nginx/snippets/collarone-cache.conf
  nginx -t && systemctl reload nginx
  echo "WARNING: cache-header snippet rejected by nginx -t; removed it and reloaded the previous config" >&2
fi

echo "Deployed \$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo 'n/a') at \$(date -u +%FT%TZ)"
EOF

echo "==> Done"
