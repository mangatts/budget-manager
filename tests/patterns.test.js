import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coachTips } from '../js/services/insights/engine.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

let n = 0;
const tx = (date, amountCents, categoryId, note = '', type = 'expense') => ({ id: `p${++n}`, date, type, amountCents, categoryId, note });
const state = (transactions, extra = {}) => ({ transactions, categories: DEFAULT_CATEGORIES, bills: [], meta: {}, ...extra });
const find = (tips, type) => tips.filter((t) => t.type === type);

test('higher than usual: last month vs the 3 months before it', () => {
  const list = [tx('2026-06-10', 30000, 'c-entertainment'), tx('2026-07-10', 25000, 'c-entertainment'), tx('2026-08-10', 35000, 'c-entertainment'), tx('2026-09-10', 52000, 'c-entertainment')];
  const [tip] = find(coachTips(state(list), '2026-10-05'), 'higher_than_usual');
  assert.equal(tip.message, 'Entertainment was $520 last month, $220 more than your usual $300.');
  // Not when it's normal
  assert.equal(find(coachTips(state(list.slice(0, 3).concat(tx('2026-09-10', 31000, 'c-entertainment'))), '2026-10-05'), 'higher_than_usual').length, 0);
});

test('spike: a recent charge 3× your usual (and ≥ $50) is flagged as information', () => {
  const list = [...Array.from({ length: 6 }, (_, i) => tx(`2026-09-${10 + i}`, 4500, 'c-shopping')), tx('2026-10-12', 34000, 'c-shopping', 'TV')];
  const [tip] = find(coachTips(state(list), '2026-10-14'), 'spike');
  assert.match(tip.message, /^\$340 for Shopping \(TV\) on 10\/12 is much more than your usual \$45\. Was it planned\?/);
  assert.equal(tip.score, 0); // shown after money-saving tips
  // Old spikes (> 14 days) and categories without enough history are ignored
  assert.equal(find(coachTips(state(list), '2026-10-30'), 'spike').length, 0);
  assert.equal(find(coachTips(state(list.slice(2)), '2026-10-14'), 'spike').length, 0);
});

test('small stuff: 8+ purchases under $15 adding to $60+ last month', () => {
  const list = Array.from({ length: 22 }, (_, i) => tx(`2026-09-${String(i + 1).padStart(2, '0')}`, 536, 'c-dining', 'Coffee'));
  const [tip] = find(coachTips(state(list), '2026-10-05'), 'small_stuff');
  assert.equal(tip.message, '22 Dining Out purchases under $15 came to $118 last month. That’s about $1,415 a year. Cutting them in half would save about $59 a month.');
  assert.equal(find(coachTips(state(list.slice(0, 7)), '2026-10-05'), 'small_stuff').length, 0);
});

test('repeating charges: same note and amount in 3 of the last 4 months → likely a subscription', () => {
  const list = ['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'].map((d) => tx(d, 1549, 'c-subscriptions', 'Netflix'));
  const [tip] = find(coachTips(state(list), '2026-10-14'), 'repeating');
  assert.equal(tip.title, 'Netflix: about $15 every month');
  assert.match(tip.message, /in 4 of the last 4 months\. That’s about \$186 a year\. Still using it\?/);
  // Already a bill → no tip; needs (e.g. utilities) → no tip; only twice → no tip
  const bill = { id: 'b', name: 'Netflix', categoryId: 'c-subscriptions', amountCents: 1549, dayOfMonth: 3, active: true };
  assert.equal(find(coachTips(state(list, { bills: [bill] }), '2026-10-14'), 'repeating').length, 0);
  assert.equal(find(coachTips(state(list.map((t) => ({ ...t, categoryId: 'c-utilities' }))), '2026-10-14'), 'repeating').length, 0);
  assert.equal(find(coachTips(state(list.slice(2)), '2026-10-14'), 'repeating').length, 0);
});

test('repeating: varying amounts (groceries) are not a subscription', () => {
  const list = ['2026-07-03', '2026-08-03', '2026-09-03'].map((d, i) => tx(d, 1549 + i * 400, 'c-entertainment', 'Movies'));
  assert.equal(find(coachTips(state(list), '2026-10-14'), 'repeating').length, 0);
});

test('best month: your lowest recent month for a want, as a target', () => {
  const amounts = [32000, 19000, 30000, 35000, 28000, 31000];
  const list = amounts.map((a, i) => tx(`2026-${String(4 + i).padStart(2, '0')}-10`, a, 'c-dining'));
  const [tip] = find(coachTips(state(list), '2026-10-05'), 'best_month');
  assert.equal(tip.message, 'Your lowest Dining Out month recently was $190, against a usual $305. Matching it would free up about $115 a month.');
  // Needs (groceries) never get a "best month" target
  assert.equal(find(coachTips(state(list.map((t) => ({ ...t, categoryId: 'c-groceries' }))), '2026-10-05'), 'best_month').length, 0);
});

test('per-category topics: the stronger of pace / higher / best-month wins; spikes and subscriptions stand alone', () => {
  const list = [];
  for (const m of ['04', '05', '06', '07', '08']) list.push(tx(`2026-${m}-10`, 20000, 'c-dining'));
  list.push(tx('2026-09-10', 60000, 'c-dining')); // higher than usual + best month both apply
  const tips = coachTips(state(list), '2026-10-05');
  assert.equal(tips.filter((t) => ['pace', 'higher_than_usual', 'best_month'].includes(t.type) && (t.key === 'c-dining')).length, 1);
});

test('no "more than your usual $0": one-offs in a new category are not overspending', () => {
  const list = [tx('2026-06-10', 5000, 'c-dining'), tx('2026-07-10', 5000, 'c-dining'), tx('2026-08-10', 5000, 'c-dining'), tx('2026-09-10', 30000, 'c-gifts')];
  assert.equal(find(coachTips(state(list), '2026-10-05'), 'higher_than_usual').length, 0);
  const pace = [tx('2026-08-10', 5000, 'c-dining'), tx('2026-09-10', 5000, 'c-dining'), tx('2026-10-03', 30000, 'c-gifts')];
  assert.equal(find(coachTips(state(pace), '2026-10-14'), 'pace').length, 0);
});

test('unlabeled repeated amounts are not called a subscription', () => {
  const list = ['2026-07-12', '2026-08-12', '2026-09-12'].map((d) => tx(d, 2000, 'c-entertainment', ''));
  assert.equal(find(coachTips(state(list), '2026-10-14'), 'repeating').length, 0);
});
