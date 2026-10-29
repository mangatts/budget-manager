// Needs / Wants / Savings as a share of income, against the 50/30/20 guideline (E4-S3). Pure.
import { inMonth, byBucket, incomeForMonth } from './month.js';
import { INCOME_BENCHMARKS } from './benchmarkData.js';

export const MIN_ENTRIES = 5; // fewer than this and the split says more about timing than habits

const GROUPS = [
  { key: 'need', benchmark: INCOME_BENCHMARKS.needs, over: 'high' },
  { key: 'want', benchmark: INCOME_BENCHMARKS.wants, over: 'high' },
  { key: 'savings', benchmark: INCOME_BENCHMARKS.savings, over: 'low' },
];

const percentOf = (cents, income) => Math.round((cents / income) * 100);

export function fiftyThirtyTwenty(state, month) {
  const entries = inMonth(state.transactions, month).filter((t) => t.type === 'expense');
  if (entries.length < MIN_ENTRIES) return { available: false, reason: 'few-entries', entries: entries.length };
  const income = incomeForMonth(state, month);
  if (!income) return { available: false, reason: 'no-income' };

  const sums = byBucket(entries, state.categories);
  const groups = GROUPS.map(({ key, benchmark, over }) => {
    const percent = percentOf(sums[key], income.cents);
    const guideline = Math.round(benchmark.share * 100);
    // Needs and wants: above the guideline is worth a look. Savings: below it is.
    const status = over === 'high' ? (percent > guideline ? 'high' : 'ok') : (percent < guideline ? 'low' : 'ok');
    return { key, label: benchmark.label, cents: sums[key], percent, guideline, status, note: benchmark.note };
  });
  return { available: true, incomeCents: income.cents, incomeSource: income.source, groups, headline: headline(groups) };
}

// One plain sentence about the biggest gap. Neutral wording: information, not judgment.
export function headline(groups) {
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));
  const gaps = [
    byKey.want.status === 'high' && { size: byKey.want.percent - 30, text: `Wants are ${byKey.want.percent}% of your income. The guideline is 30%.` },
    byKey.need.status === 'high' && { size: byKey.need.percent - 50, text: `Needs are ${byKey.need.percent}% of your income. The guideline is 50%.` },
    byKey.savings.status === 'low' && { size: 20 - byKey.savings.percent, text: `You’ve put ${byKey.savings.percent}% of your income toward savings so far. The guideline is 20%.` },
  ].filter(Boolean).sort((a, b) => b.size - a.size);
  return gaps[0]?.text ?? 'You’re within the 50/30/20 guideline this month. Nice work.';
}
