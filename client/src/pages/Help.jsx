import { useState } from 'react';
import AppLayout from '../components/AppLayout.jsx';

// Illustrative mockups, not real screenshots — no authenticated screenshot
// capture was available for this, so these are drawn to scale/layout instead.
// Kept in the same lightweight CSS-box technique as the website builder's
// theme previews.
const M = {
  wrap: { border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', background: '#fff', margin: '14px 0' },
  bar: { height: 22, background: '#f3f2f1', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' },
  dot: (c) => ({ width: 7, height: 7, borderRadius: '50%', background: c }),
};

function DesktopLauncherMockup() {
  return (
    <div style={{ ...M.wrap, maxWidth: 520 }}>
      <div style={M.bar}><span style={M.dot('#ff5f57')} /><span style={M.dot('#febc2e')} /><span style={M.dot('#28c840')} /></div>
      <div style={{ display: 'flex' }}>
        <div style={{ width: 90, background: '#fafafa', borderRight: '1px solid var(--line)', padding: 8 }}>
          {['Home', 'HR', 'Leave', 'Tasks', 'CRM'].map((s) => <div key={s} style={{ fontSize: 8, padding: '5px 4px', borderRadius: 4, marginBottom: 3, background: s === 'Home' ? '#eee' : 'transparent' }}>{s}</div>)}
        </div>
        <div style={{ flex: 1, padding: 10 }}>
          <div style={{ width: '60%', height: 8, background: '#333', borderRadius: 3, marginBottom: 10 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[0, 1, 2, 3, 3].map((i, idx) => (
              <div key={idx} style={{ height: 40, borderRadius: 6, background: '#f5f5f5', border: '1px solid #eee' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminCenterMockup() {
  return (
    <div style={{ ...M.wrap, maxWidth: 520 }}>
      <div style={M.bar}><span style={M.dot('#ff5f57')} /><span style={M.dot('#febc2e')} /><span style={M.dot('#28c840')} /></div>
      <div style={{ padding: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ width: '30%', height: 8, background: '#333', borderRadius: 3 }} />
          <div style={{ width: 50, height: 14, background: 'var(--brand)', borderRadius: 4 }} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderTop: i > 0 ? '1px solid #f0f0f0' : 'none', alignItems: 'center' }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#ddd' }} />
            <div style={{ width: '40%', height: 6, background: '#ccc', borderRadius: 3 }} />
            <div style={{ width: 30, height: 10, background: '#e5f4e5', borderRadius: 8, marginLeft: 'auto' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileMockup() {
  return (
    <div style={{ ...M.wrap, maxWidth: 200, border: '2px solid #333', borderRadius: 20, padding: '10px 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 8px', alignItems: 'center' }}>
        <div style={{ width: 14, height: 10, display: 'flex', flexDirection: 'column', gap: 2 }}><div style={{ height: 2, background: '#333' }} /><div style={{ height: 2, background: '#333' }} /><div style={{ height: 2, background: '#333' }} /></div>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--brand)' }} />
      </div>
      <div style={{ width: '70%', height: 7, background: '#333', borderRadius: 3, marginBottom: 8 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ height: 34, borderRadius: 6, background: '#f5f5f5', border: '1px solid #eee', marginBottom: 6 }} />
      ))}
    </div>
  );
}

const SECTIONS = [
  {
    id: 'launcher',
    title: '1. Signing in & the Suite Launcher',
    body: "After you log in, you land on the Launcher — every suite you've been granted access to shows as a tile. Click one to open it. If a tile is greyed out, ask your System Administrator to grant you that suite from the Admin Center.",
    mockup: <DesktopLauncherMockup />,
  },
  {
    id: 'admin',
    title: '2. Admin Center — Users, Departments, Billing',
    body: "System Administrators manage everything from Administration in the left rail: create staff accounts (no self-signup — admins provision every account), assign departments, grant or revoke suite access per person, and manage billing/seats. Each suite can also have its own \"manager\" role for people who need to approve things (e.g. approving leave, running payroll) without being a full System Administrator.",
    mockup: <AdminCenterMockup />,
  },
  {
    id: 'suites',
    title: '3. Using a suite',
    body: 'Every suite follows the same shape: tabs across the top for different views, a table of records in the middle, and a primary button (top right) to create something new. Click any row for more detail or to edit it. Most suites have both a "staff" view (your own stuff) and a "manager" view (everyone\'s, plus approvals) — which one you see depends on your role in that suite.',
    mockup: null,
  },
  {
    id: 'mobile',
    title: '4. On your phone',
    body: 'The whole platform is responsive — suite tiles stack to a single column, the left rail collapses behind the hamburger menu (☰) top-left, and tables scroll horizontally where needed. Everything you can do on desktop, you can do on mobile — this was built for teams who are out in the field as often as they\'re at a desk.',
    mockup: <MobileMockup />,
  },
];

export default function Help() {
  const [open, setOpen] = useState('launcher');
  return (
    <AppLayout breadcrumb={[{ label: 'Home', to: '/' }, { label: 'How to use Collarone' }]} title="How to use Collarone">
      <div style={{ maxWidth: 640 }}>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 20 }}>
          A quick walkthrough of how the platform is laid out — on desktop and on mobile. If you get stuck, reach out to your System Administrator.
        </p>
        {SECTIONS.map((s) => (
          <div key={s.id} style={{ marginBottom: 10, border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(open === s.id ? null : s.id)}
              style={{ width: '100%', textAlign: 'left', padding: '14px 18px', background: 'var(--surface)', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14.5, display: 'flex', justifyContent: 'space-between' }}
            >
              {s.title}
              <span style={{ transform: open === s.id ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
            </button>
            {open === s.id && (
              <div style={{ padding: '0 18px 18px' }}>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-2)', margin: '0 0 4px' }}>{s.body}</p>
                {s.mockup}
              </div>
            )}
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
