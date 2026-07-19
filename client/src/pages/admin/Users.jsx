import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost, apiPatch, apiPut } from '../../api/client.js';
import { SUITE_META, SUITE_ROLES, MULTI_TENANT_SAFE_SUITES, suiteAllowedForCountry } from '../../config/suites.js';
import { FOUNDING_ORG_ID } from '../../config/org.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import AppLayout from '../../components/AppLayout.jsx';
import SuiteIcon from '../../components/SuiteIcon.jsx';
import { useToast, useConfirm } from '../../components/ui.jsx';

const ROLE_LABEL = { super_admin: 'System Admin', manager: 'Manager', staff: 'Staff' };
const ROLE_FILTERS = [
  { key: '', label: 'All users' },
  { key: 'super_admin', label: 'System Admins' },
  { key: 'manager', label: 'Managers' },
  { key: 'staff', label: 'Staff' },
  { key: '_setup', label: 'Needs setup' },
];

/* ---- command-bar glyphs (SVG, no emoji) ---- */
const I = {
  addUser: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5 1.2 0 2.3.3 3.2.9"/><path d="M17 13v6M14 16h6"/></svg>,
  refresh: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-.6 4"/><path d="M20 4v5h-5"/></svg>,
  block: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>,
  check: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8a8886" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>,
  kebab: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/></svg>,
};

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOut]);
}

const DEFAULT_ROLES = [{ value: 'member', label: 'Member' }, { value: 'manager', label: 'Manager' }];
const getSuiteRoles = (key) => SUITE_ROLES[key] || DEFAULT_ROLES;

function SuiteGrantPicker({ catalog, value, onChange, disabled }) {
  const map = useMemo(() => Object.fromEntries(value.map((g) => [g.key, g.role])), [value]);
  const toggle = (key) => {
    const defaultRole = getSuiteRoles(key)[0].value;
    if (map[key] !== undefined) { onChange(value.filter((g) => g.key !== key)); return; }
    // A suite can declare companions (e.g. HR comes with Benefits, Payroll,
    // Documents) — granting it auto-selects them so the connected experience
    // works out of the box. They stay individually removable.
    const companions = (catalog.find((s) => s.key === key)?.companions || [])
      .filter((c) => map[c] === undefined && catalog.some((s) => s.key === c && s.status === 'live'))
      .map((c) => ({ key: c, role: getSuiteRoles(c)[0].value }));
    onChange([...value, { key, role: defaultRole }, ...companions]);
  };
  const setRole = (key, role) => onChange(value.map((g) => (g.key === key ? { ...g, role } : g)));
  const hasCompanionParent = value.some((g) => (catalog.find((s) => s.key === g.key)?.companions || []).length > 0);
  return (
    <div className={`grant-grid ${disabled ? 'is-disabled' : ''}`}>
      {hasCompanionParent && (
        <p className="muted" style={{ gridColumn: '1 / -1', fontSize: 12, margin: '0 0 4px', lineHeight: 1.5 }}>
          Companion suites added with HR count toward your plan's included-suite total like any other suite — untick any you don't want billed.
        </p>
      )}
      {catalog.map((s) => {
        const on = map[s.key] !== undefined; const meta = SUITE_META[s.key] || {};
        const roles = getSuiteRoles(s.key);
        return (
          <div key={s.key} className={`grant-row ${on ? 'on' : ''}`}>
            <label className="grant-main">
              <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(s.key)} />
              <span className="grant-icon" style={{ background: on ? meta.tint || 'var(--brand)' : '#c8c6c4' }}>
                <SuiteIcon name={meta.icon || 'grid'} size={15} color="#fff" />
              </span>
              <span className="grant-name">{s.name}{s.status === 'soon' && <em> · soon</em>}</span>
            </label>
            {on && (
              <select className="select grant-role" value={map[s.key]} disabled={disabled} onChange={(e) => setRole(s.key, e.target.value)}>
                {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

const EMPTY = { name: '', email: '', password: '', role: 'staff', jobTitle: '', department: '', departmentId: '', suites: [] };

export default function AdminUsers() {
  const { user: me } = useAuth();
  const isFoundingOrg = me?.org?.id === FOUNDING_ORG_ID;
  const [searchParams] = useSearchParams();
  const [users, setUsers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  // Suites not yet safe for multi-tenant use are hidden from non-founding grant
  // pickers — showing a checkbox the server will silently strip is worse
  // than not offering it. Same reasoning for country-gated suites (payroll is
  // Nigeria-only — see config/suites.js).
  const grantableCatalog = (isFoundingOrg ? catalog : catalog.filter((s) => MULTI_TENANT_SAFE_SUITES.includes(s.key)))
    .filter((s) => suiteAllowedForCountry(s.key, me?.org?.country))
    .filter((s) => s.status !== 'soon'); // nothing to grant on a coming-soon suite
  const [departments, setDepartments] = useState([]);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortDir, setSortDir] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [manage,  setManage]  = useState(null);
  const [viewUser, setViewUser] = useState(null);
  const [rowMenu, setRowMenu] = useState(null); // { id, rect } | null

  const { flash, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const load = () =>
    apiGet('/users').then((d) => setUsers(d.users)).catch((e) => flash(e.message, true)).finally(() => setLoading(false));

  useEffect(() => {
    apiGet('/catalog').then((d) => setCatalog(d.suites)).catch(() => {});
    apiGet('/departments').then((d) => setDepartments(d.departments)).catch(() => {});
    load(); /* eslint-disable-next-line */
  }, []);

  const view = useMemo(() => {
    let list = users;
    if (roleFilter === '_setup') list = list.filter((u) => u.suites.length === 0 && u.role !== 'super_admin');
    else if (roleFilter) list = list.filter((u) => u.role === roleFilter);
    if (q.trim()) {
      const rx = new RegExp(q.trim(), 'i');
      list = list.filter((u) => rx.test(u.name) || rx.test(u.email) || rx.test(u.department || ''));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name) * sortDir);
  }, [users, roleFilter, q, sortDir]);

  const replace = (u) => setUsers((l) => l.map((x) => (x.id === u.id ? u : x)));
  const selectable = view.filter((u) => u.role !== 'super_admin');
  const allChecked = selectable.length > 0 && selectable.every((u) => selected.has(u.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(selectable.map((u) => u.id)));
  const toggleOne = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const setStatus = async (u, status) => {
    try { const d = await apiPatch(`/users/${u.id}/status`, { status }); replace(d.user); return true; }
    catch (e) { flash(e.message, true); return false; }
  };
  const bulkStatus = async (status) => {
    const targets = view.filter((u) => selected.has(u.id) && u.role !== 'super_admin');
    let n = 0; for (const u of targets) { if (await setStatus(u, status)) n++; }
    setSelected(new Set()); flash(`${n} account${n === 1 ? '' : 's'} ${status === 'active' ? 'enabled' : 'disabled'}.`);
  };
  const resetPw = async (u) => {
    const res = await confirm({
      title: 'Reset password',
      message: `Set a temporary password for ${u.name}. They should change it after signing in.`,
      confirmLabel: 'Set password',
      input: { label: 'Temporary password (min 8 chars)', required: true },
    });
    if (!res) return;
    if (res.value.length < 8) { flash('Password must be at least 8 characters.', true); return; }
    try { await apiPost(`/users/${u.id}/reset-password`, { password: res.value }); flash('Temporary password set.'); }
    catch (e) { flash(e.message, true); }
  };

  const hasSel = selected.size > 0;
  const commandBar = (
    <>
      <button className="cmd" onClick={() => setCreateOpen(true)}><span className="ci">{I.addUser}</span> Add a user</button>
      <button className="cmd" onClick={() => { setLoading(true); load(); }}><span className="ci">{I.refresh}</span> Refresh</button>
      {hasSel && (<>
        <span className="cmd-divider" />
        <button className="cmd" onClick={() => bulkStatus('disabled')}><span className="ci">{I.block}</span> Disable ({selected.size})</button>
        <button className="cmd" onClick={() => bulkStatus('active')}><span className="ci">{I.check}</span> Enable</button>
      </>)}
    </>
  );

  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Users' }]} title="Active users" commandBar={commandBar}>
      <div className="filterbar">
        <span className="filter-label">Filter:</span>
        <div className="filter-pills">
          {ROLE_FILTERS.map((f) => (
            <button key={f.key} className={`pill ${roleFilter === f.key ? 'active' : ''}`} onClick={() => setRoleFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <div className="cmd-search" style={{ marginLeft:'auto' }}>
          {I.search}
          <input
            placeholder="Search by name, email or department…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ border:'none', outline:'none', background:'transparent', fontSize:13, marginLeft:6, width:220 }}
          />
        </div>
        <span className="count">{view.length} account{view.length === 1 ? '' : 's'}</span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="col-check"><input className="cbx" type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" /></th>
              <th className="th-sort" onClick={() => setSortDir((d) => -d)}>Display name <span className="sort-caret">{sortDir === 1 ? '▲' : '▼'}</span></th>
              <th>Username</th><th>Role</th><th>Suites granted</th><th>Status</th><th className="col-check"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="td-empty">Loading…</td></tr>}
            {!loading && view.length === 0 && <tr><td colSpan={7} className="td-empty">No accounts found.</td></tr>}
            {!loading && view.map((u) => (
              <tr key={u.id}>
                <td className="col-check">
                  {u.role !== 'super_admin' &&
                    <input className="cbx" type="checkbox" checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} aria-label={`Select ${u.name}`} />}
                </td>
                <td>
                  <div className="cell-user" style={{ cursor:'pointer' }} onClick={() => setViewUser(u)}>
                    <span className="avatar sm">{u.name.split(' ').slice(0,2).map((w)=>w[0]).join('').toUpperCase()}</span>
                    <div className="cu-name" style={{ color:'var(--brand)', textDecoration:'underline', textDecorationColor:'transparent' }}
                      onMouseEnter={(e) => e.currentTarget.style.textDecorationColor = 'var(--brand)'}
                      onMouseLeave={(e) => e.currentTarget.style.textDecorationColor = 'transparent'}>
                      {u.name}
                    </div>
                  </div>
                </td>
                <td className="cu-mail">{u.email}</td>
                <td><span className={`role-pill role-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
                <td>
                  {u.role === 'super_admin' ? <span className="all-suites">All suites</span>
                    : u.suites.length === 0 ? <span className="muted">None</span>
                    : <div className="chips">{u.suites.map((s) => (
                        <span key={s.key} className="chip"><span className="chip-dot" style={{ background: SUITE_META[s.key]?.tint }} />{catalog.find((c)=>c.key===s.key)?.name || s.key}</span>))}
                      </div>}
                </td>
                <td><span className={`status-dot ${u.status}`} />{u.status === 'active' ? 'Active' : 'Disabled'}</td>
                <td className="col-check">
                  <button className="kebab" aria-label="Row actions"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setRowMenu(rowMenu?.id === u.id ? null : { id: u.id, rect });
                    }}>{I.kebab}</button>
                  {rowMenu?.id === u.id && (
                    <RowMenu u={u} rect={rowMenu.rect} onClose={() => setRowMenu(null)}
                      onView={() => { setRowMenu(null); setViewUser(u); }}
                      onManage={() => { setRowMenu(null); setManage(u); }}
                      onReset={() => { setRowMenu(null); resetPw(u); }}
                      onStatus={() => { setRowMenu(null); setStatus(u, u.status === 'active' ? 'disabled' : 'active').then((ok) => ok && flash(`${u.name} ${u.status === 'active' ? 'disabled' : 'enabled'}.`)); }} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && <CreateUserModal catalog={grantableCatalog} departments={departments} onClose={() => setCreateOpen(false)}
        onCreated={(u, warning) => { setUsers((l) => [u, ...l]); setCreateOpen(false); flash(warning || `${u.name} created.`, Boolean(warning)); }} onError={(m) => flash(m, true)} />}
      {manage && <EditUserModal user={manage} catalog={grantableCatalog} departments={departments} onClose={() => setManage(null)}
        onSaved={(u, warning) => { replace(u); setManage(null); flash(warning || 'Access updated.', Boolean(warning)); }} onError={(m) => flash(m, true)} />}
      {viewUser && <ProfileModal user={viewUser} catalog={catalog} departments={departments} onClose={() => setViewUser(null)}
        onManage={() => { setViewUser(null); setManage(viewUser); }} />}
      {toastNode}
    </AppLayout>
  );
}

function ProfileModal({ user: u, catalog, departments, onClose, onManage }) {
  const initials = u.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const fmtDate  = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Never';
  const deptName = departments.find((d) => String(d.id) === String(u.departmentId))?.name || '—';

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h2>Staff profile</h2>
          <button className="iconbtn dark" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="modal-body" style={{ padding: '0 24px 24px' }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:16, padding:'20px 0 20px', borderBottom:'1px solid var(--line)' }}>
            <span className="avatar" style={{ width:56, height:56, fontSize:20, flexShrink:0 }}>{initials}</span>
            <div>
              <div style={{ fontSize:18, fontWeight:600 }}>{u.name}</div>
              <div style={{ fontSize:13, color:'var(--text-2)', marginTop:2 }}>{u.email}</div>
              <div style={{ marginTop:6, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                <span className={`role-pill role-${u.role}`}>{ROLE_LABEL[u.role]}</span>
                <span className={`status-dot ${u.status}`} style={{ marginLeft:4 }} />
                <span style={{ fontSize:12, color:'var(--text-2)' }}>{u.status === 'active' ? 'Active' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px 24px', padding:'18px 0', borderBottom:'1px solid var(--line)' }}>
            {[
              { label:'Job title',    value: u.jobTitle    || '—' },
              { label:'Department',   value: deptName },
              { label:'Last login',   value: fmtDate(u.lastLoginAt) },
              { label:'Account ID',   value: u.id.slice(0, 8) + '…' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3 }}>{label}</div>
                <div style={{ fontSize:13 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Suites */}
          <div style={{ padding:'16px 0 8px' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>Suites granted</div>
            {u.role === 'super_admin' ? (
              <span className="all-suites">All suites (System Admin)</span>
            ) : u.suites.length === 0 ? (
              <span className="muted" style={{ fontSize:13 }}>No suites assigned yet.</span>
            ) : (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {u.suites.map((s) => {
                  const meta = SUITE_META[s.key] || {};
                  const name = catalog.find((c) => c.key === s.key)?.name || s.key;
                  return (
                    <div key={s.key} style={{ display:'flex', alignItems:'center', gap:7, background:'var(--surface)', border:'1px solid var(--line)', borderRadius:6, padding:'6px 10px' }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background: meta.tint || 'var(--brand)', flexShrink:0 }} />
                      <span style={{ fontSize:13, fontWeight:500 }}>{name}</span>
                      <span style={{ fontSize:11, color:'var(--text-2)', background:'#f3f2f1', padding:'1px 6px', borderRadius:8, textTransform:'capitalize' }}>{s.role}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          {u.role !== 'super_admin' && (
            <div style={{ paddingTop:16, borderTop:'1px solid var(--line)', display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-primary" onClick={onManage}>Manage access</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RowMenu({ u, rect, onClose, onView, onManage, onReset, onStatus }) {
  const ref = useRef(null);
  useClickOutside(ref, onClose);
  const style = rect ? { position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right } : {};
  return createPortal(
    <div className="rowmenu" ref={ref} style={style}>
      <button onClick={onView}>View profile</button>
      {u.role !== 'super_admin' && <button onClick={onManage}>Manage access</button>}
      <button onClick={onReset}>Reset password</button>
      {u.role !== 'super_admin' && <button className={u.status === 'active' ? 'danger' : ''} onClick={onStatus}>{u.status === 'active' ? 'Disable account' : 'Enable account'}</button>}
    </div>,
    document.body
  );
}

function DeptSelect({ departments, value, onChange }) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— No department —</option>
      {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
    </select>
  );
}

function CreateUserModal({ catalog, departments, onClose, onCreated, onError }) {
  const [f, setF] = useState(EMPTY); const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const isAdmin = f.role === 'super_admin';
  const pickDept = (id) => {
    const dept = departments.find((d) => String(d.id) === String(id));
    setF((s) => ({ ...s, departmentId: id ? Number(id) : '', department: dept?.name || '' }));
  };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const d = await apiPost('/users', { ...f, departmentId: f.departmentId || null, suites: isAdmin ? [] : f.suites });
      onCreated(d.user, d.warning);
    }
    catch (e2) { onError(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add a user" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field"><label>Full name</label><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></div>
          <div className="field"><label>Work email</label><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required /></div>
          <div className="field"><label>Job title</label><input className="input" value={f.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} /></div>
          <div className="field"><label>Department</label>
            <DeptSelect departments={departments} value={f.departmentId} onChange={pickDept} />
          </div>
          <div className="field"><label>Temporary password</label><input className="input" value={f.password} onChange={(e) => set('password', e.target.value)} required placeholder="Min 8 characters" /></div>
          <div className="field"><label>System role</label>
            <select className="select" value={f.role} onChange={(e) => set('role', e.target.value)}>
              <option value="staff">Staff</option><option value="manager">Manager</option><option value="super_admin">System Admin (all suites)</option>
            </select></div>
        </div>
        <div className="field">
          <label>Suite access {isAdmin && <span className="muted">— System Admins get every suite automatically</span>}</label>
          <SuiteGrantPicker catalog={catalog} value={f.suites} onChange={(v) => set('suites', v)} disabled={isAdmin} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Create account'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, catalog, departments, onClose, onSaved, onError }) {
  const [grants, setGrants] = useState(user.suites);
  const [role, setRole] = useState(user.role);
  const [deptId, setDeptId] = useState(user.departmentId ? String(user.departmentId) : '');
  const [busy, setBusy] = useState(false);

  const pickDept = (id) => setDeptId(id);

  const save = async () => {
    setBusy(true);
    try {
      const dept = departments.find((d) => String(d.id) === String(deptId));
      const [profileRes] = await Promise.all([
        apiPatch(`/users/${user.id}`, {
          role,
          departmentId: deptId ? Number(deptId) : null,
          department: dept?.name || '',
        }),
      ]);
      const suitesRes = await apiPut(`/users/${user.id}/suites`, { suites: grants });
      onSaved({ ...profileRes.user, suites: suitesRes.user.suites }, suitesRes.warning);
    }
    catch (e) { onError(e.message); } finally { setBusy(false); }
  };

  const isAdmin = role === 'super_admin';

  return (
    <Modal title={`Edit user · ${user.name}`} onClose={onClose} wide>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field"><label>System role</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)} disabled={user.role === 'super_admin'}>
            <option value="staff">Staff</option>
            <option value="manager">Manager</option>
            <option value="super_admin">System Admin</option>
          </select>
        </div>
        <div className="field"><label>Department</label>
          <DeptSelect departments={departments} value={deptId} onChange={pickDept} />
        </div>
      </div>
      <div className="field">
        <label>Suite access {isAdmin && <span className="muted">— System Admins get every suite automatically</span>}</label>
        <SuiteGrantPicker catalog={catalog} value={grants} onChange={setGrants} disabled={isAdmin} />
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? <span className="spinner" /> : 'Save changes'}</button>
      </div>
    </Modal>
  );
}
