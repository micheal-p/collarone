// Job-board poster approval queue. Companies register PENDING with vetting
// details and cannot post until approved here. Posters live behind the
// /api/job-post handler (admin actions authorised via platform_admins), not
// the Supabase route table.
import { useEffect, useMemo, useState } from 'react';
import { getAccessToken } from '../../api/client.js';
import { safeExternalUrl, EXTERNAL_LINK_REL } from '../../lib/safeUrl.js';
import { useToast } from '../../components/ui.jsx';
import { usePlatformCounts } from '../../components/PlatformShell.jsx';
import { Empty, Seg, fmtDate } from './shared.jsx';

const STATUS = { pending: ['Awaiting review', 'warn'], approved: ['Approved', 'ok'], suspended: ['Suspended', 'err'], rejected: ['Rejected', ''] };

export default function Jobs() {
  const { flash, toastNode } = useToast();
  const { refreshCounts } = usePlatformCounts();
  const [posters, setPosters] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);

  const postJob = async (bodyObj) => {
    const r = await fetch('/api/job-post', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken() || ''}` }, body: JSON.stringify(bodyObj) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || 'Something went wrong.');
    return d;
  };
  const load = () => postJob({ action: 'admin-list-posters' }).then((d) => setPosters(d.posters || [])).catch((e) => { flash(e.message, true); setPosters([]); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setStatus = async (p, status) => {
    setBusyId(p.id);
    try {
      await postJob({ action: 'admin-set-poster', posterId: p.id, status });
      setPosters((ps) => ps.map((x) => (x.id === p.id ? { ...x, status } : x)));
      flash(`${p.company || p.name || 'Poster'} ${STATUS[status][0].toLowerCase()}.`);
      refreshCounts();
    } catch (e) { flash(e.message, true); } finally { setBusyId(null); }
  };

  const all = posters || [];
  const counts = useMemo(() => ({ pending: all.filter((p) => p.status === 'pending').length, approved: all.filter((p) => p.status === 'approved').length, other: all.filter((p) => p.status === 'suspended' || p.status === 'rejected').length }), [all]);
  const shown = all.filter((p) => (filter === 'all' ? true : filter === 'other' ? p.status === 'suspended' || p.status === 'rejected' : p.status === filter))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <>
      <div className="pc-toolbar">
        <Seg label="Status" value={filter} onChange={setFilter} options={[['pending', 'Awaiting review', counts.pending], ['approved', 'Approved', counts.approved], ['other', 'Suspended or rejected', counts.other], ['all', 'All']]} />
      </div>
      <div className="pc-panel">
        {posters == null ? <div className="pc-empty">Loading…</div> : shown.length === 0 ? (
          <Empty title={filter === 'pending' ? 'Nothing to review' : 'No posters here'}>
            {filter === 'pending' ? 'A company that registers to post on the public jobs board appears here until you approve or reject it.' : 'Change the filter to see other posters.'}
          </Empty>
        ) : shown.map((p) => {
          const [label, tone] = STATUS[p.status] || [p.status, ''];
          return (
            <div key={p.id} className="pc-poster">
              <div style={{ minWidth: 0 }}>
                <div className="pc-poster-name">{p.company || p.name || 'Unnamed poster'}</div>
                <div className="pc-poster-meta">
                  {p.name && <span>{p.name}{p.role ? `, ${p.role}` : ''}</span>}
                  {p.email && <a href={`mailto:${p.email}`}>{p.email}</a>}
                  {p.phone && <span>{p.phone}</span>}
                  {safeExternalUrl(p.website) && <a href={safeExternalUrl(p.website)} target="_blank" rel={EXTERNAL_LINK_REL}>{p.website.replace(/^https?:\/\//, '')} ↗</a>}
                  <span className="pc-faint">registered {fmtDate(p.created_at)}</span>
                </div>
                {p.about && <div className="pc-poster-about">{p.about}</div>}
              </div>
              <div className="pc-poster-side">
                <span className={`pc-chip ${tone}`}>{label}</span>
                <div className="pc-actions">
                  {p.status !== 'approved' && <button className="pc-btn sm primary" disabled={busyId === p.id} onClick={() => setStatus(p, 'approved')}>Approve</button>}
                  {p.status === 'pending' && <button className="pc-btn sm" disabled={busyId === p.id} onClick={() => setStatus(p, 'rejected')}>Reject</button>}
                  {p.status === 'approved' && <button className="pc-btn sm danger" disabled={busyId === p.id} onClick={() => setStatus(p, 'suspended')}>Suspend</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {toastNode}
    </>
  );
}
