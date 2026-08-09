#!/usr/bin/env bash
# A copy of the database that does not live inside Supabase.
#
# Supabase takes its own backups, and they are genuinely useful — for the
# failure mode where the data is damaged but the project is fine. They are no
# help at all for the failure mode where the PROJECT is gone: a billing lapse,
# an account dispute, a mis-click on delete, a provider-side incident. In every
# one of those, the backups go with the thing they are backing up.
#
# This pulls a dump to the VPS, which is a different company, a different
# account and a different set of credentials. That is the whole point: the two
# copies should not be able to fail together.
#
# Installed and scheduled by deploy/deploy.sh. Does nothing, loudly, if
# BACKUP_DB_URL is not set — see the note at the bottom.
set -uo pipefail

DIR="${BACKUP_DIR:-/var/backups/collarone}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M)"
OUT="${DIR}/collarone-${STAMP}.sql.gz"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [ -z "${BACKUP_DB_URL:-}" ]; then
  log "BACKUP_DB_URL is not set — no offsite backup was taken."
  log "Add it to /opt/collarone/app/.env as the Supabase SESSION POOLER"
  log "connection string. Until then this database exists in exactly one place."
  exit 78     # EX_CONFIG: not a crash, a missing configuration
fi

command -v pg_dump >/dev/null 2>&1 || { log "pg_dump is not installed on this box."; exit 1; }

mkdir -p "$DIR"
chmod 700 "$DIR"     # dumps contain every tenant's data; nobody else reads this

log "Dumping to ${OUT}"
# --no-owner / --no-acl: the roles on a restore target will not match Supabase's,
# and a dump that refuses to restore is not a backup.
# Written to a .part file and renamed only on success, so a dump interrupted
# half way through can never be mistaken for a complete one — which is how
# people discover their backups were empty at the worst possible moment.
if pg_dump "$BACKUP_DB_URL" --no-owner --no-acl --format=plain 2>/tmp/pgdump.err | gzip -9 > "${OUT}.part"; then
  mv "${OUT}.part" "$OUT"
  chmod 600 "$OUT"
else
  log "pg_dump FAILED:"; head -c 500 /tmp/pgdump.err | sed 's/^/    /'
  rm -f "${OUT}.part"
  exit 1
fi

# ---- prove it is a real dump, not an empty file ----------------------------
# A zero-byte or truncated backup passes every check that only asks "did the
# command exit 0". Look inside.
SIZE=$(stat -c%s "$OUT" 2>/dev/null || echo 0)
if [ "$SIZE" -lt 10000 ]; then
  log "Dump is only ${SIZE} bytes — that is not a real backup. Keeping it for inspection and failing."
  exit 1
fi
if ! gzip -t "$OUT" 2>/dev/null; then
  log "Dump does not decompress cleanly. Failing."
  exit 1
fi
if ! zcat "$OUT" | head -n 400 | grep -q 'CREATE TABLE'; then
  log "Dump contains no CREATE TABLE in its first 400 lines. Failing rather than trusting it."
  exit 1
fi

log "OK: ${OUT} ($(numfmt --to=iec "$SIZE" 2>/dev/null || echo "$SIZE bytes"))"

# ---- retention --------------------------------------------------------------
# Deleted only AFTER a good dump landed, so a run of failures can never erode
# the history down to nothing.
find "$DIR" -name 'collarone-*.sql.gz' -type f -mtime "+${KEEP_DAYS}" -delete 2>/dev/null || true
find "$DIR" -name '*.part' -type f -mmin +180 -delete 2>/dev/null || true
log "Retained $(find "$DIR" -name 'collarone-*.sql.gz' -type f | wc -l) backups (keeping ${KEEP_DAYS} days)"

# ---- one honest caveat ------------------------------------------------------
# The VPS is a second location, not a third. If the VPS itself is lost, these
# go with it. The next step is pushing the same file to object storage in
# another provider, which needs credentials that do not exist yet — writing
# that half now, with no bucket behind it, would only look like protection.
