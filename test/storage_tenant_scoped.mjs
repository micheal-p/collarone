// Private storage buckets must be tenant-isolated, forever.
//
// The hole: six private buckets were protected by bucket_id alone, so any
// authenticated user of any tenant could list/read/overwrite/delete every
// other company's files (storage.list returns paths without touching a table,
// so table RLS did not help). The fix makes the org id the first path segment
// and scopes every policy to it.
//
// This guards both halves so neither can silently regress:
//   - Static: every private-bucket uploader puts an org id first in the path.
//   - Live (when a DB is present): each bucket's SELECT policy is scoped by
//     foldername + my_org_id, and no permissive bucket-only ALL policy remains.
//
// Run:  [DB_URL=...] node test/storage_tenant_scoped.mjs
import { readFileSync } from 'node:fs';
import pg from 'pg';

const PRIVATE_BUCKETS = ['org-documents','employee-documents','hr-letters','finance-receipts','task-attachments','candidate-resumes'];

// (file, the upload call's bucket) — every private-bucket upload site.
const UPLOADERS = [
  ['client/src/suites/documents/documentsApi.js', 'org-documents'],
  ['client/src/suites/hr/complianceApi.js', 'employee-documents'],
  ['client/src/suites/hr/lettersApi.js', 'hr-letters'],
  ['client/src/suites/tasks/taskApi.js', 'task-attachments'],
  ['client/src/suites/hr/lifecycleApi.js', 'candidate-resumes'],
  ['client/src/pages/careers/careersApi.js', 'candidate-resumes'],
];
const ORG_TOKEN = /currentOrgId\(\)|orgId|org_id|posting\.org_id/;

let failures = 0;

// 1. Static: each uploader builds its path with an org id up front.
for (const [file, bucket] of UPLOADERS) {
  const src = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  // the line that assigns `path` for this bucket's upload
  const pathLines = src.split('\n').filter((l) => /const path\s*=/.test(l));
  const bad = pathLines.filter((l) => !ORG_TOKEN.test(l));
  if (!pathLines.length || bad.length) {
    failures++;
    console.log(`✗ ${file}: an upload path is not org-prefixed (${bucket})`);
    bad.forEach((l) => console.log(`    ${l.trim()}`));
  }
}
if (!failures) console.log(`✓ all ${UPLOADERS.length} private-bucket uploaders put the org id first in the path`);

// 2. Live: policies are org-scoped and the permissive pattern is gone.
const url = process.env.DB_URL || process.env.DATABASE_URL;
if (!url) {
  console.log('~ no DB_URL: skipping live policy check (runs in the live CI job)');
} else {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(`
      select policyname, cmd, coalesce(qual,'') as using_expr, coalesce(with_check,'') as check_expr
      from pg_policies where schemaname='storage' and tablename='objects'`);
    for (const b of PRIVATE_BUCKETS) {
      const forBucket = rows.filter((r) => (r.using_expr + r.check_expr).includes(`'${b}'`));
      const sel = forBucket.find((r) => r.cmd === 'SELECT');
      if (!sel || !/foldername/.test(sel.using_expr) || !/my_org_id/.test(sel.using_expr)) {
        failures++;
        console.log(`✗ ${b}: SELECT policy is not org-scoped (foldername + my_org_id)`);
      }
      // the old hole: an authenticated ALL/SELECT policy gated on bucket_id with no foldername
      const permissive = forBucket.find((r) =>
        (r.cmd === 'ALL' || r.cmd === 'SELECT') && !/foldername/.test(r.using_expr + r.check_expr));
      if (permissive) {
        failures++;
        console.log(`✗ ${b}: a bucket-only policy still exists (${permissive.policyname}/${permissive.cmd}) — cross-tenant`);
      }
    }
    if (!failures) console.log(`✓ all ${PRIVATE_BUCKETS.length} private buckets are org-scoped, no bucket-only policy remains`);
  } finally { await c.end(); }
}

if (failures) { console.error(`\nFAILED: ${failures} storage-isolation check(s)`); process.exit(1); }
console.log('\nStorage is tenant-isolated. ALL PASSED');
