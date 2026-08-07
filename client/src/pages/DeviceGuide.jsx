// Public installer guide for connecting clocking hardware to the universal
// punch endpoint. Deliberately public (no login): the person wiring the device
// is usually the vendor's technician, not a Collarone user — the workspace
// admin sends them this link plus the device key from Attendance → Devices.
import { LegalNav, LegalFooter } from './LegalChrome.jsx';
import './Legal.css';

const code = { display: 'block', background: '#14161a', color: '#e8e6e1', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', margin: '8px 0 18px' };
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 8px' };
const h3 = { fontSize: 14.5, fontWeight: 700, margin: '18px 0 6px' };
const p = { fontSize: 14, lineHeight: 1.7, margin: '0 0 10px' };
const td = { padding: '6px 10px', fontSize: 13, borderBottom: '1px solid rgba(10,14,26,0.08)', verticalAlign: 'top' };

export default function DeviceGuide() {
  return (
    <div className="lg">
      <LegalNav />
      <div className="lg-body">
      <p className="lg-kicker">Integration guide</p>
      <h1 className="lg-h1">Connect a clocking device</h1>
      <p className="lg-updated">Everything a device installer needs to feed punches into Collarone. No Collarone login required to follow this page.</p>
      <p style={p}>
        Collarone accepts clock-in/out punches from any hardware that can make an HTTP request — thumbprint
        terminals, RFID readers, turnstile controllers, or a small gateway box wired to older machines. There is
        one endpoint, one authentication header, and one payload shape. If the machine cannot make requests at
        all, skip to <a href="#csv">the CSV route</a>.
      </p>

      <h2 style={h2}>Before you start</h2>
      <p style={p}>Ask the company&rsquo;s workspace admin for two things, both from <strong>Attendance → Devices</strong> in their Collarone:</p>
      <table style={{ borderCollapse: 'collapse', margin: '4px 0 10px' }}><tbody>
        <tr><td style={td}><strong>Device key</strong></td><td style={td}>Issued when they register the device (name + serial). It authorises punch submission for their company only — it cannot read anything.</td></tr>
        <tr><td style={td}><strong>PIN mapping</strong></td><td style={td}>The device knows people as enrolment PINs (1, 2, 42…). The admin maps each PIN to a real employee on the same screen. Punches for unmapped PINs are accepted and stored, and apply once the PIN is mapped.</td></tr>
      </tbody></table>

      <h2 style={h2}>The endpoint</h2>
      <code style={code}>{`POST https://collarone.app/api/punch
x-device-key: <the device key>
Content-Type: application/json`}</code>

      <h3 style={h3}>One punch</h3>
      <code style={code}>{`{ "personRef": "42", "timestamp": "2026-08-07T08:03:00+01:00", "direction": "in" }`}</code>

      <h3 style={h3}>A batch (up to 500 — use this when flushing an offline buffer)</h3>
      <code style={code}>{`{ "punches": [
  { "personRef": "42", "timestamp": "2026-08-07T08:03:00+01:00" },
  { "personRef": "7",  "timestamp": "2026-08-07T08:11:24+01:00" }
] }`}</code>

      <table style={{ borderCollapse: 'collapse', margin: '4px 0 10px' }}><tbody>
        <tr><td style={td}><code>personRef</code></td><td style={td}>Required. The PIN/user ID the person enrolled with on the device.</td></tr>
        <tr><td style={td}><code>timestamp</code></td><td style={td}>ISO&nbsp;8601 with timezone offset (<code>+01:00</code> for Lagos). Omit it and the server stamps the arrival time. Past timestamps are fine — that is how offline buffering works. Future timestamps are refused.</td></tr>
        <tr><td style={td}><code>direction</code></td><td style={td}><code>"in"</code>, <code>"out"</code>, or omit for <code>"auto"</code> — auto closes the person&rsquo;s open shift if one exists, otherwise opens one, which is exactly how a single-reader wall terminal behaves. If your device knows the direction, send it.</td></tr>
      </tbody></table>

      <h3 style={h3}>A test punch with curl</h3>
      <code style={code}>{`curl -X POST https://collarone.app/api/punch \\
  -H "x-device-key: YOUR_DEVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"personRef":"42"}'`}</code>
      <p style={p}>A successful call answers like this — and the device&rsquo;s <em>Last seen</em> light in the admin&rsquo;s Devices tab goes green:</p>
      <code style={code}>{`{ "received": 1, "applied": 1, "duplicates": 0, "unmapped": [], "errors": [] }`}</code>

      <h2 style={h2}>Rules the endpoint enforces</h2>
      <p style={p}>
        <strong>Retries are safe.</strong> The same (person, timestamp) is stored once no matter how many times it is
        sent — on flaky networks, retry freely; duplicates count in <code>duplicates</code>, never double-punch anyone.<br />
        <strong>Send punch events only.</strong> Fingerprint or face templates are never accepted and never stored —
        biometric data stays on your device. Send the PIN and the time, nothing else.<br />
        <strong>Buffer offline, flush later.</strong> Store punches locally when the network is down and send the batch
        when it returns, with their original timestamps. Collarone records both when the punch happened and when it
        arrived.
      </p>

      <h2 style={h2}>Common responses</h2>
      <table style={{ borderCollapse: 'collapse', margin: '4px 0 10px' }}><tbody>
        <tr><td style={td}><code>401 Unknown device key</code></td><td style={td}>The key is wrong, or the device was deleted. Get a fresh key from the admin.</td></tr>
        <tr><td style={td}><code>403 This device has been disabled</code></td><td style={td}>The admin disabled it in the Devices tab.</td></tr>
        <tr><td style={td}><code>403 Device clock-in is turned off</code></td><td style={td}>The company switched the wall-device lane off in Clock-in rules.</td></tr>
        <tr><td style={td}><code>unmapped</code> in the response</td><td style={td}>Not an error — those PINs have no employee mapped yet. The punches are stored; ask the admin to map the PINs.</td></tr>
      </tbody></table>

      <h2 style={h2}>Gateway pattern for devices without an internet option</h2>
      <p style={p}>
        Many older terminals only speak to software on the local network. The pattern: a small always-on box (a
        Raspberry&nbsp;Pi is plenty) on the same network reads new punches from the device — via the vendor&rsquo;s SDK,
        its database, or its export folder — and forwards them to the endpoint above. Twenty lines of any language:
      </p>
      <code style={code}>{`# every minute:
new_punches = read_from_device_since(last_sync)   # vendor SDK / db / export dir
POST /api/punch  { "punches": [ ... ] }           # with the x-device-key header
last_sync = now`}</code>
      <p style={p}>
        ZKTeco-family devices with &ldquo;ADMS / Cloud Server&rdquo; in the menu: direct connection (typing
        collarone.app into the device itself, no gateway box) is on our roadmap — tell us at{' '}
        <a href="https://wa.me/2348148128551" target="_blank" rel="noreferrer">0814 812 8551</a> and we will
        prioritise it for you. The gateway pattern above works for them today.
      </p>

      <h2 style={h2} id="csv">No connectivity at all: the CSV route</h2>
      <p style={p}>
        Every clocking machine ever made can export its log. The admin uploads it in
        <strong> Attendance → Devices → Import a CSV export</strong> — one punch per line:
      </p>
      <code style={code}>{`42,2026-08-07T08:03:00+01:00,in
42,2026-08-07T17:12:00+01:00,out
7,2026-08-07T08:11:24+01:00`}</code>
      <p style={p}>
        Direction is optional. Re-uploading the same file is harmless — duplicates are recognised and skipped.
      </p>
      </div>
      <LegalFooter />
    </div>
  );
}
