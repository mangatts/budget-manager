import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestChallenges, challengeProgress, visibleChallenges } from '../js/services/insights/cutPlan.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { buildPayload, validatePayload } from '../js/services/backup.js';

let n = 0;
const tx = (date, amountCents, categoryId) => ({ id: `c${++n}`, date, type: 'expense', amountCents, categoryId, note: '' });
const state = (transactions, extra = {}) => ({ transactions, categories: DEFAULT_CATEGORIES, bills: [], challenges: [], meta: {}, ...extra });
const history = [
  ...['05', '06', '07', '08', '09'].map((m, i) => tx(`2026-${m}-10`, [30000, 32000, 29000, 33000, 31000][i], 'c-dining')),
  ...['07', '08', '09'].map((m) => tx(`2026-${m}-12`, 20000, 'c-entertainment')),
  ...['07', '08', '09'].map((m) => tx(`2026-${m}-12`, 60000, 'c-groceries')), // a need: never suggested
];

test('suggests realistic cuts on wants: best month, never more than 25% at once', () => {
  const s = suggestChallenges(state(history), '2026-10-03');
  // Dining: best $290 is only a 6% cut → 10% minimum → $279 → rounded down to $275.
  // Entertainment: never lower, so a 10% step: $180.
  assert.deepEqual(s.map((x) => [x.categoryId, x.fromCents, x.targetCents]), [['c-dining', 31000, 27500], ['c-entertainment', 20000, 18000]]);
  // A much better month is capped at a 25% cut.
  const deep = [...history, tx('2026-04-10', 5000, 'c-dining')];
  assert.equal(suggestChallenges(state(deep), '2026-10-03').find((x) => x.categoryId === 'c-dining').targetCents, 23000);
});

test('no suggestion for needs, small categories, bill categories, or ones already chosen this month', () => {
  const bill = { id: 'b', active: true, categoryId: 'c-entertainment', amountCents: 20000, dayOfMonth: 1 };
  assert.deepEqual(suggestChallenges(state(history, { bills: [bill] }), '2026-10-03').map((x) => x.categoryId), ['c-dining']);
  const taken = [{ categoryId: 'c-dining', month: '2026-10', status: 'skipped' }];
  assert.deepEqual(suggestChallenges(state(history, { challenges: taken }), '2026-10-03').map((x) => x.categoryId), ['c-entertainment']);
  assert.deepEqual(suggestChallenges(state([tx('2026-08-10', 3000, 'c-dining'), tx('2026-09-10', 3000, 'c-dining')]), '2026-10-03'), []);
});

test('progress: on track, ahead of plan, over; and month-end results', () => {
  const ch = { id: 'x', categoryId: 'c-dining', month: '2026-10', fromCents: 31000, targetCents: 31000 - 6000, status: 'active' };
  const at = (spent, today) => challengeProgress(ch, [tx('2026-10-02', spent, 'c-dining')], today);
  assert.deepEqual([at(5000, '2026-10-10').status, at(5000, '2026-10-10').daysLeft], ['on-track', 22]);
  assert.equal(at(12000, '2026-10-10').status, 'ahead'); // $120 by day 10 of a $250 month
  assert.equal(at(26000, '2026-10-20').status, 'over');
  assert.deepEqual(at(22000, '2026-11-02'), { spent: 22000, left: 3000, done: true, result: 'won', savedCents: 9000 });
  assert.equal(at(28000, '2026-11-02').result, 'missed');
});

test('visible: this month’s active ones, plus last month’s results in the first week only', () => {
  const challenges = [
    { id: 'a', month: '2026-11', status: 'active' }, { id: 'b', month: '2026-11', status: 'skipped' },
    { id: 'c', month: '2026-10', status: 'active' }, { id: 'd', month: '2026-10', status: 'stopped' },
  ];
  const early = visibleChallenges({ challenges }, '2026-11-03');
  assert.deepEqual([early.current.map((c) => c.id), early.results.map((c) => c.id)], [['a'], ['c']]);
  assert.deepEqual(visibleChallenges({ challenges }, '2026-11-12').results, []);
});

test('store: add, no duplicates, stop with undo, and category is then "in use"', async () => {
  let id = 0;
  const repo = createRepository(createMemoryAdapter());
  const store = createStore({ repo, newId: () => `3f6c1a2e-9b7d-4c1e-8a2b-20000000000${++id}`, today: () => '2026-10-28' });
  await store.init();
  const input = { categoryId: 'c-dining', month: '2026-10', fromCents: 31000, targetCents: 29000 };
  const added = await store.addChallenge(input);
  assert.equal(added.ok, true);
  assert.match((await store.addChallenge(input)).errors.form, /already a challenge/);
  assert.equal((await store.addChallenge({ ...input, categoryId: 'c-savings' })).errors.categoryId, 'Pick a spending category');
  assert.equal((await store.addChallenge({ ...input, categoryId: 'c-gifts', targetCents: 40000 })).errors.targetCents, 'The target should be less than your usual');
  const stopped = await store.setChallengeStatus(added.record.id, 'stopped');
  assert.equal(store.getState().challenges[0].status, 'stopped');
  await stopped.undo();
  assert.equal(store.getState().challenges[0].status, 'active');
  assert.equal((await store.deleteCategory('c-dining')).ok, false); // a challenge uses it
});

test('challenges travel in backups (v3); older backups restore with none; bad ones reject', () => {
  const ch = { id: '3f6c1a2e-9b7d-4c1e-8a2b-300000000001', categoryId: 'c-dining', month: '2026-10', fromCents: 31000, targetCents: 29000, status: 'active', createdAt: 5 };
  const base = { transactions: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), meta: [], bills: [] };
  assert.deepEqual(validatePayload(buildPayload({ ...base, challenges: [ch] }, 9)).data.challenges, [ch]);
  const v2 = { ...buildPayload(base, 9), schemaVersion: 2 };
  delete v2.data.challenges;
  assert.deepEqual(validatePayload(v2).data.challenges, []);
  for (const bad of [{ targetCents: 40000 }, { status: 'won' }, { month: '2026-13' }, { categoryId: 'c-paycheck' }]) {
    assert.match(validatePayload(buildPayload({ ...base, challenges: [{ ...ch, ...bad }] }, 9)).error, /challenge that isn’t valid/, JSON.stringify(bad));
  }
});
