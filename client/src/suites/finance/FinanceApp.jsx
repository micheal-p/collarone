import { useCallback, useEffect, useMemo, useState } from 'react';
import * as F from './financeApi.js';
import { useToast, useConfirm, Modal, EmptyState, searchMatcher, usePagedList, Paginator } from '../../components/ui.jsx';

const CSS = `
  .fn-badge { display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px; font-weight:700; letter-spacing:.03em; }
  .fn-s-pending  { background:#fff4ce; color:#7a5200; }
  .fn-s-approved { background:#dff6dd; color:#1a6a1a; }
  .fn-s-rejected { background:#fde7e9; color:#a4262c; }
  .fn-s-paid     { background:#deecfd; color:#194b8f; }

  .fn-pills { display:flex; gap:6px; flex-wrap:wrap; }
  .fn-pill { border:1px solid var(--line); background:var(--surface); border-radius:14px; padding:3px 12px; font-size:12.5px; cursor:pointer; color:var(--text-2); }
  .fn-pill:hover { background:var(--surface-2); }
  .fn-pill.active { background:var(--brand); border-color:var(--brand); color:#fff; font-weight:600; }
`;

const STATUS_PILLS = [
  ['all', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid'], ['rejected', 'Rejected'],
];

function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }
function StatusBadge({ status }) { const s = F.STATUS[status] || F.STATUS.pending; return <span className={`fn-badge ${s.cls}`}>{s.label}</span>; }

function CategoryModal({ onClose, onSaved, flash }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return flash('Category name is required.', true);
    setBusy(true);
    try { const saved = await F.createCategory({ name }); flash('Category added.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add expense category" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add category'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseModal({ categories, expense = null, onClose, onSaved, flash }) {
  const [f, setF] = useState(expense ? {
    categoryId: expense.category?.id || '', vendor: expense.vendor || '', description: expense.description || '',
    amount: expense.amount ?? '', vatRate: expense.vat_rate ?? 0.075,
    expenseDate: expense.expense_date || new Date().toISOString().slice(0, 10), notes: expense.notes || '',
  } : { categoryId: '', vendor: '', description: '', amount: '', vatRate: 0.075, expenseDate: new Date().toISOString().slice(0, 10), notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const total = (Number(f.amount) || 0) * (1 + (Number(f.vatRate) || 0));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.description.trim()) return flash('Description is required.', true);
    setBusy(true);
    try {
      const saved = expense ? await F.updateExpense(expense.id, f) : await F.createExpense(f);
      flash(expense ? 'Expense updated.' : 'Expense submitted.'); onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={expense ? 'Edit expense' : 'Submit expense'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <Field label="Description *"><input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} required autoFocus /></Field>
        <div className="form-grid">
          <Field label="Category">
            <select className="select" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Uncategorised —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Vendor"><input className="input" value={f.vendor} onChange={(e) => set('vendor', e.target.value)} /></Field>
          <Field label="Amount (₦, excl. VAT)"><input className="input" type="number" value={f.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
          <Field label="VAT rate"><input className="input" type="number" step="0.001" value={f.vatRate} onChange={(e) => set('vatRate', e.target.value)} /></Field>
          <Field label="Expense date"><input className="input" type="date" value={f.expenseDate} onChange={(e) => set('expenseDate', e.target.value)} /></Field>
        </div>
        <p style={{ fontSize: 13, margin: '0 0 12px' }}>Total (incl. VAT): <strong>{F.money(total)}</strong></p>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : (expense ? 'Save changes' : 'Submit')}</button>
        </div>
      </form>
    </Modal>
  );
}

function BudgetModal({ categories, onClose, onSaved, flash }) {
  const [f, setF] = useState({ categoryId: '', periodYear: new Date().getFullYear(), periodMonth: '', amount: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.amount) return flash('Amount is required.', true);
    setBusy(true);
    try {
      const saved = await F.createBudget({ ...f, periodMonth: f.periodMonth || null, categoryId: f.categoryId || null });
      flash('Budget added.'); onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add budget line" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Category">
            <select className="select" value={f.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— All categories —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Year *"><input className="input" type="number" value={f.periodYear} onChange={(e) => set('periodYear', e.target.value)} required /></Field>
          <Field label="Month (blank = annual)"><input className="input" type="number" min="1" max="12" value={f.periodMonth} onChange={(e) => set('periodMonth', e.target.value)} /></Field>
          <Field label="Amount (₦) *"><input className="input" type="number" value={f.amount} onChange={(e) => set('amount', e.target.value)} required /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add budget'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function FinanceApp({ access }) {
  const isManager = access?.role === 'manager';
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('expenses');
  const [statusFilter, setStatusFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('');
  const [q, setQ] = useState('');
  const [expModal, setExpModal] = useState(false);
  const [editExp, setEditExp] = useState(null);
  const [budgetModal, setBudgetModal] = useState(false);
  const [catModal, setCatModal] = useState(false);
  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, b, c] = await Promise.all([F.getExpenses(), F.getBudgets(), F.getCategories()]);
      setExpenses(e); setBudgets(b); setCategories(c);
    } catch (e2) { flash(e2.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const decide = async (e, action) => {
    try { await F.decideExpense(e.id, action); flash(`Expense ${action}.`); load(); } catch (err) { flash(err.message, true); }
  };
  const removeExpense = async (e) => {
    const ok = await confirm({
      title: 'Delete expense?',
      message: `"${e.description}" and its approval trail will be permanently removed.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await F.deleteExpense(e.id); flash('Expense deleted.'); load(); } catch (err) { flash(err.message, true); }
  };
  const removeBudget = async (b) => {
    const ok = await confirm({
      title: 'Delete budget line?',
      message: `${b.category?.name || 'All categories'} — ${F.money(b.amount)} will be removed.`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try { await F.deleteBudget(b.id); flash('Budget deleted.'); load(); } catch (err) { flash(err.message, true); }
  };

  // Status pill → category → search, in that order, then paginate.
  const filteredExpenses = useMemo(() => {
    let list = expenses;
    if (statusFilter !== 'all') list = list.filter((e) => e.status === statusFilter);
    if (catFilter) list = list.filter((e) => (e.category?.id || '') === catFilter);
    const match = searchMatcher(q);
    return list.filter((e) => match(e.description, e.submitter?.name));
  }, [expenses, statusFilter, catFilter, q]);
  const paged = usePagedList(filteredExpenses, 25);

  const report = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const spentByCategory = {};
    expenses.filter((e) => (e.status === 'approved' || e.status === 'paid') && new Date(e.expense_date).getFullYear() === thisYear)
      .forEach((e) => {
        const key = e.category?.id || 'uncategorised';
        spentByCategory[key] = (spentByCategory[key] || 0) + Number(e.total_amount);
      });
    return budgets.filter((b) => b.period_year === thisYear && !b.period_month).map((b) => ({
      label: b.category?.name || 'All categories',
      budget: Number(b.amount),
      spent: spentByCategory[b.category?.id || 'uncategorised'] || 0,
    }));
  }, [expenses, budgets]);

  return (
    <div className="lv">
      <style>{CSS}</style>
      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
        {isManager && <button className={`lv-tab ${tab === 'budgets' ? 'active' : ''}`} onClick={() => setTab('budgets')}>Budgets</button>}
        {isManager && <button className={`lv-tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>Report</button>}
        {tab === 'expenses' && <button className="btn btn-primary lv-apply" onClick={() => setExpModal(true)}>Submit expense</button>}
        {tab === 'budgets' && isManager && (
          <>
            <button className="btn btn-ghost" onClick={() => setCatModal(true)} style={{ marginRight: 8 }}>Add category</button>
            <button className="btn btn-primary lv-apply" onClick={() => setBudgetModal(true)}>Add budget</button>
          </>
        )}
      </div>

      {loading && <div className="suite-loading"><div className="boot-spinner" /></div>}

      {!loading && tab === 'expenses' && (
        <>
        <div className="filterbar" style={{ marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
          <div className="fn-pills">
            {STATUS_PILLS.map(([k, label]) => (
              <button key={k} type="button" className={`fn-pill ${statusFilter === k ? 'active' : ''}`} onClick={() => setStatusFilter(k)}>{label}</button>
            ))}
          </div>
          <select className="select" value={catFilter} onChange={(e) => setCatFilter(e.target.value)} style={{ maxWidth: 180, padding: '5px 8px', fontSize: 13 }}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input className="input" placeholder="Search description, employee…" value={q} onChange={(e) => setQ(e.target.value)}
            style={{ maxWidth: 220, padding: '6px 10px', fontSize: 13 }} />
          <span className="count" style={{ marginLeft: 'auto' }}>{filteredExpenses.length} expense{filteredExpenses.length === 1 ? '' : 's'}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Description</th><th>Category</th><th>Date</th><th>Submitted by</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filteredExpenses.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 0 }}>
                  <EmptyState title={expenses.length === 0 ? 'No expenses yet' : 'No expenses match these filters'}
                    hint={expenses.length === 0 ? 'Submit your first expense to start the approval trail.' : 'Adjust the status, category or search to see more.'} />
                </td></tr>
              )}
              {paged.slice.map((e) => (
                <tr key={e.id}>
                  <td style={{ fontWeight: 500 }}>{e.description}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{e.category?.name || '—'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{F.fmtDate(e.expense_date)}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{e.submitter?.name}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{F.money(e.total_amount)}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {isManager && e.status === 'pending' && (
                      <>
                        <button className="iconbtn" onClick={() => decide(e, 'approved')}>Approve</button>
                        <button className="iconbtn" onClick={() => decide(e, 'rejected')}>Reject</button>
                      </>
                    )}
                    {isManager && e.status === 'approved' && <button className="iconbtn" onClick={() => decide(e, 'paid')}>Mark paid</button>}
                    {e.status === 'pending' && (
                      <button className="iconbtn" title="Edit expense" aria-label="Edit expense" onClick={() => setEditExp(e)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3.5a2.4 2.4 0 0 1 3.4 3.4L7.5 19.8 3 21l1.2-4.5z" /></svg>
                      </button>
                    )}
                    {(e.status === 'pending' || e.status === 'rejected') && <button className="iconbtn" onClick={() => removeExpense(e)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator page={paged.page} pages={paged.pages} onPage={paged.setPage} total={paged.total} />
        </>
      )}

      {!loading && tab === 'budgets' && isManager && (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Category</th><th>Period</th><th>Amount</th><th></th></tr></thead>
            <tbody>
              {budgets.length === 0 && <tr><td colSpan={4} className="td-empty">No budgets yet.</td></tr>}
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500 }}>{b.category?.name || 'All categories'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{b.period_month ? `${b.period_month}/${b.period_year}` : `${b.period_year} (annual)`}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{F.money(b.amount)}</td>
                  <td><button className="iconbtn" onClick={() => removeBudget(b)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'report' && isManager && (
        <div style={{ maxWidth: 640 }}>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 16px' }}>Annual budget vs. actual spend (approved + paid expenses), {new Date().getFullYear()}.</p>
          {report.length === 0 && <div className="crm-activity-empty">No annual budgets set for this year yet.</div>}
          {report.map((r) => {
            const pct = r.budget > 0 ? Math.min(100, (r.spent / r.budget) * 100) : 0;
            const over = r.spent > r.budget;
            return (
              <div key={r.label} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <strong>{r.label}</strong>
                  <span className={over ? 'muted' : 'muted'} style={over ? { color: '#a4262c' } : {}}>{F.money(r.spent)} / {F.money(r.budget)}</span>
                </div>
                <div style={{ height: 8, background: '#f3f2f1', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: over ? '#a4262c' : 'var(--brand)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expModal && <ExpenseModal categories={categories} onClose={() => setExpModal(false)} onSaved={load} flash={flash} />}
      {editExp && <ExpenseModal categories={categories} expense={editExp} onClose={() => setEditExp(null)} onSaved={load} flash={flash} />}
      {budgetModal && <BudgetModal categories={categories} onClose={() => setBudgetModal(false)} onSaved={load} flash={flash} />}
      {catModal && <CategoryModal onClose={() => setCatModal(false)} onSaved={load} flash={flash} />}
      {confirmNode}
      {toastNode}
    </div>
  );
}
