// A support session must not be able to write. Anywhere.
//
// Read-only cannot be a UI state: if the only thing stopping a write is a
// missing Send button, every route, RPC and socket is still a live write
// path. This asserts the guarantee at the database, where it belongs:
//
//   1. Structural — every tenant table (anything with an org_id column) carries
//      the a_block_support_writes trigger. A future migration that adds a table
//      or drops the trigger fails this immediately.
//   2. Functional — under a mode=support_read claim, INSERT / UPDATE / DELETE on
//      org_chat_messages each raise, while the same writes succeed without the
//      claim. Proves the block fires, and only for support sessions. Everything
//      runs in a transaction that is rolled back, so prod is untouched.
//
// Needs a DB connection; skips (does not fail) when none is set, like the other
// live probes. Run:  DB_URL=... node test/support_write_denial.mjs
import pg from 'pg';

const url = process.env.DB_URL || process.env.DATABASE_URL;
if (!url) { console.log('support_write_denial: no DB_URL, skipping (structural check runs in the live job)'); process.exit(0); }

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
let failures = 0;
const SUPPORT_CLAIM = JSON.stringify({ mode: 'support_read', sub: '00000000-0000-0000-0000-000000000000' });

try {
  // 1. Structural: every table with org_id must have the block trigger.
  const { rows: gaps } = await c.query(`
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (
        select 1 from pg_trigger t
        where t.tgrelid = c.oid and t.tgname = 'a_block_support_writes' and not t.tgisinternal)
    order by c.relname`);
  if (gaps.length) {
    failures++;
    console.log(`✗ tenant tables missing the support-write block: ${gaps.map(g => g.relname).join(', ')}`);
    console.log('  Re-run supabase/support_readonly_enforcement.sql to re-attach.');
  } else {
    console.log('✓ every tenant table (org_id) carries a_block_support_writes');
  }

  // 2. Functional: chat writes blocked under the claim, allowed without it.
  const { rows: seed } = await c.query(`
    select p.id as author_id, p.org_id
    from public.profiles p limit 1`);
  if (!seed.length) {
    console.log('~ no profiles to seed a functional test; structural check only');
  } else {
    const { author_id, org_id } = seed[0];
    await c.query('begin');
    try {
      // baseline: without a support claim, a normal insert works
      await c.query(`set local request.jwt.claims = '{}'`);
      const ins = await c.query(
        `insert into public.org_chat_messages (org_id, room, author_id, body, mentions)
         values ($1,'__probe__',$2,'probe','{}') returning id`, [org_id, author_id]);
      const rowId = ins.rows[0].id;
      console.log('✓ baseline insert (no support claim) succeeded');

      // now become a support session
      await c.query(`set local request.jwt.claims = '${SUPPORT_CLAIM}'`);
      for (const [op, sql, args] of [
        ['INSERT', `insert into public.org_chat_messages (org_id, room, author_id, body, mentions)
                    values ($1,'__probe__',$2,'nope','{}')`, [org_id, author_id]],
        ['UPDATE', `update public.org_chat_messages set body='edited' where id=$1`, [rowId]],
        ['DELETE', `delete from public.org_chat_messages where id=$1`, [rowId]],
      ]) {
        await c.query('savepoint sp');
        try {
          await c.query(sql, args);
          failures++;
          console.log(`✗ ${op} as support session was ALLOWED (should have been blocked)`);
        } catch (e) {
          if (/read-only|42501/.test(e.message) || e.code === '42501') {
            console.log(`✓ ${op} as support session blocked: ${e.message.split('.')[0]}`);
          } else {
            failures++;
            console.log(`✗ ${op} failed for the WRONG reason: ${e.message}`);
          }
        }
        await c.query('rollback to savepoint sp');
      }
    } finally {
      await c.query('rollback');  // nothing the probe did survives
    }
  }
} finally {
  await c.end();
}

if (failures) { console.error(`\nFAILED: ${failures} support-write-denial check(s)`); process.exit(1); }
console.log('\nSupport sessions cannot write. ALL PASSED');
