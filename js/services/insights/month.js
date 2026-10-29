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
