// Minimal inline SVG icon set (stroke-based, Fluent-ish). 24x24 viewBox.
const PATHS = {
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16 6.5a3 3 0 0 1 0 5.6M17 14c2.5.4 4 2.3 4 5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><rect x="7" y="12.5" width="3.5" height="3.5" rx=".5" /></>,
  check: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M8 12l2.5 2.5L16 9" /></>,
  badge: <><rect x="4" y="3.5" width="16" height="17" rx="2" /><circle cx="12" cy="10" r="2.6" /><path d="M8 17c.6-2 2.2-3 4-3s3.4 1 4 3" /></>,
  laptop: <><rect x="4" y="5" width="16" height="10" rx="1.5" /><path d="M2.5 19h19l-1.5-3.5h-16z" /></>,
  cart: <><circle cx="9.5" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /><path d="M3 4h2l2 11h11l2-8H6" /></>,
  box: <><path d="M12 3l8 4.2v9.6L12 21l-8-4.2V7.2z" /><path d="M4 7.2l8 4.2 8-4.2M12 11.4V21" /></>,
  // Finance. Was a small lopsided cylinder with a second coin drawn as a broken
  // arc trailing off it, which at 26px read as a stray squiggle rather than a
  // coin. A plain stacked-cylinder replacement was legible but is the universal
  // DATABASE icon — wrong meaning on the Finance tile. A naira mark on a coin
  // is unambiguous at every size and says what the suite is about in a product
  // whose prices, payslips and invoices are all in naira.
  //
  // The one trade-off: it is currency-specific. Revisit if Collarone ever sells
  // outside Nigeria, since only payroll is country-locked today.
  coins: <><circle cx="12" cy="12" r="8.5" /><path d="M9 16V8l6 8V8" /><path d="M8 11h8M8 13.5h8" /></>,
  // The card marks were drawn twice: three zero-length segments (M6.2 8h0),
  // which round line caps turn into dots, sitting on top of three short lines
  // covering the same spots. At tile size that read as uneven smudges rather
  // than cards. One mark per card, one card per column, plus a second in the
  // first column so the board looks in progress.
  kanban: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M9 4v16M15 4v16" /><path d="M5.5 8h2M11 8h2M16.5 8h2M5.5 12h2" /></>,
  doc: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.4" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.4" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.4" /></>,
  home: <><path d="M4 10.5L12 4l8 6.5" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  shield: <><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  // Two full-width verticals crossing two full-width horizontals made a 3x3
  // mesh that read as a spreadsheet, not a building. Windows are separate
  // marks now, and a door at the base gives it a ground floor.
  building: <><rect x="4" y="7" width="16" height="14" rx="1.5" /><path d="M9 4h6v3" /><path d="M8 11h3M13 11h3M8 15h3M13 15h3" /><path d="M10.5 21v-3h3v3" /></>,
  wallet: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h11A2.5 2.5 0 0 1 19 7.5V8H5.5A2.5 2.5 0 0 1 3 5.5" /><rect x="3" y="8" width="18" height="11" rx="2" /><circle cx="16" cy="13.5" r="1.4" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></>,
  heart: <><path d="M12 20s-7.5-4.6-9.7-9.3C.7 6.9 3 3.6 6.4 3.6c2 0 3.5 1.2 5.6 3.8 2.1-2.6 3.6-3.8 5.6-3.8 3.4 0 5.7 3.3 4.1 7.1C19.5 15.4 12 20 12 20z" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5a14 14 0 0 1 0 17M12 3.5a14 14 0 0 0 0 17" /></>,
  contacts: <><rect x="4" y="3" width="13" height="18" rx="1.5" /><circle cx="10.5" cy="9.5" r="2.4" /><path d="M7 16c.6-1.8 2-2.7 3.5-2.7s2.9.9 3.5 2.7" /><path d="M19.5 8h1.5M19.5 12h1.5M19.5 16h1.5" /></>,
  bolt: <><path d="M13 2.5 4.5 13.5H11l-1.5 8 8.5-11H11.5z" /></>,
  receipt: <><path d="M6 3h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" /><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" /></>,
  chat: <><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.9 8.9 0 0 1-4-.9L3 20l1-4.5A8.4 8.4 0 0 1 12.5 3a8.4 8.4 0 0 1 8.5 8.5Z" /><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" /></>,
};

export default function SuiteIcon({ name, size = 24, color = 'currentColor', strokeWidth = 1.6, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {PATHS[name] || PATHS.grid}
    </svg>
  );
}
