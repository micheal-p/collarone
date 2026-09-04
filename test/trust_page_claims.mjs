// Everything the public security page claims must still be true.
//
// /trust tells buyers, in writing, that specific protections exist: restored
// backups, a cross-tenant probe, automatic rollback, a payroll-week freeze, a
// vulnerability gate, a support write block. Those are the sentences a security
// reviewer will ask us to demonstrate.
//
// A public promise that quietly stops being true is worse than never having
// made it, and the way it stops being true is not malice — it is someone
// deleting a workflow step during unrelated work. So each claim is pinned to
// the thing that implements it.
//
// Run:  node test/trust_page_claims.mjs
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => (existsSync(`${root}${p}`) ? readFileSync(`${root}${p}`, 'utf8') : '');

const trust = read('client/src/pages/Trust.jsx');
const deployYml = read('.github/workflows/deploy.yml');
const restoreYml = read('.github/workflows/backup-restore-test.yml');
const deploySh = read('deploy/deploy.sh');

let failures = 0;
const claim = (ok, what, where) => {
  if (!ok) { failures++; console.log(`x /trust claims ${what}`); console.log(`    but ${where}`); }
};

claim(trust.length > 0, 'anything at all', 'client/src/pages/Trust.jsx is missing');

claim(/cron:/.test(restoreYml) && /restore/i.test(restoreYml),
  'backups are restored and verified every Monday',
  'the scheduled restore workflow (.github/workflows/backup-restore-test.yml) is gone or unscheduled');

claim(/node test\/rls_probe\.mjs/.test(deployYml),
  'a cross-tenant probe runs on every release',
  'test/rls_probe.mjs is no longer run by the deploy workflow');

// Anchored to the job key, not a substring. `/payroll-freeze/` alone passes
// against `payroll-freeze-disabled:`, which is exactly the rename someone would
// make to switch it off — the first version of this check waved that through.
claim(/^\s{2}payroll-freeze:\s*$/m.test(deployYml),
  'releases are frozen from the 25th to month end',
  'no `payroll-freeze:` job exists in the deploy workflow (renamed or removed)');

claim(/npm audit .*--audit-level=high/.test(deployYml),
  'a high or critical vulnerability stops the release',
  'the npm audit gate is gone from the deploy workflow');

// The audit step is allowed to give up when npm's advisory service is down,
// because blocking every deploy on someone else's uptime is worse. /trust says
// so explicitly, and says an unscanned build is MARKED rather than treated as
// clean. That second half is the whole reason the first half is acceptable, so
// pin it: without the annotation, a skipped scan is indistinguishable from a
// passed one and the page is making a promise the pipeline does not keep.
claim(/::warning title=Vulnerability scan did not run/.test(deployYml),
  'an unscanned release is marked as unscanned, not treated as clean',
  'the audit step no longer annotates the run when the scan could not be performed');

// And the real finding must still be fatal, or "a finding stops the release" is
// false. Guards against someone widening the outage match until everything
// looks like an outage.
claim(/::error title=Vulnerable dependency/.test(deployYml),
  'a high or critical finding stops the release',
  'the audit step no longer raises an error for a genuine finding');

// The mechanism, not the word. A comment saying "rollback" is not a rollback.
claim(/rsync .*--delete.*\$\{APP_DIR\}\.rollback/.test(deploySh) || /\.rollback\/" "\$\{APP_DIR\}\//.test(deploySh),
  'a failed health check restores the previous version automatically',
  'deploy/deploy.sh no longer restores from the .rollback snapshot');

// The write block is a database trigger, so look for the thing itself rather
// than for a filename that happens to contain the word "support".
const supabaseSql = readdirSync(`${root}supabase`).filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`${root}supabase/${f}`, 'utf8')).join('\n');
claim(/support/i.test(supabaseSql) && /raise exception/i.test(supabaseSql) && /is_support|support_session|guest_mode/i.test(supabaseSql),
  'support sessions cannot write to your data',
  'no support write-block logic was found anywhere in supabase/*.sql');

// The page deliberately names no competitor. A factual page becomes a
// marketing claim the moment it does, and that is a different legal standard.
for (const name of ['paycita', 'zoho', 'seamless', 'bamboohr']) {
  claim(!new RegExp(name, 'i').test(trust),
    'nothing about any other company',
    `it mentions "${name}" — keep this page to facts about Collarone only`);
}

// Performance budget behind the "about three hundred and thirty kilobytes"
// sentence. Skipped when there is no build to measure, like the live-DB tests.
const assets = `${root}client/dist/assets`;
if (existsSync(assets)) {
  const entry = readdirSync(assets)
    .filter((f) => /^(index|vendor)-.*\.(js|css)$/.test(f))
    .map((f) => ({ f, mtime: statSync(`${assets}/${f}`).mtimeMs, size: statSync(`${assets}/${f}`).size }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 6);
  const raw = entry.reduce((n, e) => n + e.size, 0);
  // Uncompressed, so the ceiling is generous: gzip on the wire runs roughly a
  // third of this. It exists to catch a step change (a chart library landing in
  // the entry chunk), not to police kilobytes.
  const CEILING = 2_400_000;
  claim(raw < CEILING,
    'the app is light enough to open on mobile data',
    `the newest entry chunks total ${Math.round(raw / 1024)}KB uncompressed, over the ${Math.round(CEILING / 1024)}KB budget`);
} else {
  console.log('~ no client/dist: skipped the page-weight budget (runs after a build)');
}

if (failures) { console.error(`\nFAILED, ${failures} unsupported claim(s) on /trust`); process.exit(1); }
console.log('Every claim on the public security page is still backed by something that runs. ALL PASSED');
