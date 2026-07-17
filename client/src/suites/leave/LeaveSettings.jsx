import { useEffect, useState } from 'react';
import * as L from './leaveApi.js';
import { Modal, useConfirm, EmptyState } from '../../components/ui.jsx';

const YEAR = new Date().getFullYear();
const YEARS = [YEAR - 1, YEAR, YEAR + 1];
const fmt = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const ADMIN_NOTE = 'Only the System Administrator can change leave types.';

/* Admin surface for leave approvers: org holidays, leave types (super_admin
   writes — RLS enforces it, we also pre-disable), and per-employee balance
   overrides. onChange = parent reload so calendar/working-day preview and
   balance cards pick up edits immediately. */
export default function LeaveSettings({ flash, onChange }) {
  const [profile, setProfile] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [holYear, setHolYear] = useState(YEAR);
  const [types, setTypes] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [typeEdit, setTypeEdit] = useState(null); // null | {} (new) | type row
  const { confirm, confirmNode } = useConfirm();

  const loadHolidays = async (y) => setHolidays(await L.getHolidays(y));
  const loadTypes = async () => setTypes(await L.getAllTypes());

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([L.getMyProfile(), L.getOrgStaff(), loadTypes(), loadHolidays(holYear)]);
        setProfile(p); setStaff(s);
      } catch (e) { flash(e.message, true); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line
  }, []);
  useEffect(() => { loadHolidays(holYear).catch((e) => flash(e.message, true)); /* eslint-disable-next-line */ }, [holYear]);

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;
  const isAdmin = profile?.role === 'super_admin';

  const removeHoliday = async (h) => {
    const ok = await confirm({
      title: 'Delete holiday',
      message: `"${h.name}" (${fmt(h.day)}) will be removed. Working-day counts for new requests will change.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try { await L.deleteHoliday(h.id); await loadHolidays(holYear); onChange?.(); flash('Holiday deleted.'); }
    catch (e) { flash(e.message, true); }
  };

  return (
    <>
      {/* ---- Holidays ---- */}
      <div className="lv-section">
        <div className="filterbar">
          <h3 style={{ margin: 0 }}>Holidays</h3>
          <div className="filter-pills">
            {YEARS.map((y) => (
              <button key={y} className={`pill ${holYear === y ? 'active' : ''}`} onClick={() => setHolYear(y)}>{y}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setHolidayOpen(true)}>Add holiday</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Name</th><th>Scope</th><th className="ta-r"></th></tr></thead>
            <tbody>
              {holidays.length === 0 && (
                <tr><td colSpan={4}><EmptyState title="No holidays" hint={`No holidays recorded for ${holYear}.`} /></td></tr>
              )}
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td>{fmt(h.day)}</td>
                  <td>{h.name}</td>
                  <td>{h.org_id
                    ? <span className="lv-status st-approved">Company</span>
                    : <span className="lv-status st-cancelled">Statutory</span>}</td>
                  <td className="ta-r">{h.org_id
                    ? <button className="btn btn-ghost btn-sm" onClick={() => removeHoliday(h)}>Delete</button>
                    : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Statutory public holidays apply to every organisation and cannot be edited. Company holidays are excluded from working-day counts the moment they are added.</p>
      </div>

      {/* ---- Leave types ---- */}
      <div className="lv-section">
        <div className="filterbar">
          <h3 style={{ margin: 0 }}>Leave types</h3>
          <span className="count">{types.length} type{types.length === 1 ? '' : 's'}</span>
          <button className="btn btn-primary btn-sm" disabled={!isAdmin} title={isAdmin ? '' : ADMIN_NOTE} onClick={() => setTypeEdit({})}>New type</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Type</th><th>Default days</th><th>Status</th><th className="ta-r"></th></tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.id}>
                  <td><span className="lv-dot" style={{ background: t.color }} />{t.name}{t.tracked ? '' : <span className="muted"> (untracked)</span>}</td>
                  <td>{t.tracked ? t.default_days : '—'}</td>
                  <td>{t.active
                    ? <span className="lv-status st-approved">Active</span>
                    : <span className="lv-status st-cancelled">Inactive</span>}</td>
                  <td className="ta-r">
                    <button className="btn btn-ghost btn-sm" disabled={!isAdmin} title={isAdmin ? '' : ADMIN_NOTE} onClick={() => setTypeEdit(t)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!isAdmin && <p className="muted" style={{ marginTop: 6 }}>{ADMIN_NOTE}</p>}
        {isAdmin && <p className="muted" style={{ marginTop: 6 }}>Types cannot be deleted because leave requests reference them — deactivate instead.</p>}
      </div>

      {/* ---- Balance adjustments ---- */}
      <div className="lv-section">
        <h3>Balance adjustments</h3>
        <BalanceEditor staff={staff} types={types.filter((t) => t.active && t.tracked)} flash={flash} onChange={onChange} />
      </div>

      {holidayOpen && (
        <HolidayModal
          onClose={() => setHolidayOpen(false)}
          onDone={async () => {
            setHolidayOpen(false);
            await loadHolidays(holYear); onChange?.(); flash('Holiday added.');
          }}
          onError={(m) => flash(m, true)} />
      )}
      {typeEdit && (
        <TypeModal
          type={typeEdit.id ? typeEdit : null}
          nextSort={types.reduce((m, t) => Math.max(m, t.sort), 0) + 1}
          onClose={() => setTypeEdit(null)}
          onDone={async () => {
            setTypeEdit(null);
            await loadTypes(); onChange?.(); flash('Leave type saved.');
          }}
          onError={(m) => flash(m, true)} />
      )}
      {confirmNode}
    </>
  );
}

function HolidayModal({ onClose, onDone, onError }) {
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !day) return onError('Give the holiday a name and a date.');
    setBusy(true);
    try { await L.addHoliday({ name: name.trim(), day }); await onDone(); }
    catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add company holiday" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Name</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founders' Day" /></div>
        <div className="field"><label>Date</label>
          <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Add holiday'}</button>
        </div>
      </form>
    </Modal>
  );
}

function TypeModal({ type, nextSort, onClose, onDone, onError }) {
  const [name, setName] = useState(type?.name || '');
  const [color, setColor] = useState(type?.color || '#0b6b3a');
  const [days, setDays] = useState(type ? String(type.default_days) : '0');
  const [active, setActive] = useState(type ? type.active : true);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return onError('Give the leave type a name.');
    const default_days = Number(days);
    if (!Number.isFinite(default_days) || default_days < 0) return onError('Default days must be zero or more.');
    setBusy(true);
    try {
      if (type) await L.updateType(type.id, { name: name.trim(), color, default_days, active });
      else await L.createType({ name: name.trim(), color, default_days, active, sort: nextSort });
      await onDone();
    } catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={type ? 'Edit leave type' : 'New leave type'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field"><label>Name</label>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Study Leave" /></div>
        <div className="form-grid">
          <div className="field"><label>Colour</label>
            <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ padding: 4, height: 38 }} /></div>
          <div className="field"><label>Default days / year</label>
            <input className="input" type="number" min="0" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} /></div>
        </div>
        <label className="lv-half"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (staff can request this type)</label>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : type ? 'Save changes' : 'Create type'}</button>
        </div>
      </form>
    </Modal>
  );
}

function BalanceEditor({ staff, types, flash, onChange }) {
  const [userId, setUserId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [year, setYear] = useState(YEAR);
  const [entitled, setEntitled] = useState('');       // '' = use type default (null in DB)
  const [carried, setCarried] = useState('0');
  const [adjustment, setAdjustment] = useState('0');
  const [available, setAvailable] = useState(null);
  const [hasRow, setHasRow] = useState(false);
  const [busy, setBusy] = useState(false);
  const type = types.find((t) => t.id === typeId);
  const ready = userId && typeId && year;

  useEffect(() => {
    if (!ready) return;
    let stale = false;
    (async () => {
      try {
        const [row, avail] = await Promise.all([
          L.getBalanceRow(userId, typeId, year),
          L.getAvailable(userId, typeId, year).catch(() => null),
        ]);
        if (stale) return;
        setHasRow(Boolean(row));
        setEntitled(row?.entitled ?? row?.entitled === 0 ? String(row.entitled) : '');
        setCarried(String(row?.carried_over ?? 0));
        setAdjustment(String(row?.adjustment ?? 0));
        setAvailable(avail);
      } catch (e) { if (!stale) flash(e.message, true); }
    })();
    return () => { stale = true; };
    // eslint-disable-next-line
  }, [userId, typeId, year]);

  const save = async (e) => {
    e.preventDefault();
    if (!ready) return flash('Pick an employee, a leave type and a year.', true);
    const nums = [entitled, carried, adjustment].map((v) => (v === '' ? 0 : Number(v)));
    if (nums.some((n) => !Number.isFinite(n))) return flash('Balance fields must be numbers.', true);
    setBusy(true);
    try {
      await L.saveBalance({
        userId, typeId, year: Number(year),
        entitled: entitled === '' ? null : Number(entitled),
        carried_over: carried === '' ? 0 : Number(carried),
        adjustment: adjustment === '' ? 0 : Number(adjustment),
      });
      setHasRow(true);
      setAvailable(await L.getAvailable(userId, typeId, year).catch(() => null));
      onChange?.();
      flash('Balance saved.');
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={save}>
      <div className="form-grid">
        <div className="field"><label>Employee</label>
          <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Select employee…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
          </select></div>
        <div className="field"><label>Leave type</label>
          <select className="select" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Select type…</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></div>
      </div>
      <div className="form-grid">
        <div className="field"><label>Year</label>
          <select className="select" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select></div>
        <div className="field"><label>Entitled days <span className="muted">(blank = type default{type ? `, ${type.default_days}` : ''})</span></label>
          <input className="input" type="number" step="0.5" value={entitled} onChange={(e) => setEntitled(e.target.value)} placeholder={type ? String(type.default_days) : ''} disabled={!ready} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label>Carried over</label>
          <input className="input" type="number" step="0.5" value={carried} onChange={(e) => setCarried(e.target.value)} disabled={!ready} /></div>
        <div className="field"><label>Adjustment <span className="muted">(+/−)</span></label>
          <input className="input" type="number" step="0.5" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} disabled={!ready} /></div>
      </div>
      {ready && (
        <div className="lv-preview">
          <span>{hasRow ? 'Current available balance' : 'Available (no override row yet — type defaults apply)'}</span>
          <b>{available === null ? '—' : `${available} day(s)`}</b>
        </div>
      )}
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
        <button className="btn btn-primary" disabled={busy || !ready}>{busy ? <span className="spinner" /> : 'Save balance'}</button>
      </div>
    </form>
  );
}
