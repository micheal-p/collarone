// Every workspace on the platform, worked as a directory: the list on the
// left with search and a status filter, the chosen organization on the right
// with its facts, its actions, its suite check and its money. Actions live
// in the detail pane, not in a row of eight buttons per table line.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../../api/client.js';
import { supabase } from '../../lib/supabaseClient.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { FOUNDING_ORG_ID } from '../../config/org.js';
import { SUITES } from '../../config/suites.js';
import { useToast } from '../../components/ui.jsx';
import { usePlatformCounts } from '../../components/PlatformShell.jsx';
import { countryName } from './charts.jsx';
import { ALL_SUITE_KEYS, BillingModal, DeleteOrgModal, Empty, Facts, GatewayModal, SectionHead, Seg, STATUS_DOT, STATUS_LABEL, StatusPill, TX_TYPE, WebsiteLink, ago, fmtDate, naira } from './shared.jsx';

const GUEST_KEY = 'collarone_guest_mode';
const PLAN = { startup: 'Startup', standard: 'Standard', enterprise: 'Enterprise' };
const suiteName = (k) => SUITES.find((s) => s.key === k)?.name || k;

export default function Organizations() {
  const nav = useNavigate();
  const { user } = useAuth();
  const myOrgId = user?.org?.id || null;
  const { flash, toastNode } = useToast();
  const { refreshCounts } = usePlatformCounts();

  const [orgs, setOrgs] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [adminIds, setAdminIds] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [sites, setSites] = useState([]);
  const [themes, setThemes] = useState([]);
  const [error, setError] = useState('');

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [suiteResults, setSuiteResults] = useState({});
  const [testing, setTesting] = useState(false);
  const [guesting, setGuesting] = useState(false);
  const [modal, setModal] = useState(null); // 'billing' | 'gateway' | 'delete'
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    Promise.all([apiGet('/platform/organizations'), apiGet('/platform/profiles'), apiGet('/platform/admin-ids'), apiGet('/platform/transactions'), apiGet('/platform/sites'), apiGet('/platform/site-themes')])
      .then(([o, p, ai, t, s, th]) => { setOrgs(o.organizations || []); setProfiles(p.profiles || []); setAdminIds(ai.adminIds || []); setTransactions(t.transactions || []); setSites(s.sites || []); setThemes(th.themes || []); })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  const staffCount = useMemo(() => {
    const m = {};
    profiles.filter((p) => !adminIds.includes(p.id)).forEach((p) => { m[p.org_id] = (m[p.org_id] || 0) + 1; });
    return m;
  }, [profiles, adminIds]);
  const siteByOrg = useMemo(() => Object.fromEntries(sites.map((s) => [s.org_id, s])), [sites]);

  const counts = useMemo(() => {
    const c = { all: (orgs || []).length, active: 0, attention: 0 };
    (orgs || []).forEach((o) => { if (o.status === 'active') c.active += 1; else c.attention += 1; });
    return c;
  }, [orgs]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (orgs || [])
      .filter((o) => (filter === 'all' ? true : filter === 'active' ? o.status === 'active' : o.status !== 'active'))
      .filter((o) => !needle || o.name.toLowerCase().includes(needle) || (o.slug || '').toLowerCase().includes(needle))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [orgs, q, filter]);

  const open = (orgs || []).find((o) => o.id === openId) || null;
  useEffect(() => {
    if (openId || !orgs || orgs.length === 0) return;
    if (window.matchMedia('(max-width: 900px)').matches) return;
    setOpenId(visible[0]?.id || orgs[0].id);
  }, [orgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const orgTx = useMemo(() => (open ? transactions.filter((t) => t.org_id === open.id) : []), [transactions, open]);
  const collected = orgTx.filter((t) => t.status === 'confirmed').reduce((s, t) => s + Number(t.amount_kobo || 0), 0);

  // Count-only reachability per suite, never row content: confirms "is it
  // working" without the operator ever seeing a customer's records.
  const testSuites = async (org) => {
    setTesting(true);
    try {
      const results = await Promise.all(ALL_SUITE_KEYS.map((key) => apiPost('/platform/test-suite', { orgId: org.id, suiteKey: key }).then((d) => ({ key, ...d.result })).catch((e) => ({ key, ok: false, error: e.message }))));
      setSuiteResults((s) => ({ ...s, [org.id]: { at: Date.now(), results } }));
    } catch (e) { flash(e.message, true); } finally { setTesting(false); }
  };

  // Enter a tenant workspace to click through it WITHOUT impersonating anyone:
  // a reason-stamped support grant adds a read-only claim to our own token.
  const guestIntoOrg = async (org) => {
    const reason = window.prompt(`Reason for entering ${org.name}'s workspace (recorded in the audit log):`);
    if (reason === null) return;
    if (!reason.trim()) { flash('A reason is required to enter a workspace.', true); return; }
    setGuesting(true);
    try {
      const d = await apiPost('/platform/guest-mode', { orgId: org.id, reason: reason.trim() });
      const mint = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        return supabase.auth.refreshSession(session ? { refresh_token: session.refresh_token } : undefined);
      };
      let { error: err } = await mint();
      if (err && /already.?used/i.test(err.message)) { await new Promise((r) => setTimeout(r, 600)); ({ error: err } = await mint()); }
      if (err) throw new Error(err.message);
      localStorage.setItem(GUEST_KEY, JSON.stringify({ orgId: org.id, orgName: d.orgName, startedAt: Date.now() }));
      window.location.href = '/workspace';
    } catch (e) { flash(e.message, true); setGuesting(false); }
  };

  const deleteOrg = async () => {
    setDeleting(true);
    try {
      await apiPost('/platform/delete-org', { orgId: open.id });
      flash(`${open.name} deleted.`);
      setModal(null); setOpenId(null); load(); refreshCounts();
    } catch (e) { flash(e.message, true); } finally { setDeleting(false); }
  };

  const toolbar = (
    <div className="pc-toolbar">
      <label className="pc-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or address" aria-label="Search organizations" />
      </label>
      <Seg label="Status" value={filter} onChange={setFilter} options={[['all', 'All', counts.all], ['active', 'Active', counts.active], ['attention', 'Needs attention', counts.attention]]} />
    </div>
  );

  return (
    <>
      {error && <p className="pc-note" style={{ color: 'var(--err)' }}>{error}</p>}
      {toolbar}

      {orgs != null && orgs.length === 0 ? (
        <div className="pc-card"><Empty title="No organizations yet">The first company to finish signup appears here with its plan, status and staff count.</Empty></div>
      ) : (
        <div className={`pc-split${open ? ' has-open' : ''}`}>
          <aside className="pc-list" aria-label="Organizations">
            {orgs == null && <div className="pc-empty">Loading…</div>}
            {orgs != null && visible.length === 0 && <div className="pc-empty">No organization matches that search.</div>}
            {visible.map((o) => (
              <button key={o.id} className={`pc-list-item${o.id === openId ? ' active' : ''}`} onClick={() => setOpenId(o.id)}>
                <span className="pc-dot" style={{ background: STATUS_DOT[o.status] || 'var(--faint)' }} title={STATUS_LABEL[o.status] || o.status} />
                <span className="pc-list-main">
                  <span className="pc-list-title">{o.name}{myOrgId && o.id === myOrgId && <span className="pc-chip accent" style={{ marginLeft: 8 }}>Yours</span>}</span>
                  <span className="pc-list-sub">{PLAN[o.plan_tier] || o.plan_tier} · {staffCount[o.id] || 0} staff · {STATUS_LABEL[o.status] || o.status}</span>
                </span>
                <span className="pc-list-when">{ago(o.created_at)}</span>
              </button>
            ))}
          </aside>

          <section className="pc-thread" style={{ maxHeight: 'none', minHeight: 0 }}>
            {!open ? (
              <div className="pc-empty" style={{ padding: '60px 20px' }}>Pick an organization to see its details.</div>
            ) : (
              <>
                <header className="pc-detail-head">
                  <button className="pc-btn sm pc-thread-back" onClick={() => setOpenId(null)}>← All</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 className="pc-detail-title">{open.name}</h2>
                    <div className="pc-detail-sub">
                      <span className="pc-mono">{open.slug}</span>
                      <StatusPill status={open.status} />
                      <span className="pc-chip">{PLAN[open.plan_tier] || open.plan_tier}</span>
                      {myOrgId && open.id === myOrgId && <span className="pc-chip accent">Your own workspace</span>}
                    </div>
                  </div>
                  <div className="pc-detail-actions">
                    {open.status === 'active' && (myOrgId && open.id === myOrgId
                      ? <button className="pc-btn sm" onClick={() => nav('/workspace')} title="Opens with your normal access">Open workspace</button>
                      : <button className="pc-btn sm primary" disabled={guesting} onClick={() => guestIntoOrg(open)}>{guesting ? 'Entering…' : 'Guest in'}</button>)}
                    <button className="pc-btn sm" disabled={testing || open.status !== 'active'} onClick={() => testSuites(open)} title={open.status !== 'active' ? 'Only an active workspace can be checked' : 'Count-only reachability check per suite'}>{testing ? 'Checking…' : 'Check suites'}</button>
                    {open.status === 'active' && siteByOrg[open.id] && <button className="pc-btn sm" onClick={() => setModal('gateway')}>Card payments</button>}
                    {open.id !== FOUNDING_ORG_ID && <button className="pc-btn sm" onClick={() => setModal('billing')}>Billing</button>}
                    {open.id !== FOUNDING_ORG_ID && <button className="pc-btn sm danger" onClick={() => setModal('delete')}>Delete</button>}
                  </div>
                </header>

                <div className="pc-detail-body">
                  <Facts items={[
                    ['Plan', PLAN[open.plan_tier] || open.plan_tier],
                    ['Status', STATUS_LABEL[open.status] || open.status],
                    ['Staff', String(staffCount[open.id] || 0)],
                    ['Country', countryName(open.country || 'NG')],
                    ['Since', fmtDate(open.created_at)],
                    open.current_period_end && ['Renews', fmtDate(open.current_period_end)],
                    ['Website', <WebsiteLink org={open} site={siteByOrg[open.id]} themes={themes} />],
                    ['Collected', naira(collected)],
                  ]} />

                  <div>
                    <div className="pc-sub-title">Suite check{suiteResults[open.id] ? ` · ${ago(suiteResults[open.id].at)} ago` : ''}</div>
                    {!suiteResults[open.id] ? (
                      <p className="pc-faint" style={{ fontSize: 12.5, margin: 0 }}>Not checked yet. "Check suites" asks each suite for a row count and nothing else, so it confirms the workspace answers without showing anyone's data.</p>
                    ) : (
                      <div className="pc-suite-grid">
                        {suiteResults[open.id].results.map((r) => (
                          <div key={r.key} className={`pc-suite${r.ok ? '' : ' err'}`} title={r.ok ? `${r.count} rows` : r.error || 'error'}>
                            <span>{suiteName(r.key)}</span><b>{r.ok ? r.count : 'error'}</b>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="pc-sub-title">Money · {orgTx.length} transaction{orgTx.length === 1 ? '' : 's'}</div>
                    {orgTx.length === 0 ? (
                      <p className="pc-faint" style={{ fontSize: 12.5, margin: 0 }}>No payments yet. Activation fees, renewals and seat credits will list here.</p>
                    ) : (
                      <div className="pc-panel pc-tablewrap" style={{ boxShadow: 'none' }}>
                        <table className="pc-table collapsible">
                          <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th className="num">Amount</th><th>Status</th></tr></thead>
                          <tbody>
                            {orgTx.slice(0, 8).map((t) => (
                              <tr key={t.id}>
                                <td className="pc-dim" style={{ fontSize: 12.5 }}>{fmtDate(t.created_at)}</td>
                                <td>{TX_TYPE[t.type] || t.type}</td>
                                <td className="pc-mono pc-dim" style={{ fontSize: 11.5 }}>{t.reference}</td>
                                <td className="num" style={{ fontWeight: 600 }}>{naira(t.amount_kobo)}</td>
                                <td><span className="pc-pill"><span className="pc-dot" style={{ background: t.status === 'confirmed' ? 'var(--ok)' : t.status === 'pending' ? 'var(--warn)' : t.status === 'refunded' ? 'var(--err)' : 'var(--faint)' }} />{t.status}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <ProductFeedback flash={flash} />

      {modal === 'delete' && open && <DeleteOrgModal org={open} busy={deleting} onClose={() => setModal(null)} onConfirm={deleteOrg} />}
      {modal === 'gateway' && open && <GatewayModal org={open} onClose={() => setModal(null)} flash={flash} />}
      {modal === 'billing' && open && <BillingModal org={open} flash={flash} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {toastNode}
    </>
  );
}

// Which suites the public can try at /try/<suite>, the funnel, and what
// triers and real customers wrote. The "what should we fix next" panel.
function ProductFeedback({ flash }) {
  const [rows, setRows] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [starts, setStarts] = useState({});
  const [realFb, setRealFb] = useState([]);
  const load = () => { apiGet('/platform/demo-suites').then((d) => { setRows(d.demoSuites || []); setFeedback(d.feedback || []); setStarts(d.starts || {}); setRealFb(d.realFeedback || []); }).catch(() => {}); };
  useEffect(load, []);
  const toggle = async (r) => {
    try { await apiPost('/platform/demo-suites', { suiteKey: r.suite_key, enabled: !r.enabled }); load(); }
    catch (e) { flash(e.message, true); }
  };
  if (!rows.length && !realFb.length && !feedback.length) return null;
  const fbFor = (k) => feedback.filter((x) => x.suite_key === k);
  const comments = feedback.filter((f) => f.comment && f.comment.trim());

  return (
    <section className="pc-section" style={{ marginTop: 30 }}>
      <SectionHead title="Product feedback" count={`${realFb.length} from customers · ${feedback.length} from demo triers`} />
      <div className="pc-grid-2">
        <div className="pc-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 16px 10px' }}>
            <h3 className="pc-card-title">Public demos</h3>
            <p className="pc-card-sub" style={{ margin: '2px 0 0' }}>Open suites show as "Try it" on the landing page. Low ease means the suite or its tour confuses people; low would-pay means the value is not landing.</p>
          </div>
          <div className="pc-tablewrap">
            <table className="pc-table">
              <thead><tr><th>Suite</th><th>Demo</th><th className="num">Starts</th><th className="num">Replies</th><th className="num">Ease</th><th>Would pay</th></tr></thead>
              <tbody>
                {[...rows].sort((a, b) => (starts[b.suite_key] || 0) - (starts[a.suite_key] || 0)).map((r) => {
                  const f = fbFor(r.suite_key); const st = starts[r.suite_key] || 0;
                  const ease = f.length ? f.reduce((a, b) => a + b.ease, 0) / f.length : null;
                  const yes = f.filter((x) => x.would_pay === 'yes').length; const maybe = f.filter((x) => x.would_pay === 'maybe').length;
                  return (
                    <tr key={r.suite_key}>
                      <td style={{ fontWeight: 550 }}>{suiteName(r.suite_key)}</td>
                      <td><button className={`pc-btn sm${r.enabled ? ' primary' : ''}`} onClick={() => toggle(r)}>{r.enabled ? 'Open' : 'Closed'}</button></td>
                      <td className="num">{st}</td>
                      <td className="num">{f.length}{st ? <span className="pc-faint"> · {Math.round((f.length / st) * 100)}%</span> : ''}</td>
                      <td className="num" style={ease != null && ease < 3.5 ? { color: 'var(--warn)', fontWeight: 600 } : {}}>{ease != null ? ease.toFixed(1) : '—'}</td>
                      <td className="pc-dim" style={{ fontSize: 12.5 }}>{f.length ? `${yes} yes · ${maybe} maybe · ${f.length - yes - maybe} no` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="pc-card" style={{ padding: 0 }}>
          <div style={{ padding: '14px 16px 6px' }}><h3 className="pc-card-title">In their own words</h3><p className="pc-card-sub" style={{ margin: '2px 0 0' }}>Customers inside the product first, then demo triers.</p></div>
          {realFb.length === 0 && comments.length === 0 && <div className="pc-empty">No written feedback yet. Ratings with a comment appear here.</div>}
          {realFb.slice(0, 12).map((f) => (
            <div key={f.id} className="pc-rowline" style={{ alignItems: 'flex-start', fontSize: 13 }}>
              <div style={{ minWidth: 0 }}>
                <div><b>{f.org?.name || 'Customer'}</b> <span className="pc-dim">· {suiteName(f.suite_key)} · {f.rating}/5 · {fmtDate(f.created_at)}</span></div>
                <div style={{ color: 'var(--dim)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.comment || 'No comment, rating only.'}</div>
              </div>
            </div>
          ))}
          {comments.slice(0, 12).map((f) => (
            <div key={f.id} className="pc-rowline" style={{ alignItems: 'flex-start', fontSize: 13 }}>
              <div style={{ minWidth: 0 }}>
                <div><b>Demo trier</b> <span className="pc-dim">· {suiteName(f.suite_key)} · ease {f.ease}/5 · would pay: {f.would_pay} · {fmtDate(f.created_at)}</span></div>
                <div style={{ color: 'var(--dim)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{f.comment}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
