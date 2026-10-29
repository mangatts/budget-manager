import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fiftyThirtyTwenty, headline, MIN_ENTRIES } from '../js/services/insights/split.js';
import { incomeForMonth } from '../js/services/insights/month.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

const tx = (amountCents, categoryId, type = 'expense', date = '2026-10-10') => ({ date, type, amountCents, categoryId });
const state = (transactions, meta = { monthlyTakeHomeCents: 400000 }) => ({ transactions, categories: DEFAULT_CATEGORIES, meta });
const five = [tx(140000, 'c-housing'), tx(40000, 'c-groceries'), tx(60000, 'c-dining'), tx(20000, 'c-shopping'), tx(40000, 'c-savings')];

test('shares of income per group, against 50 / 30 / 20', () => {
  const s = fiftyThirtyTwenty(state(five), '2026-10');
  assert.equal(s.available, true);
  assert.equal(s.incomeCents, 400000);
  assert.deepEqual(s.groups.map((g) => [g.key, g.percent, g.guideline, g.status]), [
    ['need', 45, 50, 'ok'], // 1,800 / 4,000
    ['want', 20, 30, 'ok'], // 800
    ['savings', 10, 20, 'low'], // 400
  ]);
  assert.equal(s.headline, 'You’ve put 10% of your income toward savings so far. The guideline is 20%.');
});

test('above the guideline is flagged for needs and wants; the biggest gap leads', () => {
  const s = fiftyThirtyTwenty(state([...five, tx(120000, 'c-dining'), tx(20000, 'c-savings')]), '2026-10');
  assert.deepEqual(s.groups.map((g) => g.status), ['ok', 'high', 'low']); // wants 50%, savings 15%
  assert.equal(s.headline, 'Wants are 50% of your income. The guideline is 30%.');
});

test('within all three → a short, positive line', () => {
  assert.equal(headline([{ key: 'need', percent: 48, status: 'ok' }, { key: 'want', percent: 29, status: 'ok' }, { key: 'savings', percent: 21, status: 'ok' }]), 'You’re within the 50/30/20 guideline this month. Nice work.');
});

test('not shown with too few entries or no income', () => {
  assert.deepEqual(fiftyThirtyTwenty(state(five.slice(0, MIN_ENTRIES - 1)), '2026-10'), { available: false, reason: 'few-entries', entries: 4 });
  assert.equal(fiftyThirtyTwenty(state(five, {}), '2026-10').reason, 'no-income');
});

test('income: recorded money in counts when higher than take-home; other months ignored', () => {
  const s = fiftyThirtyTwenty(state([...five, tx(500000, 'c-paycheck', 'income'), tx(999999, 'c-dining', 'expense', '2026-09-01')]), '2026-10');
  assert.equal(s.incomeCents, 500000);
  assert.equal(s.incomeSource, 'recorded');
  assert.equal(s.groups[0].percent, 36);
  assert.equal(incomeForMonth(state([]), '2026-10').source, 'take-home');
});

test('percent can exceed 100 when spending is above income (the bar caps, the number does not)', () => {
  const s = fiftyThirtyTwenty(state([...five, tx(800000, 'c-housing')], { monthlyTakeHomeCents: 400000 }), '2026-10');
  assert.equal(s.groups[0].percent, 245);
});
