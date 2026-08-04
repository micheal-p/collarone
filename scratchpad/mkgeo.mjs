// Rebuild the geofence migration FROM the live function definition, changing
// exactly one condition. Writing the function from memory invented columns that
// do not exist (user_id instead of employee_id, a clock_in_at insert, no
// late_minutes); taking the real definition and editing one line cannot.
import pg from 'pg';
import { writeFileSync } from 'node:fs';

const c = new pg.Client({ connectionString: process.env.DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  "select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid=p.pronamespace"
  + " where n.nspname='public' and proname='attendance_clock_in'");
await c.end();

let def = rows[0].d;

const OLD = "  if s.geofence_radius_m is not null and s.geofence_radius_m > 0\n"
  + "     and s.office_lat is not null and p_lat is not null then";

const NEW = [
  '  -- Is a fence configured for this org?',
  '  if s.geofence_radius_m is not null and s.geofence_radius_m > 0',
  '     and s.office_lat is not null then',
  '    -- Then a missing position is a REFUSAL, not a free pass.',
  '    --',
  '    -- The old condition ended with "and p_lat is not null", which reads as',
  '    -- "only check when we have a position" but meant the entire distance',
  '    -- check was skipped whenever the client sent NULL coordinates. That is',
  '    -- exactly what it sends when someone denies the location permission, so',
  '    -- the way past a 500m fence was to turn location off.',
  '    --',
  '    -- Verified against production before this change: at the office allowed,',
  '    -- 250m allowed, 1.5km refused, and NO LOCATION AT ALL allowed.',
  '    if p_lat is null or p_lng is null then',
  "      raise exception 'Turn on location so we can confirm you are at work, then clock in again.';",
  '    end if;',
].join('\n');

if (!def.includes(OLD)) {
  console.error('Anchor not found: the live function is not shaped as expected. Nothing written.');
  process.exit(1);
}
def = def.replace(OLD, NEW);

const header = [
  '-- ============================================================================',
  '-- A geofence that any member of staff can switch off does not exist. Idempotent.',
  '--',
  '-- This is the LIVE attendance_clock_in() with one condition changed. It was',
  '-- generated from pg_get_functiondef rather than retyped, because the first',
  '-- attempt at writing it from memory invented columns that do not exist.',
  '-- ============================================================================',
  '',
].join('\n');

writeFileSync('supabase/attendance_geofence_required.sql',
  `${header}${def};\n\ngrant execute on function public.attendance_clock_in(numeric, numeric) to authenticated;\n`);
console.log('written from the live definition, one condition changed');
