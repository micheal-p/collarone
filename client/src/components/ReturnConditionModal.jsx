// Shared return-inspection form — used when staff bring back a takeout item
// or an IT asset. Captures condition, any issues encountered, and an optional
// photo (compressed to ~20KB before upload). The result feeds the numbered
// Goods Return Note in Invoicing & Trade Docs.
import { useState } from 'react';
import { Modal } from './ui.jsx';
import { compressImage } from '../lib/imageCompress.js';
import { uploadSiteImage } from '../pages/admin/website/websiteApi.js';

export const CONDITIONS = [
  ['optimal', 'Optimal', 'Came back in the same state it went out.'],
  ['minor', 'Minor wear', 'Usable, but showing wear worth noting.'],
  ['damaged', 'Damaged', 'Faulty or broken — needs repair or write-off.'],
];

export default function ReturnConditionModal({ title, itemLabel, orgId, onClose, onSubmit, flash }) {
  const [condition, setCondition] = useState('optimal');
  const [issues, setIssues] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const small = await compressImage(file); // ~20KB target
      setPhotoUrl(await uploadSiteImage(orgId, small, 'custody-'));
    } catch (err) { flash(err.message, true); } finally { setUploading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (condition !== 'optimal' && !issues.trim()) return flash('Describe the issue so the note carries it.', true);
    setBusy(true);
    try { await onSubmit({ condition, issues: issues.trim(), photoUrl }); onClose(); }
    catch (err) { flash(err.message, true); } finally { setBusy(false); }
  };

  return (
    <Modal title={title || 'Return inspection'} onClose={onClose}>
      <form onSubmit={submit}>
        {itemLabel && <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Returning: <strong>{itemLabel}</strong></p>}

        <div className="field"><label>Condition on return *</label>
          <div style={{ display: 'grid', gap: 8 }}>
            {CONDITIONS.map(([key, label, hint]) => (
              <label key={key} className="card" style={{ padding: '9px 13px', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start', border: condition === key ? '2px solid var(--brand)' : undefined }}>
                <input type="radio" name="retCondition" checked={condition === key} onChange={() => setCondition(key)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontWeight: 650, fontSize: 13.5, display: 'block' }}>{label}</span>
                  <span className="muted" style={{ fontSize: 12.5 }}>{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="field"><label>Any issues while using it?{condition !== 'optimal' ? ' *' : ''}</label>
          <textarea className="input" rows={2} value={issues} onChange={(e) => setIssues(e.target.value)}
            placeholder="e.g. battery drains fast, scratch on the left side, none"
            style={{ resize: 'vertical', fontFamily: 'inherit' }} />
        </div>

        <div className="field"><label>Snap a photo of it (optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {photoUrl && <img src={photoUrl} alt="Returned item" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover' }} />}
            <input type="file" accept="image/*" capture="environment" onChange={pickPhoto} disabled={uploading} />
            {uploading && <span className="spinner" />}
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>Compressed to ~20KB automatically — fine on any data plan.</p>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || uploading}>{busy ? <span className="spinner" /> : 'Confirm return'}</button>
        </div>
      </form>
    </Modal>
  );
}
