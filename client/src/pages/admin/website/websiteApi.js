import { supabase } from '../../../lib/supabaseClient.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';

export const getThemes = async () => {
  const { data, error } = await supabase.from('site_themes').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  return data;
};

// "I already have a website" path — mutually exclusive with the builder.
export const setExternalWebsite = async (orgId, url) => {
  const { error } = await supabase.from('organizations').update({ external_website_url: url }).eq('id', orgId);
  if (error) throw new Error(error.message);
};

export const getMySite = async (orgId) => {
  const { data, error } = await supabase.from('org_sites').select('*').eq('org_id', orgId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

export const setupSite = async (themeKey, siteName, tagline) => {
  const { data, error } = await supabase.rpc('setup_org_site', { p_theme_key: themeKey, p_site_name: siteName, p_tagline: tagline });
  if (error) throw new Error(error.message);
  return data;
};

export const updateSiteSettings = async (orgId, patch) => {
  const { data, error } = await supabase.from('org_sites').update({ ...patch, updated_at: new Date().toISOString() }).eq('org_id', orgId).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const setPublished = async (published) => {
  const { data, error } = await supabase.rpc('set_site_published', { p_published: published });
  if (error) throw new Error(error.message);
  return data;
};

export const deleteSite = async () => {
  const { error } = await supabase.rpc('delete_org_site');
  if (error) throw new Error(error.message);
};

export const getPages = async (orgId) => {
  const { data, error } = await supabase.from('site_pages').select('*').eq('org_id', orgId).order('sort_order');
  if (error) throw new Error(error.message);
  return data;
};

export const createPage = async (orgId, { slug, title, sortOrder }) => {
  const { data, error } = await supabase.from('site_pages').insert({ org_id: orgId, slug, title, sort_order: sortOrder || 0 }).select().single();
  if (error) throw new Error(/unique/i.test(error.message) ? 'A page with that URL slug already exists.' : error.message);
  return data;
};

export const deletePage = async (id) => {
  const { error } = await supabase.from('site_pages').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const getBlocks = async (pageId) => {
  const { data, error } = await supabase.from('site_blocks').select('*').eq('page_id', pageId).order('sort_order');
  if (error) throw new Error(error.message);
  return data;
};

export const createBlock = async (orgId, pageId, type, content, sortOrder) => {
  const { data, error } = await supabase.from('site_blocks').insert({ org_id: orgId, page_id: pageId, type, content: content || {}, sort_order: sortOrder || 0 }).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateBlock = async (id, content) => {
  const { data, error } = await supabase.from('site_blocks').update({ content }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateBlockOrder = async (id, sortOrder) => {
  const { error } = await supabase.from('site_blocks').update({ sort_order: sortOrder }).eq('id', id);
  if (error) throw new Error(error.message);
};

export const deleteBlock = async (id) => {
  const { error } = await supabase.from('site_blocks').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const getProducts = async (orgId) => {
  const { data, error } = await supabase.from('site_products').select('*').eq('org_id', orgId).order('sort_order');
  if (error) throw new Error(error.message);
  return data;
};

export const createProduct = async (orgId, body) => {
  const { data, error } = await supabase.from('site_products').insert({ org_id: orgId, ...body }).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateProduct = async (id, body) => {
  const { data, error } = await supabase.from('site_products').update(body).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteProduct = async (id) => {
  const { error } = await supabase.from('site_products').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

// Upload an image to the public site-assets bucket; returns a public URL.
export const uploadSiteImage = async (orgId, file, prefix = '') => {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${orgId}/${prefix}${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from('site-assets').upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return `${SUPABASE_URL}/storage/v1/object/public/site-assets/${path}`;
};

export const getPublicSite = async (slug) => {
  const { data, error } = await supabase.rpc('public_get_site', { p_slug: slug });
  if (error) throw new Error(error.message);
  return data;
};

// Authenticated preview of your own org's site, regardless of published state.
export const getPreviewSite = async () => {
  const { data, error } = await supabase.rpc('preview_get_site');
  if (error) throw new Error(error.message);
  return data;
};

export const BLOCK_TYPES = {
  hero:         'Hero banner',
  text:         'Text section',
  image:        'Image',
  features:     'Feature list',
  team:         'Team',
  testimonials: 'Testimonials',
  faq:          'FAQ',
  contact_form: 'Contact form',
  subscribe:    'Mailing list signup',
  products:     'Product grid',
  cta:          'Call to action',
  footer:       'Footer note',
};

// Website insights — aggregated in Postgres (site_insights RPC), not by
// shipping thousands of raw visit rows to the browser (which also silently
// capped the 30-day count for busy stores). Lead count excludes orders,
// which have their own tile and tab.
export const getSiteInsights = async (orgId) => {
  const [{ data: agg, error: aErr }, { count: leadCount }, { count: orderCount }] = await Promise.all([
    supabase.rpc('site_insights', { p_org_id: orgId }),
    supabase.from('crm_activities').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('type', 'web_message').neq('source', 'order'),
    supabase.from('site_orders').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
  ]);
  if (aErr) throw new Error(aErr.message);
  return { ...(agg || { v24: 0, v7: 0, v30: 0, topPages: [], topCountries: [] }), leadCount: leadCount || 0, orderCount: orderCount || 0 };
};

// Store orders — checkout writes them via public_place_order; the org
// manages status here.
export const getOrders = async (orgId) => {
  const { data, error } = await supabase.from('site_orders').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return data;
};

// Status changes go through the RPC so fulfilment can move linked Inventory
// stock out of the shipping warehouse (best-effort, once per order).
export const updateOrderStatus = async (id, status) => {
  const { data, error } = await supabase.rpc('set_site_order_status', { p_order_id: id, p_status: status });
  if (error) throw new Error(error.message);
  return data;
};

// Merchant manually confirms a card payment they've sighted in their own
// Paystack dashboard (missed-redirect case) — stamps paid_at so the badge
// agrees with reality.
export const markOrderPaid = async (id) => {
  const { data, error } = await supabase.from('site_orders')
    .update({ status: 'confirmed', paid_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
};

export const money = (n) => n == null ? '' : `₦${Number(n).toLocaleString('en-NG')}`;
