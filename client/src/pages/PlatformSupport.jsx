// Support tickets get their OWN page in Platform Control — a queue you work,
// not a panel buried mid-scroll on the overview ("ticket should have its own
// page" — founder). Same RLS-gated routes tenants use: platform admins read
// and answer every org's tickets; a reply lands in the tenant's thread as
// "Collarone support" and flips the ticket to their turn.
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '../api/client.js';
import PlatformShell from '../components/PlatformShell.jsx';
import { useToast } from '../components/ui.jsx';

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const CATEGORY = { bug: 'Broken', billing: 'Billing', how_to: 'How-to', feature: 'Feature', other: 'Other' };

export default function PlatformSupport() {
  const { flash, toastNode } = useToast();
  const [tickets, setTickets] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [messages, setMessages] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('active'); // active | open | resolved | all

  const load = () => {
    Promise.all([apiGet('/support/tickets'), apiGet('/platform/organizations')])
      .then(([t, o]) => { setTickets(t.tickets || []); setOrgs(o.organizations || []); })
      .catch((e) => flash(e.message, true));
  };
  useEffect(load, []);
  const orgName = (id) => orgs.find((o) => o.id === id)?.name || '—';

  const openThread = (t) => {
    const next = openId === t.id ? null : t.id;
    setOpenId(next); setMessages(null); setReply('');
    if (next) apiGet(`/support/tickets/${t.id}/messages`).then((d) => setMessages(d.messages)).catch(() => setMessages([]));
  };
  const send = async (t) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/support/tickets/${t.id}/messages`, { body: reply, asPlatform: true });
      setReply(''); load();
      apiGet(`/support/tickets/${t.id}/messages`).then((d) => setMessages(d.messages)).catch(() => {});
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };
  const resolve = async (t) => {
    setBusy(true);
    try { await apiPatch(`/support/tickets/${t.id}`, { status: 'resolved' }); load(); }
    catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const needsUs = (tickets || []).filter((t) => t.status === 'open').length;
  const visible = (tickets || []).filter((t) => (
    filter === 'all' ? true
      : filter === 'open' ? t.status === 'open'
        : filter === 'resolved' ? t.status === 'resolved'
          : t.status !== 'resolved'));

  return (
    <PlatformShell>
      <section className="pc-section">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Support tickets</h1>
          <span className="pc-dim" style={{ fontSize: 13 }}>
            {needsUs > 0 ? `${needsUs} waiting on us` : 'nothing waiting on us'}
          </span>
          <span className="pc-sec-spacer" />
          {['active', 'open', 'resolved', 'all'].map((f) => (
            <button key={f} className={`pc-btn sm${filter === f ? ' primary' : ''}`} onClick={() => setFilter(f)}>
              {f === 'active' ? 'Active' : f === 'open' ? 'Needs reply' : f === 'resolved' ? 'Resolved' : 'All'}
            </button>
          ))}
        </div>

        {tickets == null && <p className="pc-dim" style={{ fontSize: 13 }}>Loading…</p>}
        {tickets != null && visible.length === 0 && (
          <p className="pc-dim" style={{ fontSize: 13 }}>
            {filter === 'active' ? 'Inbox zero — no active tickets.' : 'Nothing here.'}
          </p>
        )}

        {visible.map((t) => (
          <div key={t.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
            <button onClick={() => openThread(t)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.subject}</span>
              <span className="pc-dim" style={{ fontSize: 12 }}>{orgName(t.org_id)} · {CATEGORY[t.category] || t.category}</span>
              <span className="pc-sec-spacer" />
              <span className="pc-dim" style={{ fontSize: 11.5 }}>{fmtDateTime(t.updated_at)}</span>
              <span className="pc-dim" style={{ fontSize: 11.5 }}>
                <span className="pc-dot" style={{ background: t.status === 'open' ? '#e8b23f' : t.status === 'pending' ? 'var(--ok)' : 'var(--faint)', marginRight: 6 }} />
                {t.status === 'open' ? 'needs reply' : t.status === 'pending' ? 'their turn' : 'resolved'}
              </span>
            </button>
            {openId === t.id && (
              <div style={{ padding: '0 14px 12px' }}>
                {messages == null && <p className="pc-dim" style={{ fontSize: 12.5 }}>Loading thread…</p>}
                {(messages || []).map((m) => (
                  <div key={m.id} style={{ fontSize: 13, lineHeight: 1.6, padding: '7px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="pc-dim" style={{ fontSize: 11.5 }}>{m.is_platform ? 'Collarone' : 'Customer'} · {fmtDateTime(m.created_at)}: </span>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input className="pc-input" style={{ flex: 1 }} value={reply} placeholder="Reply as Collarone support…"
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(t); } }} />
                  <button className="pc-btn sm primary" disabled={busy || !reply.trim()} onClick={() => send(t)}>Send</button>
                  {t.status !== 'resolved' && <button className="pc-btn sm" disabled={busy} onClick={() => resolve(t)}>Resolve</button>}
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
      {toastNode}
    </PlatformShell>
  );
}
