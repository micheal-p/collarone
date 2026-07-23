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
  // fallback for any other demo-enabled suite
  _generic: [
    { title: 'Welcome to the demo', body: 'Everything you see is sample data — no real company, no real people. Click anything; you cannot break it.' },
    { selector: TABS, title: 'Find your way with the tabs', body: 'Each tab is one job this suite does. Open them in order — the screens are built to explain themselves.' },
    { title: 'Make something', body: 'The best way to judge it: create a record, edit it, delete it. When you exit, two quick questions tell us how it felt.' },
  ],
};

export const tourForSuite = (key) => DEMO_TOURS[key] || DEMO_TOURS._generic;
