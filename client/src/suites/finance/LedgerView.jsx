// The general ledger: journal, chart of accounts, and the three statements.
//
// Everything that guarantees correctness lives in the database — an entry that
// doesn't balance is refused, a posted entry can't be edited or deleted, and
// only a finance manager can post. This file is presentation. That split is
// deliberate: an accountant's willingness to trust these numbers is the whole
// product, and rules enforced only in a browser are not rules.
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as F from './financeApi.js';
import { todayISO, monthStartISO, yearStartISO } from '../../lib/today.js';

const cell = { padding: '9px 12px', fontSize: 13, borderBottom: '1px solid var(--line)' };
const num = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const th = { ...cell, fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text-2)' };

// A wrapper every table shares: wide financial tables must scroll inside their
// own box, never drag the whole page sideways on a phone.
function Scroller({ children }) {
  return <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)' }}>{children}</div>;
}

function Empty({ title, hint }) {
  return (
    <div style={{ padding: '38px 20px', textAlign: 'center' }}>
      <div style={{ fontWeight: 650, marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>{hint}</div>
    </div>
  );
}

/* ---- new journal entry --------------------------------------------------- */
function EntryModal({ accounts, onClose, onSaved, onError }) {
  const [entryDate, setEntryDate] = useState(todayISO());
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState([
    { code: '', debit: '', credit: '', description: '' },
    { code: '', debit: '', credit: '', description: '' },
  ]);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    debit: a.debit + (Number(r.debit) || 0),
    credit: a.credit + (Number(r.credit) || 0),
  }), { debit: 0, credit: 0 }), [rows]);
  const diff = Math.round((totals.debit - totals.credit) * 100) / 100;
  const balanced = diff === 0 && totals.debit > 0;

  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => {
    if (j !== i) return r;
    // One side or the other, never both — typing in one clears the other, so
    // the "both filled" mistake can't reach the server at all.
    if (k === 'debit' && v) return { ...r, debit: v, credit: '' };
    if (k === 'credit' && v) return { ...r, credit: v, debit: '' };
    return { ...r, [k]: v };
  }));

  const submit = async (e) => {
    e.preventDefault();
    const lines = rows
      .filter((r) => r.code && (Number(r.debit) > 0 || Number(r.credit) > 0))
      .map((r) => ({ code: r.code, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0, description: r.description }));
    if (lines.length < 2) return onError('A journal entry needs at least two lines — one debit and one credit.');
    if (!balanced) return onError(`This entry does not balance. Debits ${F.money(totals.debit)} against credits ${F.money(totals.credit)}.`);
    setBusy(true);
    try { await F.postLedgerEntry({ entryDate, memo, lines }); onSaved(); }
    catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-head"><h3>New journal entry</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <form onSubmit={submit} className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, marginBottom: 14 }}>
            <div className="field"><label htmlFor="je-date">Date</label>
              <input id="je-date" className="input" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required /></div>
            <div className="field"><label htmlFor="je-memo">Description</label>
              <input id="je-memo" className="input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="What is this entry for?" /></div>
          </div>

          <Scroller>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead><tr>
                <th style={th}>Account</th><th style={th}>Narration</th>
                <th style={{ ...th, textAlign: 'right' }}>Debit</th><th style={{ ...th, textAlign: 'right' }}>Credit</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={cell}>
                      <select className="select" value={r.code} onChange={(e) => setRow(i, 'code', e.target.value)} style={{ minWidth: 190 }}>
                        <option value="">Choose an account…</option>
                        {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                      </select>
                    </td>
                    <td style={cell}><input className="input" value={r.description} onChange={(e) => setRow(i, 'description', e.target.value)} style={{ minWidth: 130 }} /></td>
                    <td style={num}><input className="input" type="number" step="0.01" min="0" value={r.debit} onChange={(e) => setRow(i, 'debit', e.target.value)} style={{ width: 110, textAlign: 'right' }} /></td>
                    <td style={num}><input className="input" type="number" step="0.01" min="0" value={r.credit} onChange={(e) => setRow(i, 'credit', e.target.value)} style={{ width: 110, textAlign: 'right' }} /></td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Totals</td>
                  <td style={{ ...num, fontWeight: 700 }}>{F.money(totals.debit)}</td>
                  <td style={{ ...num, fontWeight: 700 }}>{F.money(totals.credit)}</td>
                </tr>
              </tbody>
            </table>
          </Scroller>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setRows((rs) => [...rs, { code: '', debit: '', credit: '', description: '' }])}>+ Add line</button>
            <span style={{ fontSize: 13, fontWeight: 650, color: balanced ? 'var(--ok, #167c3f)' : 'var(--danger, #b42318)' }}>
              {totals.debit === 0 && totals.credit === 0 ? '' : balanced ? '✓ Balanced' : `Out by ${F.money(Math.abs(diff))}`}
            </span>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy || !balanced}>{busy ? 'Posting…' : 'Post entry'}</button>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Once posted, an entry cannot be edited or deleted — that is what makes the ledger trustworthy. To correct a mistake, reverse it.
          </p>
        </form>
      </div>
    </div>
  );
}

/* ---- statements ---------------------------------------------------------- */
function TrialBalance({ rows }) {
  const t = rows.reduce((a, r) => ({ d: a.d + Number(r.debit), c: a.c + Number(r.credit) }), { d: 0, c: 0 });
  const balanced = Math.round((t.d - t.c) * 100) / 100 === 0;
  if (!rows.length) return <Empty title="Nothing posted in this period" hint="Post a journal entry, or record expenses and invoices, and the trial balance fills itself in." />;
  return (
    <>
      <Scroller>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
          <thead><tr><th style={th}>Code</th><th style={th}>Account</th>
            <th style={{ ...th, textAlign: 'right' }}>Debit</th><th style={{ ...th, textAlign: 'right' }}>Credit</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}><td style={cell}>{r.code}</td><td style={cell}>{r.name}</td>
                <td style={num}>{Number(r.debit) ? F.money(r.debit) : ''}</td>
                <td style={num}>{Number(r.credit) ? F.money(r.credit) : ''}</td></tr>
            ))}
            <tr><td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Total</td>
              <td style={{ ...num, fontWeight: 700 }}>{F.money(t.d)}</td>
              <td style={{ ...num, fontWeight: 700 }}>{F.money(t.c)}</td></tr>
          </tbody>
        </table>
      </Scroller>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
        {balanced
          ? 'Debits equal credits, as they must. If these two ever differ, something wrote to the ledger tables directly — tell us immediately.'
          : 'These totals do not match, which should be impossible. Please contact support before relying on these figures.'}
      </p>
    </>
  );
}

function ProfitAndLoss({ rows }) {
  const income = rows.filter((r) => r.type === 'income');
  const expense = rows.filter((r) => r.type === 'expense');
  const sum = (a) => a.reduce((t, r) => t + Number(r.amount), 0);
  const profit = sum(income) - sum(expense);
  if (!rows.length) return <Empty title="No income or expenses in this period" hint="Profit and loss is built from posted journal entries. Once money moves, this fills in." />;
  const Section = ({ title, list, total }) => (
    <>
      <tr><td style={{ ...cell, fontWeight: 700, background: 'var(--surface-2, #faf9f7)' }} colSpan={2}>{title}</td></tr>
      {list.map((r) => <tr key={r.code}><td style={cell}>{r.code} — {r.name}</td><td style={num}>{F.money(r.amount)}</td></tr>)}
      <tr><td style={{ ...cell, fontWeight: 650 }}>Total {title.toLowerCase()}</td><td style={{ ...num, fontWeight: 650 }}>{F.money(total)}</td></tr>
    </>
  );
  return (
    <Scroller>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
        <tbody>
          <Section title="Income" list={income} total={sum(income)} />
          <Section title="Expenses" list={expense} total={sum(expense)} />
          <tr><td style={{ ...cell, fontWeight: 800, fontSize: 14 }}>{profit >= 0 ? 'Profit' : 'Loss'} for the period</td>
            <td style={{ ...num, fontWeight: 800, fontSize: 14, color: profit >= 0 ? 'var(--ok, #167c3f)' : 'var(--danger, #b42318)' }}>{F.money(Math.abs(profit))}</td></tr>
        </tbody>
      </table>
    </Scroller>
  );
}

function BalanceSheet({ rows }) {
  const g = (t) => rows.filter((r) => r.type === t);
  const sum = (a) => a.reduce((t, r) => t + Number(r.amount), 0);
  const assets = sum(g('asset'));
  const liabsEquity = sum(g('liability')) + sum(g('equity'));
  if (!rows.length) return <Empty title="Nothing to show yet" hint="The balance sheet is a snapshot of what the business owns and owes, built from posted entries." />;
  const Section = ({ title, list }) => (
    <>
      <tr><td style={{ ...cell, fontWeight: 700, background: 'var(--surface-2, #faf9f7)' }} colSpan={2}>{title}</td></tr>
      {list.map((r) => <tr key={r.code}><td style={cell}>{r.code} — {r.name}</td><td style={num}>{F.money(r.amount)}</td></tr>)}
      <tr><td style={{ ...cell, fontWeight: 650 }}>Total {title.toLowerCase()}</td><td style={{ ...num, fontWeight: 650 }}>{F.money(sum(list))}</td></tr>
    </>
  );
  const off = Math.round((assets - liabsEquity) * 100) / 100;
  return (
    <>
      <Scroller>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
          <tbody>
            <Section title="Assets" list={g('asset')} />
            <Section title="Liabilities" list={g('liability')} />
            <Section title="Equity" list={g('equity')} />
          </tbody>
        </table>
      </Scroller>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
        {off === 0
          ? 'Assets equal liabilities plus equity, which is how you know the books are consistent.'
          : `These two sides differ by ${F.money(Math.abs(off))}, which should not happen. Please contact support.`}
      </p>
    </>
  );
}

/* ---- the ledger view ------------------------------------------------------ */
export default function LedgerView({ isManager, flash, confirm }) {
  const [sub, setSub] = useState('journal');
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [tb, setTb] = useState([]);
  const [pnl, setPnl] = useState([]);
  const [bs, setBs] = useState([]);
  const [from, setFrom] = useState(yearStartISO());
  const [to, setTo] = useState(todayISO());
  const [asAt, setAsAt] = useState(todayISO());
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const [a, e] = await Promise.all([F.getLedgerAccounts(), F.getLedgerEntries()]);
      setAccounts(a); setEntries(e);
    } catch (e) { flash(e.message, true); } finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { loadCore(); }, [loadCore]);

  // Reports load on demand — no point fetching a balance sheet nobody opened.
  useEffect(() => {
    if (sub === 'trial') F.getTrialBalance(from, to).then(setTb).catch((e) => flash(e.message, true));
    if (sub === 'pnl') F.getProfitAndLoss(from, to).then(setPnl).catch((e) => flash(e.message, true));
    if (sub === 'bs') F.getBalanceSheet(asAt).then(setBs).catch((e) => flash(e.message, true));
  }, [sub, from, to, asAt, flash]);

  const reverse = async (entry) => {
    const ok = await confirm({
      title: 'Reverse this entry?',
      message: `A mirror entry will be posted that cancels ${entry.memo || 'this entry'}, and the original will be marked void. Both stay visible — that is the audit trail.`,
      confirmLabel: 'Reverse it',
    });
    if (!ok) return;
    try { await F.reverseLedgerEntry(entry.id); flash('Entry reversed.'); loadCore(); }
    catch (e) { flash(e.message, true); }
  };

  if (loading) return <div style={{ padding: 24 }}><div className="boot-spinner" /></div>;

  return (
    <div>
      <div className="lv-tabs" style={{ marginBottom: 14 }}>
        <button className={`lv-tab ${sub === 'journal' ? 'active' : ''}`} onClick={() => setSub('journal')}>Journal</button>
        <button className={`lv-tab ${sub === 'accounts' ? 'active' : ''}`} onClick={() => setSub('accounts')}>Chart of accounts</button>
        <button className={`lv-tab ${sub === 'trial' ? 'active' : ''}`} onClick={() => setSub('trial')}>Trial balance</button>
        <button className={`lv-tab ${sub === 'pnl' ? 'active' : ''}`} onClick={() => setSub('pnl')}>Profit &amp; loss</button>
        <button className={`lv-tab ${sub === 'bs' ? 'active' : ''}`} onClick={() => setSub('bs')}>Balance sheet</button>
      </div>

      {(sub === 'trial' || sub === 'pnl') && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="lg-from">From</label>
            <input id="lg-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="lg-to">To</label>
            <input id="lg-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn btn-ghost" onClick={() => { setFrom(monthStartISO()); setTo(todayISO()); }}>This month</button>
          <button className="btn btn-ghost" onClick={() => { setFrom(yearStartISO()); setTo(todayISO()); }}>This year</button>
        </div>
      )}
      {sub === 'bs' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'end', marginBottom: 12 }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="lg-asat">As at</label>
            <input id="lg-asat" className="input" type="date" value={asAt} onChange={(e) => setAsAt(e.target.value)} /></div>
        </div>
      )}

      {sub === 'journal' && (
        <>
          {isManager && (
            <div style={{ marginBottom: 12 }}>
              <button className="btn btn-primary" onClick={() => setModal(true)}>+ New journal entry</button>
            </div>
          )}
          {entries.length === 0 ? (
            <Empty title="No journal entries yet"
              hint="A journal entry records one movement of money against two or more accounts — money in one place, out of another. Post your first one to begin the books." />
          ) : (
            <Scroller>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead><tr><th style={th}>No.</th><th style={th}>Date</th><th style={th}>Description</th>
                  <th style={th}>Accounts</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th} /></tr></thead>
                <tbody>
                  {entries.map((e) => {
                    const total = (e.lines || []).reduce((t, l) => t + Number(l.debit), 0);
                    return (
                      <tr key={e.id} style={e.status === 'void' ? { opacity: 0.55 } : undefined}>
                        <td style={cell}>{e.entry_no ?? '—'}</td>
                        <td style={cell}>{F.fmtDate(e.entry_date)}</td>
                        <td style={cell}>{e.memo || '—'}
                          {e.status === 'void' && <span className="muted" style={{ marginLeft: 8, fontSize: 11.5 }}>reversed</span>}
                          {e.source_type && e.source_type !== 'manual' && (
                            <span className="muted" style={{ marginLeft: 8, fontSize: 11.5 }}>from {e.source_type}</span>
                          )}
                        </td>
                        <td style={{ ...cell, fontSize: 12 }}>
                          {(e.lines || []).map((l) => `${l.account?.code} ${Number(l.debit) > 0 ? 'Dr' : 'Cr'}`).join(', ')}
                        </td>
                        <td style={num}>{F.money(total)}</td>
                        <td style={cell}>
                          {isManager && e.status === 'posted' && (
                            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => reverse(e)}>Reverse</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Scroller>
          )}
        </>
      )}

      {sub === 'accounts' && (
        <Scroller>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
            <thead><tr><th style={th}>Code</th><th style={th}>Account</th><th style={th}>Type</th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}><td style={cell}>{a.code}</td><td style={cell}>{a.name}</td>
                  <td style={{ ...cell, textTransform: 'capitalize' }}>{a.type}</td></tr>
              ))}
            </tbody>
          </table>
        </Scroller>
      )}

      {sub === 'trial' && <TrialBalance rows={tb} />}
      {sub === 'pnl' && <ProfitAndLoss rows={pnl} />}
      {sub === 'bs' && <BalanceSheet rows={bs} />}

      {modal && (
        <EntryModal accounts={accounts} onClose={() => setModal(false)}
          onSaved={() => { setModal(false); flash('Journal entry posted.'); loadCore(); }}
          onError={(m) => flash(m, true)} />
      )}
    </div>
  );
}
