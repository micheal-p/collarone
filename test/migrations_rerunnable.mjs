// Migrations must survive being run twice.
//
// Every migration in this repo is applied by hand and re-applied whenever a
// related one changes, so "run it again" is the normal case, not the edge case.
// Two shapes have already caused real damage today:
//
//   1. leave_org_seed.sql copied rows with `on conflict do nothing` and THEN
//      deleted the source, while the old unique index was still in place. The
//      copies all conflicted, the "do nothing" hid it, and the delete made it
//      permanent — every holiday in production gone.
//
//   2. billing_seat_release.sql re-declared a CHECK constraint's value list
//      from an older file, which would have silently dropped `promo_grant`
//      that a later migration had added. Only the constraint refusing to
//      validate caught it.
//
// Both are invisible in review and both report success. This test refuses the
// shapes that produce them.
//
// Run:  node test/migrations_rerunnable.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../supabase/', import.meta.url).pathname;
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

// Statements that are destructive if a preceding step silently did nothing.
const DELETE_RE = /^\s*delete\s+from\s+public\./i;
const CONFLICT_RE = /on\s+conflict[\s\S]{0,40}do\s+nothing/i;
const DROP_CONSTRAINT_RE = /alter\s+table[\s\S]{0,80}drop\s+constraint/i;
const ADD_CHECK_RE = /add\s+constraint[\s\S]{0,200}check\s*\(/i;

let failures = 0;
const flag = (file, why, hint) => {
  failures++;
  console.log(`✗ ${file}\n    ${why}\n    ${hint}`);
};

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  // Strip comments so prose about a pattern isn't mistaken for the pattern, and
  // strip $$ function bodies: those run when something CALLS them, not when the
  // migration runs, so an insert in add_member() and a delete in remove_member()
  // are unrelated. Only top-level DML can damage data on a re-run.
  const noComments = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  const code = noComments.replace(/\$\$[\s\S]*?\$\$/g, (b) => b.replace(/[^\n]/g, ' '));
  const lines = code.split('\n');

  // --- shape 1: an ignore-conflicts insert followed by a delete -------------
  // Only dangerous when the delete empties the SAME table the ignore-conflicts
  // insert was writing into — that is the copy-then-delete-the-source shape.
  // Two unrelated RPCs (add a member / remove a member) are not that, and
  // flagging them would train people to ignore this test.
  const conflictAt = lines.findIndex((l) => CONFLICT_RE.test(l));
  const insertTable = (() => {
    for (let i = conflictAt; i >= 0 && i > conflictAt - 12; i--) {
      const m = /insert\s+into\s+public\.(\w+)/i.exec(lines[i] || '');
      if (m) return m[1];
    }
    return null;
  })();
  const deleteAt = insertTable
    ? lines.findIndex((l) => new RegExp(`^\\s*delete\\s+from\\s+public\\.${insertTable}\\b`, 'i').test(l))
    : -1;
  if (conflictAt !== -1 && deleteAt > conflictAt) {
    // Safe when the uniqueness rule is dropped BEFORE the copy, which is the
    // fix that made leave_org_seed.sql correct.
    const dropsFirst = lines.slice(0, conflictAt).some((l) => DROP_CONSTRAINT_RE.test(l) || /drop\s+index/i.test(l));
    if (!dropsFirst) {
      flag(file,
        `line ${deleteAt + 1}: deletes rows after an "on conflict do nothing" insert (line ${conflictAt + 1}).`,
        'If the insert silently conflicts, the delete makes the loss permanent. Drop the old uniqueness rule BEFORE copying, or verify the copy landed before deleting.');
    }
  }

  // --- shape 2 is checked against the LIVE database below --------------------
  // Flagging every drop-and-re-add would flag the migration that legitimately
  // OWNS the constraint. The only real danger is a file that would NARROW what
  // is live, and that can only be known by asking the database.
  void DROP_CONSTRAINT_RE; void ADD_CHECK_RE;
}

// --- shape 2: would re-running this file NARROW a live CHECK list? ----------
const DB_URL = process.env.DB_URL || process.env.DATABASE_URL;
if (DB_URL) {
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows: live } = await c.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint where contype = 'c'
      and connamespace = 'public'::regnamespace`);
  await c.end();
  const liveByName = new Map(live.map((r) => [r.conname, r.def]));
  // Values inside a check list: 'foo'::text or 'foo'
  const valuesOf = (text) => new Set([...String(text).matchAll(/'([a-z0-9_]+)'/gi)].map((m) => m[1]));

  for (const file of files) {
    const sql = readFileSync(join(DIR, file), 'utf8');
    const code = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    for (const m of code.matchAll(/add\s+constraint\s+(\w+)\s+check\s*\(([\s\S]{0,400}?)\)\s*(?:not\s+valid)?\s*;/gi)) {
      const [, name, expr] = m;
      const liveDef = liveByName.get(name);
      if (!liveDef) continue;                        // not applied, or renamed
      const fileVals = valuesOf(expr);
      const liveVals = valuesOf(liveDef);
      if (fileVals.size === 0 || liveVals.size === 0) continue;
      const lost = [...liveVals].filter((v) => !fileVals.has(v));
      if (lost.length) {
        flag(file,
          `re-running would NARROW constraint ${name}, dropping: ${lost.join(', ')}`,
          'A later migration widened this list. Extend the LIVE definition rather than restating it from this file.');
      }
    }
  }
} else {
  console.log('~ no DB_URL: skipped the live CHECK-narrowing comparison (runs in the live CI job)');
}

if (failures) {
  console.error(`\nFAILED, ${failures} migration(s) that are unsafe to re-run`);
  process.exit(1);
}
console.log(`Checked ${files.length} migrations: none can silently destroy data on a re-run. ALL PASSED`);
