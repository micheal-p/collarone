// Everything the public sends us, plus what breaks in real browsers.
//
// Messages and demo requests are read like mail: a list, a reading pane, the
// ways to reach the person, and "Mark as replied" once you have. No sending
// happens here, nothing in this codebase sends on the operator's behalf; the
// buttons open WhatsApp, mail or the phone, which is the real channel.
//
// App errors are grouped by message so a crash loop reads as one row, and a
// group is resolved only when every row in it is. A fresh occurrence of an
// old message reopens it, which is exactly what "it came back" should do.
import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../api/client.js';
import { waLink } from '../../lib/whatsapp.js';
import { useToast } from '../../components/ui.jsx';
import { usePlatformCounts } from '../../components/PlatformShell.jsx';
import { DAY_MS, Empty, SectionHead, Seg, ago, fmtDateTime } from './shared.jsx';

export default function Inbox() {
  const { flash, toastNode } = useToast();
  const { refreshCounts } = usePlatformCounts();
  const [view, setView] = useState('messages');
  const [messages, setMessages] = useState(null);
  const [errors, setErrors] = useState([]);
  const [filter, setFilter] = useState('new');
  const [openId, setOpenId] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    apiGet('/platform/contact-messages').then((d) => setMessages(d.messages || [])).catch((e) => flash(e.message, true));
    apiGet('/platform/client-errors').then((d) => setErrors(d.errors || [])).catch(() => {});
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const all = messages || [];
  const newCount = all.filter((m) => m.status === 'new').length;
  const demoCount = all.filter((m) => m.kind === 'demo' && m.status === 'new').length;
  const visible = useMemo(() => all.filter((m) => (filter === 'new' ? m.status === 'new' : filter === 'demo' ? m.kind === 'demo' : true)), [all, filter]);
  const open = all.find((m) => m.id === openId) || null;
  useEffect(() => {
    if (openId || visible.length === 0) return;
    if (window.matchMedia('(max-width: 900px)').matches) return;
    setOpenId(visible[0].id);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const markReplied = async (m) => {
    setBusy(true);
    try {
      await apiPost(`/platform/contact-messages/${m.id}/reply`);
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, status: 'replied', replied_at: new Date().toISOString() } : x)));
      refreshCounts();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  const grouped = useMemo(() => {
    const m = new Map();
    errors.forEach((e) => {
      const g = m.get(e.message);
      if (g) { g.count += 1; if (e.occurred_at > g.last) g.last = e.occurred_at; if (e.occurred_at < g.first) g.first = e.occurred_at; if (!e.resolved_at) g.resolved = false; }
      else m.set(e.message, { ...e, count: 1, first: e.occurred_at, last: e.occurred_at, resolved: Boolean(e.resolved_at) });
    });
    return [...m.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [errors]);
  const openGroups = grouped.filter((g) => !g.resolved);
  const weekCount = errors.filter((e) => !e.resolved_at && Date.now() - new Date(e.occurred_at).getTime() < 7 * DAY_MS).length;
  const resolve = async (g) => {
    setBusy(true);
    try { await apiPost('/platform/client-errors/resolve', { message: g.message }); load(); refreshCounts(); }
    catch (e) { flash(e.message, true); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="pc-toolbar">
        <Seg label="Inbox" value={view} onChange={setView} options={[['messages', 'Messages', newCount], ['errors', 'App errors', openGroups.length]]} />
        <span className="pc-sec-spacer" />
        {view === 'messages'
          ? <Seg label="Show" value={filter} onChange={setFilter} options={[['new', 'New', newCount], ['demo', 'Demo visits', demoCount], ['all', 'All']]} />
          : <button className="pc-btn sm" onClick={() => setShowResolved((v) => !v)}>{showResolved ? 'Hide resolved' : 'Show resolved'}</button>}
      </div>

      {view === 'messages' && (
        messages != null && all.length === 0 ? (
          <div className="pc-card"><Empty title="No messages yet">Anything sent through the contact page or a demo request lands here the moment it is submitted.</Empty></div>
        ) : (
          <div className={`pc-split${open ? ' has-open' : ''}`}>
            <aside className="pc-list" aria-label="Messages">
              {messages == null && <div className="pc-empty">Loading…</div>}
              {messages != null && visible.length === 0 && <div className="pc-empty">{filter === 'new' ? 'No new messages. You are caught up.' : filter === 'demo' ? 'No demo requests yet.' : 'Nothing here.'}</div>}
              {visible.map((m) => (
                <button key={m.id} className={`pc-list-item${m.id === openId ? ' active' : ''}`} onClick={() => setOpenId(m.id)} style={{ opacity: m.status === 'replied' ? 0.7 : 1 }}>
                  <span className="pc-dot" style={{ background: m.status === 'new' ? 'var(--accent)' : 'var(--faint)' }} title={m.status === 'new' ? 'New' : 'Replied'} />
                  <span className="pc-list-main">
                    <span className="pc-list-title">{m.name}{m.company ? <span className="pc-dim" style={{ fontWeight: 400 }}> · {m.company}</span> : ''}</span>
                    <span className="pc-list-sub">{m.kind === 'demo' ? <span className="pc-chip accent" style={{ marginRight: 6 }}>Demo visit</span> : null}{m.message}</span>
                  </span>
                  <span className="pc-list-when">{ago(m.created_at)}</span>
                </button>
              ))}
            </aside>

            <section className="pc-thread" style={{ maxHeight: 'none', minHeight: 320 }}>
              {!open ? <div className="pc-empty" style={{ padding: '60px 20px' }}>Pick a message to read it.</div> : (
                <>
                  <header className="pc-detail-head">
                    <button className="pc-btn sm pc-thread-back" onClick={() => setOpenId(null)}>← Inbox</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 className="pc-detail-title">{open.name}</h2>
                      <div className="pc-detail-sub">
                        {open.company && <span>{open.company}</span>}
                        {open.kind === 'demo' && <span className="pc-chip accent">Demo visit request</span>}
                        <span className={`pc-chip${open.status === 'new' ? ' accent' : ' ok'}`}>{open.status === 'new' ? 'New' : `Replied ${fmtDateTime(open.replied_at)}`}</span>
                        <span className="pc-faint">{fmtDateTime(open.created_at)}</span>
                      </div>
                    </div>
                    {open.status === 'new' && <button className="pc-btn sm primary" disabled={busy} onClick={() => markReplied(open)}>Mark as replied</button>}
                  </header>
                  <div className="pc-detail-body">
                    {open.kind === 'demo' && (
                      <dl className="pc-visit" style={{ margin: 0 }}>
                        {open.location && <div><dt>Visit address</dt><dd><a href={`https://maps.google.com/?q=${encodeURIComponent(open.location)}`} target="_blank" rel="noreferrer">{open.location}</a></dd></div>}
                        {open.preferred_at && <div><dt>Wants</dt><dd>{fmtDateTime(open.preferred_at)}</dd></div>}
                        {open.staff_count && <div><dt>Staff</dt><dd>{open.staff_count}</dd></div>}
                        {open.interest && <div><dt>Pain point</dt><dd>{open.interest}</dd></div>}
                      </dl>
                    )}
                    <div className="pc-msg-full">{open.message}</div>
                    <div>
                      <div className="pc-sub-title">Reach them</div>
                      <div className="pc-contact-row">
                        {open.phone && <a className="pc-btn sm" href={waLink(open.phone)} target="_blank" rel="noreferrer">WhatsApp {open.phone}</a>}
                        {open.email && <a className="pc-btn sm" href={`mailto:${open.email}?subject=${encodeURIComponent('Re: your message to Collarone')}`}>Email {open.email}</a>}
                        {open.phone && <a className="pc-btn sm" href={`tel:+${waLink(open.phone).split('/').pop()}`}>Call</a>}
                        {!open.phone && !open.email && <span className="pc-faint" style={{ fontSize: 12.5 }}>No contact details were left.</span>}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )
      )}

      {view === 'errors' && (
        <section className="pc-section">
          <SectionHead title="App errors" count={weekCount > 0 ? `${weekCount} this week, unresolved` : 'inbox zero'} />
          <div className="pc-panel">
            {grouped.length === 0 ? (
              <Empty title="No front-end errors reported">Crashes inside users' browsers are captured automatically and land here with the page and the stack.</Empty>
            ) : grouped.filter((g) => showResolved || !g.resolved).length === 0 ? (
              <Empty title="All error groups resolved">A new occurrence of an old message reopens its group automatically.</Empty>
            ) : grouped.filter((g) => showResolved || !g.resolved).map((g) => (
              <div key={g.id} className={`pc-err-row${g.resolved ? ' resolved' : ''}`}>
                <div className="pc-err-head">
                  <span className="pc-err-msg" onClick={() => setExpanded(expanded === g.id ? null : g.id)} title={g.stack ? 'Show stack' : undefined}>{g.message}</span>
                  {g.count > 1 && <span className="pc-chip err">×{g.count}</span>}
                  {g.resolved && <span className="pc-chip">resolved</span>}
                  {g.path && <span className="pc-mono pc-faint" style={{ fontSize: 11 }}>{g.path}</span>}
                  <span className="pc-faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>{g.count > 1 ? `${fmtDateTime(g.first)} → ` : ''}{fmtDateTime(g.last)}</span>
                  {!g.resolved && <button className="pc-btn sm" disabled={busy} onClick={() => resolve(g)}>Resolve</button>}
                </div>
                {expanded === g.id && g.stack && <pre className="pc-err-stack">{g.stack}</pre>}
              </div>
            ))}
          </div>
        </section>
      )}
      {toastNode}
    </>
  );
}
