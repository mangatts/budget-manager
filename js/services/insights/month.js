// Pure month math for Home and the coach. Money is integer cents throughout.
import { monthKey, shiftMonth } from '../../utils/dates.js';
import { totals } from '../history.js';

export const inMonth = (transactions, month) => transactions.filter((t) => monthKey(t.date) === month);

export function monthSummary(transactions, month) {
  const { inCents, outCents } = totals(inMonth(transactions, month));
  return { inCents, outCents, leftCents: inCents - outCents };
}

// Money out per 50/30/20 group; categories without a bucket count as "want" (nice-to-have).
export function byBucket(transactions, categories) {
  const bucketOf = new Map(categories.map((c) => [c.id, c.bucket ?? 'want']));
  const sums = { need: 0, want: 0, savings: 0 };
  for (const t of transactions) if (t.type === 'expense') sums[bucketOf.get(t.categoryId) ?? 'want'] += t.amountCents;
  return sums;
}

// Monthly take-home: what the person entered, or else the median money-in of the last
// 3 complete months that have any (labeled "estimated" in the UI). null if nothing to go on.
export function monthlyIncome({ transactions, meta }, currentMonth) {
  if (Number.isSafeInteger(meta.monthlyTakeHomeCents) && meta.monthlyTakeHomeCents > 0) {
    return { cents: meta.monthlyTakeHomeCents, estimated: false };
  }
  const months = [1, 2, 3].map((n) => shiftMonth(currentMonth, -n))
    .map((m) => monthSummary(transactions, m).inCents)
    .filter((cents) => cents > 0)
    .sort((a, b) => a - b);
  if (!months.length) return null;
  const mid = Math.floor(months.length / 2);
  const median = months.length % 2 ? months[mid] : Math.round((months[mid - 1] + months[mid]) / 2);
  return { cents: median, estimated: true };
}

// Income for a month, as Safe to Spend and the 50/30/20 split use it: the higher of money in recorded
// that month and the expected monthly income (entered take-home, or estimated). null if none.
export function incomeForMonth(state, month) {
  const recordedCents = inMonth(state.transactions, month).filter((t) => t.type === 'income').reduce((s, t) => s + t.amountCents, 0);
  const expected = monthlyIncome(state, month);
  if (expected && expected.cents > recordedCents) return { cents: expected.cents, source: expected.estimated ? 'estimated' : 'take-home', recordedCents };
  return recordedCents > 0 ? { cents: recordedCents, source: 'recorded', recordedCents } : null;
}

// Money out by category for a month, biggest first: the top `top` plus "Everything else". Pure.
export function spendingByCategory({ transactions, categories }, month, top = 6) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map();
  for (const t of inMonth(transactions, month)) {
    if (t.type !== 'expense') continue;
    totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountCents);
  }
  const totalCents = [...totals.values()].reduce((s, c) => s + c, 0);
  const rows = [...totals].map(([id, cents]) => ({ id, name: byId.get(id)?.name ?? 'Unknown', icon: byId.get(id)?.icon ?? '•', cents }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));
  const shown = rows.slice(0, top);
  const rest = rows.slice(top);
  if (rest.length) shown.push({ id: 'other', name: `Everything else (${rest.length})`, icon: '…', cents: rest.reduce((s, r) => s + r.cents, 0) });
  return { totalCents, rows: shown.map((r) => ({ ...r, share: totalCents ? r.cents / totalCents : 0 })) };
}
