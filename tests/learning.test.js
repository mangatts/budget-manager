// E6-S1–S3: learning from your feedback, ranking by money saved, and "did it work?".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightsFrom, rankTips, tipCategories, usualSpending, onItProgress, onItResults, topicOf, WEIGHT_MAX, WEIGHT_MIN } from '../js/services/insights/learning.js';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { buildPayload, validatePayload } from '../js/services/backup.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

const TODAY = '2026-10-28';
const tip = (over = {}) => ({ id: 'pace:c-dining:2026-10', type: 'pace', key: 'c-dining', score: 10000, estimatedMonthlySavingsCents: 10000, confidence: 1, ...over });
const fb = (over = {}) => ({ id: '3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c', topic: 'pace|c-dining', insightType: 'pace', month: '2026-10', reaction: 'up', categoryIds: ['c-dining'], baselineCents: 0, createdAt: 1, ...over });
let n = 0;
const tx = (categoryId, dollars, date) => ({ id: `t${++n}`, type: 'expense', amountCents: dollars * 100, categoryId, date, note: '', source: 'manual', createdAt: n, updatedAt: n });

test('weights: start at 1, up for 👍 and "on it", down for 👎, clamped', () => {
  assert.equal(Object.keys(weightsFrom([])).length, 0);
  assert.equal(weightsFrom([fb()]).pace, 1.25);
  assert.equal(weightsFrom([fb(), fb({ reaction: 'down', createdAt: 2 })]).pace, 1);
  assert.equal(weightsFrom(Array.from({ length: 20 }, (_, i) => fb({ createdAt: i }))).pace, WEIGHT_MAX);
  assert.equal(weightsFrom(Array.from({ length: 20 }, (_, i) => fb({ reaction: 'down', createdAt: i }))).pace, WEIGHT_MIN);
  assert.equal(weightsFrom([fb({ reaction: 'not-now' })]).pace, 1); // "Not now" only hides, it doesn't count against
  assert.equal(Object.getPrototypeOf(weightsFrom([fb({ insightType: 'constructor' })])), null);
});

test('rankTips: money × confidence × your weight; 👎 and "Not now" hide a topic for the month only', () => {
  const tips = [tip(), tip({ id: 'small:c-dining:2026-09', type: 'small_stuff', key: 'small:c-dining', score: 9000 })];
  assert.deepEqual(rankTips(tips, [], TODAY).map((t) => t.type), ['pace', 'small_stuff']);
  // You liked "small stuff" tips in the past (×1.25² = 1.56): 9,000 → 14,063 beats 10,000.
  const liked = [fb({ topic: 'small_stuff|x', insightType: 'small_stuff', month: '2026-08' }), fb({ topic: 'small_stuff|y', insightType: 'small_stuff', month: '2026-09', createdAt: 2 })];
  const ranked = rankTips(tips, liked, TODAY);
  assert.deepEqual(ranked.map((t) => [t.type, t.score]), [['small_stuff', 14063], ['pace', 10000]]);
  assert.equal(rankTips(tips, [fb({ reaction: 'not-now' })], TODAY).length, 1);
  assert.equal(rankTips(tips, [fb({ reaction: 'down', month: '2026-09' })], TODAY).length, 2); // last month's 👎 doesn't hide it now
  assert.equal(rankTips(tips, [fb({ reaction: 'on-it' })], TODAY)[0].reaction, 'on-it');
});

test('tipCategories maps each kind of tip to the categories it’s about', () => {
  assert.deepEqual(tipCategories(tip(), DEFAULT_CATEGORIES), ['c-dining']);
  assert.deepEqual(tipCategories(tip({ type: 'repeating', key: 'repeat:c-subscriptions:netflix' }), DEFAULT_CATEGORIES), ['c-subscriptions']);
  assert.deepEqual(tipCategories(tip({ type: 'spending_mix', key: 'entertainment' }), DEFAULT_CATEGORIES).sort(), ['c-entertainment', 'c-subscriptions']);
  assert.deepEqual(tipCategories(tip({ type: 'housing_burden', key: 'housing' }), DEFAULT_CATEGORIES).sort(), ['c-housing', 'c-utilities']);
  assert.deepEqual(tipCategories(tip({ type: 'spike', key: 'spike:t1' }), DEFAULT_CATEGORIES), []);
});

test('"I’m on it": progress this month, and next month’s result', () => {
  const transactions = [tx('c-dining', 300, '2026-08-10'), tx('c-dining', 300, '2026-09-10'), tx('c-dining', 120, '2026-10-05')];
  assert.equal(usualSpending(transactions, ['c-dining'], TODAY), 30000);
  const entry = fb({ reaction: 'on-it', baselineCents: 30000 });
  assert.deepEqual(onItProgress(entry, transactions, TODAY), { spentCents: 12000, baselineCents: 30000, leftCents: 18000, month: '2026-10', done: false });
  // In November, October's result: $205 against $300 → cut by $95.
  const nov = [...transactions, tx('c-dining', 85, '2026-10-20')];
  const [r] = onItResults([entry], nov, DEFAULT_CATEGORIES, '2026-11-03');
  assert.deepEqual([r.label, r.savedCents, r.worked], ['Dining Out', 9500, true]);
  const [close] = onItResults([entry], [...nov, tx('c-dining', 90, '2026-10-25')], DEFAULT_CATEGORIES, '2026-11-03');
  assert.equal(close.worked, false); // $295: $5 isn't a real cut
  assert.deepEqual(onItResults([entry], nov, DEFAULT_CATEGORIES, TODAY), []); // not until next month
});

async function setup(adapter = createMemoryAdapter()) {
  let clock = 1000;
  let ids = 0;
  const store = createStore({ repo: createRepository(adapter), now: () => clock++, newId: () => `id-${++ids}`, today: () => TODAY });
  await store.init();
  return store;
}

test('store: one reaction per tip per month (changing it replaces), with undo; "on it" saves your usual', async () => {
  const store = await setup();
  for (const t of [tx('c-dining', 300, '2026-09-10')]) await store.addTransaction({ type: 'expense', amount: '300', categoryId: t.categoryId, date: t.date });
  const up = await store.setTipReaction(tip(), 'up');
  assert.deepEqual(store.getState().feedback.map((f) => [f.topic, f.reaction]), [['pace|c-dining', 'up']]);
  const onIt = await store.setTipReaction(tip(), 'on-it');
  assert.equal(store.getState().feedback.length, 1);
  assert.deepEqual([onIt.record.reaction, onIt.record.baselineCents, onIt.record.id], ['on-it', 30000, up.record.id]);
  await onIt.undo();
  assert.equal(store.getState().feedback[0].reaction, 'up');
  await up.undo();
  assert.deepEqual(store.getState().feedback, []);
  assert.equal((await store.setTipReaction(tip(), 'love')).ok, false);
  assert.equal(topicOf(tip()), 'pace|c-dining');
});

test('backups carry feedback; ids of deleted categories are dropped, not fatal; v6 backups restore with none', async () => {
  const state = { transactions: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), meta: [{ key: 'seededCategories', value: 1 }] };
  const result = validatePayload(buildPayload({ ...state, feedback: [fb({ categoryIds: ['c-dining', 'c-gone'] })] }, 9));
  assert.deepEqual(result.data.feedback, [fb()]);
  const v6 = { ...buildPayload(state, 9), schemaVersion: 6 };
  delete v6.data.feedback;
  assert.deepEqual(validatePayload(v6).data.feedback, []);
  for (const bad of [fb({ reaction: 'love' }), fb({ month: '2026-13' }), fb({ insightType: 'Pace!' }), fb({ baselineCents: -1 }), fb({ id: 'x' })]) {
    assert.match(validatePayload(buildPayload({ ...state, feedback: [bad] }, 9)).error, /tip feedback that isn’t valid/, JSON.stringify(bad));
  }
});

// ── Regression tests (code review) ──

test('hiding a tip lets another valid tip on the same topic through (feedback applies before one-tip-per-topic)', async () => {
  const { coachTips } = await import('../js/services/insights/engine.js');
  // Dining out heavy for three months, and running ahead this month: "pace" and "above typical" both fire for dining.
  const t = [];
  for (const m of ['2026-07', '2026-08', '2026-09']) for (let d = 10; d < 20; d++) {
    t.push(tx('c-dining', 40, `${m}-${d}`), tx('c-groceries', 60, `${m}-${d}`), tx('c-gas', 30, `${m}-${d}`));
  }
  for (let d = 1; d < 15; d++) t.push(tx('c-dining', 60, `2026-10-${String(d).padStart(2, '0')}`));
  const state = { transactions: t, categories: DEFAULT_CATEGORIES, meta: {}, bills: [], feedback: [] };
  const first = coachTips(state, '2026-10-15').filter((x) => tipCategories(x, DEFAULT_CATEGORIES).includes('c-dining'));
  assert.equal(first.length, 1);
  const hidden = [fb({ topic: topicOf(first[0]), insightType: first[0].type, month: '2026-10', reaction: 'not-now' })];
  const after = coachTips({ ...state, feedback: hidden }, '2026-10-15').filter((x) => tipCategories(x, DEFAULT_CATEGORIES).includes('c-dining'));
  assert.equal(after.length, 1);
  assert.notEqual(after[0].type, first[0].type);
});

test('topics aren’t cut short, so long subscription names don’t collide', () => {
  const a = topicOf(tip({ type: 'repeating', key: `repeat:c-subscriptions:${'x'.repeat(100)}a` }));
  const b = topicOf(tip({ type: 'repeating', key: `repeat:c-subscriptions:${'x'.repeat(100)}b` }));
  assert.notEqual(a, b);
});

test('a backup with two reactions for the same tip and month keeps the latest', () => {
  const state = { transactions: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), meta: [{ key: 'seededCategories', value: 1 }] };
  const older = fb({ reaction: 'up', createdAt: 1 });
  const newer = fb({ id: '4f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c', reaction: 'down', createdAt: 2 });
  assert.deepEqual(validatePayload(buildPayload({ ...state, feedback: [newer, older] }, 9)).data.feedback.map((f) => f.reaction), ['down']);
});
