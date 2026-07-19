// ============================================================================
// The Collarone assistant's brain — no external AI, no API keys.
// A curated intent base grounded in the real product: every answer is written
// from what actually exists (suites, exact pricing, flows), matched by a
// weighted keyword/phrase scorer. It can compute real price quotes from
// numbers in the question. Below the confidence threshold it hands over to a
// human — never guesses.
// ============================================================================

import { PLANS, PER_STAFF_FEE, naira } from '../lib/pricing.js';

// derived, never restated — the chat quotes whatever the platform charges
const TIERS = PLANS.map((t) => ({ key: t.key, name: t.name, base: t.baseFee, included: t.includedSuites, extra: t.extraSuiteFee }));
const PER_STAFF = PER_STAFF_FEE;
const N = naira;

// "how much for 12 staff on standard?" → a real quote, computed.
function priceQuote(text) {
  const staffMatch = text.match(/(\d{1,4})\s*(staff|employees?|people|workers|team members?)/i);
  const tier = TIERS.find((t) => text.toLowerCase().includes(t.key)) || null;
  if (!staffMatch && !tier) return null;
  const staff = staffMatch ? Math.min(5000, Number(staffMatch[1])) : null;
  const lines = (tier ? [tier] : TIERS).map((t) => {
    const monthly = t.base + (staff || 0) * PER_STAFF;
    return staff
      ? `${t.name}: ${N(t.base)} base + ${staff} staff × ${N(PER_STAFF)} = ${N(monthly)}/month (${t.included} suites included, extras ${N(t.extra)} each)`
      : `${t.name}: ${N(t.base)}/month with ${t.included} suites included, extra suites ${N(t.extra)} each`;
  });
  const staffNote = staff ? '' : `\nEvery tier adds ${N(PER_STAFF)} per staff member per month.`;
  return `Here's the real arithmetic:\n${lines.join('\n')}${staffNote}\nPay yearly and 15% comes off, and your rate locks in at sign-up. The homepage pricing section has a calculator you can play with.`;
}

// Each intent: match phrases (worth 3) + keywords (worth 1), a written
// answer, follow-up chips, and optionally human=true to open the hand-off.
const INTENTS = [
  {
    id: 'greeting',
    // single-word greetings are phrases (weight 3): a bare "hi" must clear
    // the confidence threshold — matching is word-boundary-safe, see norm()
    phrases: ['good morning', 'good afternoon', 'good evening', 'how far', 'hi', 'hello', 'hey', 'hiya', 'greetings'],
    keys: [],
    answer: 'Welcome! I can walk you through what Collarone does, what it costs, and how to get your company set up. What would you like to know?',
    chips: ['What does Collarone cost?', 'What suites are included?', 'How do I get started?'],
  },
  {
    id: 'what-is',
    phrases: ['what is collarone', 'what does collarone do', 'tell me about collarone', 'what is this'],
    keys: ['about', 'explain', 'overview'],
    answer: 'Collarone is the business platform for Nigerian companies — HR, payroll, CRM, finance and more, 16 live suites behind one login, priced and billed in naira. Your company gets its own isolated workspace, you switch on only the suites you need, and your data stays completely separate from every other company\'s.',
    chips: ['What suites are included?', 'What does it cost?', 'Is my data safe?'],
  },
  {
    id: 'pricing',
    phrases: ['how much', 'what does it cost', 'what does collarone cost', 'pricing', 'price list'],
    keys: ['cost', 'price', 'pay', 'fee', 'cheap', 'expensive', 'afford', 'monthly', 'subscription'],
    answer: (text) => priceQuote(text) || `Every tier is à la carte — you pick the suites. ${TIERS.map((t) => `${t.name} is ${N(t.base)}/month with any ${t.included} suites included`).join(', ')}. Extra suites cost ${TIERS.map((t) => N(t.extra)).join('/')} each by tier, plus ${N(PER_STAFF)} per staff member on all tiers. Yearly billing saves 15%, no forex markup, and your rate locks in at sign-up. Tell me your team size and I'll do the exact arithmetic.`,
    chips: ['Price for 10 staff on Standard', 'What suites are included?', 'Is there a trial?'],
  },
  {
    id: 'suites',
    phrases: ['what suites', 'what is included', "what's included", 'list of suites', 'what modules', 'features'],
    keys: ['suites', 'modules', 'apps', 'included', 'tools'],
    answer: 'Sixteen live suites. Core: HR & Staff, Leave, Task & Report, Visitor Management, Payroll, CRM. Extended: Time & Attendance, Benefits, IT Assets, Procurement, Inventory, Finance, Projects, Documents, Trade Documents, Automation. Every tier picks any of them à la carte — a Startup customer gets the same full suites as Enterprise, just fewer included.',
    chips: ['Tell me about HR', 'Does it do payroll?', 'What does it cost?'],
  },
  {
    id: 'hr',
    phrases: ['employee 360', 'tell me about hr', 'hr suite', 'human resources'],
    keys: ['hr', 'staff', 'directory', 'onboarding', 'recruiting', 'probation', 'disciplinary'],
    answer: 'HR is the flagship. Every employee has a 360 page — pay, leave, attendance, assets, documents, reviews and cases in one view. Recruiting runs a kanban pipeline with a public careers page, interview scorecards, candidate emails, offer links candidates accept online, and one-click hire that creates their staff login. Probation ends trigger a proper confirm/extend/exit decision, discipline follows the query → response → outcome sequence, and there\'s an analytics tab with headcount, attrition and statutory compliance.',
    chips: ['Can it write company letters?', 'Does it do payroll?', 'How do I get started?'],
  },
  {
    id: 'letters',
    phrases: ['company letters', 'write letters', 'letter engine', 'confirmation letter', 'offer letter', 'query letter'],
    keys: ['letters', 'letterhead', 'signature', 'promotion', 'verification'],
    answer: 'Yes — the Letters engine drafts confirmation, promotion, introduction, verification, query and warning letters, manually or with Collarone AI. They render live on your own letterhead (8 designs, or upload yours), carry your logo and authorized signature, get auto-numbered references, and file themselves into your Documents suite. Nigerian SMBs pay consultants for these — here they take two minutes.',
    chips: ['What does it cost?', 'Tell me about HR', 'How do I get started?'],
  },
  {
    id: 'payroll',
    phrases: ['does it do payroll', 'tell me about payroll', 'salary payment'],
    keys: ['payroll', 'paye', 'pension', 'nhf', 'nsitf', 'payslip', 'salary', 'salaries', 'tax'],
    answer: 'Payroll runs real Nigerian statutory math — PAYE, Pension, NHF, NSITF — with payslips and a Banking Wall for whoever liaises with your bank. Important honesty: Collarone never touches your bank account. It prepares the disbursement instruction; your bank executes it. Payroll is available to Nigerian-registered companies.',
    chips: ['What does it cost?', 'What suites are included?'],
  },
  {
    id: 'crm',
    phrases: ['tell me about crm', 'customer management', 'deals pipeline'],
    keys: ['crm', 'customers', 'leads', 'deals', 'pipeline', 'contacts'],
    answer: 'The CRM is WhatsApp-first, because that\'s where Nigerian business actually happens — contacts, companies, an activity log, a deals pipeline valued in naira, a bookings day-sheet for appointments (with one-tap WhatsApp confirmations), a Money Owed tracker that ages what customers owe you, and a Messages inbox fed straight from your website\'s forms so no enquiry gets ignored.',
    chips: ['Does my website connect to it?', 'What does it cost?'],
  },
  {
    id: 'website',
    phrases: ['website builder', 'build a website', 'do i get a website', 'already have a website', 'online store'],
    keys: ['website', 'site', 'store', 'ecommerce', 'themes', 'domain'],
    answer: 'Every tier includes the website builder — 10 themes across online store, landing pages and company profiles, all edited in place, and every new site starts fully written with sample content you just swap out. Stores get a real cart and checkout: bank transfer or pay on delivery by default, and card/bank/USSD payments through your OWN Paystack account at no extra Collarone charge (ask the team to switch it on — money settles straight to your bank). Already have a website? Just link it at sign-up.',
    chips: ['What does it cost?', 'How do I get started?'],
  },
  {
    id: 'jobs',
    phrases: ['careers page', 'job board', 'post jobs', 'hire people'],
    keys: ['jobs', 'careers', 'hiring', 'recruit', 'candidates', 'vacancy', 'vacancies'],
    answer: 'Every company gets a public careers page (collarone.app/careers/your-handle) where candidates apply with no account, and all open roles also appear on the platform-wide board at collarone.app/jobs. Inside, applications land in a kanban pipeline with ratings and interview scheduling.',
    chips: ['Tell me about HR', 'How do I get started?'],
  },
  {
    id: 'security',
    phrases: ['is my data safe', 'data security', 'who can see my data', 'is it secure'],
    keys: ['secure', 'security', 'safe', 'privacy', 'isolated', 'nda', 'protect'],
    answer: 'Every company gets one isolated workspace, enforced at the database itself (row-level security) — not just hidden in the interface — and we\'ve verified that isolation directly. Every screen also checks the viewer\'s role before showing anything. Payroll is instruction-only: no customer funds are ever held or moved by Collarone.',
    chips: ['What does it cost?', 'How do I get started?'],
  },
  {
    id: 'start',
    phrases: ['how do i get started', 'how to start', 'sign up', 'create account', 'register'],
    keys: ['start', 'signup', 'begin', 'join', 'onboard'],
    answer: 'Head to collarone.app/signup — pick a plan, name your company and choose a handle (your workspace lives at your-handle.collarone.app), tell us if you already have a website, brand your space, and create your admin account. During early access we confirm payment personally: WhatsApp your reference to 0814 812 8551 and your space is activated the same day.',
    chips: ['What does it cost?', 'Is there a trial?'],
  },
  {
    id: 'trial',
    phrases: ['is there a trial', 'free trial', 'promo code', 'discount code', 'try it free'],
    keys: ['trial', 'free', 'promo', 'demo', 'test'],
    answer: 'Promo codes exist for trials and discounts — some give free time-boxed access, some cut the activation fee. They\'re shared personally during early access, so the honest route is to ask the team on WhatsApp. Want me to connect you?',
    chips: ['Talk to a human', 'What does it cost?'],
  },
  {
    id: 'rate-lock',
    phrases: ['rate lock', 'price increase', 'will the price change'],
    keys: ['lock', 'increase', 'change', 'forever'],
    answer: 'Your per-seat and tier rates lock in at sign-up — later published price changes don\'t move your bill. And everything is priced in naira with no forex markup, so your cost doesn\'t swing with the exchange rate.',
    chips: ['What does it cost?', 'How do I get started?'],
  },
  {
    id: 'leave',
    phrases: ['leave management', 'annual leave', 'leave tracking'],
    keys: ['leave', 'holidays', 'vacation', 'absence'],
    answer: 'Leave runs on real balances — leave types with entitlements, approvals with reasons employees actually see, a team calendar, working-day math that skips weekends and holidays (including your company\'s own holidays), and per-employee balance adjustments when HR needs discretion.',
    chips: ['What suites are included?', 'What does it cost?'],
  },
  {
    id: 'benefits',
    phrases: ['group life', 'hmo', 'pension provider'],
    keys: ['benefits', 'insurance', 'rsa', 'pfa'],
    answer: 'Benefits tracks HMO, group life and pension enrollments — including each employee\'s PFA and RSA PIN, visible to the employee themselves. And because group life cover is a legal requirement at 5+ staff under the Pension Reform Act, the HR analytics tab flags you the moment you cross that line without cover on record.',
    chips: ['Tell me about HR', 'What does it cost?'],
  },
  {
    id: 'attendance',
    phrases: ['clock in', 'time tracking', 'attendance'],
    keys: ['attendance', 'timesheet', 'overtime', 'shift'],
    answer: 'Time & Attendance does geo-tagged clock-in/out, weekly summaries, a manager timesheet with correction flows (forgotten clock-outs get fixed, not stuck), clock-in location review, and CSV export that feeds payroll.',
    chips: ['Does it do payroll?', 'What does it cost?'],
  },
  {
    id: 'who',
    phrases: ['who built', 'who is behind', 'who owns', 'founder'],
    keys: ['founder', 'team', 'company', 'aniebiet'],
    answer: 'Collarone is founded by Aniebiet Pius and built in Nigeria, for Nigerian business — it started as an internal tool for one real company, proved itself, and became the platform. It\'s designed, built and supported on Nigerian business hours.',
    chips: ['What is Collarone?', 'How do I get started?'],
  },
  {
    id: 'mobile',
    phrases: ['mobile app', 'use on phone', 'android', 'iphone'],
    keys: ['mobile', 'phone', 'app'],
    answer: 'Collarone works fully in the browser on any phone — every screen is built mobile-responsive, so your team can clock in, approve leave and check the dashboard from a phone without installing anything.',
    chips: ['How do I get started?', 'What does it cost?'],
  },
  {
    id: 'thanks',
    phrases: ['thank you', 'thanks', 'appreciated'],
    keys: ['thanks', 'cheers', 'ose', 'nagode'],
    answer: 'Any time! Anything else you\'d like to know — or should I connect you with the team to get set up?',
    chips: ['How do I get started?', 'Talk to a human'],
  },
  // Things that must go to a person — never guessed at.
  {
    id: 'human-topics',
    phrases: ['custom price', 'special discount', 'partnership', 'invest', 'refund', 'my account', 'cannot log in', "can't log in", 'forgot password', 'complain', 'complaint', 'not working'],
    keys: ['negotiate', 'reseller', 'agent', 'broken', 'bug', 'error', 'problem'],
    answer: 'That one deserves a real person, not a bot — the team handles account issues, custom arrangements and anything sensitive directly, and they reply fast:',
    human: true,
    chips: [],
  },
];

const tokenize = (t) => t.toLowerCase().replace(/[^a-z0-9₦\s]/g, ' ').split(/\s+/).filter(Boolean);
// word-boundary-safe phrase matching: "hi" must not match inside "this"
const norm = (t) => ` ${tokenize(t).join(' ')} `;

export function answerQuestion(text) {
  const padded = norm(text);
  const tokens = new Set(tokenize(text));

  let best = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    let score = 0;
    for (const p of intent.phrases || []) if (padded.includes(norm(p))) score += 3;
    for (const k of intent.keys || []) if (tokens.has(k)) score += 1;
    if (score > bestScore) { best = intent; bestScore = score; }
  }

  // A number + staff/tier means they want arithmetic even without "price".
  const quote = priceQuote(text);
  if (quote && (!best || best.id === 'pricing' || bestScore < 3)) {
    return { reply: quote, human: false, chips: ['What suites are included?', 'Is there a trial?', 'How do I get started?'] };
  }

  // Confidence: a phrase hit (3) or two keywords always answer. A single
  // keyword answers only in a short, focused question ("does it support
  // payroll?") — in a long message one weak keyword still escalates.
  const confident = best && (bestScore >= 2 || (bestScore === 1 && tokens.size <= 6));
  if (!confident) {
    return {
      reply: 'I don\'t want to guess on that one — but a real person will know, and they reply fast:',
      human: true,
      chips: ['What does Collarone cost?', 'What suites are included?', 'How do I get started?'],
    };
  }

  const reply = typeof best.answer === 'function' ? best.answer(text) : best.answer;
  return { reply, human: Boolean(best.human), chips: best.chips || [] };
}
