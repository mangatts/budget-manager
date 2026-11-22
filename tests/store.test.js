import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, LIMITS } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function setup({ adapter = createMemoryAdapter(), today = '2026-11-22' } = {}) {
  let clock = 1000;
  let ids = 0;
  const repo = createRepository(adapter);
  const store = createStore({ repo, now: () => clock++, newId: () => uuid(++ids), today: () => today });
  await store.init();
  return { store, repo, adapter };
}

const chase = { name: 'Chase', apr: '24.99', minPayment: '35', limit: '5000' };

test('init on a fresh device: ready, empty, marked as carried over', async () => {
  const { store, repo } = await setup();
  const s = store.getState();
  assert.equal(s.ready, true);
  assert.deepEqual([s.cards, s.checkins, s.incomes, s.expenses], [[], [], [], []]);
  assert.deepEqual(await repo.get('meta', 'carriedOver'), { key: 'carriedOver', value: 1 });
});

test('carries debts, active bills and take-home pay over from the earlier version, once', async () => {
  const adapter = createMemoryAdapter();
  const repo = createRepository(adapter);
  await repo.put('debts', { id: uuid(90), name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500, createdAt: 5, updatedAt: 6 });
  await repo.put('bills', { id: uuid(91), name: 'Rent', amountCents: 140000, categoryId: 'c-housing', dayOfMonth: 1, active: true, createdAt: 5, updatedAt: 6 });
  await repo.put('bills', { id: uuid(92), name: 'Old gym', amountCents: 3000, categoryId: 'c-other', dayOfMonth: 9, active: false, createdAt: 5, updatedAt: 6 });
  await repo.put('meta', { key: 'monthlyTakeHomeCents', value: 450000 });
  await repo.put('transactions', { id: uuid(93), amountCents: 475 });

  const { store } = await setup({ adapter });
  const s = store.getState();
  assert.deepEqual(s.cards, [{ id: uuid(90), name: 'Visa', limitCents: null, aprBps: 2499, minPaymentCents: 7500, createdAt: 5, updatedAt: 6 }]);
  assert.deepEqual(s.checkins, [{ date: '2026-11-22', balances: [{ cardId: uuid(90), balanceCents: 240000 }], createdAt: 1000 }]);
  assert.deepEqual(s.expenses.map((e) => [e.name, e.amountCents, e.dayOfMonth]), [['Rent', 140000, 1]]);
  assert.deepEqual(s.incomes.map((i) => [i.name, i.amountCents, i.frequency]), [['Take-home pay', 450000, 'monthly']]);

  // Deleting a carried-over card doesn't bring it back on the next start.
  await store.deleteCard(uuid(90));
  const again = await setup({ adapter });
  assert.equal(again.store.getState().cards.length, 0);
});

test('add, edit and delete a card, each with undo', async () => {
  const { store, repo } = await setup();
  const added = await store.addCard(chase);
  assert.equal(added.ok, true);
  assert.deepEqual(store.getState().cards[0], { id: uuid(1), name: 'Chase', limitCents: 500000, aprBps: 2499, minPaymentCents: 3500, createdAt: 1001, updatedAt: 1001 });

  const edited = await store.updateCard(uuid(1), { ...chase, minPayment: '40' });
  assert.equal(store.getState().cards[0].minPaymentCents, 4000);
  await edited.undo();
  assert.equal((await repo.get('cards', uuid(1))).minPaymentCents, 3500);

  const removed = await store.deleteCard(uuid(1));
  assert.equal(store.getState().cards.length, 0);
  await removed.undo();
  assert.equal(store.getState().cards.length, 1);
  await added.undo();
  assert.equal((await repo.getAll('cards')).length, 0);
});

test('invalid input saves nothing and says why', async () => {
  const { store, repo } = await setup();
  const result = await store.addCard({ name: '', apr: 'x' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.name && result.errors.apr && result.errors.minPayment);
  assert.equal((await repo.getAll('cards')).length, 0);
  assert.match((await store.updateIncome('nope', {})).errors.form, /no longer exists/);
});

test('cards are sorted highest interest first; expenses by due day', async () => {
  const { store } = await setup();
  await store.addCard({ name: 'Low', apr: '9.99', minPayment: '25' });
  await store.addCard({ name: 'High', apr: '29.99', minPayment: '25' });
  await store.addExpense({ name: 'Phone', amount: '60', dayOfMonth: '15' });
  await store.addExpense({ name: 'Food', amount: '400', dayOfMonth: '' });
  await store.addExpense({ name: 'Rent', amount: '1400', dayOfMonth: '1' });
  assert.deepEqual(store.getState().cards.map((c) => c.name), ['High', 'Low']);
  assert.deepEqual(store.getState().expenses.map((e) => e.name), ['Rent', 'Phone', 'Food']);
});

test('check-ins: one per day; saving onto a day replaces it and undo brings it back', async () => {
  const { store, repo } = await setup();
  await store.addCard(chase);
  const first = await store.saveCheckin({ date: '2026-11-01', balances: { [uuid(1)]: '1200' } });
  assert.equal(first.ok, true);
  const second = await store.saveCheckin({ date: '2026-11-22', balances: { [uuid(1)]: '900' } });
  assert.deepEqual(store.getState().checkins.map((c) => c.date), ['2026-11-22', '2026-11-01']);

  const replaced = await store.saveCheckin({ date: '2026-11-01', balances: { [uuid(1)]: '1250' } });
  assert.equal(store.getState().checkins.length, 2);
  assert.equal((await repo.get('checkins', '2026-11-01')).balances[0].balanceCents, 125000);
  assert.equal((await repo.get('checkins', '2026-11-01')).createdAt, first.record.createdAt, 'keeps when it was first made');
  await replaced.undo();
  assert.equal((await repo.get('checkins', '2026-11-01')).balances[0].balanceCents, 120000);

  const deleted = await store.deleteCheckin('2026-11-22');
  assert.deepEqual(store.getState().checkins.map((c) => c.date), ['2026-11-01']);
  await deleted.undo();
  assert.equal(store.getState().checkins.length, 2);
  await second.undo();
  assert.deepEqual((await repo.getAll('checkins')).map((c) => c.date), ['2026-11-01']);
});

test('check-ins can’t be in the future or skip a card', async () => {
  const { store } = await setup();
  await store.addCard(chase);
  const result = await store.saveCheckin({ date: '2026-11-23', balances: {} });
  assert.ok(result.errors.date && result.errors[`balance-${uuid(1)}`]);
});

test('limits match what a backup accepts', async () => {
  const { store } = await setup();
  for (let i = 0; i < LIMITS.incomes; i++) assert.equal((await store.addIncome({ name: `Job ${i}`, amount: '1', frequency: 'monthly' })).ok, true);
  assert.match((await store.addIncome({ name: 'One more', amount: '1', frequency: 'monthly' })).errors.form, /up to 50/);
});

test('a failed save reports it and changes nothing', async () => {
  const adapter = createMemoryAdapter();
  const { store } = await setup({ adapter });
  adapter.putMany = async () => { throw new Error('disk full'); };
  const result = await store.addCard(chase);
  assert.equal(result.ok, false);
  assert.match(result.errors.form, /Couldn’t save/);
  assert.equal(store.getState().cards.length, 0);
});

test('snapshot → replaceAll round trip, with undo', async () => {
  const { store } = await setup();
  await store.addCard(chase);
  await store.addIncome({ name: 'Pay', amount: '2000', frequency: 'biweekly' });
  const snap = store.snapshot();
  const result = await store.replaceAll({ cards: [], meta: [] });
  assert.equal(store.getState().cards.length, 0);
  await result.undo();
  assert.deepEqual(store.snapshot(), snap);
});

test('wipe clears everything, including data from the earlier version', async () => {
  const adapter = createMemoryAdapter();
  const { store, repo } = await setup({ adapter });
  await store.addCard(chase);
  await repo.put('transactions', { id: uuid(80), amountCents: 1 });
  assert.equal((await store.wipe()).ok, true);
  assert.equal((await repo.getAll('transactions')).length, 0);
  assert.equal((await repo.getAll('cards')).length, 0);
  assert.equal(store.getState().cards.length, 0);
});

test('updating a day’s check-in is one write: if it fails, the old one is still there', async () => {
  const adapter = createMemoryAdapter();
  const { store, repo } = await setup({ adapter });
  await store.addCard(chase);
  await store.saveCheckin({ date: '2026-11-01', balances: { [uuid(1)]: '1200' } });
  adapter.putMany = async () => { throw new Error('disk full'); };
  adapter.delete = async () => { throw new Error('should not delete'); };
  assert.equal((await store.saveCheckin({ date: '2026-11-01', balances: { [uuid(1)]: '1' } })).ok, false);
  assert.equal((await repo.get('checkins', '2026-11-01')).balances[0].balanceCents, 120000);
  assert.equal(store.getState().checkins.length, 1);
});

test('carry-over is all or nothing: a failed write leaves it to try again next time', async () => {
  const adapter = createMemoryAdapter();
  const repo = createRepository(adapter);
  await repo.put('debts', { id: uuid(90), name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500, createdAt: 5, updatedAt: 6 });
  await repo.put('meta', { key: 'lastBackupAt', value: 42 });
  const realReplace = adapter.replaceAll.bind(adapter);
  adapter.replaceAll = async () => { throw new Error('tab closed'); };
  await assert.rejects(setup({ adapter }));
  assert.equal(await repo.get('meta', 'carriedOver'), undefined);
  adapter.replaceAll = realReplace;
  const { store } = await setup({ adapter });
  assert.equal(store.getState().cards.length, 1);
  assert.equal(store.getState().meta.lastBackupAt, 42, 'other settings are kept');
});
