// Support tickets must notify the right person at every stage.
//
// The founder asked plainly: is there mail for a raised ticket, for when we
// answer from the admin end, and for when it is resolved? The first version
// only ever mailed the TEAM, so a customer heard nothing after writing in.
// This test pins all four moments and their recipients so a refactor can't
// quietly drop one — a customer who gets no acknowledgement assumes we ignored
// them, and that is churn, not a cosmetic bug.
//
// Run:  node test/support_ticket_mail.mjs
import { readFileSync } from 'node:fs';

const notify = readFileSync(new URL('../client/api/support-notify.js', import.meta.url), 'utf8');
const facade = readFileSync(new URL('../client/src/api/supabaseApi.js', import.meta.url), 'utf8');
const email = readFileSync(new URL('../client/api/_lib/email.js', import.meta.url), 'utf8');

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) { failures++; console.log(`✗ ${label}\n    ${detail}`); }
};

// 1. Every lifecycle kind is handled by the endpoint.
for (const kind of ['new', 'reply', 'platform_reply', 'resolved']) {
  check(`endpoint handles kind '${kind}'`, notify.includes(`'${kind}'`),
    `support-notify.js never mentions the '${kind}' kind`);
}

// 2. The customer is actually reachable — the endpoint must look up the
//    raiser's address server-side (never accept one from the caller).
check('customer address is looked up server-side', /created_by/.test(notify) && /from\('profiles'\)/.test(notify),
  'support-notify.js does not resolve the ticket raiser from created_by');
check('endpoint never takes a recipient from the request body', !/body\.(to|email|recipient)/.test(notify),
  'support-notify.js reads a recipient off the request body — that is an open relay');

// 3. Both reply directions fire, and resolving fires.
check('a Collarone reply notifies the customer', /asPlatform \? 'platform_reply' : 'reply'/.test(facade),
  'supabaseApi.js does not send platform_reply when Collarone answers');
check('resolving a ticket notifies the customer', /kind: 'resolved'/.test(facade),
  'supabaseApi.js never fires the resolved notification');

// 4. Sending stays provider-agnostic: the Twilio/SendGrid switch must be a
//    key change, not a code change.
check('sender supports SendGrid', /api\.sendgrid\.com/.test(email), '_lib/email.js has no SendGrid path');
check('sender supports Resend', /api\.resend\.com/.test(email), '_lib/email.js lost the Resend path');
check('SendGrid wins when both keys exist', /if \(SENDGRID_KEY\) return sendSendGrid/.test(email),
  'sendMail() does not prefer SendGrid — the decided provider must win');
check('support-notify sends through the shared sender', /sendMail/.test(notify) && !/api\.resend\.com/.test(notify),
  'support-notify.js calls a provider directly instead of sendMail()');

// 5. Mail is best-effort: a missing key must never break the ticket itself.
check('no key means no send, not an error', /emailEnabled\(\)/.test(notify) && /sent: false/.test(notify),
  'support-notify.js does not degrade gracefully when email is switched off');

// 6. User input into email HTML stays escaped.
check('subject and org name are escaped', /esc\(t\.subject\)/.test(notify) && /esc\(t\.organizations\?\.name/.test(notify),
  'ticket subject or org name reaches email HTML unescaped');

if (failures) {
  console.error(`\nFAILED, ${failures} gap(s) in the support-ticket mail lifecycle`);
  process.exit(1);
}
console.log('Support mail covers all 4 moments, addresses are server-resolved, provider-agnostic. ALL PASSED');
