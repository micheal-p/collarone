// Apply a .sql file to the database, and say plainly what happened.
//
// Collarone applies migrations by hand: loose .sql files in supabase/, pasted
// into the Supabase SQL editor. That works, but nothing records what was
// applied — which is how supabase/platform_contact.sql came to be listed in
// PROJECT_SUMMARY.md as "may not yet be run against production", with no way to
// tell short of looking.
//
// This does not fix that. It is the smaller thing: one command, so applying a
// file is not a copy-paste ritual, and so the output says which statement
// failed rather than leaving you to find it in a 281-line paste.
//
// Every file it is used on must be idempotent, which is already the house rule
// (test/migrations_rerunnable.mjs enforces it). So a re-run is safe, and a
// half-applied file can simply be run again.
//
// Usage:
//   DATABASE_URL='postgresql://...' node deploy/apply-sql.mjs supabase/bundles/pending_2026_09.sql
//
// or, to keep the credential out of your shell history:
//   node deploy/apply-sql.mjs supabase/bundles/pending_2026_09.sql --url-file ~/.collarone-db-url
import { readFileSync } from 'node:fs';
import pg from 'pg';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const urlFileIdx = args.indexOf('--url-file');
const urlFile = urlFileIdx !== -1 ? args[urlFileIdx + 1] : null;

if (!file) {
  console.error('Usage: node deploy/apply-sql.mjs <file.sql> [--url-file <path>]');
  process.exit(2);
}

const url = urlFile
  ? readFileSync(urlFile.replace(/^~/, process.env.HOME), 'utf8').trim()
  : process.env.DATABASE_URL;

if (!url) {
  console.error('No connection string. Set DATABASE_URL, or pass --url-file <path>.');
  process.exit(2);
}

const sql = readFileSync(file, 'utf8');

// One connection, one transaction. Either the whole file lands or none of it
// does — a partly-applied migration is the worst outcome, because the next
// person cannot tell how far it got.
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows: [who] } = await client.query('select current_database() as db, current_user as usr');
  console.log(`connected: ${who.db} as ${who.usr}`);
  console.log(`applying:  ${file} (${sql.split('\n').length} lines)`);

  await client.query('begin');
  await client.query(sql);
  await client.query('commit');

  console.log('\nAPPLIED, and committed.');
} catch (e) {
  try { await client.query('rollback'); } catch { /* connection may already be gone */ }
  console.error(`\nFAILED, nothing was applied (rolled back).`);
  console.error(`  ${e.message}`);
  if (e.position) {
    // Point at the offending statement rather than making someone count lines.
    const upto = sql.slice(0, Number(e.position));
    const line = upto.split('\n').length;
    console.error(`  at line ${line}: ${sql.split('\n')[line - 1]?.trim().slice(0, 120)}`);
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
