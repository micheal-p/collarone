// No customer should ever read a Postgres error.
//
// 261 call sites in supabaseApi.js end in `fail(400, error.message)`, where
// the message is whatever the database said — "duplicate key value violates
// unique constraint idx_org_slug", "new row violates row-level security policy
// for table profiles". That teaches the customer nothing, reads as amateur,
// and leaks table and column names on the way past.
//
// The translation happens in one place (fail()), so this test pins two things:
// database noise gets rewritten, and our own hand-written messages do NOT.
// The second half matters more than the first — a translator that mangles
// "Only a finance manager can post to the ledger." into something generic has
// made the product worse, not better.
//
// Run:  node test/human_errors.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../client/src/api/supabaseApi.js', import.meta.url), 'utf8');

// Pull the translator out of the module without importing Supabase.
const start = src.indexOf('const DB_ERRORS = [');
const end = src.indexOf('const fail = (status, message)');
if (start === -1 || end === -1) {
  console.error('✗ could not find the error translator in supabaseApi.js — was it removed?');
  process.exit(1);
}
const mod = src.slice(start, end).replace('export const humanizeDbError', 'const humanizeDbError');
// eslint-disable-next-line no-new-func
const humanize = new Function(`${mod}; return humanizeDbError;`)();

let failures = 0;
const expectRewritten = (input, mustContain) => {
  const out = humanize(input);
  if (out === input || !out.toLowerCase().includes(mustContain)) {
    failures++;
    console.log(`✗ database error reached the customer unchanged:\n    in:  ${input}\n    out: ${out}`);
  }
};
const expectUnchanged = (input) => {
  const out = humanize(input);
  if (out !== input) {
    failures++;
    console.log(`✗ a hand-written message was mangled:\n    in:  ${input}\n    out: ${out}`);
  }
};

// --- database noise must be translated -------------------------------------
expectRewritten('duplicate key value violates unique constraint "organizations_slug_key"', 'already exists');
expectRewritten('new row violates row-level security policy for table "profiles"', 'permission');
expectRewritten('permission denied for table payroll_runs', 'permission');
expectRewritten('insert or update on table "tasks" violates foreign key constraint "tasks_assigned_to_fkey"', 'still being used');
expectRewritten('new row for relation "expenses" violates check constraint "expenses_amount_check"', 'not valid');
expectRewritten('null value in column "title" of relation "tasks" violates not-null constraint', 'left blank');
expectRewritten('invalid input syntax for type numeric: "abc"', 'format');
expectRewritten('JWT expired', 'sign in again');
expectRewritten('relation "public.ledger_accountz" does not exist', 'our side');
expectRewritten('function public.nope(uuid) does not exist', 'our side');
expectRewritten('deadlock detected', 'try again');

// --- the '{}' class, which a real prospect hit at signup --------------------
expectRewritten('{}', 'our side');
expectRewritten('', 'our side');
expectRewritten('{"code":"PGRST116"}', 'our side');

// --- our own sentences must survive intact ----------------------------------
expectUnchanged('Only a finance manager can post to the ledger.');
expectUnchanged('This entry does not balance: debits 500 vs credits 400.');
expectUnchanged('A payroll run that has been disbursed cannot be deleted.');
expectUnchanged('You already have an open shift — clock out first.');
expectUnchanged('A Nigerian account number is exactly 10 digits. Check the number before it goes onto your invoices.');
expectUnchanged('Enter a valid work email.');
expectUnchanged('You cannot decide your own leave request.');

if (failures) {
  console.error(`\nFAILED, ${failures} error-message problem(s)`);
  process.exit(1);
}
console.log('Database errors are translated; hand-written messages pass through untouched. ALL PASSED');
