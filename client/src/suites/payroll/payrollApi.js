import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';
import * as D from '../documents/documentsApi.js';

export const getBankWall = () => apiGet('/payroll/bankwall').then((d) => d.actions);
export const markBankAction = (id, status) => apiPatch(`/payroll/bankwall/${id}`, { status }).then((d) => d.action);

export const getEmployees = () => apiGet('/payroll/employees').then((d) => d.employees);
export const setEmployeeState = (employeeId, state) => apiPatch(`/payroll/employees/${employeeId}/state`, { state });

export const getSalaryHistory = (employeeId) => apiGet(`/payroll/salary/${employeeId}`).then((d) => d.history);
export const addSalaryStructure = (body) => apiPost('/payroll/salary', body).then((d) => d.structure);
export const updateSalaryStructure = (id, body) => apiPatch(`/payroll/salary/${id}`, body).then((d) => d.structure);

export const getBankAccounts = (employeeId) => apiGet(`/payroll/bank/${employeeId}`).then((d) => d.accounts);
export const addBankAccount = (body) => apiPost('/payroll/bank', body).then((d) => d.account);
export const deleteBankAccount = (id) => apiDelete(`/payroll/bank/${id}`);

export const getRuns = () => apiGet('/payroll/runs').then((d) => d.runs);
export const generateRun = (month, year) => apiPost('/payroll/runs/generate', { month, year }).then((d) => d.run);
export const deleteRun = (id) => apiDelete(`/payroll/runs/${id}`);
export const runAction = (id, action, extra = {}) => apiPatch(`/payroll/runs/${id}`, { action, ...extra }).then((d) => d.run);

export const getRunLines = (runId) => apiGet(`/payroll/runs/${runId}/lines`).then((d) => d.lines);
export const updateLine = (id, body) => apiPatch(`/payroll/lines/${id}`, body).then((d) => d.line);

export const getMyPayslips = () => apiGet('/payroll/mypayslips').then((d) => d.payslips);

// Staff loans & salary advances — repaid by payroll deduction, instruction-only
export const getLoans = () => apiGet('/payroll/loans').then((d) => d.loans);
export const requestLoan = (body) => apiPost('/payroll/loans', body).then((d) => d.loan);
export const decideLoan = (id, decision, installment) => apiPost(`/payroll/loans/${id}/decide`, { decision, installment }).then((d) => d.loan);
export const loanBalance = (l) => Math.max(0, Number(l.principal) - Number(l.repaid || 0));
export const LOAN_STATUS = {
  pending:   { label: 'Pending',   cls: 'lc-req-draft' },
  active:    { label: 'Active',    cls: 'lc-req-filled' },
  rejected:  { label: 'Rejected',  cls: 'lc-exit-settled' },
  closed:    { label: 'Repaid',    cls: 'lc-exit-done' },
  cancelled: { label: 'Cancelled', cls: 'lc-req-draft' },
};

export const getRates = () => apiGet('/payroll/rates');
export const updateDeductionRate = (key, rate) => apiPatch(`/payroll/rates/${key}`, { rate }).then((d) => d.rate);
export const updatePayeBand = (id, body) => apiPatch(`/payroll/paye-bands/${id}`, body).then((d) => d.band);

export const RUN_STATUS = {
  draft:     { label: 'Draft',     cls: 'lc-req-draft' },
  review:    { label: 'In review', cls: 'lc-stage-interview' },
  approved:  { label: 'Approved',  cls: 'lc-req-filled' },
  released:  { label: 'Released',  cls: 'lc-exit-settled' },
  disbursed: { label: 'Disbursed', cls: 'lc-exit-done' },
};

export const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export const money = (n) => n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDt = (d) => d
  ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

// ---- Contract generation: "every agreement generates a contract that stays
// in company documents" — runs automatically whenever a new salary
// structure is saved (see SalaryModal in PayrollApp.jsx). Restricted
// visibility, filed into a "Contracts" folder (found or created), and the
// employee themselves gets access to their own copy.
async function findOrCreateContractsFolder() {
  const folders = await D.getFolders();
  const existing = folders.find((f) => f.name === 'Contracts');
  if (existing) return existing;
  return D.createFolder({ name: 'Contracts' });
}

const buildContractHtml = ({ employeeName, companyName, jobTitle, basic, housing, transport, otherAllowances, effectiveDate }) => {
  const gross = basic + housing + transport + otherAllowances;
  const fmt = (n) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Employment Agreement — ${employeeName}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.6;color:#14161a;} h1{font-size:20px;} table{border-collapse:collapse;width:100%;margin:16px 0;} td{padding:6px 10px;border:1px solid #ccc;}</style>
</head><body>
<h1>Letter of Employment &amp; Salary Agreement</h1>
<p>This agreement confirms the terms of employment between <strong>${companyName}</strong> ("the Company") and <strong>${employeeName}</strong> ("the Employee"), effective <strong>${effectiveDate}</strong>.</p>
<p><strong>Position:</strong> ${jobTitle || 'To be confirmed'}</p>
<p><strong>Compensation:</strong> The Employee's monthly gross compensation is set out below, subject to statutory deductions (PAYE, Pension, NHF) as computed by the Company's payroll system.</p>
<table>
<tr><td>Basic salary</td><td>${fmt(basic)}</td></tr>
<tr><td>Housing allowance</td><td>${fmt(housing)}</td></tr>
<tr><td>Transport allowance</td><td>${fmt(transport)}</td></tr>
<tr><td>Other allowances</td><td>${fmt(otherAllowances)}</td></tr>
<tr><td><strong>Gross monthly</strong></td><td><strong>${fmt(gross)}</strong></td></tr>
</table>
<p>This document was generated automatically by Collarone when this salary structure was recorded, and is filed in the Company's Documents for both parties' records. It is not a substitute for independent legal review where required.</p>
<p style="margin-top:40px;">_____________________________<br>${companyName}</p>
<p style="margin-top:40px;">_____________________________<br>${employeeName}</p>
</body></html>`;
};

export const generateContractDocument = async ({ employeeId, employeeName, companyName, jobTitle, basic, housing, transport, otherAllowances, effectiveDate }) => {
  const html = buildContractHtml({ employeeName, companyName, jobTitle, basic, housing, transport, otherAllowances, effectiveDate });
  const folder = await findOrCreateContractsFolder();
  const safeName = employeeName.replace(/[^a-zA-Z0-9]+/g, '-');
  const file = new File([html], `Employment-Agreement-${safeName}-${effectiveDate}.html`, { type: 'text/html' });
  const { path, size } = await D.uploadFile(file, 'contracts/');
  const doc = await D.createDocument({
    name: `Employment Agreement — ${employeeName} — ${effectiveDate}`,
    folderId: folder.id, filePath: path, fileSize: size, visibility: 'restricted',
  });
  try { await D.grantPermission(doc.id, employeeId); } catch { /* best-effort — payroll manager can grant manually if this fails */ }
  return doc;
};

// Client-side bank disbursement export — this app never moves money, it only
// produces the instruction the partner bank's own payroll wall executes.
export const exportBankCsv = (run, lines) => {
  const rows = [
    ['Account Name', 'Account Number', 'Bank Name', 'Bank Code', 'Amount', 'Narration'],
    ...lines.map((l) => [
      l.bank_snapshot?.accountName || l.employee?.name || '',
      l.bank_snapshot?.accountNumber || '',
      l.bank_snapshot?.bankName || '',
      l.bank_snapshot?.bankCode || '',
      Number(l.net).toFixed(2),
      `Salary ${MONTHS[run.period_month - 1]} ${run.period_year}`,
    ]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payroll-${run.period_year}-${String(run.period_month).padStart(2, '0')}-disbursement.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
