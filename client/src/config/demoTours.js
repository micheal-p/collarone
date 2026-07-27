// Guided-tour scripts for the public suite demos (/try/:suite). Written for
// someone who has NEVER seen the product and may not know the jargon — every
// step says what a thing is before what it does. Keep that discipline when
// adding suites: assume nothing.
//
// Steps: { selector?, title, body } — selector spotlights a real element
// (CoachTour). No selector = centered card.

const TABS = '.lv-tabs'; // every suite's tab strip

export const DEMO_TOURS = {
  payroll: [
    { title: 'Welcome to Payroll & Benefits', body: "Payroll is how a company pays salaries every month. This demo is filled with sample staff and sample money — nothing here is real, so click anything. We'll walk you through it." },
    { selector: '[data-tour="pr-employees"]', title: 'First, your people', body: 'Each staff member gets a salary (basic pay, housing, transport) and their bank account. You type it once — the system remembers and does all the maths from then on.' },
    { selector: '[data-tour="pr-runs"]', title: 'Pay everyone in one click', body: "A 'payroll run' means paying all your staff for one month. Click one button and it works out everyone's tax (the new 2026 government rates), pension and take-home pay — no calculator, no spreadsheet." },
    { selector: '[data-tour="pr-loans"]', title: 'Staff loans that repay themselves', body: 'If you lend a staff member money or give a salary advance, the repayment is deducted from their salary automatically every month until it finishes. You approve once; the system remembers.' },
    { selector: '[data-tour="pr-benefits"]', title: 'Benefits, per person', body: "Health insurance (HMO), pension, or any benefit you invent yourself. Each one can be switched ON or OFF per person — so an intern or contractor simply doesn't carry what full staff do." },
    { selector: '[data-tour="pr-bankwall"]', title: 'Your bank stays yours', body: "Collarone never touches your bank account. Instead, this 'Banking Wall' is a checklist for whoever talks to your bank: it lists exactly what the bank needs — new accounts, changed accounts, and each month's payment schedule ready to download." },
    { title: "That's payroll", body: 'Play with it — generate a run, look at a payslip, switch a benefit off. When you exit, we\'d love two quick answers about how it felt.' },
  ],
  tasks: [
    { title: 'Welcome to Task & Report', body: 'This is where work gets assigned and tracked, so nothing lives only in someone\'s head or a WhatsApp group. Everything here is sample data — click freely.' },
    { selector: TABS, title: 'Tasks in one place', body: 'Create a task, give it to a person, set a deadline and a priority. Everyone sees what they own; the manager sees what\'s moving and what\'s stuck.' },
    { title: 'Reports without asking', body: 'Staff attach short progress reports to their tasks — so "how far?" already has an answer before you ask. Try opening a task and adding one.' },
  ],
  crm: [
    { title: 'Welcome to the CRM', body: 'CRM simply means one place to keep your customers — who they are, what they asked for, what they owe. All sample customers here; nothing is real.' },
    { selector: TABS, title: 'Contacts and deals', body: 'Every customer becomes a contact. A "deal" is money you might make — you drag it through stages (talking → agreed → paid) so you always know what\'s coming in.' },
    { title: 'Built for WhatsApp businesses', body: 'Nigerian business happens on WhatsApp, so logging a customer chat takes one tap, and your website enquiries land here automatically. Money owed is tracked with due dates — most overdue first.' },
  ],
  inventory: [
    { title: 'Welcome to Inventory & Assets', body: 'This tracks everything your business owns: goods you sell, tools staff borrow, and company property like laptops or generators. Sample stock only — click anything.' },
    { selector: TABS, title: 'Three kinds of "stock"', body: 'Sell stock is what customers buy. Staff equipment is what workers take out and bring back — with a signed handover note each way. Company assets are one-of-a-kind items (a laptop, a generator) tracked through their whole life.' },
    { title: 'Nothing walks away', body: 'When someone takes an item out, a numbered handover note is generated in their name. When they return it, you record its condition — even snap a photo. If it never comes back, you have paper.' },
  ],
  'trade-docs': [
    { title: 'Welcome to Invoicing & Trade Docs', body: "This makes the paperwork of buying and selling: invoices, receipts, delivery notes — numbered, on your own letterhead. Sample documents only; make as many as you like." },
    { selector: TABS, title: 'Invoices customers can pay', body: 'Create an invoice and share it as a link on WhatsApp. Your customer opens it, sees exactly what they owe, and pays by transfer — or by card straight into YOUR OWN Paystack account. Collarone never holds your money.' },
    { title: 'Who owes you, at a glance', body: 'The "Money owed" view lists every unpaid invoice, most overdue first, with the total outstanding at the top. Part-payments are recorded too, so the balance is always honest.' },
  ],
  hr: [
    { title: 'Welcome to HR & Staff', body: "This is one place for everything about the people you employ — their file, their letters, who reports to whom, and hiring. All sample staff here; click anything." },
    { selector: TABS, title: 'Every person, one file', body: "Each employee has a full file — pay, leave, attendance, documents, even discipline cases — so you're never digging through folders or WhatsApp for one detail." },
    { title: 'Hiring and letters, sorted', body: "New hires and people leaving get proper step-by-step checklists, and Collarone drafts letters (promotion, confirmation) on your own letterhead. Have a play, then two quick questions on the way out." },
  ],
  leave: [
    { title: 'Welcome to Leave', body: 'Leave is time off work — annual leave, sick days and the rest. This is where staff ask for it and you approve, without the back-and-forth. Sample requests only.' },
    { selector: TABS, title: 'Request, approve, done', body: "A staff member requests days off; you see it and tap approve or decline. Everyone's remaining balance updates by itself — no more 'how many days do I have left?'" },
    { title: 'See who is off', body: 'The calendar shows who is away and when, so you never approve two key people onto the same week by accident. Try approving a request.' },
  ],
  visitors: [
    { title: 'Welcome to Visitor Management', body: 'This is your front desk, digitised — who came in, who they came to see, and when they left. All sample visitors here.' },
    { selector: TABS, title: 'Check in, host alerted', body: 'When a visitor checks in, the staff member they came to see gets an alert. Each visitor gets a code, and there is a live log of everyone currently in the building.' },
    { title: 'Nothing slips past the desk', body: 'Security can look up a code, and management sees anyone who has overstayed or been flagged. Check a visitor in and watch it flow.' },
  ],
  attendance: [
    { title: 'Welcome to Time & Attendance', body: 'This records when staff start and finish work — useful for field teams and shift work especially. Sample clock-ins only.' },
    { selector: TABS, title: 'Clock in, with proof', body: 'Staff clock in and out with their location captured, so you know it is really them at the site. The timesheet adds up their hours, including overtime, on its own.' },
    { title: 'Feeds straight into payroll', body: 'The hours here are built to become the pay in Payroll — no re-typing, no arguments about overtime. Have a look around.' },
  ],
  procurement: [
    { title: 'Welcome to Buying (Procurement)', body: 'This is how staff ask to purchase something and a manager approves it — so money is not spent without a yes. Sample requests only.' },
    { selector: TABS, title: 'Ask before you spend', body: 'A staff member raises a request — what to buy, how much, from which supplier. It waits for approval before anything is ordered, so there is always a paper trail.' },
    { title: 'Nothing untracked', body: 'Suppliers live in one list, and every request shows exactly where it is — waiting, approved, ordered or received. Try approving one.' },
  ],
  finance: [
    { title: 'Welcome to Finance', body: 'This is where the money going OUT is tracked — expenses, budgets and simple reports. Sample figures only; nothing real.' },
    { selector: TABS, title: 'Expenses and budgets', body: 'Staff log expenses (with VAT handled the Nigerian way), you set budgets, and the system shows budget-versus-actual so overspending is caught early.' },
    { title: 'The honest spending picture', body: 'It is what the business is really spending, without a spreadsheet. Add an expense and watch it land.' },
  ],
  projects: [
    { title: 'Welcome to Projects', body: 'Projects is for bigger pieces of work that run over weeks — planning them in stages and tracking them as a team. Sample projects only.' },
    { selector: TABS, title: 'Plan it on a board', body: 'A project has stages and a board you drag work across, so everyone sees what is done, what is next and what is stuck. Key dates keep it on track.' },
    { title: 'Move it along', body: 'Assign people, mark milestones, watch it progress. Open a project and drag something forward.' },
  ],
  documents: [
    { title: 'Welcome to Documents', body: 'This is a safe home for your business files — contracts, letters, policies — instead of scattered WhatsApp and email. Sample files only.' },
    { selector: TABS, title: 'Safe, and versioned', body: 'Upload a file and it is kept safely, with a history of every change so you can always go back. You control who sees what — everyone, or only chosen people.' },
    { title: 'Never lose the latest', body: "No more 'which version is final?' or 'who has that contract?'. Upload something and set who can open it." },
  ],
  automation: [
    { title: 'Welcome to Automation', body: 'Automation runs your busywork for you — the little reminders and checks you would otherwise forget. Sample rules only.' },
    { selector: TABS, title: 'Switch on a helper', body: 'These are ready-made helpers you just turn ON: chase overdue invoices, alert you when stock runs low, nudge a customer who enquired but went quiet. No setup, no code.' },
    { title: 'It works while you sleep', body: 'Turn one on and it runs quietly in the background, every day. Flip a switch and see.' },
  ],
  compliance: [
    { title: 'Welcome to the Compliance Calendar', body: 'This tracks the government deadlines every Nigerian business must meet — so you never get a penalty for a missed date. Sample deadlines only.' },
    { selector: TABS, title: 'Every deadline, tracked', body: 'PAYE, VAT, pension, NHF, CAC — each is tracked month by month, with what is due and when. Tick a deadline as done and it is on record.' },
    { title: 'Only what applies to you', body: 'Switch on the ones that apply to your business and the calendar does the remembering. Mark one done.' },
  ],
  // fallback for any other demo-enabled suite
  _generic: [
    { title: 'Welcome to the demo', body: 'Everything you see is sample data — no real company, no real people. Click anything; you cannot break it.' },
    { selector: TABS, title: 'Find your way with the tabs', body: 'Each tab is one job this suite does. Open them in order — the screens are built to explain themselves.' },
    { title: 'Make something', body: 'The best way to judge it: create a record, edit it, delete it. When you exit, two quick questions tell us how it felt.' },
  ],
};

export const tourForSuite = (key) => DEMO_TOURS[key] || DEMO_TOURS._generic;
