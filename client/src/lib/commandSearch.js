// Record search for the workspace command bar. Each source is a suite's own
// api module, so what comes back is what this person may see in that suite.
// Lists are cached for a minute so typing does not refetch on every key.
import * as T from '../suites/tasks/taskApi.js';
import * as CRM from '../suites/crm/crmApi.js';
import * as D from '../suites/documents/documentsApi.js';
import * as TD from '../suites/tradeDocs/tradeDocsApi.js';

const TTL = 60_000;
const cache = new Map(); // key -> { at, rows }
async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  const rows = (await load()) || [];
  cache.set(key, { at: Date.now(), rows });
  return rows;
}
export const forgetSearchCache = () => cache.clear();

const money = (n) => (n == null ? '' : `₦${Number(n).toLocaleString('en-NG')}`);

const SOURCES = [
  {
    suite: 'tasks', load: () => cached('tasks', T.getTasks),
    match: (t, rx) => rx.test(t.title || '') || rx.test(t.description || ''),
    map: (t) => ({ id: `task-${t.id}`, suite: 'tasks', title: t.title, sub: `Task · ${t.status || ''}${t.due_date ? ` · due ${String(t.due_date).slice(0, 10)}` : ''}`, path: `/suite/tasks?q=${encodeURIComponent(t.title || '')}` }),
  },
  {
    suite: 'crm', load: () => cached('contacts', CRM.getContacts),
    match: (c, rx) => rx.test(c.name || '') || rx.test(c.email || '') || rx.test(c.phone || '') || rx.test(c.company?.name || ''),
    map: (c) => ({ id: `contact-${c.id}`, suite: 'crm', title: c.name, sub: `Customer${c.company?.name ? ` · ${c.company.name}` : ''}${c.phone ? ` · ${c.phone}` : ''}`, path: `/suite/crm?q=${encodeURIComponent(c.name || '')}` }),
  },
  {
    suite: 'documents', load: () => cached('documents', D.getDocuments),
    match: (d, rx) => rx.test(d.name || ''),
    map: (d) => ({ id: `doc-${d.id}`, suite: 'documents', title: d.name, sub: 'Document', path: `/suite/documents?q=${encodeURIComponent(d.name || '')}` }),
  },
  {
    suite: 'trade-docs', load: () => cached('trade-docs', TD.getDocuments),
    match: (d, rx) => rx.test(d.doc_no || '') || rx.test(d.party_name || ''),
    map: (d) => ({ id: `trade-${d.id}`, suite: 'trade-docs', title: `${d.doc_no || 'Document'} · ${d.party_name || ''}`, sub: `${(d.doc_type || 'document').replace(/_/g, ' ')} · ${TD.STATUS_LABELS?.[d.status] || d.status || ''}${d.total != null ? ` · ${money(d.total)}` : ''}`, path: `/suite/trade-docs?q=${encodeURIComponent(d.doc_no || d.party_name || '')}` }),
  },
];

// Up to three hits per source, sources this person can open only, and a
// failing source is simply absent from the answer.
export async function searchRecords(query, openableSuiteKeys) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const usable = SOURCES.filter((s) => openableSuiteKeys.includes(s.suite));
  const settled = await Promise.allSettled(usable.map((s) => s.load()));
  const out = [];
  usable.forEach((s, i) => {
    if (settled[i].status !== 'fulfilled') return;
    settled[i].value.filter((row) => s.match(row, rx)).slice(0, 3).forEach((row) => out.push(s.map(row)));
  });
  return out.slice(0, 9);
}
