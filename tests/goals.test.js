// E12-S1: savings goals (database v5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { validateGoal } from '../js/services/validate.js';
import { buildPayload, validatePayload } from '../js/services/backup.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';
import { goalEta } from '../js/views/goals.js';

const car = { name: 'New car', target: '3,000', saved: '500', monthly: '250' };
const goal = (over = {}) => ({ id: '3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c', name: 'Car', targetCents: 300000, savedCents: 50000, monthlyCents: 25000, createdAt: 1, updatedAt: 1, ...over });
const state = (over = {}) => ({ transactions: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), meta: [{ key: 'seededCategories', value: 1 }], ...over });

async function setup(adapter = createMemoryAdapter()) {
  let clock = 1000;
  let ids = 0;
  const store = createStore({ repo: createRepository(adapter), now: () => clock++, newId: () => `id-${++ids}`, today: () => '2026-10-28' });
  await store.init();
  return store;
}

test('validateGoal: name and target required; saved and monthly may be blank or 0', () => {
  assert.deepEqual(validateGoal(car).value, { name: 'New car', targetCents: 300000, savedCents: 50000, monthlyCents: 25000 });
  assert.deepEqual(validateGoal({ name: 'Trip', target: '800' }).value, { name: 'Trip', targetCents: 80000, savedCents: 0, monthlyCents: 0 });
  assert.equal(validateGoal({ ...car, saved: '0.00' }).value.savedCents, 0);
  assert.deepEqual(Object.keys(validateGoal({ name: '', target: '0', saved: 'x', monthly: '-5' }).errors).sort(), ['monthly', 'name', 'saved', 'target']);
});

test('goals: add, edit, delete with undo; survive a reload; oldest first', async () => {
  const adapter = createMemoryAdapter();
  const store = await setup(adapter);
  const added = await store.addGoal(car);
  await store.addGoal({ name: 'Trip', target: '800' });
  assert.deepEqual(store.getState().goals.map((g) => g.name), ['New car', 'Trip']);
  const edited = await store.updateGoal('id-1', { ...car, saved: '1,000' });
  assert.equal(store.getState().goals[0].savedCents, 100000);
  await edited.undo();
  assert.equal(store.getState().goals[0].savedCents, 50000);
  const removed = await store.deleteGoal('id-1');
  assert.equal(store.getState().goals.length, 1);
  await removed.undo();
  assert.deepEqual(store.getState().goals[0], added.record);
  assert.match((await store.updateGoal('nope', car)).errors.form, /no longer exists/);
  assert.equal((await setup(adapter)).getState().goals.length, 2);
  assert.equal(store.snapshot().goals.length, 2);
});

test('backups carry goals; v4 backups restore with none; bad or repeated goals reject the backup', () => {
  assert.deepEqual(validatePayload(buildPayload(state({ goals: [goal()] }), 9)).data.goals, [goal()]);
  const v4 = { ...buildPayload(state(), 9), schemaVersion: 4 };
  delete v4.data.goals;
  assert.deepEqual(validatePayload(v4).data.goals, []);
  for (const bad of [goal({ id: 'x' }), goal({ targetCents: 0 }), goal({ savedCents: -1 }), goal({ monthlyCents: 1.5 }), goal({ name: '' })]) {
    assert.match(validatePayload(buildPayload(state({ goals: [bad] }), 9)).error, /goal that isn’t valid/, JSON.stringify(bad));
  }
  assert.match(validatePayload(buildPayload(state({ goals: [goal(), goal()] }), 9)).error, /repeated goal/);
});

test('goalEta: a date, already reached, or why there’s no date', () => {
  assert.equal(goalEta(goal(), '2026-10-28'), 'About August 2027 (10 months) at $250.00 a month.');
  assert.equal(goalEta(goal({ savedCents: 300000 }), '2026-10-28'), 'Reached. Nice work!');
  assert.equal(goalEta(goal({ monthlyCents: 0 }), '2026-10-28'), 'Add a monthly amount to see when you’ll get there.');
});

test('no more goals than a backup can restore', async () => {
  const store = await setup();
  for (let i = 0; i < 100; i++) await store.addGoal({ name: `Goal ${i}`, target: '10' });
  assert.match((await store.addGoal(car)).errors.form, /up to 100 goals/);
  assert.equal(validatePayload(buildPayload({ ...state(), goals: store.snapshot().goals.map((g, i) => ({ ...g, id: `3f6c1a2e-9b7d-4c1e-8a2b-${String(i).padStart(12, '0')}` })) }, 9)).ok, true);
});
