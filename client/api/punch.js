// The universal punch endpoint — the one canonical lane every clocking source
// feeds: registered wall devices (thumbprint terminals, turnstiles, any
// hardware that can make an HTTP request) authenticate with their per-device
// key; an org's attendance manager can also push a batch with their own login
// (that is what the CSV import in the Devices tab does). Vendor dialects
// (ZKTeco ADMS etc.) become thin adapters that translate into this later.
//
//   POST /api/punch
//   auth:  x-device-key: <key>            (registered device)
//      or  Authorization: Bearer <token>  (attendance manager — manual import)
//   body:  { personRef, timestamp?, direction? }            single
//      or  { punches: [{ personRef, timestamp?, direction? }, ...] }  batch
//
// Rules, deliberate (see supabase/attendance_punch_core.sql):
//   * punch events only — fingerprint templates are never accepted or stored
//   * back-dated punches are accepted (devices buffer offline and flush when
//     the network returns) but logged with received_at so skew stays visible;
//     future timestamps are refused
//   * idempotent: (org, person, timestamp) is unique — retries can't double-punch
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dxekronjsvnwmnbanlqh.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const json = (res, s, o) => res.status(s).json(o);
const MAX_BATCH = 500;
const FUTURE_SLACK_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { message: 'Method not allowed' });
  if (!SERVICE_KEY) return json(res, 500, { message: 'Server not configured.' });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

  // ---- who is punching? ----
  let orgId = null; let deviceId = null; let source = 'device';
  const deviceKey = req.headers['x-device-key'] || body.deviceKey;
  if (deviceKey) {
    const { data: dev } = await admin.from('attendance_devices')
      .select('id, org_id, active').eq('api_key', String(deviceKey)).maybeSingle();
    if (!dev) return json(res, 401, { message: 'Unknown device key.' });
    if (!dev.active) return json(res, 403, { message: 'This device has been disabled.' });
    const { data: s } = await admin.from('attendance_settings')
      .select('device_enabled').eq('org_id', dev.org_id).maybeSingle();
    if (s && s.device_enabled === false) return json(res, 403, { message: 'Device clock-in is turned off for this company.' });
    orgId = dev.org_id; deviceId = dev.id;
  } else {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return json(res, 401, { message: 'Send a device key or sign in.' });
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) return json(res, 401, { message: 'Invalid session.' });
    const { data: caller } = await admin.from('profiles').select('org_id, role, suites').eq('id', user.id).single();
    const isManager = caller && (caller.role === 'super_admin'
      || (Array.isArray(caller.suites) && caller.suites.some((x) => x.key === 'attendance' && x.role === 'manager')));
    if (!isManager) return json(res, 403, { message: 'Only an attendance manager can import punches.' });
    orgId = caller.org_id; source = 'manual';
  }

  // ---- the punches ----
  const punches = Array.isArray(body.punches) ? body.punches : [body];
  if (!punches.length) return json(res, 400, { message: 'No punches in the request.' });
  if (punches.length > MAX_BATCH) return json(res, 400, { message: `At most ${MAX_BATCH} punches per request.` });

  let applied = 0; let duplicates = 0;
  const unmapped = new Set(); const errors = [];

  for (const p of punches) {
    const personRef = String(p.personRef ?? p.pin ?? '').trim();
    if (!personRef) { errors.push({ personRef: '', error: 'personRef is required' }); continue; }
    const at = p.timestamp ? new Date(p.timestamp) : new Date();
    if (Number.isNaN(at.getTime())) { errors.push({ personRef, error: 'bad timestamp' }); continue; }
    if (at.getTime() > Date.now() + FUTURE_SLACK_MS) { errors.push({ personRef, error: 'timestamp is in the future' }); continue; }
    const direction = ['in', 'out', 'auto'].includes(p.direction) ? p.direction : 'auto';

    // Raw log first — its unique index IS the idempotency.
    const { data: raw, error: rawErr } = await admin.from('attendance_device_punches')
      .insert({ org_id: orgId, device_id: deviceId, person_ref: personRef, punched_at: at.toISOString(), direction, source })
      .select('id').single();
    if (rawErr) {
      if (rawErr.code === '23505') { duplicates += 1; continue; }
      errors.push({ personRef, error: rawErr.message }); continue;
    }

    const { data: map } = await admin.from('attendance_device_map')
      .select('employee_id').eq('org_id', orgId).eq('device_uid', personRef).maybeSingle();
    if (!map) {
      unmapped.add(personRef);
      await admin.from('attendance_device_punches').update({ error: 'unmapped' }).eq('id', raw.id);
      continue;
    }

    const { data: recId, error: applyErr } = await admin.rpc('attendance_apply_punch', {
      p_org: orgId, p_employee: map.employee_id, p_at: at.toISOString(),
      p_direction: direction, p_source: source, p_device_uid: personRef,
    });
    if (applyErr) {
      errors.push({ personRef, error: applyErr.message });
      await admin.from('attendance_device_punches').update({ error: applyErr.message }).eq('id', raw.id);
    } else {
      applied += 1;
      await admin.from('attendance_device_punches').update({ applied: true, record_id: recId }).eq('id', raw.id);
    }
  }

  if (deviceId) await admin.from('attendance_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', deviceId);

  return json(res, 200, { received: punches.length, applied, duplicates, unmapped: [...unmapped], errors });
}
