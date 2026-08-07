// Tenant → Collarone support tickets. WhatsApp stays for quick questions —
// this exists because a ticket is a RECORD: numbered, threaded, statused,
// attached to the workspace, visible to the raiser and their admin, and
// answerable from Platform Control. Deliberately small: no priorities or SLA
// timers until real volume earns them.
import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet, apiPost, apiPatch } from '../api/client.js';
import { useToast } from '../components/ui.jsx';

const CATEGORIES = [
  ['bug', 'Something is broken'],
  ['billing', 'Billing or payment'],
  ['how_to', 'How do I…'],
  ['feature', 'Feature request'],
  ['other', 'Something else'],
];
const CAT_LABEL = Object.fromEntries(CATEGORIES);
const STATUS_PILL = {
  open: { label: 'Open — with Collarone', cls: 'st-warn' },
  pending: { label: 'Answered — your turn', cls: 'st-success' },
  resolved: { label: 'Resolved', cls: 'st-neutral' },
};

function StatusPill({ status }) {
  const s = STATUS_PILL[status] || STATUS_PILL.open;
  return <span className={`st-pill ${s.cls}`}>{s.label}</span>;
}

const fmtDt = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function Thread({ ticket, me, onChanged, flash }) {
  const [messages, setMessages] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => apiGet(`/support/tickets/${ticket.id}/messages`).then((d) => setMessages(d.messages)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, [ticket.id]); // eslint-disable-line

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try { await apiPost(`/support/tickets/${ticket.id}/messages`, { body: reply }); setReply(''); load(); onChanged(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };
  const close = async () => {
    setBusy(true);
    try { await apiPatch(`/support/tickets/${ticket.id}`, { status: 'resolved' }); flash('Ticket closed. Reply anytime to reopen it.'); onChanged(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ padding: 18, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ fontWeight: 650, fontSize: 15 }}>{ticket.subject}</div>
        <StatusPill status={ticket.status} />
        <span className="muted" style={{ fontSize: 12 }}>{CAT_LABEL[ticket.category] || ticket.category}</span>
      </div>
      {messages == null && <div className="suite-loading"><div className="boot-spinner" /></div>}
      {messages != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '12px 0' }}>
          {messages.map((m) => (
            <div key={m.id} style={{
              alignSelf: m.is_platform ? 'flex-start' : 'flex-end',
              maxWidth: '82%', borderRadius: 10, padding: '9px 13px', fontSize: 13.5, lineHeight: 1.6,
              background: m.is_platform ? 'var(--surface-2)' : 'var(--brand)',
              color: m.is_platform ? 'inherit' : '#fff',
              border: m.is_platform ? '1px solid var(--line)' : 'none',
            }}>
              <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 3 }}>
                {m.is_platform ? 'Collarone support' : (m.author_id === me?.id ? 'You' : 'Your workspace')} · {fmtDt(m.created_at)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={send} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea className="input" rows={2} style={{ flex: 1, resize: 'vertical' }} value={reply}
          placeholder={ticket.status === 'resolved' ? 'Replying reopens this ticket…' : 'Write a reply…'}
          onChange={(e) => setReply(e.target.value)} />
        <button className="btn btn-primary" disabled={busy || !reply.trim()}>Send</button>
      </form>
      {ticket.status !== 'resolved' && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={close}>
          This is sorted — close the ticket
        </button>
      )}
    </div>
  );
}

export default function Support() {
  const { user } = useAuth();
  const { flash, toastNode } = useToast();
  const [tickets, setTickets] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'bug', body: '' });
  const [busy, setBusy] = useState(false);

  const load = () => apiGet('/support/tickets').then((d) => setTickets(d.tickets)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { ticket } = await apiPost('/support/tickets', form);
      setForm({ subject: '', category: 'bug', body: '' });
      setCreating(false);
      flash('Ticket raised — we will reply here, and your workspace admin can see it too.');
      await load();
      setOpenId(ticket.id);
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  const open = tickets?.find((t) => t.id === openId) || null;

  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Support' }]} title="Contact Collarone support">
      <div style={{ maxWidth: 720 }}>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
          Raise anything — a bug, a billing question, a how-do-I. Every ticket keeps its full history here.
          Urgent? WhatsApp <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">0814 812 8551</a> and raise the ticket after, so the record exists.
        </p>

        {!creating && <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setCreating(true)}>New ticket</button>}
        {creating && (
          <form onSubmit={create} className="card" style={{ padding: 18, marginBottom: 16 }}>
            <div className="form-grid">
              <div className="field"><label>Subject</label>
                <input className="input" value={form.subject} onChange={(e) => setForm((s) => ({ ...s, subject: e.target.value }))} placeholder="Payslip email never arrived" required maxLength={140} />
              </div>
              <div className="field"><label>Category</label>
                <select className="input" value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}>
                  {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="field"><label>What happened?</label>
              <textarea className="input" rows={4} value={form.body} onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))}
                placeholder="What you did, what you expected, what happened instead. Screenshots help — describe what they show." required />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Raising…' : 'Raise ticket'}</button>
            </div>
          </form>
        )}

        {tickets == null && <div className="suite-loading"><div className="boot-spinner" /></div>}
        {tickets != null && tickets.length === 0 && !creating && (
          <p className="muted" style={{ fontSize: 13 }}>No tickets yet. When you raise one, its whole history lives here.</p>
        )}
        {tickets != null && tickets.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Subject</th><th>Status</th><th>Last activity</th></tr></thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} onClick={() => setOpenId(openId === t.id ? null : t.id)} style={{ cursor: 'pointer', background: openId === t.id ? 'var(--surface-2)' : undefined }}>
                    <td style={{ fontWeight: 550 }}>{t.subject}</td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="muted" style={{ fontSize: 12.5 }}>{fmtDt(t.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {open && <Thread ticket={open} me={user} onChanged={load} flash={flash} />}
      </div>
      {toastNode}
    </AppLayout>
  );
}
