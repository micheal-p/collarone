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
