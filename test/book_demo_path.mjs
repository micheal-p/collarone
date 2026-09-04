// The Book a demo path must be whole, from the button to the inbox.
//
// This is the only place on the site where a stranger who is not ready to sign
// up can raise their hand. It is six pieces in five files, and any one of them
// going missing breaks it silently: the button still renders, the form still
// submits, and nobody ever sees the request. Nothing would throw. You would
// just stop getting leads and have no reason to look.
//
// So each link in the chain is pinned here, including the last one, which is
// the one most likely to be forgotten: the request has to be VISIBLE in the
// platform inbox. A lead captured and never shown is worse than no lead, since
// it also removes the reason to check.
//
// Run:  node test/book_demo_path.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');

const app = read('client/src/App.jsx');
const page = read('client/src/pages/BookDemo.jsx');
const api = read('client/src/api/supabaseApi.js');
const demo = read('client/src/api/demo.js');
const sql = read('supabase/demo_requests.sql');
const landing = read('client/src/pages/Landing.jsx');
const inbox = read('client/src/pages/PlatformAdmin.jsx');

let failures = 0;
const need = (ok, what) => { if (!ok) { failures++; console.log(`x ${what}`); } };

need(/path="\/book-demo"/.test(app), 'App.jsx has no /book-demo route, so the page is unreachable');
need(/apiPost\('\/book-demo'/.test(page), 'BookDemo.jsx no longer posts to /book-demo');
need(/head === 'POST \/book-demo'/.test(api), 'supabaseApi.js does not answer POST /book-demo');
need(/public_request_demo/.test(api), 'the /book-demo route no longer calls the public_request_demo RPC');
need(/route === 'POST \/book-demo'/.test(demo), 'demo.js does not answer POST /book-demo, so the form errors inside /try');

need(/create or replace function public\.public_request_demo/.test(sql),
  'supabase/demo_requests.sql no longer defines public_request_demo');
need(/grant execute on function public\.public_request_demo[\s\S]{0,200}to anon/.test(sql),
  'public_request_demo is not granted to anon, so a logged-out prospect cannot book');
need(/kind[\s\S]{0,80}'demo'/.test(sql), 'the migration no longer stamps kind = demo on the row');

// The button. Without an entry point the page exists and nobody finds it.
need(/to="\/book-demo"/.test(landing), 'the landing page has no link to /book-demo');

// The last link in the chain, and the quietest one to break.
need(/kind === 'demo'/.test(inbox),
  'PlatformAdmin.jsx no longer distinguishes demo requests, so they arrive invisible');
need(/preferred_at/.test(inbox),
  'PlatformAdmin.jsx no longer shows the requested time, which is the whole point of the booking');

if (failures) { console.error(`\nFAILED, ${failures} break(s) in the Book a demo path`); process.exit(1); }
console.log('Book a demo is wired end to end: button, page, API, demo mode, database, inbox. ALL PASSED');
