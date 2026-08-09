// Salary files are the one export where a silent change is unacceptable.
//
// A bulk-payment portal rejects the whole file for one malformed row, and it
// does so after upload, with an error naming a line number and nothing else.
// The person finding out is a bank liaison on payday. So every format's exact
// bytes are pinned here: a column reordered, a header reworded, an amount that
// starts carrying a thousands separator, all of it fails loudly at build time
// instead of quietly at the bank.
//
// The pre-flight validator is tested harder than the layouts, because it is
// the half we can be certain about. Ten-digit NUBANs, missing bank codes,
// zero amounts and two staff sharing one account are all knowable before the
// file leaves the building.
//
// Run:  node test/bank_export_formats.mjs
import { FORMATS, formatById, toRows, validateRows, renderFile, fileName, totalOf }
  from '../client/src/suites/payroll/bankFormats.js';

// A real field splitter. The first attempt used a regex that mis-counted a
// trailing empty field, which reported a correct 7-column GAPS row as 6 — the
// test was wrong about the code, which is its own kind of bug.
function splitFields(line, delimiter) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delimiter) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

let failures = 0;
const fail = (what, expected, got) => {
  failures++;
  console.log(`✗ ${what}\n    expected: ${JSON.stringify(expected)}\n    got:      ${JSON.stringify(got)}`);
};
const eq = (what, got, expected) => {
  if (got !== expected) fail(what, expected, got);
};

// --- fixtures ----------------------------------------------------------------
const run = { period_month: 3, period_year: 2026 };
const lines = [
  { net: 450000, employee: { name: 'Adaeze Nwosu' },
    bank_snapshot: { accountName: 'ADAEZE NWOSU', accountNumber: '0123456789', bankName: 'GTBank', bankCode: '058' } },
  // A comma in the account name, which must not shift every later column.
  { net: 275500.5, employee: { name: 'Chinedu Obi' },
    bank_snapshot: { accountName: 'OBI, CHINEDU J.', accountNumber: '2233445566', bankName: 'Zenith Bank', bankCode: '057' } },
];
const rows = toRows(run, lines, { valueDate: '2026-03-25' });

// --- the neutral layout ------------------------------------------------------
eq('generic: header row',
  renderFile(rows, formatById('generic')).split('\r\n')[0],
  'Account Name,Account Number,Bank Name,Bank Code,Amount,Narration');
eq('generic: a comma in a name is quoted, not spilled',
  renderFile(rows, formatById('generic')).split('\r\n')[2],
  '"OBI, CHINEDU J.",2233445566,Zenith Bank,057,275500.50,Salary March 2026');

// --- every named layout is pinned exactly ------------------------------------
const GOLDEN = {
  gtb_gaps: [
    'Amount,Payment Date,Beneficiary Account Number,Beneficiary Bank Code,Beneficiary Name,Narration,Remark',
    '450000.00,2026-03-25,0123456789,058,ADAEZE NWOSU,Salary March 2026,',
    '275500.50,2026-03-25,2233445566,057,"OBI, CHINEDU J.",Salary March 2026,',
  ],
  zenith_bulk: [
    'S/N,Beneficiary Account Number,Beneficiary Name,Bank Code,Bank Name,Amount,Narration',
    '1,0123456789,ADAEZE NWOSU,058,GTBank,450000.00,Salary March 2026',
    '2,2233445566,"OBI, CHINEDU J.",057,Zenith Bank,275500.50,Salary March 2026',
  ],
  access_bulk: [
    'Beneficiary Account Number,Beneficiary Name,Bank Code,Amount,Narration',
    '0123456789,ADAEZE NWOSU,058,450000.00,Salary March 2026',
    '2233445566,"OBI, CHINEDU J.",057,275500.50,Salary March 2026',
  ],
  firstbank_bulk: [
    'Account Number,Account Name,Bank Code,Amount,Narration',
    '0123456789,ADAEZE NWOSU,058,450000,Salary March 2026',
    '2233445566,"OBI, CHINEDU J.",057,275501,Salary March 2026',
  ],
  uba_bulk: [
    'S/N,Account Number,Account Name,Bank,Amount,Narration',
    '1,0123456789,ADAEZE NWOSU,GTBank,450000.00,Salary March 2026',
    '2,2233445566,"OBI, CHINEDU J.",Zenith Bank,275500.50,Salary March 2026',
  ],
  kobo_txt: [
    '0123456789\t058\t45000000\tADAEZE NWOSU\tSalary March 2026',
    '2233445566\t057\t27550050\tOBI, CHINEDU J.\tSalary March 2026',
  ],
};
for (const [id, expected] of Object.entries(GOLDEN)) {
  eq(`${id}: exact bytes`, renderFile(rows, formatById(id)), expected.join('\r\n'));
}

// --- properties that must hold for EVERY format, including ones added later --
for (const f of FORMATS) {
  const out = renderFile(rows, f);
  const body = out.split('\r\n').slice(f.headerRow ? 1 : 0);

  eq(`${f.id}: one line per employee`, body.length, rows.length);

  // Every row has the same number of fields as there are columns. A row that
  // silently gains a field from an unescaped delimiter is the exact failure
  // that pays the wrong person.
  for (const [i, line] of body.entries()) {
    const fields = splitFields(line, f.delimiter);
    if (fields.length !== f.columns.length) {
      fail(`${f.id}: row ${i + 1} has ${fields.length} fields, not ${f.columns.length}`, f.columns.length, fields.length);
    }
  }

  // No thousands separators anywhere in an amount column — a portal reading
  // "450,000.00" as two fields is a classic rejection.
  const amountCol = f.columns.findIndex((c) => /amount/i.test(c.header));
  if (amountCol !== -1) {
    for (const r of rows) {
      const v = f.columns[amountCol].value(r);
      if (/,/.test(v)) fail(`${f.id}: amount "${v}" contains a thousands separator`, 'no comma', v);
      if (!/^\d+(\.\d{2})?$/.test(v)) fail(`${f.id}: amount "${v}" is not a plain number`, 'digits only', v);
    }
  }

  // CRLF, because these files are read by Windows banking software.
  if (!out.includes('\r\n') && rows.length > 1) fail(`${f.id}: not CRLF terminated`, 'CRLF', 'LF');

  // A filename that says which layout it is, so a liaison holding three
  // downloads knows which one to upload.
  const name = fileName(run, f);
  eq(`${f.id}: filename`, name, `payroll-2026-03-${f.id}.${f.ext}`);
}

// --- the honesty rule: named presets are not trusted until checked -----------
for (const f of FORMATS) {
  if (f.id === 'generic') {
    eq('generic is the one verified layout', f.verified, true);
  } else if (f.verified !== false) {
    fail(`${f.id}: a bank-specific layout must start verified:false`, false, f.verified);
  }
}

// --- rounding, on the number that matters ------------------------------------
const oddRows = toRows(run, [{ net: 0.005, bank_snapshot: { accountName: 'A', accountNumber: '0000000001', bankCode: '058' } }]);
eq('kobo amounts are integers, never 0.5 of a kobo',
  formatById('kobo_txt').columns.find((c) => /amount/i.test(c.header)).value(oddRows[0]), '1');
eq('total is summed from the rows, not re-derived',
  totalOf(rows).toFixed(2), '725500.50');

// --- pre-flight validation ---------------------------------------------------
const bad = toRows(run, [
  { net: 100, employee: { name: 'Nine Digits' }, bank_snapshot: { accountName: 'NINE', accountNumber: '123456789', bankCode: '058' } },
  { net: 100, employee: { name: 'No Account' }, bank_snapshot: { accountName: 'NONE', accountNumber: '', bankCode: '058' } },
  { net: 0, employee: { name: 'Zero Pay' }, bank_snapshot: { accountName: 'ZERO', accountNumber: '0123456789', bankCode: '058' } },
  { net: 100, employee: { name: 'No Code' }, bank_snapshot: { accountName: 'NOCODE', accountNumber: '0123456780', bankName: 'Sterling', bankCode: '' } },
  { net: 100, employee: {}, bank_snapshot: { accountName: '', accountNumber: '0123456781', bankCode: '058' } },
  { net: 100, employee: { name: 'Name From HR' }, bank_snapshot: { accountName: '', accountNumber: '0123456782', bankCode: '058' } },
  { net: 100, employee: { name: 'Duplicate A' }, bank_snapshot: { accountName: 'DUPA', accountNumber: '9999999999', bankCode: '058' } },
  { net: 100, employee: { name: 'Duplicate B' }, bank_snapshot: { accountName: 'DUPB', accountNumber: '9999999999', bankCode: '058' } },
]);
const probs = validateRows(bad, formatById('generic'));
const has = (n, re) => {
  const p = probs.find((x) => x.row === n && re.test(x.message));
  if (!p) fail(`validator: row ${n} should report ${re}`, String(re), JSON.stringify(probs.filter((x) => x.row === n)));
  return p;
};
has(1, /9 digits.*leading zero/);
has(2, /No bank account/);
has(3, /reject a zero/);
has(4, /no code saved/);
has(5, /No account name/);
has(6, /came from the staff record/);
const dup = has(8, /Same account as Duplicate A/);
if (dup && dup.severity !== 'warning') fail('a shared account is a warning, not a hard block', 'warning', dup.severity);

// A clean run reports nothing at all.
if (validateRows(rows, formatById('generic')).length !== 0) {
  fail('a clean run must produce no problems', 0, validateRows(rows, formatById('generic')).length);
}

// A layout WITHOUT a bank code column must not demand one.
const noCodeFormat = { columns: [{ header: 'Account Number' }, { header: 'Amount' }] };
if (validateRows([bad[3]], noCodeFormat).some((p) => /code/i.test(p.message))) {
  fail('a layout with no code column should not require a bank code', 'no code problem', 'code problem raised');
}

if (failures) {
  console.error(`\nFAILED, ${failures} problem(s) with the bank export formats`);
  process.exit(1);
}
console.log(`Pinned ${FORMATS.length} bank layouts byte-for-byte, and the pre-flight validator catches every rejectable row. ALL PASSED`);
