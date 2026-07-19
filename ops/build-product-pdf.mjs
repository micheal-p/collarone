// Collarone Product Overview deck builder.
// Usage: cp ops/build-product-pdf.mjs client/.deck.mjs && cd client && node .deck.mjs && rm .deck.mjs
// Prereq: screenshots in SHOTS dir (see ops notes / session memory: demo build
// on :5199, log in with any email, shoot /suite/<key> for each suite plus
// hr-letters, hr-analytics, crm-pipeline, crm-bookings, launcher).
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';

const SHOTS = process.env.SHOTS_DIR || '/private/tmp/claude-501/-Users-aniebietpius/c2f3af16-8247-47a0-9031-755661175d7b/scratchpad/deck';
const THEME_SHOT = process.env.THEME_SHOT || '/private/tmp/claude-501/-Users-aniebietpius/c2f3af16-8247-47a0-9031-755661175d7b/scratchpad/themes5/boutique-noir.png';
const OUT_PDF = process.env.OUT_PDF || '/private/tmp/claude-501/-Users-aniebietpius/c2f3af16-8247-47a0-9031-755661175d7b/scratchpad/Collarone-Product-Overview.pdf';

const img = (p) => existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : '';

const PAGES = [
  { shot: 'launcher.png', kicker: 'The platform', title: 'One login. Your whole business.', body: 'Every company on Collarone gets its own isolated workspace — enforced at the database itself, not just hidden in the interface. Staff sign in once and see exactly the suites their admin has switched on, each one complete, connected to the others, and priced in naira.', why: 'Sixteen live suites replace the spreadsheet-and-WhatsApp patchwork most Nigerian businesses run on — one subscription, one login, one place where everything lives.' },
  { pricing: true },
  { shot: 'hr.png', kicker: 'Suite 01', title: 'HR & Staff', body: 'The flagship. Every employee has a 360 page — pay, leave, attendance, assets, documents, reviews and cases in one view. Recruiting runs a kanban pipeline with a public careers page, and candidates now accept offers through a private link, no account needed.', why: 'Staff records stop living in someone’s head. Probation decisions, confirmations and discipline follow proper documented sequences.', next: 'One-click hire from an accepted offer; interview scorecards.' },
  { shot: 'hr-letters.png', kicker: 'HR — Letters engine', title: 'Company letters, in two minutes', body: 'Confirmation, promotion, introduction, verification, query and warning letters — written manually, from templates, or drafted by Collarone AI — rendered live on your own letterhead with your logo and authorized signature, auto-numbered, and filed into Documents automatically.', why: 'Nigerian SMBs pay consultants for letters like these. Here they are part of the subscription.', next: 'More letter types as customers request them.' },
  { shot: 'hr-analytics.png', kicker: 'HR — Analytics', title: 'Headcount truth, at a glance', body: 'Headcount, attrition, tenure, hiring trend, work anniversaries, birthdays, and a statutory compliance meter — including the Pension Reform Act group-life requirement that kicks in at 5+ staff.', why: 'The board asks; you answer from a live dashboard, not a weekend of spreadsheet work.' },
  { shot: 'leave.png', kicker: 'Suite 02', title: 'Leave Management', body: 'Leave types with real entitlements, approvals with reasons employees actually see, a team calendar, and working-day math that skips weekends, public holidays and your company’s own holidays.', why: 'No more leave disputes settled by memory — balances are computed, visible and auditable.', next: 'Balance carry-over policies.' },
  { shot: 'tasks.png', kicker: 'Suite 03', title: 'Task & Report', body: 'Assignments with priorities and due dates, status tracking, and productivity reports across the team.', why: 'Work assigned in a meeting stops evaporating — everything has an owner and a deadline.' },
  { shot: 'visitors.png', kicker: 'Suite 04', title: 'Visitor Management', body: 'Front-desk check-in, host alerts, expected-visitor lists and a searchable visitor log.', why: 'A professional front desk without buying front-desk software separately.' },
  { shot: 'payroll.png', kicker: 'Suite 05', title: 'Payroll', body: 'Real Nigerian statutory math — PAYE, Pension, NHF, NSITF — salary structures, payroll runs, payslips, and a Banking Wall for whoever liaises with your bank. Collarone never touches your money: it prepares the disbursement instruction; your bank executes it.', why: 'Statutory deductions computed correctly every month, with an audit trail.', next: 'More country rule-packs as Collarone expands.' },
  { shot: 'crm.png', kicker: 'Suite 06', title: 'CRM', body: 'WhatsApp-first customer management — contacts, companies, an activity log, and a Messages inbox fed straight from your website’s forms so no enquiry gets ignored.', why: 'Nigerian business happens on WhatsApp. Your CRM should know that.' },
  { shot: 'crm-pipeline.png', kicker: 'CRM — Pipeline', title: 'Deals, staged and valued in naira', body: 'Every deal moves lead → qualified → proposal → won with naira values totalled per stage and follow-up reminders that surface before deals go cold.', why: 'You see exactly how much money is sitting in each stage of your funnel.' },
  { shot: 'crm-bookings.png', kicker: 'CRM — Bookings & Money owed', title: 'The service business day-sheet', body: 'Appointments grouped by day with one-tap WhatsApp confirmations, plus a Money Owed tracker that ages receivables by due date and tells you who to chase first.', why: 'Service businesses run on bookings and collections — both now live inside the CRM.', next: 'Automated reminders once a messaging channel is chosen.' },
  { shot: 'attendance.png', kicker: 'Suite 07', title: 'Time & Attendance', body: 'Geo-tagged clock-in/out, weekly summaries, manager timesheets with correction flows, and CSV export that feeds payroll.', why: 'Field and office staff on one honest clock.' },
  { shot: 'benefits.png', kicker: 'Suite 08', title: 'Benefits', body: 'HMO, group life and pension enrollments — including each employee’s PFA and RSA PIN, visible to the employee themselves.', why: 'Group life is a legal requirement at 5+ staff. Collarone flags the gap before a regulator does.' },
  { shot: 'it-assets.png', kicker: 'Suite 09', title: 'IT Assets', body: 'Asset register with assign, return, repair and retire lifecycles, plus per-asset history.', why: 'Laptops stop disappearing between staff exits.' },
  { shot: 'procurement.png', kicker: 'Suite 10', title: 'Procurement', body: 'Vendors, VAT-aware purchase requests and approval flows.', why: 'Spending gets a paper trail before the money leaves.' },
  { shot: 'inventory.png', kicker: 'Suite 11', title: 'Inventory', body: 'Multi-warehouse stock levels, atomic stock movements, low-stock alerts and bookings.', why: 'Stock counts that survive the person who kept them in their head.' },
  { shot: 'finance.png', kicker: 'Suite 12', title: 'Finance', body: 'VAT-aware expenses, budgets, and budget-vs-actual reporting.', why: 'Every expense categorized the day it happens — not reconstructed at year end.' },
  { shot: 'projects.png', kicker: 'Suite 13', title: 'Projects', body: 'Kanban boards, milestones and team membership per project.', why: 'Client work and internal projects tracked where the rest of the business already lives.' },
  { shot: 'documents.png', kicker: 'Suite 14', title: 'Documents', body: 'Folders, secure storage, append-only version history, and org-wide or restricted permissions. HR letters file themselves here automatically.', why: 'The company’s paper, findable and permissioned.' },
  { shot: 'trade-docs.png', kicker: 'Suite 15', title: 'Trade Documents', body: 'Sequential invoices, receipts, GRNs and stock release passes with your logo, address and signature on a choice of six templates.', why: 'Documents that make a small business look like a serious counterparty.' },
  { shot: 'automation.png', kicker: 'Suite 16', title: 'Automation', body: 'Daily checks across your other suites — low-stock alerts, overdue-invoice reminders, new-lead follow-up tasks — with optional drafted follow-up messages.', why: 'The busywork runs itself while your team sells and delivers.' },
  { theme: true, kicker: 'Included on every tier', title: 'A real website, with a real store', body: 'Ten designer themes across online store, landing page and company profile — every new site starts fully written with sample content the owner just swaps out. Stores get a genuine cart and checkout: bank transfer, pay on delivery, and card/bank/USSD through the merchant’s own Paystack account, settling directly to their bank.', why: 'Most Nigerian SMBs never get a website because it’s a separate project with a separate bill. Here it’s a tab.' },
  { security: true },
  { back: true },
];

const suitePage = (pg) => `
  <section class="page">
    <div class="rail">
      <div class="kicker">${pg.kicker}</div>
      <h2>${pg.title}</h2>
      <p class="body">${pg.body}</p>
      ${pg.why ? `<div class="why"><div class="why-t">Why your business needs this</div>${pg.why}</div>` : ''}
      ${pg.next ? `<div class="next"><span>Take it further:</span> ${pg.next}</div>` : ''}
    </div>
    <div class="shotwrap"><img src="${img(pg.theme ? THEME_SHOT : `${SHOTS}/${pg.shot}`)}" /></div>
    <div class="foot">Collarone — collarone.app</div>
  </section>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #14161C; }
  .page { width: 297mm; height: 209mm; page-break-after: always; position: relative; overflow: hidden; padding: 14mm 14mm 12mm; display: flex; gap: 10mm; background: #fff; }
  .kicker { font-size: 10px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: #E0500F; margin-bottom: 8px; }
  h2 { font-family: Georgia, serif; font-size: 26px; font-weight: 500; margin-bottom: 10px; }
  .rail { width: 78mm; flex: none; display: flex; flex-direction: column; }
  .body { font-size: 11.5px; line-height: 1.65; color: #3A3E48; }
  .why { margin-top: 14px; border-left: 3px solid #E0500F; padding: 8px 12px; font-size: 10.5px; line-height: 1.6; color: #3A3E48; background: #FAF7F2; }
  .why-t { font-weight: 800; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #E0500F; margin-bottom: 4px; }
  .next { margin-top: auto; font-size: 10px; color: #6B6F78; padding-top: 10px; }
  .next span { font-weight: 700; color: #14161C; }
  .shotwrap { flex: 1; border: 1px solid #E4E1D8; border-radius: 10px; overflow: hidden; background: #F6F5F1; box-shadow: 0 10px 30px rgba(20,22,28,0.10); }
  .shotwrap img { width: 100%; height: 100%; object-fit: cover; object-position: left top; display: block; }
  .foot { position: absolute; bottom: 6mm; left: 14mm; right: 14mm; font-size: 8.5px; letter-spacing: .08em; color: #9A9CA3; display: flex; justify-content: space-between; }
  .cover { background: #0A0E1A; color: #F4F1EA; flex-direction: column; justify-content: space-between; }
  .cover .wm { font-family: Georgia, serif; font-size: 30px; }
  .cover .wm em { font-style: italic; color: #FF6B2F; }
  .cover h1 { font-family: Georgia, serif; font-size: 52px; font-weight: 500; line-height: 1.1; max-width: 200mm; }
  .cover .sub { font-size: 14px; color: rgba(244,241,234,.7); margin-top: 12px; max-width: 150mm; line-height: 1.6; }
  .cover .meta { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: rgba(244,241,234,.55); }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8mm; flex: 1; align-content: center; }
  .tier { border: 1px solid #E4E1D8; border-radius: 12px; padding: 10mm 8mm; }
  .tier h3 { font-family: Georgia, serif; font-size: 20px; margin-bottom: 4px; }
  .tier .p { font-size: 24px; font-weight: 800; margin: 6px 0 2px; }
  .tier .p span { font-size: 11px; font-weight: 400; color: #6B6F78; }
  .tier ul { list-style: none; margin-top: 8px; font-size: 10.5px; line-height: 2; color: #3A3E48; padding: 0; }
  .tier li::before { content: '\\2014\\00a0'; color: #E0500F; }
  .fullcol { flex-direction: column; }
  .seclist { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 10mm; flex: 1; align-content: center; }
  .secitem { border-top: 2px solid #E0500F; padding-top: 6px; }
  .secitem h4 { font-size: 13px; margin-bottom: 4px; }
  .secitem p { font-size: 10.5px; line-height: 1.6; color: #3A3E48; }
</style></head><body>

<section class="page cover">
  <div class="wm">Collar<em>One</em></div>
  <div>
    <h1>Run your whole business.<br/>One login.</h1>
    <p class="sub">Sixteen live suites for Nigerian companies — HR with an AI letters engine, payroll, CRM with bookings, finance, projects, documents and a website builder with a real store checkout. Priced in naira. Rate locked at sign-up.</p>
  </div>
  <div class="meta">Product overview — collarone.app — July 2026</div>
</section>

${PAGES.map((pg) => {
  if (pg.pricing) return `
  <section class="page fullcol">
    <div><div class="kicker">Pricing</div><h2>À la carte, in naira, rate locked at sign-up</h2>
    <p class="body" style="max-width:180mm">Pick a tier, then pick any suites you want — every suite ships complete on every tier. Each staff member adds ₦2,000/month. Pay yearly and 15% comes off. Your rate locks at sign-up: later price changes never move your bill, and there is no dollar pricing or forex markup.</p></div>
    <div class="grid2">
      <div class="tier"><h3>Startup</h3><div class="p">₦15,000<span> /month</span></div><ul><li>Any 3 suites included</li><li>Extra suites ₦8,000 each</li><li>₦2,000 per staff member</li><li>Website builder included</li></ul></div>
      <div class="tier"><h3>Standard</h3><div class="p">₦25,000<span> /month</span></div><ul><li>Any 5 suites included</li><li>Extra suites ₦6,000 each</li><li>₦2,000 per staff member</li><li>Website builder included</li></ul></div>
      <div class="tier"><h3>Enterprise</h3><div class="p">₦45,000<span> /month</span></div><ul><li>Any 8 suites included</li><li>Extra suites ₦4,000 each</li><li>₦2,000 per staff member</li><li>Custom work on request</li></ul></div>
    </div>
    <div class="foot">Collarone — collarone.app</div>
  </section>`;
  if (pg.security) return `
  <section class="page fullcol">
    <div><div class="kicker">Security & trust</div><h2>Built like the data matters — because it does</h2></div>
    <div class="seclist">
      <div class="secitem"><h4>One isolated workspace per company</h4><p>Tenant isolation is enforced in the database itself with row-level security — verified directly, org by org — not just hidden in the interface.</p></div>
      <div class="secitem"><h4>Role checks on every screen</h4><p>Every page verifies who is allowed to see it before rendering anything, from payroll figures to HR cases.</p></div>
      <div class="secitem"><h4>Money is never held</h4><p>Payroll is instruction-only and store card payments settle to the merchant’s own Paystack account. Collarone never holds or moves customer funds.</p></div>
      <div class="secitem"><h4>Audited platform operations</h4><p>Sensitive platform actions — payment confirmations, guest sessions, gateway changes — are logged to an audit register.</p></div>
      <div class="secitem"><h4>Guest sessions expire</h4><p>Support access to a customer workspace is banner-marked, audited, and hard-expires after one hour.</p></div>
      <div class="secitem"><h4>Nigerian first</h4><p>Statutory rules — PAYE bands, pension, NHF, NSITF, PRA group-life thresholds — are first-class features, not afterthoughts.</p></div>
    </div>
    <div class="foot">Collarone — collarone.app</div>
  </section>`;
  if (pg.back) return `
  <section class="page cover">
    <div class="wm">Collar<em>One</em></div>
    <div>
      <h1>Get your business on Collarone.</h1>
      <p class="sub">Sign up at collarone.app/signup — pick a plan, name your workspace, and we activate you the same day during early access. Questions first? The team replies fast.</p>
      <p class="sub" style="margin-top:16px">WhatsApp / call: 0814 812 8551 · collarone.app/contact</p>
    </div>
    <div class="meta">Collarone — built in Nigeria, for Nigerian business</div>
  </section>`;
  return suitePage(pg);
}).join('')}
</body></html>`;

const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(html, { waitUntil: 'load' });
await p.pdf({ path: OUT_PDF, width: '297mm', height: '210mm', printBackground: true });
await b.close();
console.log('PDF written:', OUT_PDF);
