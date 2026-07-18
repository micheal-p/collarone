import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { answerQuestion } from './chatKnowledge';

/* =========================================================================
   Collarone assistant — floating chat on the landing page. Fully in-house:
   answers come from the grounded knowledge base in chatKnowledge.js (no
   external AI, no API keys, works offline-of-backend). It computes real
   price quotes, and anything it can't answer confidently escalates to a
   human: WhatsApp · call · the contact desk. Never a dead end.
   ========================================================================= */

const WA = 'https://wa.me/2348148128551';
const TEL = 'tel:+2348148128551';

const QUICK_CHIPS = [
  'What does Collarone cost?',
  'What suites are included?',
  'Can it write company letters?',
  'Talk to a human',
];

// Only explicit "get me a person" asks skip the knowledge base — product
// questions containing words like "support" go through the engine, which has
// its own escalation for what it can't answer.
const isHumanAsk = (t) => /\b(human|agent|(talk|speak|chat)\s+(to|with)\s+(a\s+)?(human|person|someone|agent|rep)|call me|customer (care|service)|real person|complain(t)?)\b/i.test(t);

function HumanCard() {
  return (
    <div className="clw-human">
      <div className="clw-human-t">Talk to a person</div>
      <a className="clw-human-btn wa" href={`${WA}?text=${encodeURIComponent('Hello Collarone — I was chatting on your website and I’d like to talk to someone.')}`} target="_blank" rel="noreferrer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.87 9.87 0 0 0 4.74 1.21c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2z"/></svg>
        WhatsApp us — fastest
      </a>
      <a className="clw-human-btn" href={TEL}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .6 3a2 2 0 0 1-.5 2L8 10a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2-.5c1 .3 2 .5 3 .6a2 2 0 0 1 1.7 2z"/></svg>
        Call 0814 812 8551
      </a>
      <a className="clw-human-btn" href="/contact">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M4 4h16v16H4z"/><path d="M4 6l8 7 8-7"/></svg>
        Message the team — contact desk
      </a>
    </div>
  );
}

export default function ChatWidget({ visible = true }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('cl_chat') || 'null') || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showHuman, setShowHuman] = useState(false);
  const [chips, setChips] = useState(QUICK_CHIPS);
  const bodyRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    try { sessionStorage.setItem('cl_chat', JSON.stringify(msgs.slice(-20))); } catch { /* private mode */ }
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, showHuman, open, chips]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const send = (text) => {
    const content = (text || input).trim();
    if (!content || busy) return;
    setInput('');
    setChips([]);
    if (isHumanAsk(content) && content.length < 60) {
      setMsgs((m) => [...m, { role: 'user', content }, { role: 'assistant', content: 'Of course — here’s the team, pick whichever suits you:' }]);
      setShowHuman(true);
      return;
    }
    setMsgs((m) => [...m, { role: 'user', content }]);
    setBusy(true);
    const { reply, human, chips: next } = answerQuestion(content);
    // A short beat before replying keeps the exchange feeling conversational.
    timerRef.current = setTimeout(() => {
      setMsgs((m) => [...m, { role: 'assistant', content: reply }]);
      if (human) setShowHuman(true);
      setChips(next || []);
      setBusy(false);
    }, 450 + Math.min(650, reply.length * 3));
  };

  return (
    <>
      <AnimatePresence>
        {visible && !open && (
          <motion.button
            type="button" className="cl-wa-float" aria-label="Chat with us"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.9 }}
            transition={{ duration: 0.25 }}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z" /></svg>
            <span>Chat with us</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            className="clw" role="dialog" aria-label="Collarone assistant"
            initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.3, 1] }}
          >
            <div className="clw-head">
              <span className="clw-dot" aria-hidden="true" />
              <div>
                <div className="clw-title">Collarone assistant</div>
                <div className="clw-sub">Ask anything about the platform</div>
              </div>
              <button type="button" className="clw-x" aria-label="Close chat" onClick={() => setOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 5l14 14M19 5L5 19" /></svg>
              </button>
            </div>

            <div className="clw-body" ref={bodyRef}>
              {msgs.length === 0 && (
                <div className="clw-msg bot">
                  Welcome! I can explain what Collarone does, what it costs, and how to get your company set up — or hand you straight to a human. What would you like to know?
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`clw-msg ${m.role === 'user' ? 'me' : 'bot'}`}>{m.content}</div>
              ))}
              {busy && <div className="clw-msg bot clw-typing"><span /><span /><span /></div>}
              {showHuman && <HumanCard />}
              {!busy && chips.length > 0 && (
                <div className="clw-chips">
                  {chips.map((c) => (
                    <button key={c} type="button" className="clw-chip" onClick={() => send(c)}>{c}</button>
                  ))}
                </div>
              )}
            </div>

            <form className="clw-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <input
                value={input} onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question…" aria-label="Message" maxLength={1000}
              />
              <button type="submit" aria-label="Send" disabled={busy || !input.trim()}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
