import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachTips, spendingWindow, usualFor } from '../js/services/insights/engine.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

let n = 0;
const tx = (date, amountCents, categoryId, type = 'expense') => ({ id: `t${++n}`, date, type, amountCents, categoryId });
const state = (transactions, extra = {}) => ({ transactions, categories: DEFAULT_CATEGORIES, bills: [], meta: {}, ...extra });
const TODAY = '2026-10-28';

// 30 days of everyday spending: $2,000 total, dining $400 (20%), groceries $600, gas $300, shopping $700.
function month30() {
  const out = [];
  for (let d = 1; d <= 10; d++) {
    const date = `2026-10-${String(d + 15).padStart(2, '0')}`;
    out.push(tx(date, 4000, 'c-dining'), tx(date, 6000, 'c-groceries'), tx(date, 3000, 'c-gas'), tx(date, 7000, 'c-shopping'));
  }
  return out;
}

test('window: 30 days for new users, 90 once there are 2+ months of history', () => {
  assert.equal(spendingWindow([tx('2026-10-20', 100, 'c-dining')], TODAY).days, 30);
  assert.equal(spendingWindow([tx('2026-08-01', 100, 'c-dining'), tx('2026-10-20', 100, 'c-dining')], TODAY).days, 90);
  assert.equal(spendingWindow([], TODAY), null);
  assert.equal(spendingWindow([tx('2026-11-05', 100, 'c-dining')], TODAY), null); // future entries ignored
});

test('dining out well above the typical share → a tip with the money it frees up', () => {
  const tips = coachTips(state(month30()), TODAY);
  const dining = tips.find((t) => t.id === 'mix:food_away:2026-10');
  assert.ok(dining, JSON.stringify(tips.map((t) => t.id)));
  // 20% vs typical 5.7% of $2,000/30 days → (0.20 − 0.057) × 2,000 × (30.4375/30) ≈ $290
  assert.equal(dining.message, 'Dining Out is 20% of your spending. A typical household spends about 6%. Getting to 6% would free up about $290 a month.');
  assert.equal(dining.estimatedMonthlySavingsCents, 29017); // 0.143 × $2,000 × 30.4375/30
  assert.equal(dining.why.lines[0][1], 40000);
  assert.match(dining.why.source, /Bureau of Labor Statistics.*2025-12-19/);
});

test('categories near or below typical get no tip; tips are sorted by money × confidence', () => {
  const tips = coachTips(state(month30()), TODAY);
  assert.ok(!tips.some((t) => t.key === 'transportation')); // gas is 15% of spending, below the typical 19.4%
  assert.ok(tips.some((t) => t.key === 'food_home')); // groceries 30% vs typical 9.1%
  assert.ok(!tips.some((t) => t.type === 'spending_mix' && /Shopping/.test(t.title))); // too broad to compare
  assert.ok(tips.every((t, i) => i === 0 || tips[i - 1].score >= t.score));
});

test('not enough data → no mix tips (10 entries and $300 minimum)', () => {
  assert.deepEqual(coachTips(state(month30().slice(0, 8)), TODAY), []);
  const tiny = Array.from({ length: 12 }, (_, i) => tx(`2026-10-${10 + i}`, 1000, 'c-dining'));
  assert.deepEqual(coachTips(state(tiny), TODAY), []); // $120 total
});

test('savings and debt payments are left out of the spending base', () => {
  const withSavings = [...month30(), tx('2026-10-20', 500000, 'c-savings'), tx('2026-10-20', 300000, 'c-debt-min')];
  const dining = coachTips(state(withSavings), TODAY).find((t) => t.key === 'food_away');
  assert.equal(dining.why.lines[1][1], 200000); // base unchanged
});

test('housing above 30% of income → HUD tip, ranked low (hard to change quickly)', () => {
  const tips = coachTips(state([...month30(), tx('2026-10-01', 160000, 'c-housing')], { meta: { monthlyTakeHomeCents: 400000 } }), TODAY);
  const housing = tips.find((t) => t.type === 'housing_burden');
  assert.match(housing.message, /about 41% of your income\. HUD considers more than 30% "cost-burdened"/);
  assert.match(housing.message, /hard to change quickly/);
  assert.equal(housing.confidence, 0.25);
  assert.equal(coachTips(state(month30(), { meta: { monthlyTakeHomeCents: 400000 } }), TODAY).some((t) => t.type === 'housing_burden'), false);
});

test('pace: running ahead of your usual month (median of last 3)', () => {
  const history = [
    tx('2026-07-10', 30000, 'c-shopping'), tx('2026-08-10', 25000, 'c-shopping'), tx('2026-09-10', 35000, 'c-shopping'),
    tx('2026-10-05', 40000, 'c-shopping'), // $400 by day 14 → $886 projected vs usual $300
  ];
  assert.equal(usualFor(history, 'c-shopping', '2026-10'), 30000);
  const tips = coachTips(state(history), '2026-10-14');
  const pace = tips.find((t) => t.type === 'pace');
  assert.equal(pace.message, 'At this pace, Shopping will be about $886 this month, $586 more than your usual $300.');
});

test('pace stays quiet: early in the month, little history, bills, and housing', () => {
  const history = [tx('2026-08-10', 30000, 'c-shopping'), tx('2026-09-10', 30000, 'c-shopping'), tx('2026-10-02', 60000, 'c-shopping')];
  assert.equal(coachTips(state(history), '2026-10-05').some((t) => t.type === 'pace'), false); // day < 7
  assert.equal(coachTips(state(history.slice(1)), '2026-10-14').some((t) => t.type === 'pace'), false); // 1 month of history
  const bill = { id: 'b', name: 'Store card', categoryId: 'c-shopping', amountCents: 60000, dayOfMonth: 2, active: true };
  assert.equal(coachTips(state(history, { bills: [bill] }), '2026-10-14').some((t) => t.type === 'pace'), false);
});

test('one tip per topic: pace and mix for the same thing → keep the stronger', () => {
  const t = [];
  for (const m of ['07', '08', '09']) t.push(tx(`2026-${m}-10`, 5000, 'c-dining'), ...Array.from({ length: 4 }, () => tx(`2026-${m}-11`, 20000, 'c-groceries')));
  for (let d = 1; d <= 12; d++) t.push(tx(`2026-10-${String(d).padStart(2, '0')}`, 6000, 'c-dining'), tx(`2026-10-${String(d).padStart(2, '0')}`, 3000, 'c-groceries'));
  const tips = coachTips(state(t), '2026-10-14');
  const diningTopics = tips.filter((x) => x.key === 'food_away' || x.key === 'c-dining');
  assert.equal(diningTopics.length, 1);
});
