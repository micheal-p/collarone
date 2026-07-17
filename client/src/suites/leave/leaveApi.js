import { supabase } from '../../lib/supabaseClient.js';

const me = async () => (await supabase.auth.getUser()).data.user;
const iso = (d) => d; // dates already 'YYYY-MM-DD' from <input type=date>

async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}

export async function getTypes() {
  const { data, error } = await supabase.from('leave_types').select('*').eq('active', true).order('sort');
  if (error) throw error;
  return data;
}

export async function getHolidays(year) {
  const { data, error } = await supabase.from('holidays').select('*').eq('year', year).order('day');
  if (error) throw error;
  return data;
}

export async function getMyRequests(year) {
  const u = await me();
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*, leave_types(name,color,key)')
    .eq('user_id', u.id)
    .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyOverrides(year) {
  const u = await me();
  const { data } = await supabase.from('leave_balances').select('*').eq('user_id', u.id).eq('year', year);
  return data || [];
}

export async function getAllRequests({ status } = {}) {
  let q = supabase
    .from('leave_requests')
    .select('*, applicant:profiles!leave_requests_user_id_fkey(name,email,department), leave_types(name,color,key)')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getTeamCalendar() {
  const { data, error } = await supabase.from('team_calendar').select('*');
  if (error) throw error;
  return data;
}

export const submitRequest = (p) =>
  rpc('submit_leave_request', { _type: p.typeId, _start: iso(p.start), _end: iso(p.end), _half: !!p.half, _reason: p.reason || '' });
export const decideRequest = (id, decision, comment = '') =>
  rpc('decide_leave_request', { _id: id, _decision: decision, _comment: comment });
export const cancelRequest = (id) => rpc('cancel_leave_request', { _id: id });

// ---- settings (approver admin surface) --------------------------------------

let profileCache = null; // { org_id, role } — stable for the session
export async function getMyProfile() {
  if (!profileCache) {
    const u = await me();
    const { data, error } = await supabase.from('profiles').select('org_id, role').eq('id', u.id).single();
    if (error) throw new Error(error.message);
    profileCache = data;
  }
  return profileCache;
}

export async function addHoliday({ name, day }) {
  const { org_id } = await getMyProfile();
  const { error } = await supabase.from('holidays').insert({ name, day, org_id });
  if (error) throw new Error(error.code === '23505' ? 'A holiday already exists on that date.' : error.message);
}

export async function deleteHoliday(id) {
  const { data, error } = await supabase.from('holidays').delete().eq('id', id).select();
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Holiday not deleted — statutory holidays cannot be removed.');
}

// All types (including inactive) for the settings screen; getTypes() stays active-only.
export async function getAllTypes() {
  const { data, error } = await supabase.from('leave_types').select('*').order('sort');
  if (error) throw new Error(error.message);
  return data;
}

const TYPE_RLS_MSG = 'Only the System Administrator can change leave types.';
const isRls = (e) => e?.code === '42501' || /security|policy/i.test(e?.message || '');
const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export async function createType({ name, color, default_days, active, sort }) {
  const { org_id } = await getMyProfile();
  const { error } = await supabase.from('leave_types').insert({
    org_id, key: slug(name) || `type_${Date.now()}`, name, color, default_days, active, sort,
  });
  if (error) throw new Error(isRls(error) ? TYPE_RLS_MSG : error.message);
}

export async function updateType(id, patch) {
  const { data, error } = await supabase.from('leave_types').update(patch).eq('id', id).select();
  if (error) throw new Error(isRls(error) ? TYPE_RLS_MSG : error.message);
  if (!data?.length) throw new Error(TYPE_RLS_MSG); // RLS filters silently on update
}

export async function getOrgStaff() {
  const { data, error } = await supabase.from('profiles').select('id, name, email').eq('status', 'active').order('name');
  if (error) throw new Error(error.message);
  return data;
}

export async function getBalanceRow(userId, typeId, year) {
  const { data, error } = await supabase.from('leave_balances').select('*')
    .eq('user_id', userId).eq('leave_type_id', typeId).eq('year', year).maybeSingle();
  if (error) throw new Error(error.message);
  return data; // null when no override row exists yet
}

export const getAvailable = (userId, typeId, year) =>
  rpc('leave_available', { _user: userId, _type: typeId, _year: year });

export async function saveBalance({ userId, typeId, year, entitled, carried_over, adjustment }) {
  const { org_id } = await getMyProfile();
  const { error } = await supabase.from('leave_balances').upsert(
    { org_id, user_id: userId, leave_type_id: typeId, year, entitled, carried_over, adjustment },
    { onConflict: 'user_id,leave_type_id,year' },
  );
  if (error) throw new Error(error.message);
}

// ---- client-side helpers (display only; the DB is authoritative) ----
export function workingDays(start, end, half, holidaySet) {
  if (!start || !end || end < start) return 0;
  let d = new Date(start + 'T00:00:00'); const last = new Date(end + 'T00:00:00');
  let n = 0;
  while (d <= last) {
    const dow = d.getDay(); // 0=Sun 6=Sat
    const key = d.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(key)) n += 1;
    d.setDate(d.getDate() + 1);
  }
  if (half && start === end && n === 1) n = 0.5;
  return n;
}

export function computeBalances(types, requests, overrides, year) {
  return types.map((t) => {
    const ov = overrides.find((o) => o.leave_type_id === t.id);
    const entitled = Number(ov?.entitled ?? t.default_days) + Number(ov?.carried_over ?? 0) + Number(ov?.adjustment ?? 0);
    const mine = requests.filter((r) => r.leave_type_id === t.id && new Date(r.start_date).getFullYear() === year);
    const taken = mine.filter((r) => r.status === 'approved').reduce((s, r) => s + Number(r.working_days), 0);
    const pending = mine.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.working_days), 0);
    return { type: t, entitled, taken, pending, available: t.tracked ? entitled - taken - pending : null };
  });
}
