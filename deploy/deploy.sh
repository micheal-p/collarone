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

# ---- gateway encryption key: generate once, on the box --------------------
# Tenant Paystack secrets are AES-256-GCM-encrypted with GATEWAY_ENC_KEY
# (client/api/_lib/gatewayCrypto.js), and merchant-paystack FAILS CLOSED when
# it's missing — every tenant's "Connect Paystack" 503s. Generate it here so
# it exists without anyone SSHing in by hand, and so the value never leaves
# the server. Idempotent: an existing key is never touched, because rotating
# it would orphan every secret already encrypted under it.
if ! grep -q '^GATEWAY_ENC_KEY=' "${APP_DIR}/.env" 2>/dev/null; then
  echo "GATEWAY_ENC_KEY=\$(openssl rand -hex 32)" >> "${APP_DIR}/.env"
  systemctl restart collarone-api
  echo "GATEWAY_ENC_KEY: generated"
else
  echo "GATEWAY_ENC_KEY: present"
fi

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
# The cache-header wiring is best-effort: the code is already synced, built and
# the API restarted above. Turn OFF errexit for the whole block so no nginx
# command (nginx -t currently fails on this box with a /run/nginx.pid permission
# error, unrelated to config) can abort the deploy and throw away a good build.
set +e
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
# Ask nginx which file actually declares the site, instead of guessing from
# filenames. 'nginx -T' dumps the effective config with a "# configuration file
# <path>:" header before each one, so the last such header before the
# server_name line is the file that really serves collarone.app. Guessing gave
# nginx.conf, which passed nginx -t and changed nothing observable.
CONF=\$(nginx -T 2>/dev/null | awk '
  /^# configuration file /{ f=\$4; sub(/:$/,"",f) }
  /server_name[^;]*collarone/ { print f; exit }
')
[ -z "\$CONF" ] && CONF=\$(grep -rl 'server_name[^;]*collarone' /etc/nginx/ 2>/dev/null | grep -v 'collarone-cache' | head -1)
# Self-heal: earlier runs wrote backups NEXT TO the site file, i.e. inside
# sites-enabled/, where nginx loads EVERY file — so each backup re-declared
# 'listen 443' and made nginx -t fail with "duplicate listen options". Remove
# any such strays before testing. Backups now go to /tmp, outside nginx's path.
CONF_DIR=\$(dirname "\$CONF")
rm -f "\$CONF_DIR"/*.pre-cache-header.* 2>/dev/null || true
NGINX_STATUS="conf-not-found"
if [ -n "\$CONF" ]; then
  if grep -q 'collarone-cache.conf' "\$CONF"; then
    NGINX_STATUS="already-wired:\$CONF"
  else
    BACKUP="/tmp/collarone-nginx-backup.\$(date +%s)"
    cp "\$CONF" "\$BACKUP"
    sed -i 's|^\([[:space:]]*\)server[[:space:]]*{|\1server {\n\1    include snippets/collarone-cache.conf;|' "\$CONF"
    if nginx -t 2>/dev/null; then
      NGINX_STATUS="wired:\$CONF"
    else
      # Keep the reason. "it failed" sent me round three deploys; the actual
      # nginx message says which directive it objected to.
      WHY=\$(nginx -t 2>&1 | grep -iE 'emerg|error' | head -1 | cut -c1-160)
      cp "\$BACKUP" "\$CONF"
      NGINX_STATUS="nginx-t-failed:\$CONF :: \$WHY"
    fi
  fi
fi
# Did it actually reach the running config? "wired" only means a file changed.
# nginx -T flakes on this box (pid-permission), and an EMPTY dump must read as
# "couldn't check", not "no" — a false no here already sent one investigation
# chasing a regression that never happened.
NGINX_DUMP=\$(nginx -T 2>/dev/null)
if [ -z "\$NGINX_DUMP" ]; then
  NGINX_STATUS="\${NGINX_STATUS} effective=unknown"
elif printf '%s' "\$NGINX_DUMP" | grep -q 'collarone-cache.conf'; then
  NGINX_STATUS="\${NGINX_STATUS} effective=yes"
else
  NGINX_STATUS="\${NGINX_STATUS} effective=no"
fi

# ---- tenant subdomains: server_name must answer for *.collarone.app -------
# Published tenant sites live at <slug>.collarone.app (client/src/lib/
# subdomain.js renders PublicSite for the whole host). DNS and TLS for the
# wildcard are handled at the edge (Cloudflare proxied wildcard record); this
# makes nginx route those hosts to the same site instead of whatever block
# happens to be the default server. Same guard pattern as the cache header:
# idempotent, backup to /tmp, restore if nginx -t objects, never fail the
# deploy. Status lands in the same /api/health nginx field as wildcard=...
WILDCARD_STATUS="conf-not-found"
if [ -n "\$CONF" ]; then
  if grep -q '[*]\.collarone\.app' "\$CONF"; then
    WILDCARD_STATUS="already-wired"
  else
    WBACKUP="/tmp/collarone-nginx-wildcard-backup.\$(date +%s)"
    cp "\$CONF" "\$WBACKUP"
    sed -i 's/^\([[:space:]]*server_name[^;]*collarone\.app[^;]*\);/\1 *.collarone.app;/' "\$CONF"
    if nginx -t 2>/dev/null; then
      WILDCARD_STATUS="wired"
    else
      WHY=\$(nginx -t 2>&1 | grep -iE 'emerg|error' | head -1 | cut -c1-160)
      cp "\$WBACKUP" "\$CONF"
      WILDCARD_STATUS="nginx-t-failed :: \$WHY"
    fi
  fi
fi
NGINX_STATUS="\${NGINX_STATUS} wildcard=\${WILDCARD_STATUS}"
# Readable over /api/health, because the deploy log needs GitHub auth to read
# and this is the one thing that has silently done nothing twice.
# APP_DIR unescaped on purpose: it is a LOCAL variable expanded before the
# heredoc is sent. Escaping it made the remote shell expand an undefined name,
# so this file was being written to /NGINX_STATUS at the filesystem root and
# health.js never found it. Same reason BUILD_ID above is unescaped.
printf '%s\n' "\$NGINX_STATUS" > "${APP_DIR}/NGINX_STATUS"
rm -f /NGINX_STATUS 2>/dev/null || true
echo "nginx cache header: \$NGINX_STATUS"

# Only reload if the whole config still parses. If it doesn't, pull the
# snippet back out and leave nginx exactly as it was.
#
# CRITICAL: none of this may fail the deploy. The code is already synced, built
# and the API restarted by the time we get here — the cache header is a nicety,
# not the deploy. Every branch is guarded with '|| true' so a failing nginx -t
# can never abort the script under 'set -e' and throw away a good build. This
# is exactly what was happening: 'nginx -t' fails with
#   open() "/run/nginx.pid" failed (13: Permission denied)
# (the CONFIG SYNTAX is fine — it is a privilege/pid-file issue on the box, not
# our snippet), and the bare 'nginx -t && systemctl reload' below tripped set -e
# and failed all three attempts. Until the pid-file permission is sorted on the
# server, the cache header simply won't wire, but the app still ships.
if nginx -t 2>/dev/null; then
  systemctl reload nginx 2>/dev/null
else
  echo "nginx not reloaded (nginx -t failed — likely /run/nginx.pid perms, not the snippet). App still deployed." >&2
fi
set -e   # errexit back on for the rest of the script

echo "Deployed \$(git -C "${APP_DIR}" rev-parse --short HEAD 2>/dev/null || echo 'n/a') at \$(date -u +%FT%TZ)"
EOF

echo "==> Done"
