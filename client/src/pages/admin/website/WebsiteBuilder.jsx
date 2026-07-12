import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { applyOrgTheme } from '../../../lib/theme.js';
import AppLayout from '../../../components/AppLayout.jsx';
import * as W from './websiteApi.js';
import { BLOCK_FIELDS, emptyRepeaterItem } from './blockFields.js';

const CATEGORY_LABEL = { ecommerce: 'Online store', landing: 'Landing page', company: 'Company profile' };
const CATEGORY_BLURB = {
  ecommerce: 'Sell products — a homepage, a shop grid, and a contact page. You’ll add your product catalog (name, price, photo) after setup.',
  landing: 'Pitch one product or idea on a single scrolling page — hero, features, FAQ, contact.',
  company: 'A traditional multi-page company site — home, about, services, team, contact.',
};
const SWATCHES = ['#FF5B1F', '#C2410C', '#0F766E', '#1D4ED8', '#7C3AED', '#BE185D', '#0A0E1A', '#166534'];

function Toast({ toast }) { if (!toast) return null; return <div className={`toast ${toast.isErr ? 'error' : ''}`}>{toast.msg}</div>; }
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

/* ---- ThemeMockup: a tiny visual preview so choosing a theme doesn't rely on
   reading descriptions — one mockup skeleton per layout, tinted with the
   theme's own accent/tone so it actually looks like that theme. ---- */
function ThemeMockup({ theme }) {
  const dark = theme.tone === 'dark';
  const bg = dark ? '#15171c' : '#ffffff';
  const surface = dark ? '#20232b' : '#f1f1f3';
  const line = dark ? '#333844' : '#e2e2e6';
  const accent = theme.accent;
  const box = { width: '100%', height: 108, borderRadius: 8, overflow: 'hidden', background: bg, border: `1px solid ${line}` };

  if (theme.layoutKey === 'ecommerce-grid') {
    return (
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: `1px solid ${line}` }}>
          <div style={{ width: 28, height: 6, borderRadius: 3, background: line }} />
          <div style={{ width: 22, height: 10, borderRadius: 5, background: accent }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: surface, borderRadius: 4, height: 30 }} />
          ))}
        </div>
      </div>
    );
  }
  if (theme.layoutKey === 'landing-hero') {
    return (
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: `1px solid ${line}` }}>
          <div style={{ width: 20, height: 6, borderRadius: 3, background: line }} />
          <div style={{ width: 26, height: 8, borderRadius: 4, background: accent }} />
        </div>
        <div style={{ padding: '14px 10px', textAlign: 'center' }}>
          <div style={{ width: '70%', height: 8, borderRadius: 4, background: dark ? '#454b58' : '#cfcfd4', margin: '0 auto 6px' }} />
          <div style={{ width: '45%', height: 6, borderRadius: 3, background: line, margin: '0 auto 10px' }} />
          <div style={{ width: 40, height: 12, borderRadius: 6, background: accent, margin: '0 auto' }} />
        </div>
      </div>
    );
  }
  // company-profile
  return (
    <div style={box}>
      <div style={{ padding: '4px 8px', fontSize: 8, textAlign: 'right', color: dark ? '#8a8f9c' : '#9a9aa0', borderBottom: `1px solid ${line}` }}>contact</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: `1px solid ${line}` }}>
        <div style={{ width: 24, height: 6, borderRadius: 3, background: line }} />
        <div style={{ display: 'flex', gap: 4 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 14, height: 5, borderRadius: 2, background: i === 0 ? accent : line }} />)}</div>
      </div>
      <div style={{ padding: 10 }}>
        <div style={{ width: '55%', height: 7, borderRadius: 4, background: dark ? '#454b58' : '#cfcfd4', marginBottom: 8 }} />
        <div style={{ width: '90%', height: 5, borderRadius: 3, background: line, marginBottom: 4 }} />
        <div style={{ width: '75%', height: 5, borderRadius: 3, background: line }} />
      </div>
    </div>
  );
}

/* ---- Setup wizard ---------------------------------------------------------- */
function SetupWizard({ themes, defaultName, onSetup, onExisting, flash }) {
  const [step, setStep] = useState('category'); // category -> theme -> details | existing
  const [category, setCategory] = useState(null);
  const [themeKey, setThemeKey] = useState(null);
  const [siteName, setSiteName] = useState(defaultName || '');
  const [tagline, setTagline] = useState('');
  const [existingUrl, setExistingUrl] = useState('');
  const [busy, setBusy] = useState(false);

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            {Object.entries(CATEGORY_LABEL).map(([key, label]) => (
              <button key={key} type="button" onClick={() => { setCategory(key); setStep('theme'); }}
                style={{ textAlign: 'left', padding: 18, borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{CATEGORY_BLURB[key]}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setStep('existing')}
            style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 14, padding: 14, borderRadius: 'var(--radius-lg)', border: '1px dashed var(--line)', background: 'transparent', cursor: 'pointer' }}>
            <span style={{ fontWeight: 600 }}>I already have a website</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'block', marginTop: 2 }}>Keep using your existing site — just link it here. You can switch to building one with us anytime.</span>
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
              <button key={t.key} type="button" onClick={() => { setThemeKey(t.key); setStep('details'); }}
                style={{ textAlign: 'left', padding: 12, borderRadius: 'var(--radius-lg)', border: '1px solid var(--line)', background: 'var(--surface)', cursor: 'pointer' }}>
                <ThemeMockup theme={t} />
                <div style={{ fontWeight: 700, margin: '10px 0 4px' }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.description}</div>
              </button>
            ))}
          </div>
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
    <div style={{ display: 'flex', gap: 24 }}>
      <div style={{ width: 200, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input className="input" placeholder="New page" value={newPageTitle} onChange={(e) => setNewPageTitle(e.target.value)} style={{ fontSize: 13 }} />
          <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={addPage}>+</button>
        </div>
        {pages.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 6, background: activePage === p.id ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', marginBottom: 2 }} onClick={() => setActivePage(p.id)}>
            <span style={{ fontSize: 13.5, fontWeight: activePage === p.id ? 600 : 400 }}>{p.title}{p.is_home && ' (Home)'}</span>
            {!p.is_home && <button className="iconbtn" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); removePage(p); }}>&times;</button>}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }}>
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

/* ---- Share & embed ------------------------------------------------------------ */
function ShareEmbedPanel({ orgSlug }) {
  const [copied, setCopied] = useState('');
  const origin = window.location.origin;
  const careersUrl = `${origin}/careers/${orgSlug}`;
  const embedSnippet = `<iframe src="${origin}/embed/contact/${orgSlug}" style="width:100%;max-width:420px;height:420px;border:0;" title="Contact us"></iframe>`;

  const copy = (text, key) => { navigator.clipboard?.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 2000); };

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line)', maxWidth: 560 }}>
      <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Share &amp; embed</h3>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>Already have your own website? Link or paste these into it — no migration needed.</p>

      <Field label="Careers page link">
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" readOnly value={careersUrl} style={{ flex: 1, fontSize: 12.5 }} />
          <button type="button" className="btn btn-ghost" onClick={() => copy(careersUrl, 'careers')}>{copied === 'careers' ? 'Copied' : 'Copy'}</button>
        </div>
      </Field>
      <Field label="Contact form embed (paste into your site's HTML)">
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea className="input" readOnly rows={2} value={embedSnippet} style={{ flex: 1, fontSize: 11.5, fontFamily: 'monospace', resize: 'vertical' }} />
          <button type="button" className="btn btn-ghost" onClick={() => copy(embedSnippet, 'embed')} style={{ height: 'fit-content' }}>{copied === 'embed' ? 'Copied' : 'Copy'}</button>
        </div>
      </Field>
      <p className="muted" style={{ fontSize: 12 }}>Submissions land straight in your CRM's Contacts, with a note logged in Activity.</p>
    </div>
  );
}

/* ---- Settings tab ------------------------------------------------------------- */
function SettingsTab({ site, orgId, orgSlug, onSave, flash }) {
  const [f, setF] = useState({ siteName: site.site_name, tagline: site.tagline, contactEmail: site.contact_email, contactPhone: site.contact_phone, contactWhatsapp: site.contact_whatsapp, accentColor: site.accent_color, logoUrl: site.logo_url });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

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
    const [t, s] = await Promise.all([W.getThemes(), W.getMySite(org.id)]);
    setThemes(t);
    setSite(s);
    if (s) setCategory(t.find((x) => x.key === s.theme_key)?.category);
  }, [org.id]);

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
        <div style={{ maxWidth: 480 }}>
          <h2 style={{ fontSize: 18, margin: '0 0 10px' }}>Using your existing website</h2>
          <p style={{ fontSize: 14, marginBottom: 4 }}>Your site: <a href={org.externalWebsiteUrl} target="_blank" rel="noreferrer">{org.externalWebsiteUrl}</a></p>
          <p className="muted" style={{ fontSize: 13, marginBottom: 20 }}>Nothing about this site is managed by Collarone — this is just a link on file so your team knows where it lives.</p>
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
          <div className="lv-tabs">
            <button className={`lv-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings</button>
            <button className={`lv-tab ${tab === 'pages' ? 'active' : ''}`} onClick={() => setTab('pages')}>Pages & content</button>
            {category === 'ecommerce' && <button className={`lv-tab ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>Products</button>}
            <button className={`lv-tab ${tab === 'publish' ? 'active' : ''}`} onClick={() => setTab('publish')}>Publish</button>
            <a className="btn btn-ghost lv-apply" href={`/site/${org?.slug}?preview=1`} target="_blank" rel="noreferrer">Preview site</a>
          </div>

          {tab === 'settings' && <SettingsTab site={site} orgId={org.id} orgSlug={org.slug} onSave={load} flash={flash} />}
          {tab === 'pages' && <PagesTab orgId={org.id} flash={flash} />}
          {tab === 'products' && category === 'ecommerce' && <ProductsTab orgId={org.id} flash={flash} />}
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
