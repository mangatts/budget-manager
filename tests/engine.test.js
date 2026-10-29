import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachTips, spendingWindow, usualFor } from '../js/services/insights/engine.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

let n = 0;
const tx = (date, amountCents, categoryId, type = 'expense') => ({ id: `t${++n}`, date, type, amountCents, categoryId });
const state = (transactions, extra = {}) => ({ transactions, categories: DEFAULT_CATEGORIES, bills: [], meta: {}, ...extra });
const TODAY = '2026-10-28';

// 30 days of everyday spending: $2,000 total, dining $400 (20%), groceries $600, gas $300, shopping $700.
function month30(month = '2026-10') {
  const out = [];
  for (let d = 1; d <= 10; d++) {
    const date = `${month}-${String(d + 15).padStart(2, '0')}`;
    out.push(tx(date, 4000, 'c-dining'), tx(date, 6000, 'c-groceries'), tx(date, 3000, 'c-gas'), tx(date, 7000, 'c-shopping'));
  }
  return out;
}

test('window: whole calendar months (last 1–3 with spending), else this month from the 20th', () => {
  const w = (list, today = TODAY) => spendingWindow(list, today);
  assert.equal(w([tx('2026-10-20', 100, 'c-dining')]).kind, 'month-to-date');
  assert.equal(w([tx('2026-10-02', 100, 'c-dining')], '2026-10-15'), null); // too early in the first month
  assert.deepEqual([w([tx('2026-09-10', 100, 'c-dining'), tx('2026-10-20', 100, 'c-dining')]).kind, w([tx('2026-09-10', 100, 'c-dining')]).months], ['months', 1]);
  const three = w([tx('2026-06-10', 1, 'c-dining'), tx('2026-07-10', 1, 'c-dining'), tx('2026-09-10', 1, 'c-dining'), tx('2026-10-01', 1, 'c-dining')]);
  assert.equal(three.months, 2); // Jul and Sep have spending; Aug doesn't count; June is too old; October isn't complete
  assert.equal(three.entries.length, 2);
  assert.equal(w([], TODAY), null);
  assert.equal(w([tx('2026-11-05', 100, 'c-dining')]), null); // future entries ignored
});

test('rent counts exactly once per month, whatever the date (no rolling-window double counting)', () => {
  const rent = ['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01'].map((d) => tx(d, 160000, 'c-housing'));
  for (const today of ['2027-03-01', '2027-03-15', '2027-03-31']) {
    const w = spendingWindow(rent, today);
    assert.equal(w.months, 3, today);
    assert.equal(w.entries.reduce((s, t) => s + t.amountCents, 0) / w.months, 160000, today); // Dec, Jan, Feb: one rent each
  }
});

test('dining out well above the typical share → a tip with the money it frees up', () => {
  const tips = coachTips(state(month30()), TODAY);
  const dining = tips.find((t) => t.id === 'mix:food_away:2026-10');
  assert.ok(dining, JSON.stringify(tips.map((t) => t.id)));
  // 20% vs typical 5.7% of $2,000/30 days → (0.20 − 0.057) × 2,000 × (30.4375/30) ≈ $290
  assert.equal(dining.message, 'Dining Out is 20% of your spending. A typical household spends about 6%. Getting to 6% would free up about $286 a month.');
  assert.equal(dining.estimatedMonthlySavingsCents, 28600); // (20% − 5.7%) × $2,000 this month so far
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
  const tips = coachTips(state([...month30('2026-09'), tx('2026-09-01', 160000, 'c-housing')], { meta: { monthlyTakeHomeCents: 400000 } }), TODAY);
  const housing = tips.find((t) => t.type === 'housing_burden');
  assert.match(housing.message, /about 40% of your income\. HUD considers more than 30% "cost-burdened"/);
  assert.match(housing.message, /hard to change quickly/);
  assert.equal(housing.confidence, 0.25);
  assert.equal(coachTips(state(month30('2026-09'), { meta: { monthlyTakeHomeCents: 400000 } }), TODAY).some((t) => t.type === 'housing_burden'), false);
  // Not judged from a partial first month
  assert.equal(coachTips(state([...month30(), tx('2026-10-01', 160000, 'c-housing')], { meta: { monthlyTakeHomeCents: 400000 } }), TODAY).some((t) => t.type === 'housing_burden'), false);
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

test('usual: months with only income don\u2019t count as $0 spending months', () => {
  const list = [tx('2026-08-15', 400000, 'c-paycheck', 'income'), tx('2026-09-15', 400000, 'c-paycheck', 'income'), tx('2026-10-05', 30000, 'c-shopping')];
  assert.equal(usualFor(list, 'c-shopping', '2026-10'), null);
  assert.equal(coachTips(state(list), '2026-10-14').some((t) => t.type === 'pace'), false);
});

test('empty state tells "not enough to compare" apart from "nothing stands out"', async () => {
  const { coachStatus } = await import('../js/services/insights/engine.js');
  const few = Array.from({ length: 12 }, (_, i) => tx(`2026-10-${10 + i}`, 1000, 'c-dining')); // $120 total
  assert.equal(coachStatus(state(few), TODAY).reason, 'not-enough');
  const balanced = [];
  // Enough to compare ($360, 12 entries), but in a category with no typical benchmark → nothing stands out.
  for (let d = 1; d <= 12; d++) balanced.push(tx(`2026-09-${String(d).padStart(2, '0')}`, 3000, 'c-other'));
  assert.equal(coachStatus(state(balanced), TODAY).reason, 'none');
});
