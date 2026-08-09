// Give every stacked table cell its column name back.
//
// Below 640px the shared table CSS hides `thead` and makes each `td` a block,
// which turns a row into a card. That is the right shape for a phone — but the
// labels went with the header, so a row reads as an unlabelled stack:
//
//     Adaeze Nwosu
//     Operations
//     14 Mar 2024
//     Full time
//     ₦450,000
//
// Which of those is the start date and which is the salary review date? Which
// number is gross and which is net? On a payroll or invoice table that is not
// a cosmetic problem, because someone will act on the number they think they
// are reading.
//
// The fix is CSS (`td::before { content: attr(data-label) }`), and the reason
// it was never done is that it needs a data-label on every cell in twelve
// files. So the attribute is stamped here instead, at runtime, by copying each
// column's header text into the cells beneath it. One change, every table,
// including ones written later by someone who never reads this file.
//
// Desktop does nothing: the observer only runs while the narrow media query
// matches, and disconnects when it stops.

const MOBILE = '(max-width: 640px)';

function stamp(root = document) {
  for (const table of root.querySelectorAll('table.table')) {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    if (!heads.length) continue;
    for (const row of table.querySelectorAll('tbody tr')) {
      const cells = row.children;
      for (let i = 0; i < cells.length; i++) {
        const label = heads[i] || '';
        // Skip cells that carry their own meaning: the first column is the
        // thing itself (a name, an invoice number) and reads fine unlabelled,
        // and action cells hold buttons, not values.
        const skip = i === 0
          || cells[i].classList.contains('ta-r')
          || cells[i].classList.contains('col-check');
        const want = skip ? '' : label;
        // Only touch the DOM when it would actually change, so this cannot
        // feed its own MutationObserver.
        if ((cells[i].getAttribute('data-label') || '') !== want) {
          if (want) cells[i].setAttribute('data-label', want);
          else cells[i].removeAttribute('data-label');
        }
      }
    }
  }
}

export function installLabelledTables() {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(MOBILE);
  let observer = null;
  let queued = false;

  const run = () => {
    queued = false;
    try { stamp(); } catch { /* labels are a nicety; never break the page */ }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };

  const start = () => {
    if (observer) return;
    run();
    observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
  };
  const stop = () => {
    observer?.disconnect();
    observer = null;
  };

  if (mq.matches) start(); else stop();
  const onChange = () => (mq.matches ? start() : stop());
  mq.addEventListener('change', onChange);

  return () => { mq.removeEventListener('change', onChange); stop(); };
}
