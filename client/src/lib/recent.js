// "Pick up where you left off": the last few suites and pages this person
// opened, kept per user in localStorage. No server round trip, no new table;
// it is a convenience, and it degrades to nothing in a private window.
const KEY = (userId) => `co-recent:${userId || 'anon'}`;
const MAX = 6;

export function recordRecent(userId, item) {
  if (!userId || !item?.path) return;
  try {
    const list = getRecent(userId).filter((x) => x.path !== item.path);
    list.unshift({ ...item, at: Date.now() });
    localStorage.setItem(KEY(userId), JSON.stringify(list.slice(0, MAX)));
  } catch { /* private mode or quota: the row simply stays empty */ }
}

export function getRecent(userId) {
  try {
    const raw = localStorage.getItem(KEY(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && x.path && x.name) : [];
  } catch { return []; }
}
