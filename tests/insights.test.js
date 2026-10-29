import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthSummary, byBucket, monthlyIncome, inMonth } from '../js/services/insights/month.js';
import { SPENDING_BENCHMARKS, INCOME_BENCHMARKS, BLS_2024, CATEGORY_BENCHMARK } from '../js/services/insights/benchmarkData.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';
import { validateProfile } from '../js/services/validate.js';

const tx = (date, type, amountCents, categoryId = type === 'income' ? 'c-paycheck' : 'c-dining') => ({ date, type, amountCents, categoryId });
const list = [
  tx('2026-10-28', 'expense', 475), tx('2026-10-01', 'expense', 140000, 'c-housing'), tx('2026-10-15', 'income', 225000),
  tx('2026-10-20', 'expense', 50000, 'c-savings'), tx('2026-09-30', 'income', 400000), tx('2026-08-15', 'income', 450000),
  tx('2026-07-15', 'income', 300000), tx('2026-06-15', 'income', 999999),
];

test('month summary: in, out, left in cents', () => {
  assert.deepEqual(monthSummary(list, '2026-10'), { inCents: 225000, outCents: 190475, leftCents: 34525 });
  assert.deepEqual(monthSummary(list, '2026-11'), { inCents: 0, outCents: 0, leftCents: 0 });
  assert.equal(inMonth(list, '2026-09').length, 1);
});

test('money out by needs / wants / savings (unknown → want, income ignored)', () => {
  const october = inMonth(list, '2026-10');
  assert.deepEqual(byBucket(october, DEFAULT_CATEGORIES), { need: 140000, want: 475, savings: 50000 });
  assert.deepEqual(byBucket([tx('2026-10-01', 'expense', 100, 'c-gone')], DEFAULT_CATEGORIES), { need: 0, want: 100, savings: 0 });
});

test('income: what you entered wins; otherwise median of the last 3 months with income', () => {
  assert.deepEqual(monthlyIncome({ transactions: list, meta: { monthlyTakeHomeCents: 450000 } }, '2026-10'), { cents: 450000, estimated: false });
  // Sep 4,000 · Aug 4,500 · Jul 3,000 → median 4,000 (June is too old, October is the current month)
  assert.deepEqual(monthlyIncome({ transactions: list, meta: {} }, '2026-10'), { cents: 400000, estimated: true });
  // For August: Jul 3,000 and Jun 9,999.99 (May has none) → two months → average of the two
  assert.deepEqual(monthlyIncome({ transactions: list, meta: {} }, '2026-08'), { cents: 650000, estimated: true });
  assert.equal(monthlyIncome({ transactions: [], meta: {} }, '2026-10'), null);
});

test('profile: take-home optional, savings 0–50 whole number', () => {
  assert.deepEqual(validateProfile({ takeHome: '$4,500', savingsPercent: '20' }).value, { monthlyTakeHomeCents: 450000, savingsPercent: 20 });
  assert.deepEqual(validateProfile({ takeHome: '', savingsPercent: '0%' }).value, { monthlyTakeHomeCents: null, savingsPercent: 0 });
  assert.equal(validateProfile({ takeHome: 'abc', savingsPercent: '20' }).errors.takeHome, 'Enter an amount like 12.50');
  for (const bad of ['51', '-5', '12.5', '', 'x']) assert.match(validateProfile({ savingsPercent: bad }).errors.savingsPercent, /0 to 50/, bad);
});

test('benchmark data: every number has a source, link (or citation), and date', () => {
  for (const b of [...Object.values(SPENDING_BENCHMARKS), ...Object.values(INCOME_BENCHMARKS)]) {
    assert.ok(b.source && b.asOf && /^\d{4}-\d{2}-\d{2}$/.test(b.asOf), b.key);
    if (b.url) assert.match(b.url, /^https:\/\/(www\.)?(bls\.gov|huduser\.gov|consumerfinance\.gov|files\.consumerfinance\.gov)\//, b.key);
  }
});

test('BLS 2024 figures are internally consistent', () => {
  assert.equal(BLS_2024.base, BLS_2024.totalSpending - BLS_2024.personalInsuranceAndPensions);
  // Published shares of total spending (Table A): housing 33.4%, transportation 17.0%, food 12.9%.
  const ofTotal = (d) => Math.round((d / BLS_2024.totalSpending) * 1000) / 10;
  assert.equal(ofTotal(BLS_2024.dollars.housing), 33.4);
  assert.equal(ofTotal(BLS_2024.dollars.transportation), 17.0);
  assert.equal(ofTotal(BLS_2024.dollars.food_home + BLS_2024.dollars.food_away), 12.9);
  // Normalized (without payroll deductions): dining out ≈ 5.7%, groceries ≈ 9.1%.
  assert.equal(SPENDING_BENCHMARKS.food_away.share, 0.057);
  assert.equal(SPENDING_BENCHMARKS.food_home.share, 0.091);
  const total = Object.values(SPENDING_BENCHMARKS).reduce((sum, b) => sum + b.share, 0);
  assert.ok(total < 1, 'listed categories are a subset of all spending');
});

test('50/30/20 adds up, and every default benchmark key has a mapping or is intentionally unmapped', () => {
  assert.equal(INCOME_BENCHMARKS.needs.share + INCOME_BENCHMARKS.wants.share + INCOME_BENCHMARKS.savings.share, 1);
  const keys = new Set(DEFAULT_CATEGORIES.map((c) => c.benchmarkKey).filter(Boolean));
  const unmapped = [...keys].filter((k) => !(k in CATEGORY_BENCHMARK));
  // debt & savings are measured against income; shopping is too broad for any single BLS line.
  assert.deepEqual(unmapped.sort(), ['apparel_misc', 'debt', 'savings']);
  for (const target of Object.values(CATEGORY_BENCHMARK)) assert.ok(target in SPENDING_BENCHMARKS, target);
  assert.equal(CATEGORY_BENCHMARK.apparel_misc, undefined);
});
