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
