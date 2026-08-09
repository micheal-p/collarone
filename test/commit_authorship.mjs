// The people credited on this repository are the people who work on it.
//
// Two separate rules, both easy to break by accident and both awkward to undo:
//
//   1. No commit carries a Co-authored-by or Signed-off-by trailer. Plenty of
//      tooling adds one for itself by default, and every one of those puts a
//      name on the contributors list and into the commit history of a product
//      with a sole author. Removing one afterwards means rewriting history —
//      changing a single commit's metadata changes every descendant SHA, so
//      nine bad commits from three weeks ago would mean rewriting 280 and
//      force-pushing over every clone. Far cheaper to refuse them at the gate.
//
//   2. Commits come from a known human. A machine configured with the wrong
//      git identity silently credits somebody else — the sort of thing nobody
//      notices until the contributors list is read months later.
//
// Deliberately checks TRAILER LINES, not free text. Commit bodies in this repo
// legitimately discuss status.claude.com and status.anthropic.com as design
// references for the status page, and a test that failed on the word "Claude"
// anywhere would be wrong about what it is looking for.
//
// Run:  node test/commit_authorship.mjs
import { execFileSync } from 'node:child_process';

// Identified by EMAIL, which is what GitHub attributes on and what stays
// stable when someone's display name changes — "Inioluwa Adeyinka" and
// "Inioluwa John Adeyinka" are one person and one address.
const PEOPLE = new Map([
  ['58996608+micheal-p@users.noreply.github.com', 'Nkanta Aniebiet Pius (micheal-p) — repository owner'],
  ['boluwatifeeri@gmail.com', 'Inioluwa John Adeyinka (Johnniewhite) — collaborator'],
]);

// Machines that may COMMIT but may never be an AUTHOR. Merging a pull request
// in the GitHub web UI records github.com as the committer while keeping the
// real person as the author, which is correct and not something to flag. The
// distinction is the point: a machine recording that it performed a merge is
// bookkeeping; a machine listed as the author of the work is a credit.
const MACHINE_COMMITTERS = new Map([
  ['noreply@github.com', 'GitHub web UI (pull request merges)'],
]);

// execFileSync with an argument array, NOT a shell string. The format strings
// below contain <, > and angle-bracket sentinels, and a shell reads those as
// redirections — the first attempt died on "syntax error near unexpected
// token `>'". No shell, no quoting to get wrong.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const problems = [];

// --- rule 1: no attribution trailers ----------------------------------------
// A sentinel record separator, so a commit body containing blank lines cannot
// be mistaken for the boundary between two commits. Not a NUL byte, which is
// the obvious choice and which execSync rejects outright: "the argument
// 'command' must be a string without null bytes".
const RECORD = '<<<END-OF-COMMIT-RECORD>>>';
const log = git('log', '--all', `--format=%H%n%an <%ae>%n%B${RECORD}`);
for (const record of log.split(RECORD)) {
  const text = record.trim();
  if (!text) continue;
  const [sha, who, ...bodyLines] = text.split('\n');
  for (const line of bodyLines) {
    const m = /^\s*(co-authored-by|signed-off-by)\s*:\s*(.+)$/i.exec(line);
    if (m) {
      problems.push(`${sha.slice(0, 8)} carries a ${m[1]} trailer crediting "${m[2].trim()}".\n      Commits here have one author. Remove the trailer before committing — after it is pushed, taking it out means rewriting every commit that follows.`);
    }
  }
  void who;
}

// --- rule 2: authors and committers are known people -------------------------
const seen = new Map();
for (const line of git('log', '--all', '--format=%H|%ae|%ce|%an').trim().split('\n')) {
  if (!line) continue;
  const [sha, authorEmail, committerEmail, authorName] = line.split('|');
  for (const [role, email] of [['author', authorEmail], ['committer', committerEmail]]) {
    if (PEOPLE.has(email)) continue;
    if (role === 'committer' && MACHINE_COMMITTERS.has(email)) continue;
    // Report each unknown identity once rather than once per commit.
    const key = `${role}:${email}`;
    if (seen.has(key)) { seen.get(key).count++; continue; }
    seen.set(key, { count: 1, sha, role, email, authorName });
  }
}
for (const { count, sha, role, email, authorName } of seen.values()) {
  problems.push(`${count} commit(s) have an unknown ${role}: ${authorName} <${email}> (first: ${sha.slice(0, 8)}).\n      Either the machine that made them has the wrong git identity, or a new person joined.\n      If it is a real contributor, add their email to PEOPLE in this file. If it is a misconfigured machine, fix git config BEFORE pushing — re-attributing afterwards rewrites history.`);
}

if (problems.length) {
  console.error('Commit authorship problems:\n');
  for (const p of problems) console.error(`  ✗ ${p}\n`);
  console.error(`FAILED, ${problems.length} problem(s)`);
  process.exit(1);
}
const total = git('rev-list', '--all', '--count').trim();
console.log(`${total} commits: no attribution trailers, every author and committer is a known person. ALL PASSED`);
