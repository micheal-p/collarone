import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getEmployees = () => apiGet('/payroll/employees').then((d) => d.employees);
export const setEmployeeState = (employeeId, state) => apiPatch(`/payroll/employees/${employeeId}/state`, { state });

export const getSalaryHistory = (employeeId) => apiGet(`/payroll/salary/${employeeId}`).then((d) => d.history);
export const addSalaryStructure = (body) => apiPost('/payroll/salary', body).then((d) => d.structure);

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
