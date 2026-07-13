// Tiny visual skeleton preview of a site theme — one mockup per layout,
// tinted with the theme's own accent/tone so it actually looks like that
// theme. Shared by the website builder's theme picker and Platform Admin's
// theme gallery. Accepts raw site_themes rows (snake_case) or the public
// payload's camelCase theme object.
export default function ThemeMockup({ theme, height = 108 }) {
  const layout = theme.layout_key || theme.layoutKey;
  const dark = theme.tone === 'dark';
  const bg = dark ? '#15171c' : '#ffffff';
  const surface = dark ? '#20232b' : '#f1f1f3';
  const line = dark ? '#333844' : '#e2e2e6';
  const accent = theme.accent;
  const box = { width: '100%', height, borderRadius: 8, overflow: 'hidden', background: bg, border: `1px solid ${line}` };

  if (layout === 'ecommerce-grid') {
    return (
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderBottom: `1px solid ${line}` }}>
          <div style={{ width: 28, height: 6, borderRadius: 3, background: line }} />
          <div style={{ width: 22, height: 10, borderRadius: 5, background: accent }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, padding: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: surface, borderRadius: 4, height: Math.max(22, height - 78) }} />
          ))}
        </div>
      </div>
    );
  }
  if (layout === 'landing-hero') {
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
