// Team chat — "the chat where work lives", deliberately scoped: one General
// room + one per department, @mentions that notify (bell now; email/WhatsApp
// ride the dispatcher when the channels are switched on). No DMs, no threads,
// no presence — WhatsApp already owns general-purpose chat, and that's fine.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiGet } from '../api/client.js';
import { supabase } from '../lib/supabaseClient.js';
import AppLayout from '../components/AppLayout.jsx';
import { useKeyboardInset } from '../lib/keyboardInset.js';
import './TeamChat.css';

const initials = (n = '') => n.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function TeamChat() {
  const { user } = useAuth();
  const orgId = user?.org?.id;
  const [staff, setStaff] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [room, setRoom] = useState('general');
  const [messages, setMessages] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // @mention autocomplete state
  const [mentionQ, setMentionQ] = useState(null); // null = closed; '' or query = open
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const streamRef = useRef(null);
  useKeyboardInset();

  const staffByName = useMemo(() => staff.filter((s) => s.id !== user?.id), [staff, user]);

  // the realtime callback resolves message authors from staff; keep a ref so it
  // reads the current list without resubscribing every time staff loads/changes.
  const staffRef = useRef([]);
  useEffect(() => { staffRef.current = staff; }, [staff]);

  useEffect(() => {
    apiGet('/staff').then((d) => setStaff(d.staff || [])).catch(() => {});
    apiGet('/departments').then((d) => setDepartments((d.departments || []).filter((x) => x.active !== false))).catch(() => {});
  }, []);

  // load the room + subscribe to live inserts (RLS scopes the stream)
  useEffect(() => {
    let alive = true;
    setMessages(null);
    supabase.from('org_chat_messages').select('*, author:profiles!author_id(id, name)')
      .eq('room', room).order('created_at', { ascending: true }).limit(200)
      .then(({ data, error }) => { if (alive) { if (error) setErr(error.message); else setMessages(data || []); } });
    const ch = supabase.channel(`chat-${room}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'org_chat_messages', filter: `room=eq.${room}` }, (payload) => {
        const m = payload.new;
        if (m.org_id !== orgId) return;
        setMessages((ms) => {
          if (!ms || ms.some((x) => x.id === m.id)) return ms;
          const author = staffRef.current.find((s) => s.id === m.author_id);
          return [...ms, { ...m, author: author ? { id: author.id, name: author.name } : null }];
        });
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [room, orgId]); // eslint-disable-line

  // Jump to the newest message — but scroll the right box, and only when the
  // reader is already at the bottom. scrollIntoView() was doing neither: it
  // walks up and scrolls EVERY scrollable ancestor including the window, which
  // on a phone fights Safari's own scrolling, and it yanked you back down mid-
  // sentence if you were reading history when someone posted.
  const scrollerOf = (el) => (el && el.scrollHeight > el.clientHeight + 4 ? el : el?.closest('.content'));
  const nearBottom = () => {
    const s = scrollerOf(streamRef.current);
    if (!s) return true;
    return s.scrollHeight - s.scrollTop - s.clientHeight < 140;
  };
  const scrollToEnd = () => {
    const s = scrollerOf(streamRef.current);
    if (s) s.scrollTop = s.scrollHeight;
  };
  // Runs after the new message is in the DOM, so "near the bottom" already
  // includes its height — one message is well inside the 140px slack.
  useEffect(() => { if (nearBottom()) scrollToEnd(); }, [messages?.length]); // eslint-disable-line

  // ---- composer: parse @mentions --------------------------------------------
  const onBodyChange = (e) => {
    const v = e.target.value;
    setBody(v);
    const caret = e.target.selectionStart;
    const upto = v.slice(0, caret);
    const at = upto.match(/(?:^|\s)@([\w .-]{0,24})$/);
    setMentionQ(at ? at[1] : null);
  };
  const mentionMatches = mentionQ === null ? [] :
    staffByName.filter((s) => s.name.toLowerCase().includes(mentionQ.toLowerCase())).slice(0, 6);
  const pickMention = (s) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? body.length;
    const upto = body.slice(0, caret).replace(/@([\w .-]{0,24})$/, `@${s.name} `);
    setBody(upto + body.slice(caret));
    setMentionQ(null);
    el?.focus();
  };

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    // resolve @Full Name tokens to profile ids (longest names first so
    // "@Ada Obi" wins over "@Ada")
    const mentions = [];
    const sorted = [...staffByName].sort((a, b) => b.name.length - a.name.length);
    for (const s of sorted) {
      if (text.toLowerCase().includes(`@${s.name.toLowerCase()}`)) mentions.push(s.id);
    }
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('post_chat_message', { p_room: room, p_body: text, p_mentions: mentions });
      if (error) throw error;
      setBody('');
      setMessages((ms) => (ms && !ms.some((x) => x.id === data.id))
        ? [...ms, { ...data, author: { id: user.id, name: user.name } }] : ms);
      requestAnimationFrame(scrollToEnd); // your own message always pulls you down
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const rooms = [{ key: 'general', label: 'General' },
    ...departments.map((d) => ({ key: `dept:${d.id}`, label: d.name }))];

  const renderBody = (text) => {
    // bold the @mentions for readability
    const parts = [];
    let rest = text; let i = 0;
    const names = staffByName.map((s) => s.name).sort((a, b) => b.length - a.length);
    while (rest.length) {
      const idx = rest.indexOf('@');
      if (idx === -1) { parts.push(rest); break; }
      parts.push(rest.slice(0, idx));
      const after = rest.slice(idx);
      const hit = names.find((n) => after.toLowerCase().startsWith(`@${n.toLowerCase()}`));
      if (hit) { parts.push(<strong key={i++} className="chat-mention">@{hit}</strong>); rest = after.slice(hit.length + 1); }
      else { parts.push('@'); rest = after.slice(1); }
    }
    return parts;
  };

  let lastDay = '';
  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Team chat' }]} title="Team chat">
      <div className="chat">
        <div className="chat-rooms">
          <div className="chat-rooms-head">Rooms</div>
          {rooms.map((r) => (
            <button key={r.key} onClick={() => setRoom(r.key)}
              className={`chat-room${room === r.key ? ' on' : ''}`}>
              # {r.label}
            </button>
          ))}
        </div>

        <div className="chat-main">
          <div className="chat-stream" ref={streamRef}>
            {messages === null && <div className="suite-loading"><div className="boot-spinner" /></div>}
            {messages?.length === 0 && (
              <p className="muted chat-empty">
                Nothing here yet — say something. Type @ to mention a teammate; they get notified.
              </p>
            )}
            {(messages || []).map((m) => {
              const day = dayOf(m.created_at);
              const showDay = day !== lastDay; lastDay = day;
              return (
                <div key={m.id}>
                  {showDay && <div className="chat-daysep"><span>{day}</span></div>}
                  <div className="chat-msg">
                    <span className="avatar sm" style={{ flexShrink: 0 }}>{initials(m.author?.name || '?')}</span>
                    <div className="chat-msg-main">
                      <div className="chat-msg-head">
                        <strong>{m.author?.name || 'Someone'}</strong>
                        <span className="muted chat-msg-time">{timeOf(m.created_at)}</span>
                      </div>
                      <div className="chat-msg-body">{renderBody(m.body)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {err && <p className="chat-err">{err}</p>}
          <div className="chat-composer">
            {mentionQ !== null && mentionMatches.length > 0 && (
              <div className="chat-mentions">
                {mentionMatches.map((s) => (
                  <button key={s.id} onClick={() => pickMention(s)} className="chat-mention-item">
                    <span className="avatar sm">{initials(s.name)}</span>{s.name}
                  </button>
                ))}
              </div>
            )}
            <div className="chat-composer-row">
              <input ref={inputRef} value={body} onChange={onBodyChange} className="chat-input"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && mentionMatches.length === 0) { e.preventDefault(); send(); } if (e.key === 'Escape') setMentionQ(null); }}
                placeholder={`Message #${rooms.find((r) => r.key === room)?.label || 'General'} — @ to mention`} />
              <button className="btn btn-primary" disabled={busy || !body.trim()} onClick={send}>
                {busy ? <span className="spinner" /> : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
