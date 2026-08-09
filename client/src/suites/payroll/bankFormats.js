// Salary disbursement files, in the shape each bank's portal expects.
//
// A bank manager never logs into Collarone. They receive a file, and they
// upload it to their bank's own bulk-payment portal. Until now there was one
// neutral layout, so anyone whose bank wanted different columns had to re-jig
// the spreadsheet by hand every month — on the one file where a slip means
// someone is not paid.
//
// ---------------------------------------------------------------------------
// HONESTY ABOUT THE PRESETS
// ---------------------------------------------------------------------------
// The named layouts below are reconstructions. Bank portals are behind
// corporate logins, their templates are revised without notice, and a column
// order that is wrong produces a REJECTED SALARY FILE — the worst failure this
// product has. So no preset is trusted on our say-so:
//
//   - every named preset starts `verified: false`;
//   - the export dialog will not let a false one be downloaded until someone
//     has compared the on-screen preview against the template their bank
//     actually gave them and confirmed it;
//   - that confirmation is stored per organisation, so it is asked once;
//   - and any column order can be edited and saved without a code change,
//     which is the real point of making this data instead of code.
//
// `generic` is `verified: true` because it is our own neutral layout, making
// no claim about any particular bank.
//
// ---------------------------------------------------------------------------
// THE EXCEL TRAP
// ---------------------------------------------------------------------------
// Nigerian account numbers are exactly ten digits and a great many begin with
// zero. Open one of these files in Excel to "just check it" and Excel reads
// 0123456789 as a number, drops the leading zero, and saves back a nine-digit
// account the portal rejects — or worse, one that belongs to somebody else.
// The file we produce is correct for the portal, so the guidance is not to
// open it first, which the export dialog says plainly.

// ---- value formatting -------------------------------------------------------

// Naira with two decimals: 450000.00
const naira2 = (r) => r.amount.toFixed(2);
// Whole naira, no separators: 450000. Some portals reject a decimal point.
const nairaPlain = (r) => String(Math.round(r.amount));
// Integer kobo: 45000000. Avoids float drift on the value that matters most.
const kobo = (r) => String(Math.round(r.amount * 100));

// Portals commonly cap the narration and reject anything outside a plain
// alphanumeric set, so this is clipped and stripped rather than passed
// through and rejected at upload.
const narration = (limit) => (r) => r.narration.replace(/[^\w\s/.-]/g, '').slice(0, limit).trim();

const sn = (r) => String(r.index);

// ---- the registry -----------------------------------------------------------
// Each format is data: which columns, in what order, under what headers, and
// how the amount is written. Adding a bank is adding an entry, not writing code.

export const FORMATS = [
  {
    id: 'generic',
    label: 'Generic (NIBSS-style)',
    hint: 'Our neutral layout: every field a portal might ask for, clearly named. A good starting point if you are not sure what your bank wants.',
    verified: true,
    ext: 'csv',
    delimiter: ',',
    headerRow: true,
    columns: [
      { header: 'Account Name', value: (r) => r.accountName },
      { header: 'Account Number', value: (r) => r.accountNumber },
      { header: 'Bank Name', value: (r) => r.bankName },
      { header: 'Bank Code', value: (r) => r.bankCode },
      { header: 'Amount', value: naira2 },
      { header: 'Narration', value: narration(100) },
    ],
  },
  {
    id: 'gtb_gaps',
    label: 'GTBank (GAPS)',
    hint: 'GTBank’s Automated Payment System leads with the amount and wants the payment date on every row.',
    verified: false,
    ext: 'csv',
    delimiter: ',',
    headerRow: true,
    columns: [
      { header: 'Amount', value: naira2 },
      { header: 'Payment Date', value: (r) => r.valueDate },
      { header: 'Beneficiary Account Number', value: (r) => r.accountNumber },
      { header: 'Beneficiary Bank Code', value: (r) => r.bankCode },
      { header: 'Beneficiary Name', value: (r) => r.accountName },
      { header: 'Narration', value: narration(50) },
      { header: 'Remark', value: () => '' },
    ],
  },
  {
    id: 'zenith_bulk',
    label: 'Zenith (bulk payment)',
    hint: 'Numbered rows, account before name, and both the bank code and the bank name.',
    verified: false,
    ext: 'csv',
    delimiter: ',',
    headerRow: true,
    columns: [
      { header: 'S/N', value: sn },
      { header: 'Beneficiary Account Number', value: (r) => r.accountNumber },
      { header: 'Beneficiary Name', value: (r) => r.accountName },
      { header: 'Bank Code', value: (r) => r.bankCode },
      { header: 'Bank Name', value: (r) => r.bankName },
      { header: 'Amount', value: naira2 },
      { header: 'Narration', value: narration(60) },
    ],
  },
  {
    id: 'access_bulk',
    label: 'Access Bank (bulk transfer)',
    hint: 'A short layout: account, name, code, amount, narration.',
    verified: false,
    ext: 'csv',
    delimiter: ',',
    headerRow: true,
    columns: [
      { header: 'Beneficiary Account Number', value: (r) => r.accountNumber },
      { header: 'Beneficiary Name', value: (r) => r.accountName },
      { header: 'Bank Code', value: (r) => r.bankCode },
      { header: 'Amount', value: naira2 },
      { header: 'Narration', value: narration(50) },
    ],
  },
  {
    id: 'firstbank_bulk',
    label: 'First Bank (bulk payment)',
    hint: 'Account first, then the name as it appears on the account.',
    verified: false,
    ext: 'csv',
    delimiter: ',',
    headerRow: true,
    columns: [
      { header: 'Account Number', value: (r) => r.accountNumber },
      { header: 'Account Name', value: (r) => r.accountName },
      { header: 'Bank Code', value: (r) => r.bankCode },
      { header: 'Amount', value: nairaPlain },
      { header: 'Narration', value: narration(50) },
    ],
  },
  {
    id: 'uba_bulk',
    label: 'UBA (bulk payment)',
    hint: 'Numbered rows with the bank written out by name.',
    verified: false,
    ext: 'csv',
    delimiter: ',',
    headerRow: true,
    columns: [
      { header: 'S/N', value: sn },
      { header: 'Account Number', value: (r) => r.accountNumber },
      { header: 'Account Name', value: (r) => r.accountName },
      { header: 'Bank', value: (r) => r.bankName },
      { header: 'Amount', value: naira2 },
      { header: 'Narration', value: narration(50) },
    ],
  },
  {
    id: 'kobo_txt',
    label: 'Kobo amounts, tab-separated',
    hint: 'For portals that want a .txt upload with amounts in kobo and no header row. Nothing to round, nothing to misread.',
    verified: false,
    ext: 'txt',
    delimiter: '\t',
    headerRow: false,
    columns: [
      { header: 'Account Number', value: (r) => r.accountNumber },
      { header: 'Bank Code', value: (r) => r.bankCode },
      { header: 'Amount (kobo)', value: kobo },
      { header: 'Account Name', value: (r) => r.accountName },
      { header: 'Narration', value: narration(40) },
    ],
  },
];

export const formatById = (id) => FORMATS.find((f) => f.id === id) || FORMATS[0];

// ---- turning payroll lines into rows ----------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// One neutral row shape, built once, so a format only decides presentation.
// bank_snapshot is used in preference to the employee's current details on
// purpose: it is what their account WAS when the run was approved, and a run
// must always re-export identically.
export function toRows(run, lines, { valueDate = '' } = {}) {
  const period = `${MONTHS[(run.period_month || 1) - 1]} ${run.period_year}`;
  return lines.map((l, i) => ({
    index: i + 1,
    // Falls back to the staff record's name when the bank account has none,
    // because a blank name is rejected outright by most portals. But the two
    // are often NOT the same string — "Chinedu Obi" in HR against
    // "OBI, CHINEDU J." at the bank — so the fallback is recorded and the
    // validator warns rather than letting it look like verified bank data.
    accountName: l.bank_snapshot?.accountName || l.employee?.name || '',
    nameFromBank: Boolean(l.bank_snapshot?.accountName),
    accountNumber: String(l.bank_snapshot?.accountNumber || '').trim(),
    bankName: l.bank_snapshot?.bankName || '',
    bankCode: String(l.bank_snapshot?.bankCode || '').trim(),
    amount: Number(l.net) || 0,
    narration: `Salary ${period}`,
    employeeName: l.employee?.name || l.bank_snapshot?.accountName || '',
    valueDate,
  }));
}

// ---- pre-flight checks ------------------------------------------------------
// A bulk-payment portal rejects the WHOLE file for one bad row, and it does so
// after upload with an error that names a line number and nothing else. Every
// check below is something we can know for certain before the file leaves the
// building, which is worth far more than guessing at column orders.

export function validateRows(rows, format) {
  const problems = [];
  const add = (row, severity, message) => problems.push({ row: row.index, who: row.employeeName, severity, message });

  const needsCode = format.columns.some((c) => /code/i.test(c.header));
  const seen = new Map();

  for (const r of rows) {
    if (!r.accountNumber) {
      add(r, 'blocking', 'No bank account on file. The bank cannot pay this person.');
    } else if (!/^\d{10}$/.test(r.accountNumber)) {
      // Ten digits is the NUBAN standard; nine almost always means the file
      // has been through Excel, which eats the leading zero.
      add(r, 'blocking', `Account number is ${r.accountNumber.length} digits, not 10${r.accountNumber.length === 9 ? ' — a leading zero has probably been lost in a spreadsheet' : ''}.`);
    }
    if (!r.accountName.trim()) {
      add(r, 'blocking', 'No account name. Most portals match the name against the account and reject a blank.');
    } else if (!r.nameFromBank) {
      add(r, 'warning', 'Account name came from the staff record, not from their bank details. If the bank has it differently, the portal may reject the row.');
    }
    if (needsCode && !r.bankCode) {
      add(r, 'blocking', `This layout has a bank code column and ${r.bankName || 'this bank'} has no code saved.`);
    }
    if (!(r.amount > 0)) {
      add(r, 'blocking', `Net pay is ${r.amount}. A bank will reject a zero or negative amount.`);
    }
    // Two people, one account. Legitimate occasionally (a joint account), and
    // a payroll fraud pattern the rest of the time. Worth a look either way.
    if (r.accountNumber) {
      const key = `${r.bankCode || r.bankName}:${r.accountNumber}`;
      if (seen.has(key)) add(r, 'warning', `Same account as ${seen.get(key)}. Check this is deliberate.`);
      else seen.set(key, r.employeeName);
    }
  }
  return problems;
}

// ---- rendering --------------------------------------------------------------

// Quote only when the delimiter, a quote or a newline would otherwise break
// the row. Portals differ on whether they tolerate quotes everywhere, so the
// safest file is the one with the fewest.
const cell = (v, delimiter) => {
  const s = v === null || v === undefined ? '' : String(v);
  return s.includes(delimiter) || s.includes('"') || /[\n\r]/.test(s)
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

export function renderFile(rows, format) {
  const lines = [];
  if (format.headerRow) lines.push(format.columns.map((c) => cell(c.header, format.delimiter)).join(format.delimiter));
  for (const r of rows) {
    lines.push(format.columns.map((c) => cell(c.value(r), format.delimiter)).join(format.delimiter));
  }
  // CRLF: these files are read by Windows banking software far more often
  // than by anything else, and a lone \n is a known source of "invalid file".
  return lines.join('\r\n');
}

export const fileName = (run, format) =>
  `payroll-${run.period_year}-${String(run.period_month).padStart(2, '0')}-${format.id}.${format.ext}`;

// No BOM, deliberately. A BOM helps Excel read UTF-8, but this file is for a
// bank portal, and several treat the BOM bytes as part of the first field.
export function downloadFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const totalOf = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
