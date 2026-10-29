// Pure helpers for the History screen: filter by month and search, group by day, total up.
import { monthKey } from '../utils/dates.js';

// Case- and accent-insensitive, so "cafe" finds "Café".
const normalize = (text) => String(text ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filterTransactions(transactions, { month, query = '', categories = [] }) {
  const names = new Map(categories.map((c) => [c.id, normalize(c.name)]));
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return transactions.filter((t) => {
    if (month && monthKey(t.date) !== month) return false;
    if (!words.length) return true;
    const haystack = `${normalize(t.note)} ${names.get(t.categoryId) ?? ''}`;
    return words.every((w) => haystack.includes(w));
  });
}

// Keeps the incoming order (newest first) and groups consecutive days: [{ date, items }].
export function groupByDay(transactions) {
  const groups = [];
  for (const t of transactions) {
    const last = groups.at(-1);
    if (last?.date === t.date) last.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

export function totals(transactions) {
  let inCents = 0;
  let outCents = 0;
  for (const t of transactions) {
    if (t.type === 'income') inCents += t.amountCents;
    else outCents += t.amountCents;
  }
  return { inCents, outCents };
}
