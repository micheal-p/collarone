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
    { title: 'Welcome to Payroll & Benefits', body: "Payroll is how a company pays salaries every month. This demo is filled with sample staff and sample money, nothing here is real, so click anything. We'll walk you through it." },
    { selector: '[data-tour="pr-employees"]', title: 'First, your people', body: 'Each staff member gets a salary (basic pay, housing, transport) and their bank account. You type it once, the system remembers and does all the maths from then on.' },
    { selector: '[data-tour="pr-runs"]', title: 'Pay everyone in one click', body: "A 'payroll run' means paying all your staff for one month. Click one button and it works out everyone's tax (the new 2026 government rates), pension and take-home pay, no calculator, no spreadsheet." },
    { selector: '[data-tour="pr-loans"]', title: 'Staff loans that repay themselves', body: 'If you lend a staff member money or give a salary advance, the repayment is deducted from their salary automatically every month until it finishes. You approve once; the system remembers.' },
    { selector: '[data-tour="pr-benefits"]', title: 'Benefits, per person', body: "Health insurance (HMO), pension, or any benefit you invent yourself. Each one can be switched ON or OFF per person, so an intern or contractor simply doesn't carry what full staff do." },
    { selector: '[data-tour="pr-bankwall"]', title: 'Your bank stays yours', body: "Collarone never touches your bank account. Instead, this 'Banking Wall' is a checklist for whoever talks to your bank: it lists exactly what the bank needs, new accounts, changed accounts, and each month's payment schedule ready to download." },
    { title: "That's payroll", body: 'Play with it, generate a run, look at a payslip, switch a benefit off. When you exit, we\'d love two quick answers about how it felt.' },
  ],
  tasks: [
    { title: 'Work that does not live in WhatsApp', body: 'This is where work gets assigned and tracked, so nothing lives only in someone\'s head or a WhatsApp group. Everything here is sample data, click freely.' },
    { selector: TABS, title: 'Three views, one job', body: '"Team tasks" is the work itself. "Reports" is what people wrote about their progress. "Progress" is the manager\'s summary. You will spend most of your time on the first one.' },
    { title: 'Create a task', body: 'Click "New task". You give it a title, choose who does it, set a deadline and a priority. That is the whole ceremony, because a task nobody can raise in ten seconds is a task that stays in WhatsApp.' },
    { title: 'Priority means something here', body: 'Low, Medium, High, Urgent. Urgent is not decoration, it sorts to the top of everyone\'s list. Use it sparingly or it stops working.' },
    { title: 'What the assignee sees', body: 'Staff see the tasks they own, not the whole company\'s. They change their own status as work moves: to do, in progress, waiting for check, done.' },
    { title: 'Reports answer "how far?" before you ask', body: 'Open a task and add a progress report, with a file attached if there is one. The point is that the manager stops chasing and the staff member stops being chased.' },
    { title: 'Comments for the back-and-forth', body: 'Quick questions live on the task itself, so the context does not scatter. The assignee and the person who raised it both get notified.' },
    { title: 'Progress, for whoever is accountable', body: 'The Progress tab counts what is open, overdue and finished, by status and by priority. It is the answer to "what is the team actually doing this week".' },
  ],
  crm: [
    { title: 'Every customer in one place', body: 'CRM simply means one place to keep your customers: who they are, what they asked for, what they owe. All sample customers here; nothing is real.' },
    { selector: TABS, title: 'Four things, one customer', body: 'Contacts are people. Deals are money you might make. Bookings are appointments. Money owed is money already earned but not yet paid. Same customer, four angles.' },
    { title: 'Start with a contact', body: 'Add a person or a company. Phone number matters most here, because in Nigeria that is the identity that actually gets used.' },
    { title: 'Log the WhatsApp conversation', body: 'Business happens on WhatsApp, so logging a chat takes one tap and stays on the contact. Six months later you can see what was actually agreed.' },
    { title: 'A deal is money you might make', body: 'Move it through stages as things progress: lead, qualified, proposal, won or lost. The pipeline total tells you what is realistically coming in.' },
    { title: 'Won means invoice it', body: 'When a deal is won, the money becomes real. Record what the customer owes, with a due date, so it stops living in your head.' },
    { title: 'Chase without being rude', body: 'Money owed sorts most-overdue first, and each row can start a WhatsApp message to that customer. Chasing politely and early is most of collections.' },
  ],
  inventory: [
    { title: 'What you sell, and what your staff use', body: 'What you sell and what your staff use, tracked separately because they behave differently. Sample stock throughout.' },
    { selector: TABS, title: 'Stock versus equipment', body: 'Inventory is stock that moves and gets sold. Assets are the laptops and equipment your staff sign out and bring back. Same screen, two different jobs.' },
    { title: 'Add an item', body: 'Name, unit, cost and a reorder level. The reorder level is what makes low-stock warnings mean something rather than being permanent decoration.' },
    { title: 'Stock moves, it is not edited', body: 'You record movements in and out, and the quantity is the result of those movements. That is why the count can always be explained, and why a number cannot be quietly changed.' },
    { title: 'The movement ledger', body: 'Every in, out and adjustment is recorded with who did it and when. When the shelf disagrees with the system, this is where you find out why.' },
    { title: 'Signing equipment out to staff', body: 'Hand a laptop to someone and record it, with a photo of its condition. When they return it, record that too. This is the record that settles arguments at exit time.' },
    { title: 'Low stock, before it bites', body: 'Anything at or below its reorder level is flagged, so you order before you run out rather than after a customer asks.' },
  ],
  'trade-docs': [
    { title: 'Invoices your customers can pay from a link', body: 'Invoices your customers can pay from a link, plus receipts, delivery notes and stock passes. Sample documents here; no real money moves.' },
    { selector: TABS, title: 'One engine, several documents', body: 'They share numbering, your letterhead and your customer list, because an invoice and a delivery note are the same document with a different job.' },
    { title: 'Set your letterhead first', body: 'Logo, address, contact details, signature, and your bank account. This goes on everything you send, so it is worth five minutes now.' },
    { title: 'Your bank account is the important field', body: 'It is what customers pay into. Only a manager can change it, and the account number must be ten digits, because a typo here goes out on a month of invoices before anyone notices.' },
    { title: 'Create an invoice', body: 'Pick the customer, add line items, and VAT is applied at 7.5%. Withholding tax, if your customer deducts it, is shown as its own line so the balance due is honest.' },
    { title: 'Send the payment link', body: 'The customer gets a link, sees the invoice as you designed it, and can pay by card straight into your own Paystack account. Collarone never holds your money.' },
    { title: 'Bank transfers still work', body: 'Most Nigerian customers transfer. Record the payment against the invoice and the balance updates. Part payments are normal and fully supported.' },
    { title: 'The rest of the paperwork', body: 'Receipts prove payment, delivery notes travel with goods, and stock passes get things out of your gate. All from the same customer and the same numbering.' },
  ],
  hr: [
    { title: 'Everything about each person, in one file', body: 'Everything about each person in one place: their record, their documents, their letters, their reviews. Sample staff throughout, nothing real.' },
    { selector: TABS, title: 'One person, many angles', body: 'Directory is everyone. Open a person and you get their whole file. The other tabs are the processes that happen to people: joining, performance, cases, leaving.' },
    { title: 'The employee record', body: 'Job title, department, who they report to, when they started, employment type. Set once, and payroll, leave and the org chart all read from it.' },
    { title: 'Letters on your letterhead', body: 'Employment letters, confirmations, references, warnings, generated on your own letterhead with your logo and signature. This is the feature people ask for most and dread doing by hand.' },
    { title: 'Onboarding that does not get forgotten', body: 'A checklist runs when someone joins: contract, ID, bank details, email, laptop, induction. Each item has an owner, so nothing sits waiting on "someone".' },
    { title: 'Probation and confirmation', body: 'Probation end dates are tracked and surfaced before they pass, so confirmation is a decision you make rather than a date you missed.' },
    { title: 'Disciplinary cases, done properly', body: 'Query, then the employee\'s written response, then the outcome. That sequence is not bureaucracy, it is what makes a dismissal defensible if it is ever challenged.' },
    { title: 'Exits', body: 'Last working day, handover, equipment returned, access revoked, final settlement. Finalising an exit disables the account and stops payroll paying them.' },
  ],
  leave: [
    { title: 'Time off, without the spreadsheet', body: 'Time off, requested and approved in one place, with balances that keep themselves. Sample staff and sample requests here, so click freely.' },
    { selector: TABS, title: 'Your leave and everyone\'s', body: 'Staff see their own requests and balance. Approvers get an approvals queue. Managers also get the team calendar, so two people are not off on the same critical day.' },
    { title: 'Set your leave types first', body: 'Annual, sick, maternity, compassionate, whatever your company actually offers, each with how many days a year. Do this once and the rest follows.' },
    { title: 'Working days, not calendar days', body: 'Ask for Friday to Monday and it counts two days, not four. Weekends and the public holidays you have set are skipped automatically, including the Nigerian ones.' },
    { title: 'Requesting leave', body: 'Pick the type, the dates, and say why. The balance shown updates as you choose, so nobody requests days they do not have.' },
    { title: 'Deciding, with a reason', body: 'Approvers see who is asking, for how long, and who else is already off. Approve or decline, and the reason you type is shown to the person, because a silent "no" is how resentment starts.' },
    { title: 'Balances take care of themselves', body: 'Approved days come off the balance immediately. No spreadsheet, no arguing in December about how many days are left.' },
  ],
  visitors: [
    { title: 'Who came in, and who they came to see', body: 'Who came in, who they came to see, and when they left. Sample visits here; nothing real.' },
    { selector: TABS, title: 'Reception, security and the log', body: 'Reception registers people. Security checks codes at the gate. The log is the record afterwards. Three roles, one flow.' },
    { title: 'The walk-in', body: 'Most visitors are unannounced. Name, phone, who they are here to see, and they are in. If that takes more than a few seconds, reception stops using it.' },
    { title: 'Expected visitors', body: 'Pre-register someone coming tomorrow and they arrive with a code already issued, so reception is not typing while somebody waits.' },
    { title: 'The code is the proof', body: 'Each visit gets a code the gate can check. It confirms this person is genuinely expected, without security having to phone upstairs.' },
    { title: 'Checking out matters', body: 'Signing people out is how you know who is still in the building. That is a fire-safety question before it is an admin one.' },
    { title: 'The visit log', body: 'Every visit, searchable, with times. When you need to know who was on site on a particular afternoon, it is already recorded.' },
  ],
  attendance: [
    { title: 'Who is at work, and since when', body: 'Who is at work, when they arrived, and how many hours that adds up to. Sample staff and sample days here; nothing is real.' },
    { selector: TABS, title: 'Today, timesheets and the rules', body: 'Today is the live board. Timesheet is the history that payroll cares about. Clock-in rules and Devices are the setup you do once.' },
    { title: 'Set your office and your hours', body: 'Give the office a name and a location, and say what time the working day starts. Everything else, including who counts as late, is measured against that.' },
    { title: 'Clocking in from a phone', body: 'Staff clock in from their own phone, and the location is always required, so "I was at the site" is a fact rather than a claim. The distance from your office is shown on every record.' },
    { title: 'Or from a wall device', body: 'A thumbprint or card terminal on the wall can send punches straight in. You register the device, get a key, and map each person\'s PIN to their name. There is a public guide for whoever installs it.' },
    { title: 'Forgotten clock-outs', body: 'People forget. A shift left open too long is closed automatically and flagged as provisional, never silently turned into payable hours. A manager confirms it with an edit.' },
    { title: 'Late is measured, not judged', body: 'Lateness is worked out against the rules you set, per person, per day. You can see the pattern instead of relying on who happens to be noticed walking in.' },
    { title: 'Getting it to payroll', body: 'Export the timesheet for the period and use it as your payroll input. Attendance does not pay anyone by itself, and we would rather say so than imply otherwise.' },
  ],
  procurement: [
    { title: 'Nobody spends money without a yes', body: 'Requests to buy something, approved by the right person, turned into an order. Sample requests and suppliers here.' },
    { selector: TABS, title: 'Requests and suppliers', body: 'A purchase request is someone asking to spend money. Suppliers are who you buy from. The approval in between is the whole point of the module.' },
    { title: 'Raise a request', body: 'What you want, how many, the expected cost and the VAT. The total is calculated, so an approver is agreeing to a number rather than doing mental arithmetic.' },
    { title: 'Send it for approval', body: 'The request goes to whoever approves spending. Until they decide, nothing is committed and nothing is ordered.' },
    { title: 'The approval trail', body: 'Who approved it and when is recorded on the request permanently. Months later, "who authorised this" has an answer that does not depend on anyone\'s memory.' },
    { title: 'Issue the purchase order', body: 'An approved request becomes a proper purchase order on your letterhead, with your numbering, ready to send to the supplier.' },
    { title: 'Receiving closes the loop', body: 'When the goods arrive, mark them received and the stock appears in Inventory. The request, the order and the stock are the same chain rather than three disconnected records.' },
  ],
  finance: [
    { title: 'From a receipt to a balance sheet', body: 'Expenses, budgets, bank reconciliation and a full general ledger. Sample money throughout, so nothing here affects anything real.' },
    { selector: TABS, title: 'From receipt to statement', body: 'Expenses are what you spend. Budgets are what you meant to spend. Reconciliation matches your bank statement. Ledger is the formal accounting record underneath it all.' },
    { title: 'Record an expense', body: 'Amount, category, vendor, and the VAT rate, which defaults to 7.5%. Attach the receipt while you still have it, because nobody ever finds it later.' },
    { title: 'Approvals', body: 'An expense starts as pending. A finance manager approves or rejects it, and only then does it count against a budget. That gap is the control.' },
    { title: 'Import your bank statement', body: 'Upload the CSV your bank gives you, tell us which column is the date and which is the amount, and every line comes in. Re-importing the same file will not duplicate it.' },
    { title: 'Reconcile', body: 'Match bank lines against expenses and invoice payments you already recorded. What stays unmatched is what you have not accounted for, which is the whole point.' },
    { title: 'The ledger', body: 'Every serious set of books is double-entry: money always moves from one account to another, and the two sides must agree. Post a journal entry and it is refused unless debits equal credits.' },
    { title: 'Posted means permanent', body: 'A posted entry cannot be edited or deleted, only reversed with a mirror entry. That is what makes the numbers trustworthy to an accountant or an auditor.' },
    { title: 'Your three statements', body: 'Trial balance proves the books are consistent. Profit and loss shows whether you made money. Balance sheet shows what you own and owe. All three build themselves from the entries.' },
  ],
  projects: [
    { title: 'Work that runs for weeks, not hours', body: 'Work that runs over weeks, with milestones, a task board and billable time. Sample projects here, click freely.' },
    { selector: TABS, title: 'A project is a container', body: 'It holds the people, the milestones, the tasks and the hours. Everything else in this module hangs off that.' },
    { title: 'Set the default rate first', body: 'What an hour on this project is worth. Do it now, because hours logged at a rate of zero are money you can never invoice.' },
    { title: 'Milestones are the plan', body: 'The handful of dates that actually matter to the client. Not every task, just the ones you would mention on a call.' },
    { title: 'The task board', body: 'Tasks move across columns as work progresses. Each one has an owner, so the board answers "who is on what" without a meeting.' },
    { title: 'Log billable time', body: 'Hours against the project, by person, with a note. This is the raw material of the invoice, so the note is worth writing properly.' },
    { title: 'Turn hours into an invoice', body: 'Review the unbilled hours, then raise an invoice from them in one step. The hours are marked billed, so the same work cannot be charged twice.' },
  ],
  documents: [
    { title: 'Company files, and who may see them', body: 'Company files in one place, with control over who can see what. Sample documents here; nothing real.' },
    { selector: TABS, title: 'Folders and signatures', body: 'Documents are your files. Signature requests are for the ones someone needs to sign. Most work happens in the first tab.' },
    { title: 'Upload with visibility in mind', body: 'A document is either visible to everyone in the company, or restricted to named people. Choose at upload, because the wrong default is how private files leak.' },
    { title: 'Restricted means restricted', body: 'A restricted document is only reachable by the people you grant it to, checked on the server every time it is opened, not just hidden in the interface.' },
    { title: 'Ask for a signature', body: 'Send a document for signing and track who has and has not. No printing, scanning or "please sign and send back".' },
    { title: 'Things file themselves', body: 'Letters issued from HR and invoices you send are filed here automatically, so the company record builds itself as people work.' },
    { title: 'Finding it later', body: 'Search by name, filter by folder, and every file keeps who uploaded it and when. The point of a document store is the day you need something in a hurry.' },
  ],
  automation: [
    { title: 'The things you would otherwise have to remember', body: 'A set of checks that run daily and tell you about things you would otherwise have to remember. Sample results here.' },
    { title: 'Six checks, nothing hidden', body: 'Expiring documents, overdue probations, forgotten clock-outs, overdue invoices, low stock, and pending approvals. That is the whole list, deliberately.' },
    { selector: TABS, title: 'Turn on only what you want', body: 'Every check is off until you switch it on. Software that starts nagging on day one gets switched off entirely, so the default is silence.' },
    { title: 'What an alert looks like', body: 'A banner in the workspace, and where it is genuinely someone\'s job to act, a real task assigned to the right person rather than a notification nobody owns.' },
    { title: 'It runs whether or not you are looking', body: 'The checks run on a schedule on the server, so a deadline is caught even if nobody opens Collarone that day.' },
    { title: 'Turning it off', body: 'Switch any check off at any time and it stops immediately. No settings maze, no partial states.' },
  ],
  compliance: [
    { title: 'The deadlines government sets for you', body: 'The Nigerian statutory deadlines your business has to meet, in one list, with what you have already done ticked off.' },
    { title: 'Pick what applies to you', body: 'Not every business owes every one of these. Choose the rules that apply and the month you want to start tracking from, so you do not open to a wall of red for periods that predate you.' },
    { selector: TABS, title: 'Nine obligations, two owners', body: 'PAYE, pension, NHF and NSITF come out of payroll. VAT, withholding tax, company income tax and CAC annual returns are finance and company secretarial. Both live here.' },
    { title: 'Each one tells you who and when', body: 'Which authority, what the deadline is, and what the obligation actually means, in plain words rather than statute language.' },
    { title: 'Mark it remitted', body: 'When you have paid, tick it and record the reference. The reference is the part that matters, because it is what you produce if you are ever asked to prove it.' },
    { title: 'What this is and is not', body: 'This is a calendar and a checklist to help you remember. It is not tax advice, and it does not file anything on your behalf. Your accountant still does their job.' },
  ],
  // fallback for any other demo-enabled suite
  _generic: [
    { title: 'Welcome to the demo', body: 'Everything you see is sample data, no real company, no real people. Click anything; you cannot break it.' },
    { selector: TABS, title: 'Find your way with the tabs', body: 'Each tab is one job this suite does. Open them in order, the screens are built to explain themselves.' },
    { title: 'Make something', body: 'The best way to judge it: create a record, edit it, delete it. When you exit, two quick questions tell us how it felt.' },
  ],
};

export const tourForSuite = (key) => DEMO_TOURS[key] || DEMO_TOURS._generic;
