// Which column is which (E7-S2): common bank layouts are recognized from their headers; anything else
// is matched by hand. Then each row becomes { date, amountCents, type, description } or a row error.
import { isIsoDate } from '../../utils/dates.js';
import { MAX_CENTS, MIN_DATE } from '../validate.js';

const norm = (h) => String(h ?? '').toLowerCase().replace(/[^a-z]/g, '');
const find = (headers, ...names) => {
  const keys = headers.map(norm);
  for (const n of names) { const i = keys.indexOf(n); if (i !== -1) return i; }
  return -1;
};

// signs: 'out-negative' = money out is negative (most banks); 'out-positive' = charges are positive (card statements).
// Each layout: name, how to spot it, and its mapping.
const LAYOUTS = [
  { name: 'Chase', spot: (h) => find(h, 'transactiondate') !== -1 && find(h, 'postdate') !== -1 && find(h, 'amount') !== -1,
    map: (h) => ({ date: find(h, 'transactiondate'), description: find(h, 'description'), amount: find(h, 'amount'), signs: 'out-negative' }) },
  { name: 'Capital One', spot: (h) => find(h, 'transactiondate') !== -1 && find(h, 'debit') !== -1 && find(h, 'credit') !== -1,
    map: (h) => ({ date: find(h, 'transactiondate'), description: find(h, 'description'), debit: find(h, 'debit'), credit: find(h, 'credit') }) },
  { name: 'Citi', spot: (h) => find(h, 'status') !== -1 && find(h, 'debit') !== -1 && find(h, 'credit') !== -1,
    map: (h) => ({ date: find(h, 'date'), description: find(h, 'description'), debit: find(h, 'debit'), credit: find(h, 'credit') }) },
  { name: 'American Express', spot: (h) => find(h, 'date') !== -1 && find(h, 'description') !== -1 && find(h, 'amount') !== -1 && find(h, 'extendeddetails', 'appearsonyourstatementas', 'cardmember') !== -1,
    map: (h) => ({ date: find(h, 'date'), description: find(h, 'description'), amount: find(h, 'amount'), signs: 'out-positive' }) },
  { name: 'Bank of America', spot: (h) => find(h, 'runningbal', 'runningbalance') !== -1 && find(h, 'amount') !== -1,
    map: (h) => ({ date: find(h, 'date', 'postingdate'), description: find(h, 'description', 'payee'), amount: find(h, 'amount'), signs: 'out-negative' }) },
  { name: 'Common layout', spot: (h) => find(h, 'date', 'postingdate', 'transactiondate', 'posteddate') !== -1 && find(h, 'description', 'payee', 'merchant', 'name', 'details', 'memo') !== -1 && (find(h, 'amount') !== -1 || (find(h, 'debit', 'withdrawal', 'withdrawals') !== -1 && find(h, 'credit', 'deposit', 'deposits') !== -1)),
    map: (h) => {
      const base = { date: find(h, 'date', 'postingdate', 'transactiondate', 'posteddate'), description: find(h, 'description', 'payee', 'merchant', 'name', 'details', 'memo') };
      return find(h, 'amount') !== -1 ? { ...base, amount: find(h, 'amount'), signs: 'out-negative' } : { ...base, debit: find(h, 'debit', 'withdrawal', 'withdrawals'), credit: find(h, 'credit', 'deposit', 'deposits') };
    } },
];

// rows[0] is the header row when it has no amounts or dates in it.
export const hasHeader = (rows) => !rows[0].some((f) => parseDate(f) || /^[-($]*\d[\d,]*\.\d{2}\)?$/.test(f));

// → { name, mapping } or null (then the person matches columns by hand).
export function detectLayout(rows) {
  if (!hasHeader(rows)) return null;
  const layout = LAYOUTS.find((l) => l.spot(rows[0]));
  return layout ? { name: layout.name, mapping: layout.map(rows[0]) } : null;
}

// "01/31/2026", "1/31/26", "2026-01-31", "2026/01/31" → "2026-01-31" (US month-first). null if not a date.
export function parseDate(text) {
  const t = String(text ?? '').trim();
  let y; let m; let d;
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t);
  if (match) [, y, m, d] = match;
  else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(t))) {
    [, m, d, y] = match;
    if (y.length === 2) y = `20${y}`;
  } else return null;
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}

// "$1,234.56", "-12.00", "(12.00)", "12" → signed cents. null if not an amount.
export function parseSignedAmount(text) {
  let t = String(text ?? '').trim().replace(/\s/g, '');
  if (!t) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1); }
  if (t.startsWith('-')) { sign = -sign; t = t.slice(1); } else if (t.startsWith('+')) t = t.slice(1);
  t = t.replace(/^\$/, '');
  if (t.startsWith('-')) { sign = -sign; t = t.slice(1); }
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!match) return null;
  const cents = Number(match[1].replaceAll(',', '')) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > MAX_CENTS ? null : sign * cents;
}

// One data row → { ok: true, date, amountCents, type, description } or { ok: false, error }.
// A zero amount (a pending hold, a $0 statement line) is skipped, not an error.
export function readRow(row, mapping) {
  const date = parseDate(row[mapping.date]);
  if (!date) return { ok: false, error: `“${String(row[mapping.date] ?? '').slice(0, 20)}” isn’t a date we can read` };
  if (date < MIN_DATE) return { ok: false, error: 'The date is too far in the past' };
  let signed;
  if (mapping.amount !== undefined && mapping.amount !== -1) {
    signed = parseSignedAmount(row[mapping.amount]);
    if (signed === null) return { ok: false, error: `“${String(row[mapping.amount] ?? '').slice(0, 20)}” isn’t an amount` };
    if (mapping.signs === 'out-positive') signed = -signed;
  } else {
    const debit = String(row[mapping.debit] ?? '').trim() ? parseSignedAmount(row[mapping.debit]) : 0;
    const credit = String(row[mapping.credit] ?? '').trim() ? parseSignedAmount(row[mapping.credit]) : 0;
    if (debit === null || credit === null) return { ok: false, error: 'The money in / money out columns aren’t amounts' };
    signed = Math.abs(credit) - Math.abs(debit);
  }
  if (signed === 0) return { ok: true, skip: true };
  const description = String(row[mapping.description] ?? '').trim();
  return { ok: true, date, amountCents: Math.abs(signed), type: signed < 0 ? 'expense' : 'income', description };
}

// A hand-made mapping must name distinct columns for date, description, and amount (or money out + money in).
export function checkMapping(mapping, columns) {
  const ok = (i) => Number.isInteger(i) && i >= 0 && i < columns;
  const errors = {};
  if (!ok(mapping.date)) errors.date = 'Choose the date column';
  if (!ok(mapping.description)) errors.description = 'Choose the description column';
  const single = ok(mapping.amount);
  if (!single && !(ok(mapping.debit) && ok(mapping.credit))) errors.amount = 'Choose the amount column (or both money out and money in)';
  if (single && !['out-negative', 'out-positive'].includes(mapping.signs)) errors.signs = 'Choose how money out is shown';
  const used = [mapping.date, mapping.description, ...(single ? [mapping.amount] : [mapping.debit, mapping.credit])].filter(ok);
  if (new Set(used).size !== used.length) errors.form = 'Each column can only be used once';
  return errors;
}
