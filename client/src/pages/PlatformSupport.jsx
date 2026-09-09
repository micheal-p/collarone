// Support tickets, worked as an inbox: the queue on the left, the
// conversation on the right, the reply box where the conversation ends.
// Same RLS-gated routes tenants use: platform admins read and answer every
// org's tickets; a reply lands in the tenant's thread as "Collarone support"
// and flips the ticket to their turn. On a phone the two panes become one:
// the list, then the thread with a way back.
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, apiPatch } from '../api/client.js';
import PlatformShell, { usePlatformCounts } from '../components/PlatformShell.jsx';
import { useToast } from '../components/ui.jsx';

const CATEGORY = { bug: 'Something broken', billing: 'Billing', how_to: 'How do I', feature: 'Feature request', other: 'Other' };
const STATUS = {
  open: { label: 'Needs our reply', dot: 'var(--warn)' },
  pending: { label: 'Waiting on them', dot: 'var(--ok)' },
  resolved: { label: 'Resolved', dot: 'var(--faint)' },
};
const FILTERS = [
  ['active', 'Active', (t) => t.status !== 'resolved'],
  ['open', 'Needs reply', (t) => t.status === 'open'],
  ['resolved', 'Resolved', (t) => t.status === 'resolved'],
  ['all', 'All', () => true],
];

// "2h", "3d", or the date, so the list scans by recency without a column of timestamps.
function ago(d) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d`;
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

export default function PlatformSupport() {
  const { flash, toastNode } = useToast();
  const { refreshCounts } = usePlatformCounts();
  const [tickets, setTickets] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [filter, setFilter] = useState('active');
  const [openId, setOpenId] = useState(null);
  const [messages, setMessages] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const threadEnd = useRef(null);

  const load = () => {
    Promise.all([apiGet('/support/tickets'), apiGet('/platform/organizations')])
      .then(([t, o]) => { setTickets(t.tickets || []); setOrgs(o.organizations || []); })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);
  useEffect(() => { const id = setInterval(load, 60000); return () => clearInterval(id); }, []);

  const orgName = (id) => orgs.find((o) => o.id === id)?.name || 'Unknown organization';
  const visible = useMemo(() => (tickets || []).filter(FILTERS.find(([k]) => k === filter)[2]), [tickets, filter]);
  const open = (tickets || []).find((t) => t.id === openId) || null;
  const needsUs = (tickets || []).filter((t) => t.status === 'open').length;

  const loadThread = (id) => {
    setMessages(null);
    apiGet(`/support/tickets/${id}/messages`).then((d) => setMessages(d.messages || [])).catch(() => setMessages([]));
  };
  const select = (t) => { setOpenId(t.id); setReply(''); loadThread(t.id); };
  // On a desktop the right pane should never sit empty: open the oldest
  // ticket that needs our reply as soon as the list arrives. Phones keep the
  // list first, since there the thread replaces it.
  useEffect(() => {
    if (openId || !tickets || tickets.length === 0) return;
    if (window.matchMedia('(max-width: 900px)').matches) return;
    const first = [...tickets].filter((t) => t.status === 'open').sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))[0] || tickets[0];
    select(first);
  }, [tickets]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  const send = async () => {
    if (!open || !reply.trim()) return;
    setBusy(true);
    try {
      await apiPost(`/support/tickets/${open.id}/messages`, { body: reply, asPlatform: true });
      setReply('');
      loadThread(open.id); load(); refreshCounts();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };
  const setStatus = async (status) => {
    if (!open) return;
    setBusy(true);
    try {
      await apiPatch(`/support/tickets/${open.id}`, { status });
      flash(status === 'resolved' ? 'Ticket resolved.' : 'Ticket reopened.');
      load(); refreshCounts();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const filters = (
    <div className="pc-seg" role="tablist" aria-label="Show">
      {FILTERS.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{label}</button>
      ))}
    </div>
  );

  return (
    <PlatformShell
      title="Support"
      subtitle={tickets == null ? 'Loading tickets…' : needsUs > 0 ? `${needsUs} ticket${needsUs === 1 ? '' : 's'} waiting on us.` : 'Nothing waiting on us.'}
      actions={filters}
    >
      {error && <p className="pc-note" style={{ color: 'var(--err)' }}>{error}</p>}

      {tickets != null && tickets.length === 0 ? (
        <div className="pc-card pc-empty-wide">
          <h2 className="pc-card-title">No tickets yet</h2>
          <p>Customers raise tickets from Support inside their workspace. Each one shows up here the moment it is sent, and your reply lands back in their thread as Collarone support.</p>
        </div>
      ) : (
        <div className={`pc-split${open ? ' has-open' : ''}`}>
          <aside className="pc-list" aria-label="Tickets">
            {tickets == null && <div className="pc-empty">Loading…</div>}
            {tickets != null && visible.length === 0 && (
              <div className="pc-empty">{filter === 'open' ? 'Nothing needs a reply.' : filter === 'resolved' ? 'Nothing resolved yet.' : 'No active tickets.'}</div>
            )}
            {visible.map((t) => (
              <button key={t.id} className={`pc-list-item${t.id === openId ? ' active' : ''}`} onClick={() => select(t)}>
                <span className="pc-dot" style={{ background: STATUS[t.status]?.dot || 'var(--faint)' }} title={STATUS[t.status]?.label} />
                <span className="pc-list-main">
                  <span className="pc-list-title">{t.subject}</span>
                  <span className="pc-list-sub">{orgName(t.org_id)} · {CATEGORY[t.category] || t.category}</span>
                </span>
                <span className="pc-list-when">{ago(t.updated_at)}</span>
              </button>
            ))}
          </aside>

          <section className="pc-thread" aria-live="polite">
            {!open ? (
              <div className="pc-empty" style={{ padding: '60px 20px' }}>Pick a ticket to read the conversation.</div>
            ) : (
              <>
                <header className="pc-thread-head">
                  <button className="pc-btn sm pc-thread-back" onClick={() => setOpenId(null)}>← Tickets</button>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 className="pc-card-title" style={{ fontSize: 15 }}>{open.subject}</h2>
                    <div className="pc-thread-meta">
                      <span>{orgName(open.org_id)}</span>
                      <span className="pc-badge">{CATEGORY[open.category] || open.category}</span>
                      <span className="pc-badge" style={{ color: STATUS[open.status]?.dot }}>{STATUS[open.status]?.label}</span>
                      <span className="pc-faint">opened {fmtDateTime(open.created_at)}</span>
                    </div>
                  </div>
                  {open.status !== 'resolved'
                    ? <button className="pc-btn sm" disabled={busy} onClick={() => setStatus('resolved')}>Resolve</button>
                    : <button className="pc-btn sm" disabled={busy} onClick={() => setStatus('open')}>Reopen</button>}
                </header>

                <div className="pc-messages">
                  {messages == null && <div className="pc-empty">Loading thread…</div>}
                  {messages != null && messages.length === 0 && <div className="pc-empty">The ticket has no messages yet.</div>}
                  {(messages || []).map((m) => (
                    <div key={m.id} className={`pc-msg${m.is_platform ? ' ours' : ''}`}>
                      <div className="pc-msg-body">{m.body}</div>
                      <div className="pc-msg-meta">{m.is_platform ? 'Collarone support' : orgName(open.org_id)} · {fmtDateTime(m.created_at)}</div>
                    </div>
                  ))}
                  <div ref={threadEnd} />
                </div>

                <div className="pc-composer">
                  <textarea
                    className="pc-input"
                    rows={2}
                    value={reply}
                    placeholder={open.status === 'resolved' ? 'Replying reopens the conversation for them…' : 'Reply as Collarone support…'}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  />
                  <div className="pc-composer-row">
                    <span className="pc-faint" style={{ fontSize: 11.5 }}>Enter sends, Shift+Enter for a new line.</span>
                    <button className="pc-btn primary" disabled={busy || !reply.trim()} onClick={send}>{busy ? 'Sending…' : 'Send reply'}</button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {toastNode}
    </PlatformShell>
  );
}
