// Collarone HR Overview deck — shots + assembly in one script.
// Usage: demo build serving on :5199, then:
//   cp ops/build-hr-pdf.mjs client/.hr.mjs && cd client && node .hr.mjs && rm .hr.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'fs';

const OUT_DIR = process.env.SHOTS_DIR || '/private/tmp/claude-501/-Users-aniebietpius/c2f3af16-8247-47a0-9031-755661175d7b/scratchpad/hrdeck';
const OUT_PDF = process.env.OUT_PDF || '/private/tmp/claude-501/-Users-aniebietpius/c2f3af16-8247-47a0-9031-755661175d7b/scratchpad/Collarone-HR-Overview.pdf';
mkdirSync(OUT_DIR, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 860 } });
await p.goto('http://localhost:5199/login', { waitUntil: 'networkidle' });
await p.fill('input[type="email"]', 'demo.admin@collarone-demo.app');
await p.click('button[type="submit"]').catch(() => {});
await p.waitForTimeout(700);
const pw = await p.$('input[type="password"]');
if (pw) { await pw.fill('DemoPass1!'); await p.click('button[type="submit"]'); }
await p.waitForTimeout(1500);

const shoot = async (name) => p.screenshot({ path: `${OUT_DIR}/${name}.png` });
const gotoHrTab = async (label) => {
  await p.goto('http://localhost:5199/suite/hr', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1100);
  if (label) { const el = await p.$(`text="${label}"`); if (el) { await el.click(); await p.waitForTimeout(1200); } }
};

await gotoHrTab(null); await shoot('hr');
await gotoHrTab('Recruiting'); await shoot('hr-recruiting');
await gotoHrTab('Letters'); await shoot('hr-letters');
await gotoHrTab('Onboarding'); await shoot('hr-onboarding');
await gotoHrTab('Analytics'); await shoot('hr-analytics');
for (const key of ['leave', 'attendance', 'payroll', 'benefits']) {
  await p.goto(`http://localhost:5199/suite/${key}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1300);
  await shoot(key);
}
await p.goto('http://localhost:5199/profile', { waitUntil: 'networkidle' });
await p.waitForTimeout(1100);
await shoot('profile');

const img = (n) => { const f = `${OUT_DIR}/${n}.png`; return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : ''; };

const PAGES = [
  { flow: true },
  { shot: 'hr', kicker: 'HR & Staff', title: 'Employee 360 — one page per person', body: 'Directory, org chart, and a 360 view per employee: pay, leave, attendance, assets, documents, reviews and cases together. Departments, managers, employment type, start date and probation end all live on the record.', why: 'Staff records stop living in someone’s head — and every other HR feature hangs off this one page.' },
  { shot: 'hr-recruiting', kicker: 'Recruiting / ATS', title: 'From job post to hired, without leaving', body: 'Post a role to your public careers page (and the platform-wide jobs board). Applications land in a kanban pipeline with star ratings and interview scorecards. Email candidates from inside the pipeline, send the offer as a private accept/decline link, then hire in one click — their staff login is created instantly.', why: 'The win moment stays seamless: accepted offer → real account → onboarding, no copy-paste.' },
  { shot: 'hr-letters', kicker: 'Letters engine', title: 'Company letters, on your letterhead, in minutes', body: 'Confirmation, promotion, introduction, verification, query and warning letters — manual, template, or drafted by Collarone AI — rendered on your letterhead with logo and authorized signature, auto-numbered and filed into Documents.', why: 'Letters Nigerian SMBs pay consultants for are part of the subscription.' },
  { shot: 'hr-onboarding', kicker: 'Onboarding & probation', title: 'Structured starts, documented decisions', body: 'Hired employees get generated onboarding task lists. Probation end dates trigger a proper decision — confirm (with the letter generated), extend, or exit — and discipline follows the query → response → outcome fair-hearing sequence.', why: 'The decisions that end up in court when done casually are done properly by default.' },
  { shot: 'leave', kicker: 'Leave', title: 'Balances no one argues about', body: 'Leave types with entitlements, approvals with visible reasons, team calendar, working-day math that skips weekends, public holidays and your company’s own holidays — plus HR balance overrides when discretion is needed.', why: 'Leave disputes end when the balance is computed and visible to both sides.' },
  { shot: 'attendance', kicker: 'Time & Attendance', title: 'One honest clock', body: 'Geo-tagged clock-in/out, weekly summaries, manager timesheets with correction flows, and CSV export straight into payroll.', why: 'Field and office staff measured the same way.' },
  { shot: 'payroll', kicker: 'Payroll + Banking Wall', title: 'Nigerian statutory math, bank-ready', body: 'PAYE, Pension, NHF, NSITF computed per run, payslips, and the Banking Wall: the bank liaison gets an auto-fed queue of what changed, downloads the bank schedule (account name, number, bank, net, narration) ready for bulk upload, and tracks each payment paid or failed with a note. Account numbers are masked from everyone except the liaison.', why: 'Collarone never touches your money — it prepares the instruction, your bank executes it.' },
  { shot: 'benefits', kicker: 'Benefits', title: 'HMO, group life, pension — tracked', body: 'Enrollments per employee including PFA and RSA PIN (visible to the employee), and a statutory nudge: group life is a legal requirement at 5+ staff under the Pension Reform Act — analytics flags the gap.', why: 'Compliance you find out about from your dashboard, not a regulator.' },
  { shot: 'profile', kicker: 'Self-service', title: 'Staff keep their own record current', body: 'Every employee updates their own phone, WhatsApp, photo, date of birth, home address and emergency contact. Deliberately not self-service: name, role, salary and bank details — those stay admin-managed.', why: 'HR stops chasing people for their next of kin — and the birthdays board fills itself.' },
  { shot: 'hr-analytics', kicker: 'HR Analytics', title: 'Answers before the board asks', body: 'Headcount, attrition, tenure, hiring trend, work anniversaries, birthdays and the statutory compliance meter — live, not assembled in a spreadsheet the night before.', why: 'The state of your people, at a glance, every day.' },
  { table: true },
  { back: true },
];

const suitePage = (pg) => `
  <section class="page">
    <div class="rail">
      <div class="kicker">${pg.kicker}</div>
      <h2>${pg.title}</h2>
      <p class="body">${pg.body}</p>
      ${pg.why ? `<div class="why"><div class="why-t">Why it matters</div>${pg.why}</div>` : ''}
    </div>
    <div class="shotwrap"><img src="${img(pg.shot)}" /></div>
    <div class="foot"><span>Collarone HR</span><span>collarone.app</span></div>
  </section>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #14161C; }
  .page { width: 297mm; height: 209mm; page-break-after: always; position: relative; overflow: hidden; padding: 14mm 14mm 12mm; display: flex; gap: 10mm; background: #fff; }
  .kicker { font-size: 10px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; color: #E0500F; margin-bottom: 8px; }
  h2 { font-family: Georgia, serif; font-size: 25px; font-weight: 500; margin-bottom: 10px; }
  .rail { width: 80mm; flex: none; display: flex; flex-direction: column; }
  .body { font-size: 11.5px; line-height: 1.65; color: #3A3E48; }
  .why { margin-top: 14px; border-left: 3px solid #E0500F; padding: 8px 12px; font-size: 10.5px; line-height: 1.6; color: #3A3E48; background: #FAF7F2; }
  .why-t { font-weight: 800; font-size: 9px; letter-spacing: .12em; text-transform: uppercase; color: #E0500F; margin-bottom: 4px; }
  .shotwrap { flex: 1; border: 1px solid #E4E1D8; border-radius: 10px; overflow: hidden; background: #F6F5F1; box-shadow: 0 10px 30px rgba(20,22,28,0.10); }
  .shotwrap img { width: 100%; height: 100%; object-fit: cover; object-position: left top; display: block; }
  .foot { position: absolute; bottom: 6mm; left: 14mm; right: 14mm; font-size: 8.5px; letter-spacing: .08em; color: #9A9CA3; display: flex; justify-content: space-between; }
  .cover { background: #0A0E1A; color: #F4F1EA; flex-direction: column; justify-content: space-between; }
  .cover .wm { font-family: Georgia, serif; font-size: 30px; }
  .cover .wm em { font-style: italic; color: #FF6B2F; }
  .cover h1 { font-family: Georgia, serif; font-size: 50px; font-weight: 500; line-height: 1.12; max-width: 210mm; }
  .cover .sub { font-size: 14px; color: rgba(244,241,234,.7); margin-top: 12px; max-width: 155mm; line-height: 1.6; }
  .cover .meta { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: rgba(244,241,234,.55); }
  .fullcol { flex-direction: column; }
  .flowlist { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm 12mm; flex: 1; align-content: center; }
  .flowitem { display: flex; gap: 10px; align-items: baseline; }
  .flowitem .n { font-family: Georgia, serif; font-size: 20px; color: #E0500F; width: 26px; flex: none; }
  .flowitem h4 { font-size: 13px; margin-bottom: 2px; }
  .flowitem p { font-size: 10.5px; line-height: 1.55; color: #3A3E48; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { text-align: left; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: #6B6F78; padding: 8px 10px; border-bottom: 1.5px solid #14161C; }
  td { padding: 8px 10px; border-bottom: 1px solid #ECE9E1; vertical-align: top; line-height: 1.5; }
  td:first-child { font-weight: 650; }
</style></head><body>

<section class="page cover">
  <div class="wm">Collar<em>One</em></div>
  <div>
    <h1>HR that runs the whole employee story.</h1>
    <p class="sub">From the job post to the exit interview — recruiting, offer links, one-click hire, letters on your letterhead, leave, attendance, Nigerian payroll with a Banking Wall, benefits, discipline done properly, and analytics that answer before the board asks.</p>
  </div>
  <div class="meta">HR overview — collarone.app — July 2026</div>
</section>

${PAGES.map((pg) => {
  if (pg.flow) return `
  <section class="page fullcol">
    <div><div class="kicker">The flow</div><h2>Hire to exit, end to end — all live today</h2></div>
    <div class="flowlist">
      <div class="flowitem"><span class="n">1</span><div><h4>Post the role</h4><p>Public careers page on your handle plus the platform-wide jobs board. Candidates apply with no account, CV attached.</p></div></div>
      <div class="flowitem"><span class="n">2</span><div><h4>Run the pipeline</h4><p>Kanban stages, star ratings, interview scheduling with structured scorecards, and candidate emails sent from inside the pipeline.</p></div></div>
      <div class="flowitem"><span class="n">3</span><div><h4>Send the offer</h4><p>Salary, start date and a note — delivered as a private link the candidate accepts or declines online. The decision stamps itself.</p></div></div>
      <div class="flowitem"><span class="n">4</span><div><h4>Hire in one click</h4><p>Their staff login is created instantly (one seat credit), onboarding tasks start, and the temp password is handed over once.</p></div></div>
      <div class="flowitem"><span class="n">5</span><div><h4>Run the employment</h4><p>Leave, attendance, payroll, benefits, letters, reviews — all feeding the same Employee 360.</p></div></div>
      <div class="flowitem"><span class="n">6</span><div><h4>Decide probation properly</h4><p>End dates trigger confirm (letter generated) / extend / exit. Discipline follows query → response → outcome.</p></div></div>
      <div class="flowitem"><span class="n">7</span><div><h4>Staff self-serve</h4><p>Everyone keeps their own contact details, date of birth, address and emergency contact current.</p></div></div>
      <div class="flowitem"><span class="n">8</span><div><h4>Exit with records intact</h4><p>Offboarding tasks, exit records, and the whole history retained on the 360.</p></div></div>
    </div>
    <div class="foot"><span>Collarone HR</span><span>collarone.app</span></div>
  </section>`;
  if (pg.table) return `
  <section class="page fullcol">
    <div><div class="kicker">Separation of duties</div><h2>Setting up a new employee — who does what</h2></div>
    <div style="flex:1; display:flex; align-items:center;">
    <table>
      <tr><th>What</th><th>Who sets it</th><th>Where</th></tr>
      <tr><td>Name, email, login, job title</td><td>HR — automatically</td><td>One-click hire in the pipeline</td></tr>
      <tr><td>Role &amp; suites</td><td>Company admin</td><td>Admin Center → Users (a billing decision, so it’s deliberate)</td></tr>
      <tr><td>Department, manager, start date, probation end</td><td>HR / admin</td><td>Admin Center → Users / employee record</td></tr>
      <tr><td>Salary structure (basic, housing, transport, allowances)</td><td>Payroll manager</td><td>Payroll → employee salary, full history kept</td></tr>
      <tr><td>Bank account</td><td>Payroll manager only</td><td>Payroll — deliberately never self-service; numbers masked from everyone else</td></tr>
      <tr><td>Leave balances</td><td>Automatic; HR can override</td><td>Leave → Settings</td></tr>
      <tr><td>Benefits — HMO, pension/PFA, group life</td><td>HR</td><td>Benefits suite; employee sees their own PFA/RSA</td></tr>
      <tr><td>Phone, photo, date of birth, address, emergency contact</td><td>The employee</td><td>Their own Profile page</td></tr>
    </table>
    </div>
    <div class="foot"><span>Collarone HR</span><span>collarone.app</span></div>
  </section>`;
  if (pg.back) return `
  <section class="page cover">
    <div class="wm">Collar<em>One</em></div>
    <div>
      <h1>Put your people on Collarone.</h1>
      <p class="sub">HR is included from the Startup tier at ₦15,000/month (any 3 suites, ₦2,000 per staff member). Sign up at collarone.app/signup — we activate you the same day during early access.</p>
      <p class="sub" style="margin-top:16px">WhatsApp / call: 0814 812 8551 · collarone.app/contact</p>
    </div>
    <div class="meta">Collarone — built in Nigeria, for Nigerian business</div>
  </section>`;
  return suitePage(pg);
}).join('')}
</body></html>`;

const p2 = await b.newPage();
await p2.setContent(html, { waitUntil: 'load' });
await p2.pdf({ path: OUT_PDF, width: '297mm', height: '210mm', printBackground: true });
await b.close();
console.log('HR PDF written:', OUT_PDF);
