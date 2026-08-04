// Every action the admin API logs must be one the audit-log constraint allows.
//
// The bug this guards: admin.js started logging 'guest_mode' and
// 'payment_gateway', but the platform_admin_audit_log check constraint still
// only listed the original three. Every such insert failed with 23514, and
// because logAudit() ignores the error, the guest-in and the Paystack-key
// change were performed with NO audit row. A rejected audit write is a lost
// record of a sensitive act — the constraint must widen BEFORE the code emits
// a new action, not after production tells us.
//
// Run:  node test/audit_actions_in_sync.mjs
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../client/api/admin.js', import.meta.url), 'utf8');
const payFiles = ['../client/api/platform-pay.js', '../client/api/paystack-webhook.js']
  .map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n');
const sql = readFileSync(new URL('../supabase/platform_audit_actions_fix.sql', import.meta.url), 'utf8');

// actions the code emits. admin.js goes through logAudit('X', …). The pay
// files insert directly, so only read the `action:` that sits inside a
// platform_admin_audit_log insert — not every `action:` field in the file.
const emitted = new Set();
for (const m of admin.matchAll(/logAudit\(\s*'([a-z_]+)'/g)) emitted.add(m[1]);
for (const ins of payFiles.matchAll(/platform_admin_audit_log'\)\.insert\(\{[\s\S]{0,300}?\}\)/g)) {
  const m = ins[0].match(/action:\s*'([a-z_]+)'/);
  if (m) emitted.add(m[1]);
}

// actions the constraint allows: inside check (action in ( ... ))
const block = sql.match(/action in \(([\s\S]*?)\)/);
const allowed = new Set([...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));

const missing = [...emitted].filter((a) => !allowed.has(a));
if (missing.length) {
  console.error(`FAILED: admin API logs action(s) the constraint rejects: ${missing.join(', ')}`);
  console.error('Add them to supabase/platform_audit_actions_fix.sql before shipping.');
  process.exit(1);
}
console.log(`Every emitted audit action (${[...emitted].sort().join(', ')}) is allowed by the constraint. ALL PASSED`);
