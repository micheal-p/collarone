import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { applyOrgTheme } from '../../../lib/theme.js';
import AppLayout from '../../../components/AppLayout.jsx';
import ThemeMockup from '../../../components/ThemeMockup.jsx';
import ThemePreviewModal from '../../../components/ThemePreview.jsx';
import { waDigits } from '../../../lib/whatsapp.js';
import * as W from './websiteApi.js';
import { BLOCK_FIELDS, emptyRepeaterItem } from './blockFields.js';

const CATEGORY_LABEL = { ecommerce: 'Online store', landing: 'Landing page', company: 'Company profile' };
const CATEGORY_BLURB = {
  ecommerce: 'Sell products — homepage, shop grid and contact page, pre-styled with sample products you just swap out.',
  landing: 'Pitch one product or idea on a single scrolling page — hero, features, FAQ and contact, already written for you to edit.',
  company: 'A traditional multi-page company site — home, about, services, team and contact, filled in so you see exactly where everything goes.',
};
const CATEGORY_COVER = {
  ecommerce: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=70',
  landing: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=70',
  company: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=70',
};
const CATEGORY_ICON = {
  ecommerce: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3.5h3l2.6 12h10.4l2-8.5H6.2" /></svg>,
  landing: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>,
  company: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="8" width="18" height="13" rx="1.5" /><path d="M8 21V8M16 21V8M3 13h18" /><path d="M9 4h6v4H9z" /></svg>,
};
const LinkIcon = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>;
const SWATCHES = ['#FF5B1F', '#C2410C', '#0F766E', '#1D4ED8', '#7C3AED', '#BE185D', '#0A0E1A', '#166534'];

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

/* ---- Setup wizard ---------------------------------------------------------- */
function SetupWizard({ themes, defaultName, onSetup, onExisting, flash }) {
  const [step, setStep] = useState('category'); // category -> theme -> details | existing
  const [category, setCategory] = useState(null);
  const [themeKey, setThemeKey] = useState(null);
  const [siteName, setSiteName] = useState(defaultName || '');
  const [tagline, setTagline] = useState('');
  const [existingUrl, setExistingUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewTheme, setPreviewTheme] = useState(null);

  const categoryThemes = themes.filter((t) => t.category === category);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSetup(themeKey, siteName, tagline); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  const submitExisting = async (e) => {
    e.preventDefault();
    if (!existingUrl.trim()) return flash('Enter your website URL.', true);
    setBusy(true);
    try { await onExisting(existingUrl.trim()); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>Set up your public website</h2>
      <p className="muted" style={{ fontSize: 13.5, margin: '0 0 20px' }}>Pick what kind of site you need — each type starts with the right pages already filled in.</p>

      {step === 'category' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setCategory(key); setStep('theme'); }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 14px 32px rgba(10,14,26,0.14)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                style={{ textAlign: 'left', padding: 0, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer', overflow: 'hidden', transition: 'transform .2s ease, box-shadow .2s ease' }}>
                <div style={{ height: 110, overflow: 'hidden', position: 'relative' }}>
                  <img src={CATEGORY_COVER[key]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <span style={{ position: 'absolute', bottom: 8, left: 10, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(10,14,26,0.72)', color: '#fff', fontSize: 11.5, fontWeight: 700, borderRadius: 100, padding: '5px 12px' }}>
                    {CATEGORY_ICON[key]}{label}
                  </span>
                </div>
                <div style={{ padding: '13px 15px' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55 }}>{CATEGORY_BLURB[key]}</div>
                </div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setStep('existing')}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', textAlign: 'left', marginTop: 14, padding: 16, borderRadius: 14, border: '1px dashed var(--line)', background: 'transparent', cursor: 'pointer' }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--text-2)' }}>{LinkIcon}</span>
            <span>
              <span style={{ fontWeight: 600, display: 'block' }}>I already have a website</span>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'block', marginTop: 2 }}>
                Keep your site exactly where it is — Collarone plugs into it instead: a careers page link for your menu, and a contact form you paste in so leads land in your CRM.
              </span>
            </span>
          </button>
        </>
      )}

      {step === 'existing' && (
        <form onSubmit={submitExisting}>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setStep('category')}>&larr; Back</button>
          <Field label="Your website URL *">
            <input className="input" type="url" value={existingUrl} onChange={(e) => setExistingUrl(e.target.value)} placeholder="https://yourcompany.com" required autoFocus />
          </Field>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>This just links out to your real site from Collarone — nothing is imported or migrated. You can switch to the builder later without losing this.</p>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save my website link'}</button>
        </form>
      )}

      {step === 'theme' && (
        <>
          <button className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setStep('category')}>&larr; Back</button>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            {categoryThemes.map((t) => (
              <div key={t.key} style={{ display: 'flex', flexDirection: 'column', padding: 12, borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)', background: 'var(--surface)' }}>
                <ThemeMockup theme={t} />
                <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{t.description}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button type="button" className="btn btn-primary" style={{ flex: 1, fontSize: 12.5, padding: '8px 0' }}
                    onClick={() => { setThemeKey(t.key); setStep('details'); }}>Use this theme</button>
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12.5, padding: '8px 12px' }}
                    onClick={() => setPreviewTheme(t)}>Preview</button>
                </div>
              </div>
            ))}
          </div>
          {previewTheme && <ThemePreviewModal theme={previewTheme} onClose={() => setPreviewTheme(null)} />}
        </>
      )}

      {step === 'details' && (
        <form onSubmit={submit}>
          <button type="button" className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => setStep('theme')}>&larr; Back</button>
          <Field label="Site name *"><input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} required autoFocus /></Field>
          <Field label="Tagline"><input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="A one-line pitch" /></Field>
          <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Create my site'}</button>
        </form>
      )}
    </div>
  );
}

/* ---- Block editor modal ----------------------------------------------------- */
function BlockEditModal({ block, orgId, onClose, onSaved, flash }) {
  const config = BLOCK_FIELDS[block.type] || { simple: [] };
  const [content, setContent] = useState(() => ({ ...block.content }));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setContent((s) => ({ ...s, [k]: v }));

  const items = content[config.repeater?.key] || [];
  const setItems = (next) => setContent((s) => ({ ...s, [config.repeater?.key]: next }));

  const uploadImage = async (file, cb) => {
    setUploading(true);
    try { cb(await W.uploadSiteImage(orgId, file, 'block-')); } catch (e) { flash(e.message, true); } finally { setUploading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { const saved = await W.updateBlock(block.id, content); flash('Block updated.'); onSaved(saved); onClose(); }
    catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Edit {W.BLOCK_TYPES[block.type] || block.type}</h2></div>
        <form className="modal-body" onSubmit={submit}>
          {config.simple.length === 0 && !config.repeater && <p className="muted" style={{ fontSize: 13 }}>This block has no editable fields — it renders your Settings tab's contact details automatically.</p>}
          {config.simple.map(([key, label, kind]) => (
            <Field key={key} label={label}>
              {kind === 'textarea' && <textarea className="input" rows={3} value={content[key] || ''} onChange={(e) => set(key, e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} />}
              {kind === 'number' && <input className="input" type="number" value={content[key] ?? 0} onChange={(e) => set(key, Number(e.target.value))} />}
              {kind === 'text' && <input className="input" value={content[key] || ''} onChange={(e) => set(key, e.target.value)} />}
              {kind === 'image' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {content[key] && <img src={content[key]} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />}
                  <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0], (url) => set(key, url))} disabled={uploading} />
                </div>
              )}
            </Field>
          ))}

          {config.repeater && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>{config.repeater.label}s</label>
              {items.map((item, i) => (
                <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12, margin: '8px 0' }}>
                  {config.repeater.fields.map(([fk, flabel, fkind]) => (
                    <Field key={fk} label={flabel}>
                      {fkind === 'textarea' && <textarea className="input" rows={2} value={item[fk] || ''} onChange={(e) => { const next = [...items]; next[i] = { ...item, [fk]: e.target.value }; setItems(next); }} style={{ resize: 'vertical', fontFamily: 'inherit' }} />}
                      {fkind === 'text' && <input className="input" value={item[fk] || ''} onChange={(e) => { const next = [...items]; next[i] = { ...item, [fk]: e.target.value }; setItems(next); }} />}
                      {fkind === 'image' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {item[fk] && <img src={item[fk]} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />}
                          <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0], (url) => { const next = [...items]; next[i] = { ...item, [fk]: url }; setItems(next); })} disabled={uploading} />
                        </div>
                      )}
                    </Field>
                  ))}
                  <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setItems(items.filter((_, idx) => idx !== i))}>Remove</button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost" onClick={() => setItems([...items, emptyRepeaterItem(config.repeater.fields)])}>
                + Add {config.repeater.label.toLowerCase()}
              </button>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : 'Save block'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---- Pages & content tab ----------------------------------------------------- */
function PagesTab({ orgId, flash }) {
  const [pages, setPages] = useState([]);
  const [activePage, setActivePage] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addType, setAddType] = useState('text');
  const [editBlock, setEditBlock] = useState(null);
  const [newPageTitle, setNewPageTitle] = useState('');

  const loadPages = useCallback(async () => {
    const p = await W.getPages(orgId);
    setPages(p);
    if (p.length && !p.some((x) => x.id === activePage)) setActivePage(p[0].id);
    return p;
  }, [orgId, activePage]);

  useEffect(() => { loadPages().finally(() => setLoading(false)); }, []); // eslint-disable-line

  useEffect(() => {
    if (!activePage) return;
    W.getBlocks(activePage).then(setBlocks).catch((e) => flash(e.message, true));
  }, [activePage]); // eslint-disable-line

  const addPage = async () => {
    if (!newPageTitle.trim()) return;
    const slug = newPageTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    try {
      const p = await W.createPage(orgId, { slug, title: newPageTitle.trim(), sortOrder: pages.length + 1 });
      setNewPageTitle(''); flash('Page added.'); const list = await loadPages(); setActivePage(p.id);
    } catch (e) { flash(e.message, true); }
  };
  const removePage = async (p) => {
    if (!confirm(`Delete page "${p.title}"? This removes all its content.`)) return;
    try { await W.deletePage(p.id); flash('Page deleted.'); await loadPages(); } catch (e) { flash(e.message, true); }
  };

  const addBlock = async () => {
    try { const b = await W.createBlock(orgId, activePage, addType, {}, blocks.length + 1); setBlocks([...blocks, b]); flash('Block added.'); }
    catch (e) { flash(e.message, true); }
  };
  const removeBlock = async (b) => {
    if (!confirm('Remove this block?')) return;
    try { await W.deleteBlock(b.id); setBlocks(blocks.filter((x) => x.id !== b.id)); } catch (e) { flash(e.message, true); }
  };
  const move = async (b, dir) => {
    const idx = blocks.findIndex((x) => x.id === b.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= blocks.length) return;
    const a = blocks[idx], c = blocks[swapIdx];
    const next = [...blocks]; next[idx] = c; next[swapIdx] = a;
    setBlocks(next);
    await W.updateBlockOrder(a.id, swapIdx + 1);
    await W.updateBlockOrder(c.id, idx + 1);
  };

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  return (
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 200px', maxWidth: 260, minWidth: 180 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {/* autoComplete/name/spellCheck attrs stop the browser's autofill
              popup from covering the page list with old form values */}
          <input className="input" placeholder="New page" value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)}
            style={{ fontSize: 13 }} autoComplete="off" name="collarone-new-page" spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPage(); } }} />
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={addPage}>+</button>
        </div>
        {pages.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: activePage === p.id ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', marginBottom: 2 }} onClick={() => setActivePage(p.id)}>
            <span style={{ fontSize: 13.5, fontWeight: activePage === p.id ? 600 : 400 }}>{p.title}{p.is_home && ' (Home)'}</span>
            {!p.is_home && <button className="iconbtn" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); removePage(p); }}>&times;</button>}
          </div>
        ))}
      </div>

      <div style={{ flex: '999 1 320px', minWidth: 0 }}>
        {blocks.map((b, i) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', marginBottom: 8, background: 'var(--surface)' }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{W.BLOCK_TYPES[b.type] || b.type}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="iconbtn" disabled={i === 0} onClick={() => move(b, -1)}>&uarr;</button>
              <button className="iconbtn" disabled={i === blocks.length - 1} onClick={() => move(b, 1)}>&darr;</button>
              <button className="iconbtn" onClick={() => setEditBlock(b)}>Edit</button>
              <button className="iconbtn" onClick={() => removeBlock(b)}>Delete</button>
            </div>
          </div>
        ))}
        {blocks.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No blocks on this page yet.</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <select className="select" value={addType} onChange={(e) => setAddType(e.target.value)}>
            {Object.entries(W.BLOCK_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={addBlock}>+ Add block</button>
        </div>
      </div>

      {editBlock && (
        <BlockEditModal block={editBlock} orgId={orgId} onClose={() => setEditBlock(null)} flash={flash}
          onSaved={(saved) => setBlocks(blocks.map((b) => b.id === saved.id ? saved : b))} />
      )}
    </div>
  );
}

/* ---- Products tab (ecommerce category only) --------------------------------- */
function ProductModal({ product, onClose, onSaved, flash, orgId }) {
  const [f, setF] = useState(() => product ? { name: product.name, description: product.description, price: product.price || '', imageUrl: product.image_url } : { name: '', description: '', price: '', imageUrl: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const uploadImage = async (file) => {
    setUploading(true);
    try { set('imageUrl', await W.uploadSiteImage(orgId, file, 'product-')); } catch (e) { flash(e.message, true); } finally { setUploading(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return flash('Product name is required.', true);
    setBusy(true);
    try {
      const body = { name: f.name.trim(), description: f.description, price: f.price || null, image_url: f.imageUrl };
      const saved = product ? await W.updateProduct(product.id, body) : await W.createProduct(orgId, body);
      flash(product ? 'Product updated.' : 'Product added.'); onSaved(saved); onClose();
    } catch (e2) { flash(e2.message, true); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{product ? 'Edit product' : 'Add product'}</h2></div>
        <form className="modal-body" onSubmit={submit}>
          <Field label="Name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required autoFocus /></Field>
          <div className="form-grid">
            <Field label="Price (₦)"><input className="input" type="number" value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
            <Field label="Photo">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {f.imageUrl && <img src={f.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />}
                <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0])} disabled={uploading} />
              </div>
            </Field>
          </div>
          <Field label="Description"><textarea className="input" rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} style={{ resize: 'vertical', fontFamily: 'inherit' }} /></Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy ? <span className="spinner" /> : product ? 'Save changes' : 'Add product'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductsTab({ orgId, flash }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => { W.getProducts(orgId).then(setProducts).catch((e) => flash(e.message, true)).finally(() => setLoading(false)); }, [orgId]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  const remove = async (p) => {
    if (!confirm(`Delete ${p.name}?`)) return;
    try { await W.deleteProduct(p.id); flash('Product deleted.'); load(); } catch (e) { flash(e.message, true); }
  };

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  return (
    <>
      <div className="filterbar" style={{ marginBottom: 12 }}>
        <span className="count">{products.length} product{products.length === 1 ? '' : 's'}</span>
        <button className="btn btn-primary lv-apply" onClick={() => setModal('new')}>Add product</button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th></th><th>Name</th><th>Price</th><th></th></tr></thead>
          <tbody>
            {products.length === 0 && <tr><td colSpan={4} className="td-empty">No products yet — add your catalog here, it renders on your Shop page automatically.</td></tr>}
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.image_url ? <img src={p.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover' }} /> : '—'}</td>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td className="muted" style={{ fontSize: 13 }}>{W.money(p.price)}</td>
                <td><button className="iconbtn" onClick={() => setModal(p)}>Edit</button><button className="iconbtn" onClick={() => remove(p)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(modal === 'new' || (modal && modal !== 'new')) && (
        <ProductModal product={modal === 'new' ? null : modal} orgId={orgId} onClose={() => setModal(null)} onSaved={load} flash={flash} />
      )}
    </>
  );
}

/* ---- "Works with the website you already have" -------------------------------
   Plain-language integration story. The old version showed a raw iframe
   snippet in a tiny textarea with zero explanation — reported as confusing.
   Now: what each thing is, what happens when you use it, one Copy button. */
function ShareEmbedPanel({ orgSlug }) {
  const [copied, setCopied] = useState('');
  const origin = window.location.origin;
  const careersUrl = `${origin}/careers/${orgSlug}`;
  const embedUrl = `${origin}/embed/contact/${orgSlug}`;
  const embedSnippet = `<iframe src="${embedUrl}" style="width:100%;max-width:420px;height:420px;border:0;" title="Contact us"></iframe>`;

  const copy = (text, key) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); };

  const stepNum = (n) => (
    <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand, #FF5B1F)', color: '#fff', fontSize: 12.5, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
  );
  const card = { border: '1px solid var(--line)', borderRadius: 12, padding: 16, marginBottom: 12, background: 'var(--surface)' };

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)', maxWidth: 620 }}>
      <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>Using Collarone with the website you already have</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', lineHeight: 1.6 }}>
        You don't need to move or rebuild your website. Your site stays where it is — these two pieces connect it to your Collarone workspace.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {stepNum(1)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Put your job openings on your site</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.6 }}>
              This is a ready-made careers page that always shows your current openings from the HR suite.
              Ask whoever manages your website to add a menu link called <strong>"Careers"</strong> pointing to this address.
              Everyone who applies lands directly in your Recruiting pipeline.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="input" readOnly value={careersUrl} style={{ flex: '1 1 220px', fontSize: 12.5 }} onFocus={(e) => e.target.select()} />
              <button type="button" className="btn btn-ghost" onClick={() => copy(careersUrl, 'careers')}>{copied === 'careers' ? 'Copied ✓' : 'Copy link'}</button>
              <a className="btn btn-ghost" href={careersUrl} target="_blank" rel="noreferrer">See it</a>
            </div>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {stepNum(2)}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Catch customer messages from your site</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.6 }}>
              This is a small contact form you place on your website. The button below copies a piece of code —
              you don't need to understand it, just <strong>send it to whoever manages your website</strong> and ask them
              to paste it where your contact form should appear. Every message a visitor sends lands in your CRM as a contact,
              with the note saved in Activity.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => copy(embedSnippet, 'embed')}>{copied === 'embed' ? 'Copied ✓' : 'Copy the form code'}</button>
              <a className="btn btn-ghost" href={embedUrl} target="_blank" rel="noreferrer">See what the form looks like</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Orders tab — checkout orders from the store, worked like an inbox ------- */
const ORDER_STATUS = { new: 'New', confirmed: 'Confirmed', fulfilled: 'Fulfilled', cancelled: 'Cancelled' };
const ORDER_TINT = { new: '#B45309', confirmed: '#1D4ED8', fulfilled: '#166534', cancelled: '#6B7280' };

function OrdersTab({ orgId, orgSlug, flash }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    W.getOrders(orgId).then(setOrders).catch((e) => flash(e.message, true)).finally(() => setLoading(false));
  }, [orgId]); // eslint-disable-line

  const setStatus = async (o, status) => {
    try {
      const saved = await W.updateOrderStatus(o.id, status);
      setOrders((s) => s.map((x) => (x.id === o.id ? saved : x)));
      flash(`Order ${o.order_no} marked ${ORDER_STATUS[status].toLowerCase()}.`);
    } catch (e) { flash(e.message, true); }
  };

  // Missed-redirect recovery: ask Paystack directly whether this card order's
  // reference actually charged — the same server verify the shopper's return
  // trip uses, so a paid order can always be reconciled from here.
  const [rechecking, setRechecking] = useState(null);
  const recheckPayment = async (o) => {
    setRechecking(o.id);
    try {
      const r = await fetch('/api/site-pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', orgSlug, reference: o.paystack_ref }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.paid) {
        flash(`Paystack confirms order ${o.order_no} is PAID.`);
        W.getOrders(orgId).then(setOrders).catch(() => {});
      } else {
        flash(`Paystack has no successful payment for ${o.order_no} yet.`, true);
      }
    } catch (e) { flash(e.message, true); } finally { setRechecking(null); }
  };

  // Merchant sighted the money in their own Paystack dashboard but the
  // redirect never verified — manual confirm stamps paid_at so the badge
  // agrees with the bank.
  const confirmCardManually = async (o) => {
    try {
      const saved = await W.markOrderPaid(o.id);
      setOrders((s) => s.map((x) => (x.id === o.id ? saved : x)));
      flash(`Order ${o.order_no} confirmed as paid.`);
    } catch (e) { flash(e.message, true); }
  };

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;

  const naira = (n) => `₦${Number(n).toLocaleString('en-NG')}`;
  const awaiting = orders.filter((o) => o.status === 'new').length;

  return (
    <div style={{ maxWidth: 860 }}>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 16px' }}>
        {orders.length} order{orders.length === 1 ? '' : 's'}{awaiting > 0 && ` · ${awaiting} awaiting confirmation`}.
        Transfer orders show the customer your account details from Settings → Getting paid; confirm once the money lands.
      </p>
      {orders.length === 0 && (
        <p className="muted" style={{ fontSize: 13.5 }}>No orders yet — they'll appear here the moment a customer checks out on your store.</p>
      )}
      {orders.map((o) => (
        <div key={o.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, marginBottom: 12, background: 'var(--surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>{o.order_no}</strong>
            <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: `${ORDER_TINT[o.status]}18`, color: ORDER_TINT[o.status] }}>{ORDER_STATUS[o.status]}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
              {o.payment_method === 'card' ? 'Card (Paystack)' : o.payment_method === 'transfer' ? 'Bank transfer' : 'Pay on delivery'}
            </span>
            {o.payment_method === 'card' && (
              o.paid_at
                ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: 'rgba(18,131,63,0.12)', color: '#12833F' }}>PAID</span>
                : <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: 'rgba(183,121,31,0.12)', color: '#B7791F' }}>PAYMENT PENDING</span>
            )}
            <span style={{ flex: 1 }} />
            <strong style={{ fontSize: 14.5 }}>{naira(o.total_naira)}</strong>
          </div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            <strong>{o.customer_name}</strong>
            <span className="muted" style={{ marginLeft: 10 }}>{o.phone}</span>
            {o.email && <span className="muted" style={{ marginLeft: 10 }}>{o.email}</span>}
          </div>
          {o.address && <div className="muted" style={{ fontSize: 12.5, marginBottom: 6 }}>Deliver to: {o.address}</div>}
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            {(o.items || []).map((it) => `${it.qty}× ${it.name}`).join(' · ')}
            {o.note && <em style={{ display: 'block', marginTop: 4 }}>"{o.note}"</em>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <a className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 14px' }} target="_blank" rel="noreferrer"
              href={`https://wa.me/${waDigits(o.phone)}?text=${encodeURIComponent(`Hello ${o.customer_name.split(' ')[0]}, about your order ${o.order_no} — `)}`}>
              WhatsApp customer
            </a>
            {o.payment_method === 'card' && !o.paid_at && o.status !== 'cancelled' && (
              <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 14px' }} disabled={rechecking === o.id} onClick={() => recheckPayment(o)}>
                {rechecking === o.id ? 'Checking…' : 'Re-check with Paystack'}
              </button>
            )}
            {o.status === 'new' && (
              o.payment_method === 'card' && !o.paid_at
                ? <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={() => confirmCardManually(o)}>I've sighted this payment — confirm</button>
                : <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={() => setStatus(o, 'confirmed')}>Confirm payment/order</button>
            )}
            {o.status === 'confirmed' && <button className="btn btn-primary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={() => setStatus(o, 'fulfilled')}>Mark fulfilled</button>}
            {(o.status === 'new' || o.status === 'confirmed') && (
              <button className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 14px', color: '#a4262c' }} onClick={() => setStatus(o, 'cancelled')}>Cancel</button>
            )}
            <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{new Date(o.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---- Insights tab — the site's own traffic + the leads it produced ---------- */
const COUNTRY_NAMES = { NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', EG: 'Egypt', GB: 'United Kingdom', US: 'United States', XX: 'Unknown' };

function InsightsTab({ orgId, flash }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    W.getSiteInsights(orgId).then(setData).catch((e) => flash(e.message, true)).finally(() => setLoading(false));
  }, [orgId]); // eslint-disable-line

  if (loading) return <div className="suite-loading"><div className="boot-spinner" /></div>;
  if (!data) return null;

  const tile = { border: '1px solid var(--line)', borderRadius: 12, padding: '16px 18px', background: 'var(--surface)' };
  const tileLabel = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-2)', marginBottom: 8 };
  const tileVal = { fontSize: 26, fontWeight: 750 };
  const bar = (val, max) => ({ height: 8, borderRadius: 4, background: 'var(--brand, #FF5B1F)', width: `${Math.max(6, (val / max) * 100)}%` });
  const panels = [['Most visited pages', data.topPages || []], ['Where visitors are', data.topCountries || []]];

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 8 }}>
        <div style={tile}><div style={tileLabel}>Visits, 24h</div><div style={tileVal}>{data.v24}</div></div>
        <div style={tile}><div style={tileLabel}>Visits, 7 days</div><div style={tileVal}>{data.v7}</div></div>
        <div style={tile}><div style={tileLabel}>Visits, 30 days</div><div style={tileVal}>{data.v30}</div></div>
        <div style={tile}><div style={tileLabel}>Messages &amp; leads</div><div style={{ ...tileVal, color: '#1a7a3e' }}>{data.leadCount}</div></div>
        <div style={tile}><div style={tileLabel}>Orders</div><div style={{ ...tileVal, color: 'var(--brand, #FF5B1F)' }}>{data.orderCount}</div></div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 24px' }}>
        Anonymous visit counts from your public site — no cookies, no visitor IDs. Messages &amp; leads counts everything the site
        has sent into your CRM: contact-form messages, product enquiries and mailing-list signups. Open the CRM suite's Messages tab to reply.
      </p>

      {data.v30 > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {panels.map(([title, rows]) => (
            <div key={title}>
              <h3 style={{ fontSize: 13.5, margin: '0 0 12px' }}>{title}</h3>
              <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 16, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map((r) => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 100, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.label}>
                      {COUNTRY_NAMES[r.label] || r.label}
                    </span>
                    <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 4 }}><div style={bar(r.value, rows[0].value)} /></div>
                    <span style={{ width: 32, textAlign: 'right', fontSize: 12.5, fontWeight: 650 }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {data.v30 === 0 && (
        <p className="muted" style={{ fontSize: 13 }}>No visits recorded yet — they start counting from the moment your site is published and someone opens it.</p>
      )}
    </div>
  );
}

/* ---- Settings tab ------------------------------------------------------------- */
function SettingsTab({ site, orgId, orgSlug, isStore, onSave, flash }) {
  const [f, setF] = useState({
    siteName: site.site_name, tagline: site.tagline, contactEmail: site.contact_email, contactPhone: site.contact_phone,
    contactWhatsapp: site.contact_whatsapp, accentColor: site.accent_color, logoUrl: site.logo_url,
    bankName: site.bank_name || '', bankAccountName: site.bank_account_name || '', bankAccountNumber: site.bank_account_number || '',
    enableTransfer: site.enable_transfer !== false, enableCod: site.enable_cod !== false, paymentNote: site.payment_note || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  // Whether this store's own Paystack gateway is switched on (admin-gated;
  // the flag rides in the same payload the public site reads).
  const [cardEnabled, setCardEnabled] = useState(false);
  useEffect(() => {
    if (!isStore) return;
    W.getPreviewSite().then((d) => setCardEnabled(Boolean(d?.payments?.enableCard))).catch(() => {});
  }, [isStore]);

  const pickLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { set('logoUrl', await W.uploadSiteImage(orgId, file, 'logo-')); } catch (err) { flash(err.message, true); } finally { setUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await W.updateSiteSettings(orgId, {
        site_name: f.siteName, tagline: f.tagline, contact_email: f.contactEmail, contact_phone: f.contactPhone,
        contact_whatsapp: f.contactWhatsapp, accent_color: f.accentColor, logo_url: f.logoUrl,
        bank_name: f.bankName, bank_account_name: f.bankAccountName, bank_account_number: f.bankAccountNumber,
        enable_transfer: f.enableTransfer, enable_cod: f.enableCod, payment_note: f.paymentNote,
      });
      flash('Saved.'); onSave();
    } catch (e) { flash(e.message, true); } finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <Field label="Site name"><input className="input" value={f.siteName} onChange={(e) => set('siteName', e.target.value)} /></Field>
      <Field label="Tagline"><input className="input" value={f.tagline} onChange={(e) => set('tagline', e.target.value)} /></Field>
      <Field label="Logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {f.logoUrl && <img src={f.logoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />}
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload logo'}</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickLogo} style={{ display: 'none' }} />
        </div>
      </Field>
      <Field label="Accent colour override (optional)">
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => set('accentColor', '')} style={{ width: 30, height: 30, borderRadius: '50%', background: '#fff', border: f.accentColor === '' ? '2px solid var(--text)' : '1px dashed var(--line)' }} title="Use theme default" />
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => set('accentColor', c)} style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: f.accentColor === c ? '2px solid var(--text)' : '2px solid transparent' }} />
          ))}
        </div>
      </Field>
      <Field label="Contact email"><input className="input" type="email" value={f.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} /></Field>
      <Field label="Contact phone"><input className="input" value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} /></Field>
      <Field label="WhatsApp"><input className="input" value={f.contactWhatsapp} onChange={(e) => set('contactWhatsapp', e.target.value)} placeholder="+234..." /></Field>

      {isStore && (
        <div style={{ margin: '26px 0 20px', paddingTop: 20, borderTop: '1px solid var(--line)' }}>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Getting paid</h3>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px', lineHeight: 1.6 }}>
            Checkout doesn't need a card gateway. Customers order, then pay by transfer straight into your account
            (shown to them after ordering) or on delivery — you confirm each order from the Orders tab.
          </p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.enableTransfer} onChange={(e) => set('enableTransfer', e.target.checked)} /> Accept bank transfer
          </label>
          {f.enableTransfer && (
            <div style={{ margin: '4px 0 12px', paddingLeft: 22 }}>
              <div className="form-grid">
                <Field label="Bank"><input className="input" value={f.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="GTBank" /></Field>
                <Field label="Account number"><input className="input" value={f.bankAccountNumber} onChange={(e) => set('bankAccountNumber', e.target.value)} placeholder="0123456789" /></Field>
              </div>
              <Field label="Account name"><input className="input" value={f.bankAccountName} onChange={(e) => set('bankAccountName', e.target.value)} placeholder="Your business name" /></Field>
              <Field label="Note shown with your account details (optional)">
                <input className="input" value={f.paymentNote} onChange={(e) => set('paymentNote', e.target.value)} placeholder="Use your order number as the transfer reference." />
              </Field>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.enableCod} onChange={(e) => set('enableCod', e.target.checked)} /> Accept pay on delivery
          </label>
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '13px 15px', marginBottom: 16, background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 13.5, fontWeight: 650, marginBottom: 4 }}>
              Card payments{cardEnabled ? ' — ON' : ''}
            </div>
            {cardEnabled ? (
              <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
                Your store takes card, bank and USSD payments through your own Paystack account — money settles
                straight into your bank, and paid orders confirm themselves in the Orders tab.
              </p>
            ) : (
              <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.6 }}>
                Want customers to pay by card, bank or USSD at checkout? It runs on your own Paystack account, at no
                extra Collarone charge — <a href={`https://wa.me/2348148128551?text=${encodeURIComponent('Hello Collarone — please enable card payments (Paystack) for my store. My company handle is: ')}`} target="_blank" rel="noreferrer" style={{ fontWeight: 650 }}>contact your system admin</a> with
                your store handle and your Paystack account details to switch it on.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', border: '1px dashed var(--line)', borderRadius: 12, padding: 14 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--text-2)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M2.5 10h19" /><path d="M6 15h4" /></svg>
            </span>
            <span>
              <span style={{ fontWeight: 600, display: 'block', fontSize: 13.5 }}>Want card payments too?</span>
              <span className="muted" style={{ fontSize: 12.5, display: 'block', margin: '2px 0 8px', lineHeight: 1.55 }}>
                Most businesses don't have a payment gateway account — and that's fine. When you're ready, we'll set one up
                with you in a one-on-one session and connect it to your store.
              </span>
              <a className="btn btn-ghost" style={{ fontSize: 12.5, padding: '6px 14px' }} target="_blank" rel="noreferrer"
                href={`https://wa.me/2348148128551?text=${encodeURIComponent(`Hi Collarone, I'd like a 1-on-1 session to set up a payment gateway for my store (${orgSlug}).`)}`}>
                Book a setup session on WhatsApp
              </a>
            </span>
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <span className="spinner" /> : 'Save settings'}</button>
      <ShareEmbedPanel orgSlug={orgSlug} />
    </div>
  );
}

/* ---- Main -------------------------------------------------------------------- */
export default function AdminWebsite() {
  const { user, refreshUser } = useAuth();
  const org = user?.org;
  const [themes, setThemes] = useState([]);
  const [site, setSite] = useState(undefined); // undefined = loading, null = not set up
  const [category, setCategory] = useState(null);
  const [tab, setTab] = useState('settings');
  const [toast, setToast] = useState(null);
  const flash = (msg, isErr = false) => { setToast({ msg, isErr }); setTimeout(() => setToast(null), 3000); };

  const load = useCallback(async () => {
    // Demo/guest sessions may carry no org object — the builder talks to
    // Supabase directly and can't run without one; bail before it crashes.
    if (!org?.id) { setSite(null); setThemes([]); return; }
    const [t, s] = await Promise.all([W.getThemes(), W.getMySite(org.id)]);
    setThemes(t);
    setSite(s);
    if (s) setCategory(t.find((x) => x.key === s.theme_key)?.category);
  }, [org?.id]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const doSetup = async (themeKey, siteName, tagline) => {
    await W.setupSite(themeKey, siteName, tagline);
    flash('Site created — add your content below.');
    await load();
  };

  const togglePublish = async () => {
    try { const saved = await W.setPublished(!site.published); setSite(saved); flash(saved.published ? 'Site published — it’s live.' : 'Site unpublished.'); }
    catch (e) { flash(e.message, true); }
  };

  const removeSite = async () => {
    if (!window.confirm('Bring down and delete your website? This removes all pages, blocks and products, and cannot be undone. Are you sure?')) return;
    try { await W.deleteSite(); flash('Website deleted.'); setSite(null); setTab('settings'); }
    catch (e) { flash(e.message, true); }
  };

  const doExisting = async (url) => {
    await W.setExternalWebsite(org.id, url);
    flash('Website link saved.');
    await refreshUser();
  };

  const switchToBuilder = async () => {
    if (!window.confirm('Switch to building a site with Collarone? Your existing website link will be removed from here (your real site itself is untouched).')) return;
    try { await W.setExternalWebsite(org.id, ''); await refreshUser(); }
    catch (e) { flash(e.message, true); }
  };

  if (site === undefined) return <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Website' }]}><div className="suite-loading"><div className="boot-spinner" /></div></AppLayout>;

  if (org?.externalWebsiteUrl) {
    return (
      <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Website' }]} title="Your website">
        <div style={{ maxWidth: 620 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Your website is connected</h2>
          <p style={{ fontSize: 14, marginBottom: 4 }}>Your site: <a href={org.externalWebsiteUrl} target="_blank" rel="noreferrer">{org.externalWebsiteUrl}</a></p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Your website stays yours, hosted wherever it is today — Collarone doesn't touch it.
            The two connectors below are how it works with your workspace: jobs you post here appear on
            your careers page, and messages from your site's contact form land in your CRM.
          </p>
          <button className="btn btn-ghost" onClick={switchToBuilder}>Build a site with Collarone instead</button>
          <ShareEmbedPanel orgSlug={org?.slug} />
        </div>
        <Toast toast={toast} />
      </AppLayout>
    );
  }

  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'Website' }]} title="Your website">
      {!site && <SetupWizard themes={themes} defaultName={org?.name} onSetup={doSetup} onExisting={doExisting} flash={flash} />}

      {site && (
        <>
          <div className="lv-tabs" style={{ flexWrap: 'wrap', rowGap: 6 }}>
            <button className={`lv-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
            <button className={`lv-tab ${tab === 'pages' ? 'active' : ''}`} onClick={() => setTab('pages')}>Pages & content</button>
            {category === 'ecommerce' && <button className={`lv-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>Products</button>}
            {category === 'ecommerce' && <button className={`lv-tab ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>Orders</button>}
            <button className={`lv-tab ${tab === 'insights' ? 'active' : ''}`} onClick={() => setTab('insights')}>Insights</button>
            <button className={`lv-tab ${tab === 'publish' ? 'active' : ''}`} onClick={() => setTab('publish')}>Publish</button>
            <a className="btn btn-ghost lv-apply" href={`/site/${org?.slug}?preview=1`} target="_blank" rel="noreferrer">Preview site</a>
          </div>

          {tab === 'settings' && <SettingsTab site={site} orgId={org.id} orgSlug={org.slug} isStore={category === 'ecommerce'} onSave={load} flash={flash} />}
          {tab === 'pages' && <PagesTab orgId={org.id} flash={flash} />}
          {tab === 'products' && category === 'ecommerce' && <ProductsTab orgId={org.id} flash={flash} />}
          {tab === 'orders' && category === 'ecommerce' && <OrdersTab orgId={org.id} orgSlug={org.slug} flash={flash} />}
          {tab === 'insights' && <InsightsTab orgId={org.id} flash={flash} />}
          {tab === 'publish' && (
            <div style={{ maxWidth: 480 }}>
              <p style={{ fontSize: 14 }}>
                Your site is currently <strong style={{ color: site.published ? '#1a6a1a' : 'var(--text-2)' }}>{site.published ? 'live' : 'unpublished'}</strong>.
              </p>
              <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Public URL: <a href={`/site/${org?.slug}`} target="_blank" rel="noreferrer">{window.location.origin}/site/{org?.slug}</a>
                <br />(Will move to <strong>{org?.slug}.collarone.app</strong> once wildcard subdomains are wired up.)
              </p>
              <button className="btn btn-primary" onClick={togglePublish}>{site.published ? 'Unpublish site' : 'Publish site'}</button>
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)' }}>
                <p className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Starting over or shutting this site down for good?</p>
                <button className="btn btn-ghost" style={{ color: '#a4262c' }} onClick={removeSite}>Delete website</button>
              </div>
            </div>
          )}
        </>
      )}
      <Toast toast={toast} />
    </AppLayout>
  );
}
