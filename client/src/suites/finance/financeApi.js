import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client.js';

export const getCategories  = () => apiGet('/finance/categories').then((d) => d.categories);
export const createCategory = (body) => apiPost('/finance/categories', body).then((d) => d.category);

export const getExpenses   = () => apiGet('/finance/expenses').then((d) => d.expenses);
export const createExpense = (body) => apiPost('/finance/expenses', body).then((d) => d.expense);
export const updateExpense = (id, body) => apiPatch(`/finance/expenses/${id}`, body).then((d) => d.expense);
export const decideExpense = (id, action) => apiPatch(`/finance/expenses/${id}`, { action }).then((d) => d.expense);
export const deleteExpense = (id) => apiDelete(`/finance/expenses/${id}`);

export const getBudgets  = () => apiGet('/finance/budgets').then((d) => d.budgets);
export const createBudget = (body) => apiPost('/finance/budgets', body).then((d) => d.budget);
export const deleteBudget = (id) => apiDelete(`/finance/budgets/${id}`);

export const STATUS = {
  pending:  { label: 'Pending',  cls: 'fn-s-pending' },
  approved: { label: 'Approved', cls: 'fn-s-approved' },
  rejected: { label: 'Rejected', cls: 'fn-s-rejected' },
  paid:     { label: 'Paid',     cls: 'fn-s-paid' },
};

export const money = (n) => n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

// ---- Bank reconciliation -----------------------------------------------------
export const getBankLines = () => apiGet('/finance/bank-lines').then((d) => d.lines);
export const importBankLines = (rows) => apiPost('/finance/bank-lines', { rows }).then((d) => d.lines);
export const matchBankLine = (id, body) => apiPatch(`/finance/bank-lines/${id}`, body).then((d) => d.line);
export const getReconCandidates = () => apiGet('/finance/recon-candidates');

// ---- General ledger ----------------------------------------------------------
// Double-entry. The database refuses an unbalanced entry and freezes a posted
// one, so these calls are thin on purpose — the rules live where they can't be
// bypassed, not here.
export const getLedgerAccounts = () => apiGet('/finance/ledger/accounts').then((d) => d.accounts);
export const createLedgerAccount = (body) => apiPost('/finance/ledger/accounts', body).then((d) => d.account);
export const getLedgerEntries = (params = '') => apiGet(`/finance/ledger/entries${params}`).then((d) => d.entries);
export const postLedgerEntry = (body) => apiPost('/finance/ledger/entries', body).then((d) => d.entryId);
export const reverseLedgerEntry = (id) => apiPost(`/finance/ledger/entries/${id}/reverse`, {}).then((d) => d.entryId);
export const getTrialBalance = (from, to) => apiGet(`/finance/ledger/trial-balance?from=${from}&to=${to}`).then((d) => d.rows);
export const getProfitAndLoss = (from, to) => apiGet(`/finance/ledger/pnl?from=${from}&to=${to}`).then((d) => d.rows);
export const getBalanceSheet = (asAt) => apiGet(`/finance/ledger/balance-sheet?asAt=${asAt}`).then((d) => d.rows);

export const ACCOUNT_TYPES = [
  { key: 'asset',     label: 'Asset' },
  { key: 'liability', label: 'Liability' },
  { key: 'equity',    label: 'Equity' },
  { key: 'income',    label: 'Income' },
  { key: 'expense',   label: 'Expense' },
];
