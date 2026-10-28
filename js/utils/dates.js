// Dates are stored as local calendar days ("2026-10-28"), never as UTC timestamps:
// toISOString() would file a 9 pm expense under tomorrow for anyone west of UTC.

const pad = (n) => String(n).padStart(2, '0');

export function todayLocal(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Calendar math in UTC so daylight-saving changes can't shift a day.
const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUtc = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

// True only for real calendar days in YYYY-MM-DD form (rejects 2026-02-30).
export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

export function addDays(iso, days) {
  const date = toUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUtc(date);
}

// Feb 29 + 1 year → Feb 28.
export function addYears(iso, years) {
  const [y, m, d] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${pad(m)}-${pad(Math.min(d, lastDay))}`;
}

export const monthKey = (iso) => iso.slice(0, 7);

export function shiftMonth(key, months) {
  const [y, m] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

// "Today", "Yesterday", "Mon, Oct 26", or "Mon, Oct 26, 2025" for other years.
export function formatDay(iso, today = todayLocal()) {
  if (iso === today) return 'Today';
  if (iso === addDays(today, -1)) return 'Yesterday';
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return toUtc(iso).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

// "October 2026"
export function formatMonth(key) {
  return toUtc(`${key}-01`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
}
