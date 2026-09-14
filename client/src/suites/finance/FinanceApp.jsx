import { useCallback, useEffect, useMemo, useState } from 'react';
import * as F from './financeApi.js';
import LedgerView from './LedgerView.jsx';
import { useToast, useConfirm, Modal, EmptyState, searchMatcher, usePagedList, Paginator } from '../../components/ui.jsx';
import { todayISO } from '../../lib/today.js';

const CSS = `
  .fn-hint { display: block; font-size: 12px; color: var(--text-3); margin-top: 4px; line-height: 1.45; }
  .fn-cash { display: flex; gap: 10px; flex-wrap: wrap; margin: 0 0 14px; }
  .fn-cash-card { flex: 1 1 170px; background: var(--surface); border: 1px solid var(--line); border-radius: 13px; padding: 12px 15px; }
  .fn-cash-l { font-size: 12px; color: var(--text-2); }
  .fn-cash-v { font-size: 21px; font-weight: 600; letter-spacing: -.02em; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .fn-cash-total .fn-cash-v { color: var(--brand-ink, #8f3009); }
  .fn-open-note { font-size: 12.5px; color: var(--text-2); line-height: 1.6; margin: 0 0 14px; }
  .fn-open-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
  .fn-open-sum { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 13.5px; }
  .fn-open-sum b { font-variant-numeric: tabular-nums; }
  @media (max-width: 560px) { .fn-open-grid { grid-template-columns: 1fr; } }

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

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="fn-hint">{hint}</span>}
    </div>
  );
}
function StatusBadge({ status }) { const s = F.STATUS[status] || F.STATUS.pending; return <span className={`fn-badge ${s.cls}`}>{s.label}</span>; }

function CategoryModal({ onClose, onSaved, flash }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ledgerCode, setLedgerCode] = useState('6900');
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return flash('Category name is required.', true);
    setBusy(true);
    try { const saved = await F.createCategory({ name, ledgerCode }); flash('Category added.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add expense category" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name *"><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
        {/* Where this category's spending lands in the books. Without it every
            expense in the business piles into one line and the profit & loss
            says nothing useful. */}
        <Field label="Counts as" hint="Which account this spending shows under in your profit & loss.">
          <select className="select" value={ledgerCode} onChange={(e) => setLedgerCode(e.target.value)}>
            {F.EXPENSE_ACCOUNTS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add category'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---- Opening balances -------------------------------------------------------
   A business joining Collarone mid-life already has money in the bank, stock on
   the shelf, customers who owe it and bills outstanding. Without somewhere to
   say so, the balance sheet starts at zero and can never be right however
   careful the bookkeeping afterwards. Entered once; whatever does not balance
   is the owner's stake, which is what equity means. */
function OpeningBalancesModal({ onClose, onSaved, flash }) {
  const [f, setF] = useState({ asAt: todayISO(), cash: '', bank: '', receivable: '', inventory: '', equipment: '', payable: '', loans: '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s2) => ({ ...s2, [k]: v }));
  const n = (v) => Number(v) || 0;
  const assets = n(f.cash) + n(f.bank) + n(f.receivable) + n(f.inventory) + n(f.equipment);
  const owed = n(f.payable) + n(f.loans);
  const equity = assets - owed;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await F.setOpeningBalances(f);
      flash('Opening balances recorded. Your balance sheet now starts from where the business actually is.');
      onSaved(); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  const money = (k, label, hint) => (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min="0" step="0.01" inputMode="decimal"
        value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder="0.00" />
    </Field>
  );

  return (
    <Modal title="What the business already had" onClose={onClose} wide>
      <form onSubmit={submit}>
        <p className="fn-open-note">
          Enter where the business stood on the day it started using Collarone. You only do this once,
          and it is what makes the balance sheet true rather than a record of this month alone.
          Leave anything that does not apply at zero.
        </p>
        <Field label="As at"><input className="input" type="date" value={f.asAt} onChange={(e) => set('asAt', e.target.value)} required /></Field>
        <div className="fn-open-grid">
          {money('cash', 'Cash in hand (₦)', 'Notes in the drawer or the safe.')}
          {money('bank', 'Money in the bank (₦)', 'Add up every business account.')}
          {money('receivable', 'Owed to you (₦)', 'Invoices customers have not paid yet.')}
          {money('inventory', 'Stock on hand (₦)', 'What you paid for goods still unsold.')}
          {money('equipment', 'Equipment and vehicles (₦)', 'What they are worth now, not new.')}
          {money('payable', 'Owed to suppliers (₦)', 'Bills you have received and not paid.')}
          {money('loans', 'Staff owe you (₦)', 'Salary advances and staff loans outstanding.')}
        </div>
        <div className="fn-open-sum">
          <span>What the business owns</span><b>{F.money(assets)}</b>
        </div>
        <div className="fn-open-sum" style={{ borderTop: 0, paddingTop: 0, marginTop: 4 }}>
          <span>Less what it owes</span><b>{F.money(owed)}</b>
        </div>
        <div className="fn-open-sum">
          <span><strong>The owner&rsquo;s stake</strong></span><b>{F.money(equity)}</b>
        </div>
        {equity < 0 && (
          <p className="fn-open-note" style={{ marginTop: 10 }}>
            That is negative, which simply means the business owes more than it owns today. It is recorded as it is.
          </p>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Record opening balances'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ExpenseModal({ categories, expense = null, onClose, onSaved, flash }) {
  const [f, setF] = useState(expense ? {
    categoryId: expense.category?.id || '', vendor: expense.vendor || '', description: expense.description || '',
    amount: expense.amount ?? '', vatRate: expense.vat_rate ?? 0.075,
    expenseDate: expense.expense_date || todayISO(), notes: expense.notes || '',
  } : { categoryId: '', vendor: '', description: '', amount: '', vatRate: 0.075, expenseDate: todayISO(), notes: '' });
  const [busy, setBusy] = useState(false);
  const [receiptPath, setReceiptPath] = useState(expense?.receipt_path || null);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const total = (Number(f.amount) || 0) * (1 + (Number(f.vatRate) || 0));

  // Attach it now, while it is still in your hand. Nobody ever finds the
  // receipt later, which is why the field existed for months and stayed empty.
  const pickReceipt = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return flash('That file is over 5MB. Photograph it at a lower resolution.', true);
    setUploading(true);
    try { setReceiptPath(await F.uploadReceipt(file)); flash('Receipt attached.'); }
    catch (e) { flash(e.message, true); } finally { setUploading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.description.trim()) return flash('Description is required.', true);
    setBusy(true);
    try {
      const saved = expense ? await F.updateExpense(expense.id, { ...f, receiptPath }) : await F.createExpense({ ...f, receiptPath });
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
        <Field label="Receipt">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input type="file" accept="image/*,application/pdf" disabled={uploading}
              onChange={(e) => pickReceipt(e.target.files?.[0])} style={{ fontSize: 13 }} />
            {uploading && <span className="muted" style={{ fontSize: 12.5 }}>Uploading…</span>}
            {receiptPath && !uploading && (
              <span style={{ fontSize: 12.5, color: '#1a6a1a', fontWeight: 600 }}>Attached</span>
            )}
            {receiptPath && !uploading && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }}
                onClick={() => setReceiptPath(null)}>Remove</button>
            )}
          </div>
        </Field>
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
  const [openingModal, setOpeningModal] = useState(false);
  const [opening, setOpening] = useState(undefined);   // undefined = still loading
  const [cash, setCash] = useState([]);
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

  // The books, which now fill themselves: every approved expense, issued
  // invoice and payroll run posts to the ledger (supabase/finance_auto_posting.sql).
  // Cash is read from the ledger rather than guessed from expenses, so it is the
  // same number the balance sheet shows.
  const loadBooks = useCallback(() => {
    F.getCashPosition().then(setCash).catch(() => setCash([]));
    F.getOpeningBalances().then(setOpening).catch(() => setOpening(null));
  }, []);

  useEffect(() => { load(); loadBooks(); }, [load, loadBooks]);

  const decide = async (e, action) => {
    try { await F.decideExpense(e.id, action); flash(`Expense ${action}.`); load(); loadBooks(); } catch (err) { flash(err.message, true); }
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
      message: `${b.category?.name || 'All categories'}, ${F.money(b.amount)} will be removed.`,
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
    // Year from the stored string, not new Date(...): 'YYYY-MM-DD' parses as
    // UTC midnight, so on 1 January a Lagos user saw the previous year.
    const thisYear = Number(todayISO().slice(0, 4));
    const counted = expenses.filter((e) =>
      (e.status === 'approved' || e.status === 'paid')
      && Number(String(e.expense_date).slice(0, 4)) === thisYear);

    const spentByCategory = {};
    let spentTotal = 0;
    counted.forEach((e) => {
      const key = e.category?.id || 'uncategorised';
      spentByCategory[key] = (spentByCategory[key] || 0) + Number(e.total_amount);
      spentTotal += Number(e.total_amount);
    });

    return budgets.filter((b) => b.period_year === thisYear && !b.period_month).map((b) => ({
      label: b.category?.name || 'All categories',
      budget: Number(b.amount),
      // A budget with no category is the WHOLE company's budget — the row even
      // says "All categories". It used to be compared against uncategorised
      // spend only, so an org-wide budget always looked almost untouched while
      // the company was over it.
      spent: b.category?.id ? (spentByCategory[b.category.id] || 0) : spentTotal,
    }));
  }, [expenses, budgets]);

  return (
    <div className="lv">
      <style>{CSS}</style>
      {/* What the owner actually asks first, and nothing answered before: how
          much money is there. Read from the ledger, so it is the same figure
          the balance sheet shows rather than a second opinion. */}
      {isManager && cash.length > 0 && (
        <div className="fn-cash">
          {cash.map((a) => (
            <div key={a.code} className="fn-cash-card">
              <div className="fn-cash-l">{a.name}</div>
              <div className="fn-cash-v">{F.money(a.balance)}</div>
            </div>
          ))}
          <div className="fn-cash-card fn-cash-total">
            <div className="fn-cash-l">Money available</div>
            <div className="fn-cash-v">{F.money(cash.reduce((t, a) => t + Number(a.balance || 0), 0))}</div>
          </div>
        </div>
      )}

      {/* Shown once, until it is done. A balance sheet built on nothing is
          wrong from its first day, and the owner is the only one who knows
          where the business stood when they arrived. */}
      {isManager && opening === null && (
        <div className="fn-cash-card" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Tell us what the business already had</div>
            <div className="fn-cash-l" style={{ marginTop: 2 }}>
              Money in the bank, stock, what customers owe you. Without it your balance sheet starts at zero and can never be right.
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => setOpeningModal(true)}>Set opening balances</button>
        </div>
      )}

      <div className="lv-tabs">
        <button className={`lv-tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>Expenses</button>
        {isManager && <button className={`lv-tab ${tab === 'budgets' ? 'active' : ''}`} onClick={() => setTab('budgets')}>Budgets</button>}
        {isManager && <button className={`lv-tab ${tab === 'report' ? 'active' : ''}`} onClick={() => setTab('report')}>Report</button>}
        {isManager && <button className={`lv-tab ${tab === 'recon' ? 'active' : ''}`} onClick={() => setTab('recon')}>Reconciliation</button>}
        <button className={`lv-tab ${tab === 'ledger' ? 'active' : ''}`} onClick={() => setTab('ledger')}>Ledger</button>
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
            <thead><tr><th>Description</th><th>Category</th><th>Date</th><th>Submitted by</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
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
                  <td className="muted num" style={{ fontSize: 13 }}>{F.money(e.total_amount)}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {/* An attached receipt is worth nothing if nobody can open
                        it — this is what an auditor asks for. */}
                    {e.receipt_path && (
                      <button className="iconbtn" title="View receipt" aria-label="View receipt"
                        onClick={async () => {
                          try { window.open(await F.receiptUrl(e.receipt_path), '_blank', 'noopener'); }
                          catch (err) { flash(err.message, true); }
                        }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 3h11l5 5v13H4z" /><path d="M15 3v5h5" /></svg>
                      </button>
                    )}
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
            <thead><tr><th>Category</th><th>Period</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {budgets.length === 0 && <tr><td colSpan={4} className="td-empty">No budgets yet.</td></tr>}
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 500 }}>{b.category?.name || 'All categories'}</td>
                  <td className="muted" style={{ fontSize: 13 }}>{b.period_month ? `${b.period_month}/${b.period_year}` : `${b.period_year} (annual)`}</td>
                  <td className="muted num" style={{ fontSize: 13 }}>{F.money(b.amount)}</td>
                  <td><button className="iconbtn" onClick={() => removeBudget(b)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'recon' && isManager && <ReconTab flash={flash} />}
      {tab === 'ledger' && <LedgerView isManager={isManager} flash={flash} confirm={confirm} />}

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
      {openingModal && <OpeningBalancesModal onClose={() => setOpeningModal(false)} onSaved={loadBooks} flash={flash} />}
      {confirmNode}
      {toastNode}
    </div>
  );
}

/* ==== Bank reconciliation ======================================================
   Import the bank's own CSV, match each line against what the workspace
   already knows, customer payments in, approved expenses out, and see
   what's explained, what isn't, and what the books are missing. Suggestions
   are exact-amount within ±5 days; a human always confirms. */

function ReconTab({ flash }) {
  const [lines, setLines] = useState(null);
  const [cands, setCands] = useState({ payments: [], expenses: [] });
  const [mapOpen, setMapOpen] = useState(false);
  const [csv, setCsv] = useState(null);      // parsed rows incl header
  const [map, setMap] = useState({});        // field -> column index
  const [busy, setBusy] = useState(false);
  const { confirm, confirmNode } = useConfirm();

  const load = () => {
    F.getBankLines().then(setLines, (e) => { setLines([]); flash(e.message, true); });
    F.getReconCandidates().then(setCands, () => {});
  };
  useEffect(load, []); // eslint-disable-line

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { parseCsv } = await import('../../lib/csv.js');
    const rows = parseCsv(await file.text());
    if (rows.length < 2) { flash('That file needs a header row plus data.', true); return; }
    // guess columns
    const h = rows[0].map((x) => x.toLowerCase());
    const g = (rx) => h.findIndex((x) => rx.test(x));
    setMap({
      date: g(/date/), description: g(/desc|narrat|detail|particular/), reference: g(/ref/),
      amount: g(/^amount$/), debit: g(/debit|withdraw/), credit: g(/credit|deposit|lodg/),
    });
    setCsv(rows); setMapOpen(true);
    e.target.value = '';
  };

  const parseAmount = (v) => Number(String(v || '').replace(/[^0-9.-]/g, '')) || 0;
  const parseDate = (v) => {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);                      // 2026-07-29
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);            // 29/07/2026 (NG banks: day first)
    if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`; }
    return null;
  };

  // Rows as we actually parsed them, so the mapping can be checked BEFORE
  // anything is written. Getting "which column is the date" wrong silently
  // imports a month of garbage, and the only way to know was to import it.
  const parsedRows = useMemo(() => {
    if (!csv) return [];
    return csv.slice(1).map((r) => {
      const amount = map.amount >= 0
        ? parseAmount(r[map.amount])
        : parseAmount(r[map.credit]) - parseAmount(r[map.debit]);
      return {
        date: map.date >= 0 ? parseDate(r[map.date]) : null,
        description: map.description >= 0 ? r[map.description] : '',
        reference: map.reference >= 0 ? r[map.reference] : '',
        amount,
      };
    });
  }, [csv, map]);
  const usableRows = parsedRows.filter((r) => r.date && r.amount !== 0);
  const skippedRows = parsedRows.length - usableRows.length;

  const doImport = async () => {
    setBusy(true);
    try {
      const rows = csv.slice(1).map((r) => {
        const amount = map.amount >= 0
          ? parseAmount(r[map.amount])
          : parseAmount(r[map.credit]) - parseAmount(r[map.debit]);   // credit positive, debit negative
        return {
          date: map.date >= 0 ? parseDate(r[map.date]) : null,
          description: map.description >= 0 ? r[map.description] : '',
          reference: map.reference >= 0 ? r[map.reference] : '',
          amount,
        };
      }).filter((r) => r.date && r.amount !== 0);
      if (!rows.length) { flash('No usable lines, check the column mapping.', true); return; }
      const imported = await F.importBankLines(rows);
      // Say what actually happened. "24 imported" when 20 were duplicates is
      // the kind of small lie that makes someone stop trusting the totals.
      const added = Array.isArray(imported) ? imported.length : rows.length;
      const dupes = rows.length - added;
      flash(dupes > 0
        ? `${added} new line${added === 1 ? '' : 's'} imported, ${dupes} already on file.`
        : `${added} statement line${added === 1 ? '' : 's'} imported.`);
      setMapOpen(false); setCsv(null); load();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  // exact-amount suggestion within ±5 days, first unused candidate wins
  const usedIds = new Set((lines || []).filter((l) => l.matched_id).map((l) => l.matched_id));
  const near = (a, b) => Math.abs(new Date(a) - new Date(b)) <= 5 * 86400000;
  const suggestionFor = (l) => {
    if (l.matched_kind) return null;
    if (l.amount > 0) {
      const hit = cands.payments.find((p) => !usedIds.has(p.id) && Number(p.amount) === Number(l.amount) && near(p.paid_at, l.line_date));
      return hit ? { kind: 'invoice_payment', id: hit.id, label: `Payment · ${hit.doc?.doc_no || hit.reference || ''} ${hit.doc?.party_name || ''}`.trim() } : null;
    }
    const hit = cands.expenses.find((x) => !usedIds.has(x.id) && Number(x.total_amount) === Math.abs(Number(l.amount)) && near(x.expense_date, l.line_date));
    return hit ? { kind: 'expense', id: hit.id, label: `Expense · ${hit.vendor || hit.description || ''}`.slice(0, 60) } : null;
  };

  const apply = async (l, body, msg) => {
    try { const saved = await F.matchBankLine(l.id, body); setLines((ls) => ls.map((x) => (x.id === saved.id ? saved : x))); if (msg) flash(msg); }
    catch (e) { flash(e.message, true); }
  };
  const manualNote = async (l) => {
    const res = await confirm({
      title: 'Match manually', message: 'Say what this line is (e.g. "July payroll", "bank charges", "owner top-up").',
      confirmLabel: 'Save match', input: { label: 'What is it?', required: true },
    });
    if (res) apply(l, { kind: 'manual', note: res.value }, 'Matched.');
  };

  const open = (lines || []).filter((l) => !l.matched_kind);
  const inSum = open.filter((l) => l.amount > 0).reduce((s, l) => s + Number(l.amount), 0);
  const outSum = open.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(Number(l.amount)), 0);
  const money = (n) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

  return (
    <>
      <div className="filterbar" style={{ marginTop: 8, gap: 10, flexWrap: 'wrap' }}>
        <span className="count">
          {lines === null ? 'Loading…' : `${open.length} unexplained line${open.length === 1 ? '' : 's'}`}
          {open.length > 0 && `, in ${money(inSum)} · out ${money(outSum)}`}
        </span>
        <label className="btn btn-primary lv-apply" style={{ cursor: 'pointer' }}>
          Import bank CSV
          <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 12px', lineHeight: 1.5 }}>
        Export the statement from your bank app as CSV and import it, we suggest matches against customer payments and approved expenses; you confirm each one. Payroll and bank charges match manually with a note.
      </p>

      {lines !== null && lines.length === 0 && (
        <EmptyState title="No statement imported yet" hint="Import your bank statement CSV, matching your bank against your books is how the numbers become trustworthy." />
      )}

      {lines !== null && lines.length > 0 && (
        <div className="table-wrap">
          <table className="table" style={{ fontSize: 13 }}>
            <thead><tr><th>Date</th><th>Description</th><th className="ta-r">In</th><th className="ta-r">Out</th><th>Status</th><th className="ta-r">Action</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const sug = suggestionFor(l);
                return (
                  <tr key={l.id} style={l.matched_kind ? { opacity: 0.55 } : undefined}>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(l.line_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</td>
                    <td style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.description}>{l.description || l.reference || '—'}</td>
                    <td className="ta-r" style={{ color: '#1a6a1a', fontWeight: l.amount > 0 ? 650 : 400 }}>{l.amount > 0 ? money(l.amount) : ''}</td>
                    <td className="ta-r" style={{ color: '#a4262c', fontWeight: l.amount < 0 ? 650 : 400 }}>{l.amount < 0 ? money(-l.amount) : ''}</td>
                    <td>
                      {l.matched_kind
                        ? <span className="muted" style={{ fontSize: 12 }}>{l.matched_kind === 'ignored' ? 'Ignored' : `Matched${l.matched_note ? ` · ${l.matched_note}` : ''}`}</span>
                        : sug
                          ? <span style={{ fontSize: 12, background: '#dff6dd', color: '#1a6a1a', borderRadius: 100, padding: '2px 10px', fontWeight: 600 }}>{sug.label}</span>
                          : <span style={{ fontSize: 12, background: '#fff4ce', color: '#7a5200', borderRadius: 100, padding: '2px 10px', fontWeight: 600 }}>Unexplained</span>}
                    </td>
                    <td className="ta-r">
                      {!l.matched_kind && (
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          {sug && <button className="btn btn-primary btn-sm" onClick={() => apply(l, { kind: sug.kind, matchedId: sug.id, note: sug.label }, 'Matched.')}>Confirm</button>}
                          <button className="btn btn-ghost btn-sm" onClick={() => manualNote(l)}>Match…</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => apply(l, { kind: 'ignored', note: '' })}>Ignore</button>
                        </div>
                      )}
                      {l.matched_kind && <button className="btn btn-ghost btn-sm" onClick={() => apply(l, { clear: true })}>Undo</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mapOpen && csv && (
        <Modal title="Match the columns" onClose={() => { setMapOpen(false); setCsv(null); }}>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            Tell us which column is which. Use a single signed Amount column, or separate Debit/Credit columns.
          </p>
          {['date', 'description', 'reference', 'amount', 'debit', 'credit'].map((f) => (
            <div className="field" key={f} style={{ marginBottom: 8 }}>
              <label style={{ textTransform: 'capitalize' }}>{f}{f === 'date' ? ' *' : ''}</label>
              <select className="select" value={map[f] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [f]: Number(e.target.value) }))}>
                <option value={-1}>— not in file —</option>
                {csv[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </div>
          ))}
          {/* Preview: the first five rows EXACTLY as we parsed them. Reading
              your own statement back is the only way to catch a wrong column
              before a month of nonsense is in the books. */}
          {map.date >= 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-2)', marginBottom: 6 }}>
                How we read your file
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                <table className="table" style={{ fontSize: 12.5, minWidth: 420 }}>
                  <thead><tr><th>Date</th><th>Description</th><th className="ta-r">Amount</th></tr></thead>
                  <tbody>
                    {usableRows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td className="muted">{String(r.description).slice(0, 40) || '—'}</td>
                        <td className="ta-r" style={{ color: r.amount < 0 ? '#a4262c' : '#1a6a1a', fontVariantNumeric: 'tabular-nums' }}>
                          {F.money(r.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {usableRows.length} line{usableRows.length === 1 ? '' : 's'} will be imported
                {skippedRows > 0 && `, ${skippedRows} skipped (no readable date or a zero amount)`}.
                {' '}Re-importing the same file will not duplicate anything.
              </p>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => { setMapOpen(false); setCsv(null); }}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !usableRows.length || map.date < 0 || (map.amount < 0 && map.debit < 0 && map.credit < 0)} onClick={doImport}>
              {busy ? <span className="spinner" /> : `Import ${usableRows.length} line${usableRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </Modal>
      )}
      {confirmNode}
    </>
  );
}
