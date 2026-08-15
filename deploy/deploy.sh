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

# ---- snapshot the running app, so a bad deploy can be undone --------------
# rsync --delete below overwrites the live directory in place. Until now a
# build that started but did not work — a broken bundle, a service that exits
# on boot, a migration the code needs that has not been applied — stayed
# broken until someone noticed and pushed a fix, which is another full deploy
# cycle on a site that is already down.
#
# --link-dest hardlinks unchanged files instead of copying them, so this
# snapshot of a directory containing node_modules takes about a second and
# almost no disk. node_modules is included deliberately: a rollback has to
# restore a state that RUNS, and re-running npm ci during an outage is the
# slowest possible moment to do it.
echo "==> Snapshotting the current deployment for rollback"
$SSH bash -s <<SNAP
set -uo pipefail
if [ -d "${APP_DIR}" ]; then
  rm -rf "${APP_DIR}.rollback.tmp"
  rsync -a --delete --link-dest="${APP_DIR}/" "${APP_DIR}/" "${APP_DIR}.rollback.tmp/" 2>/dev/null || true
  rm -rf "${APP_DIR}.rollback"
  mv "${APP_DIR}.rollback.tmp" "${APP_DIR}.rollback" 2>/dev/null || true
  echo "snapshot: \$(du -sh --apparent-size "${APP_DIR}.rollback" 2>/dev/null | cut -f1 || echo '?')"
else
  echo "snapshot: no existing deployment, nothing to roll back to"
fi
SNAP

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

# ---- headless Chromium for the styled trade-document PDFs ------------------
# client/api/_lib/htmlToPdf.js renders the real letterhead template (all six
# designs + orientation) to PDF so a DOWNLOAD matches the on-screen preview.
# The browser lives OUTSIDE the app dir — rsync --delete would wipe anything
# inside it — at a fixed path the collarone service reads through
# PLAYWRIGHT_BROWSERS_PATH. Every step is best-effort: if the install fails,
# invoice-pdf.js falls back to the PDFKit renderer, so downloads never break —
# they just render the plainer design until this is healthy.
PW_DIR=/opt/collarone/pw-browsers
mkdir -p "\$PW_DIR" || true
if ! grep -q '^PLAYWRIGHT_BROWSERS_PATH=' "${APP_DIR}/.env" 2>/dev/null; then
  echo "PLAYWRIGHT_BROWSERS_PATH=\$PW_DIR" >> "${APP_DIR}/.env"
fi
# Only the FIRST deploy pays for the browser + its apt system deps + fonts; once
# \$PW_DIR has a browser, every later deploy skips this entirely (no per-deploy
# apt cost). To force a reinstall, empty the directory. If a browser is ever
# needed for another feature, this is the one place that provides it.
if [ -z "\$(ls -A "\$PW_DIR" 2>/dev/null)" ]; then
  # Headless images ship with almost no fonts; without these the text and the ₦
  # sign render as boxes.
  (apt-get update -qq && apt-get install -y --no-install-recommends fonts-liberation fonts-noto-core >/dev/null 2>&1) || true
  PLAYWRIGHT_BROWSERS_PATH="\$PW_DIR" npx playwright-core install --with-deps chromium \
    || PLAYWRIGHT_BROWSERS_PATH="\$PW_DIR" npx playwright-core install chromium \
    || true
  chown -R collarone:collarone "\$PW_DIR" || true
fi

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

# ---- automation cron secret: generate once, on the box --------------------
# /api/automations-run FAILS CLOSED without CRON_SECRET (it used to fail OPEN,
# which left a write endpoint public), and the daily sweep in server/index.js
# refuses to run without it. Same pattern as GATEWAY_ENC_KEY: generate here so
# the Automation suite works without anyone SSHing in, and so the value never
# leaves the server. Idempotent — an existing secret is never rotated.
if ! grep -q '^CRON_SECRET=' "${APP_DIR}/.env" 2>/dev/null; then
  echo "CRON_SECRET=\$(openssl rand -hex 32)" >> "${APP_DIR}/.env"
  systemctl restart collarone-api
  echo "CRON_SECRET: generated"
else
  echo "CRON_SECRET: present"
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

# ---- security headers ------------------------------------------------------
# Written as its own snippet so it can be re-included inside any location that
# sets its own add_header — nginx drops ALL inherited add_headers the moment a
# location declares even one, so the cache locations below must pull these back
# in or they'd ship the JS/HTML with no security headers at all.
#
# CSP is deliberately Report-Only for now. A wrong CSP silently blocks Supabase
# (no data), Google sign-in, Paystack (no payments) or the Unsplash theme
# previews — and a live card transaction cannot be tested from here. Report-Only
# ships the real policy, logs what it WOULD block, and breaks nothing; it gets
# promoted to enforcing once the browser console shows a clean run through
# login, a data page, checkout and a theme preview.
cat > /etc/nginx/snippets/collarone-security.conf <<'NGINX'
# managed by deploy/deploy.sh — edit there, not here
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(self)" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://js.paystack.co https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://static.cloudflareinsights.com https://dxekronjsvnwmnbanlqh.supabase.co wss://dxekronjsvnwmnbanlqh.supabase.co https://accounts.google.com https://api.paystack.co https://checkout.paystack.com https://images.unsplash.com; frame-src 'self' https://accounts.google.com https://checkout.paystack.com https://js.paystack.co https://challenges.cloudflare.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://checkout.paystack.com; object-src 'none'" always;
NGINX

cat > /etc/nginx/snippets/collarone-cache.conf <<'NGINX'
# managed by deploy/deploy.sh — edit there, not here
include snippets/collarone-security.conf;

location = /index.html {
    include snippets/collarone-security.conf;
    add_header Cache-Control "no-cache, must-revalidate" always;
    expires -1;
}
location = /service-worker.js {
    include snippets/collarone-security.conf;
    add_header Cache-Control "no-cache, must-revalidate" always;
    expires -1;
}

# The embeddable lead form is MEANT to live in an <iframe> on a customer's own
# website, so it must not carry X-Frame-Options and its CSP must allow any
# framer. It still gets every other header.
location ^~ /embed/ {
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://dxekronjsvnwmnbanlqh.supabase.co https://challenges.cloudflare.com; frame-ancestors *" always;
    # rewrite ... break serves index.html from THIS location so its headers
    # (no X-Frame-Options, frame-ancestors *) apply — try_files would internally
    # redirect into `location = /index.html`, which re-adds X-Frame-Options and
    # was why the exemption didn't take the first time.
    rewrite ^ /index.html break;
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

# ---- did it actually come up? ----------------------------------------------
# A deploy that finishes is not a deploy that works. This asks the box the same
# question an outside monitor would, and puts the previous version back if the
# answer is wrong — while the operator is still here, rather than after a
# customer finds it.
#
# The check runs ON the server against localhost, so it tests the application
# rather than DNS, Cloudflare or nginx, and cannot be fooled by an edge cache
# still serving the old page.
# ---- install the nightly offsite backup -------------------------------------
echo "==> Installing the offsite database backup"
scp -q deploy/backup-db.sh "${REMOTE_USER}@${REMOTE_HOST}:/usr/local/bin/collarone-backup-db" 2>/dev/null || \
  echo "    (could not copy the backup script; continuing — the deploy matters more)"
$SSH "APP_DIR='${APP_DIR}' SEED_BACKUP_URL='${DATABASE_URL:-}' bash -s" <<'BACKUP'
set -uo pipefail
: "${APP_DIR:=/opt/collarone/app}"
chmod 700 /usr/local/bin/collarone-backup-db 2>/dev/null || true

# Seed BACKUP_DB_URL once, from the credential CI already holds. Written only
# if absent: if someone has since pointed backups at a different database or a
# read replica, a deploy must not quietly drag it back.
if [ -n "${SEED_BACKUP_URL:-}" ] && ! grep -q '^BACKUP_DB_URL=' "${APP_DIR}/.env" 2>/dev/null; then
  printf 'BACKUP_DB_URL=%s\n' "$SEED_BACKUP_URL" >> "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env" 2>/dev/null || true
  echo "backup: BACKUP_DB_URL seeded from CI"
fi

# A systemd timer rather than cron: it survives a reboot mid-window
# (Persistent=true runs a missed backup on the next boot), and the run's output
# lands in the journal instead of a mail spool nobody reads.
cat > /etc/systemd/system/collarone-backup.service <<'UNIT'
[Unit]
Description=Collarone offsite database backup
After=network-online.target

[Service]
Type=oneshot
# EnvironmentFile supplies BACKUP_DB_URL. The dash means "carry on if the file
# is missing" — the script itself reports the missing configuration clearly.
EnvironmentFile=-/opt/collarone/app/.env
ExecStart=/usr/local/bin/collarone-backup-db
UNIT

cat > /etc/systemd/system/collarone-backup.timer <<'UNIT'
[Unit]
Description=Nightly Collarone database backup

[Timer]
OnCalendar=*-*-* 02:30:00
# Every VPS on the internet backing up at exactly 02:30 is a thundering herd
# against the same pooler; a few minutes of jitter costs nothing.
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload 2>/dev/null || true
systemctl enable --now collarone-backup.timer 2>/dev/null || true
if grep -q '^BACKUP_DB_URL=' "${APP_DIR}/.env" 2>/dev/null; then
  echo "backup: timer installed, BACKUP_DB_URL present"
else
  echo "backup: timer installed, but BACKUP_DB_URL is NOT set in .env — no dump will be taken"
fi

# ---- prove it works, once ---------------------------------------------------
# A timer that fires at 02:30 and fails is indistinguishable from a timer that
# fires at 02:30 and works, until the day the backup is needed. Two failures
# are near-certain on a fresh box and both are silent: pg_dump not installed at
# all, and pg_dump older than the server, which refuses with "server version
# mismatch" rather than producing a smaller dump. Run it once now, while
# somebody is watching the deploy log.
if [ ! -f /var/backups/collarone/.verified ] && grep -q '^BACKUP_DB_URL=' "${APP_DIR}/.env" 2>/dev/null; then
  echo "backup: no dump has ever been verified — taking one now"
  # postgresql-client is cheap and the mismatch failure is not obvious, so
  # make sure a recent pg_dump exists before blaming the credentials.
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "backup: pg_dump missing, installing postgresql-client"
    (apt-get update -qq && apt-get install -y -qq postgresql-client >/dev/null 2>&1) || true
  fi
  set -a; . "${APP_DIR}/.env"; set +a
  if /usr/local/bin/collarone-backup-db 2>&1 | sed 's/^/    /'; then
    mkdir -p /var/backups/collarone && touch /var/backups/collarone/.verified
    echo "backup: VERIFIED — a real dump was written and checked"
  else
    echo "backup: FIRST DUMP FAILED (see above). The timer is installed but is not producing backups." >&2
  fi
fi
BACKUP

echo "==> Health-gating the new build"
$SSH "APP_DIR='${APP_DIR}' bash -s" <<'GATE'
set -uo pipefail
: "${APP_DIR:=/opt/collarone/app}"
# server/index.js defaults to 4000, not 3000. Getting this wrong would mean
# the gate never reaches a perfectly healthy service and rolls back a good
# deploy every time — so the port is discovered rather than assumed.
PORT="$(grep -oP '^PORT=\K[0-9]+' "$APP_DIR/.env" 2>/dev/null || true)"
if [ -z "${PORT:-}" ]; then
  for candidate in 4000 3000 8080; do
    if curl -s -o /dev/null --max-time 4 "http://127.0.0.1:${candidate}/api/health" 2>/dev/null; then
      PORT="$candidate"; break
    fi
  done
fi
PORT="${PORT:-4000}"
echo "health gate: probing 127.0.0.1:${PORT}"
WANT="$(cat "$APP_DIR/BUILD_ID" 2>/dev/null || echo unknown)"

healthy() {
  body=$(curl -s --max-time 8 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)
  [ -n "$body" ] || return 1
  printf '%s' "$body" | grep -q '"apiOk":true' || return 1
  printf '%s' "$body" | grep -q '"dbOk":true'  || return 1
  # It must be the build we just shipped. An old process that survived the
  # restart answers happily and would otherwise pass this gate.
  printf '%s' "$body" | grep -qF "$WANT" || return 1
  return 0
}

# systemd needs a moment, and the first request warms a cold Node process.
ok=0
for i in $(seq 1 20); do
  if healthy; then ok=1; break; fi
  sleep 3
done

if [ "$ok" = "1" ]; then
  echo "health gate: PASS (build $WANT)"
  exit 0
fi

# Distinguish "unhealthy" from "I could not tell". Rolling back because the
# check itself could not reach anything would turn a scripting mistake into an
# outage — the one thing a safety net must never do.
REACHED=0
curl -s -o /dev/null --max-time 6 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null && REACHED=1

if [ "$REACHED" = "0" ]; then
  echo "health gate: INCONCLUSIVE — nothing answered on 127.0.0.1:${PORT}." >&2
  echo "Not rolling back: the check could not reach the service, which may be the check's fault." >&2
  systemctl --no-pager --lines=25 status collarone-api >&2 2>&1 || true
  exit 1
fi

echo "health gate: FAIL — the new build did not become healthy in 60s" >&2
curl -s --max-time 8 "http://127.0.0.1:${PORT}/api/health" 2>&1 | head -c 400 >&2 || true
echo >&2
systemctl --no-pager --lines=25 status collarone-api >&2 2>&1 || true

if [ ! -d "${APP_DIR}.rollback" ]; then
  echo "NO ROLLBACK AVAILABLE — leaving the new build in place so it can be inspected." >&2
  exit 1
fi

echo "==> Rolling back to the previous deployment" >&2
rsync -a --delete --exclude ".env" --exclude "**/.env" "${APP_DIR}.rollback/" "${APP_DIR}/" || {
  echo "ROLLBACK FAILED. The box needs a human." >&2; exit 1; }
chown -R collarone:collarone "${APP_DIR}" || true
systemctl restart collarone-api

# Liveness only from here. healthy() insists on the build id we just tried to
# ship, which is precisely the build we are removing.
for i in $(seq 1 15); do
  body=$(curl -s --max-time 8 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || true)
  if printf '%s' "$body" | grep -q '"apiOk":true'; then
    echo "rollback: the previous build is serving again ($(cat "$APP_DIR/BUILD_ID" 2>/dev/null))" >&2
    exit 1     # still a failed DEPLOY, even though the site is up
  fi
  sleep 3
done
echo "ROLLBACK DID NOT RECOVER THE SITE. The box needs a human." >&2
exit 1
GATE

echo "==> Done"
