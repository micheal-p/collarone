// Per-org brand theming: overrides the --brand CSS custom properties defined
// once in styles/global.css. Every consuming component already reads
// var(--brand)/var(--accent)/etc, so this needs zero component-level changes.
const COLLARONE_DEFAULT = '#FF5B1F';

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function mix(rgb, target, amt) {
  return rgb.map((c, i) => c + (target[i] - c) * amt);
}

export function applyOrgTheme(hex) {
  const color = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : COLLARONE_DEFAULT;
  const rgb = hexToRgb(color);
  const dark = rgbToHex(mix(rgb, [0, 0, 0], 0.28));
  const tint = rgbToHex(mix(rgb, [255, 255, 255], 0.92));
  const ink = rgbToHex(mix(rgb, [0, 0, 0], 0.55));
  const root = document.documentElement.style;
  root.setProperty('--brand', color);
  root.setProperty('--brand-dark', dark);
  root.setProperty('--brand-700', dark);
  root.setProperty('--brand-100', tint);
  root.setProperty('--brand-ink', ink);
  root.setProperty('--accent', color);
}

export const resetOrgTheme = () => applyOrgTheme(COLLARONE_DEFAULT);
