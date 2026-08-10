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
# ---- what is actually inside the dump --------------------------------------
# ONE pass with awk, and deliberately NOT `gzip -dc … | grep -qm1 …`.
#
# That pipeline threw away two perfectly good backups. grep -q exits the moment
# it matches — which is the whole point of the flag — but gzip is still pushing
# a large stream into a pipe with no reader, so the kernel kills it with
# SIGPIPE, exit 141. `set -o pipefail` then reports the pipeline by its worst
# member, so a SUCCESSFUL match came back as failure and this script announced
# "Dump contains no CREATE TABLE" about a dump that contained plenty.
#
# Every piece of that was individually correct: pipefail is good practice,
# grep -q is the right flag, gzip -dc is right. They are only wrong together.
# It also only reproduces on a LARGE file — with a small one gzip finishes
# before grep exits and there is no SIGPIPE, which is exactly why a quick test
# said the check was fine. Reproduced deliberately before fixing: exit 141.
#
# awk reads to end-of-file, so nothing is left unread and there is no signal to
# trip over. One decompress instead of three, and it answers both questions.
read -r TABLE_COUNT HAS_ORGS ORG_ROWS <<EOF
$(gzip -dc "$OUT" | awk '
  /^CREATE TABLE /                        { tables++ }
  /^CREATE TABLE public\.organizations/   { orgs = 1 }
  /^COPY public\.organizations /          { inorg = 1; next }
  inorg && /^\\\.$/                        { inorg = 0 }
  inorg                                   { orgrows++ }
  END { printf "%d %d %d", tables+0, orgs+0, orgrows+0 }')
EOF

if [ "${TABLE_COUNT:-0}" -lt 1 ]; then
  log "Dump contains no CREATE TABLE at all. Failing rather than trusting it."
  exit 1
fi
# Prove it is OUR database and not an empty one that happens to have a schema.
if [ "${HAS_ORGS:-0}" != "1" ]; then
  log "Dump has no public.organizations table. This is not the Collarone database. Failing."
  exit 1
fi
log "Contains ${TABLE_COUNT} tables, including public.organizations with ${ORG_ROWS} row(s)"
# An organizations table with no rows means the dump ran but captured nothing.
if [ "${ORG_ROWS:-0}" -lt 1 ]; then
  log "organizations is EMPTY. A dump with no tenants in it is not a backup. Failing."
  exit 1
fi

# ---- is it COMPLETE, not merely well-formed? -------------------------------
# Everything above proves the file is a real dump. None of it proves the dump
# holds everything the database holds. A dump taken by a role that cannot see
# some tables, or interrupted after the schema but during the data, passes
# every check so far and is still useless on the day it is needed.
#
# So the dump is compared against the source it came from: same number of
# tables, and the same number of rows in the tables that would hurt most to
# lose. Row counts are allowed to drift a little — the database is live and
# people are using it while pg_dump runs — but a table that is full in
# production and empty here is not drift.
if command -v psql >/dev/null 2>&1; then
  LIVE_TABLES=$(psql "$BACKUP_DB_URL" -tAc \
    "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'" 2>/dev/null || echo '')
  if [ -n "$LIVE_TABLES" ]; then
    if [ "$TABLE_COUNT" -lt "$LIVE_TABLES" ]; then
      log "INCOMPLETE: production has ${LIVE_TABLES} tables, the dump has ${TABLE_COUNT}. Failing."
      exit 1
    fi
    log "Table count matches production (${LIVE_TABLES})"
  fi

  for tbl in organizations profiles payroll_runs; do
    LIVE=$(psql "$BACKUP_DB_URL" -tAc "select count(*) from public.${tbl}" 2>/dev/null || echo '')
    [ -n "$LIVE" ] || continue
    DUMPED=$(gzip -dc "$OUT" | awk -v t="$tbl" '
      $0 ~ "^COPY public\\." t " " { inside = 1; next }
      inside && /^\\\.$/            { inside = 0 }
      inside                        { n++ }
      END { print n+0 }')
    if [ "$LIVE" -gt 0 ] && [ "$DUMPED" -eq 0 ]; then
      log "INCOMPLETE: public.${tbl} has ${LIVE} rows in production and 0 in the dump. Failing."
      exit 1
    fi
    log "  public.${tbl}: ${DUMPED} rows dumped, ${LIVE} live"
  done
else
  log "psql unavailable — could not compare the dump against production."
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
