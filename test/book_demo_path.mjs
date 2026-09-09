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
// The inbox moved into its own file when Platform Control was split into
// sections (Sept 2026); the demo request still has to be tellable apart there.
const inbox = read('client/src/pages/platform/Inbox.jsx');

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

// A demo is a visit to the prospect's premises. Without an address the request
// is unactionable, so the address is required end to end and must be visible to
// whoever is going to travel there. Each link pinned separately because any one
// of them going missing still leaves a form that submits and a row that saves.
const visitSql = read('supabase/demo_visits.sql');
need(/p_location/.test(visitSql), 'the migration no longer takes a location');
need(/raise exception[\s\S]{0,120}where to come/i.test(visitSql),
  'the database no longer REQUIRES a location, so a visit can be booked with no address');
need(/f\.location/.test(page), 'BookDemo.jsx no longer collects the office address');
need(/p_location:/.test(api), 'the /book-demo route no longer passes the address to the database');
// Pinned to the CONDITIONAL RENDER and its label, not to the string
// "m.location". The first version of this check matched the bare identifier,
// which also appears inside the maps href — so blanking the guard to
// `{false && (` left the identifier in the file and the test went green while
// the address had vanished from the screen. Same substring trap as the CSP
// test's "present in the policy" check.
need(/\{open\.location && /.test(inbox),
  'Inbox.jsx no longer conditionally renders the address');
need(/<dt>Visit address<\/dt>/.test(inbox),
  'the address row lost its label, so nobody knows where to go');
need(/maps\.google\.com\/\?q=\$\{encodeURIComponent\(open\.location\)\}/.test(inbox),
  'the address is no longer a maps link, and whoever picks this up will look it up anyway');

// The button. Without an entry point the page exists and nobody finds it.
need(/to="\/book-demo"/.test(landing), 'the landing page has no link to /book-demo');

// The last link in the chain, and the quietest one to break.
need(/kind === 'demo'/.test(inbox),
  'Inbox.jsx no longer distinguishes demo requests, so they arrive invisible');
need(/preferred_at/.test(inbox),
  'Inbox.jsx no longer shows the requested time, which is the whole point of the booking');

if (failures) { console.error(`\nFAILED, ${failures} break(s) in the Book a demo path`); process.exit(1); }
console.log('Book a demo is wired end to end: button, page, API, demo mode, database, inbox. ALL PASSED');
