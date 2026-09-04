// The published integration URL must never be withdrawn, and v1 must exist.
//
// DeviceGuide.jsx is a page hardware installers read once and then configure a
// wall-mounted attendance terminal from. That configuration is burned into a
// device in someone's office; nobody is going to reflash it because we tidied a
// route. So `/api/<name>` is a permanent commitment, not an implementation
// detail, and `/api/v1/<name>` is the address that carries a compatibility
// promise for anyone integrating from now on.
//
// This test guards the pair. Deleting either mount, or publishing a URL in the
// device guide that the server does not answer, fails the build.
//
// Run:  node test/api_versioning.mjs
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const server = readFileSync(`${root}server/index.js`, 'utf8');
const guide = readFileSync(`${root}client/src/pages/DeviceGuide.jsx`, 'utf8');

let failures = 0;
const fail = (msg, hint) => { failures++; console.log(`x ${msg}`); if (hint) console.log(`    ${hint}`); };

// 1. Both mounts exist.
if (!/app\.all\(`\/api\/\$\{name\}`/.test(server)) {
  fail('the unversioned /api/<name> mount is gone from server/index.js',
       'every attendance device in the field posts to it — it cannot be withdrawn');
}
if (!/app\.all\(`\/api\/v1\/\$\{name\}`/.test(server)) {
  fail('the /api/v1/<name> mount is gone from server/index.js',
       'v1 is the base URL customer integrations are told to build against');
}

// 2. Every URL the device guide publishes resolves to a handler that exists.
//    A guide promising /api/v1/punch while the file is named something else is
//    an installer following instructions into a 404.
const handlers = new Set(
  readdirSync(`${root}client/api`).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)),
);
const published = [...guide.matchAll(/collarone\.app\/api\/(?:v1\/)?([a-z0-9-]+)/g)].map((m) => m[1]);
if (!published.length) fail('the device guide no longer publishes any endpoint URL');
for (const name of new Set(published)) {
  if (!handlers.has(name)) {
    fail(`the device guide publishes /api/.../${name} but client/api/${name}.js does not exist`);
  }
}

// 3. New installations should be pointed at the versioned URL.
if (!/collarone\.app\/api\/v1\//.test(guide)) {
  fail('the device guide does not mention the versioned URL',
       'new installations should be given /api/v1/ so they inherit the compatibility promise');
}

if (failures) { console.error(`\nFAILED, ${failures} API-surface problem(s)`); process.exit(1); }
console.log(`Both /api/ and /api/v1/ are mounted, and every URL the device guide publishes exists. ALL PASSED`);
