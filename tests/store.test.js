import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

async function setup({ adapter = createMemoryAdapter() } = {}) {
  let clock = 1000;
  let ids = 0;
  const repo = createRepository(adapter);
  const store = createStore({ repo, now: () => clock++, newId: () => `id-${++ids}`, today: () => '2026-10-28' });
  await store.init();
  return { store, repo, adapter };
}

const coffee = { type: 'expense', amount: '4.75', categoryId: 'c-dining', date: '2026-10-28', note: 'Coffee' };

test('init seeds default categories once, in order', async () => {
  const { store, repo } = await setup();
  assert.equal(store.getState().ready, true);
  assert.deepEqual(store.getState().categories.map((c) => c.id), DEFAULT_CATEGORIES.map((c) => c.id));
  assert.deepEqual(await repo.get('meta', 'seededCategories'), { key: 'seededCategories', value: 1 });
});

test('seeding never runs again, so renamed or hidden categories stay that way', async () => {
  const adapter = createMemoryAdapter();
  const first = await setup({ adapter });
  const dining = first.store.getState().categories.find((c) => c.id === 'c-dining');
  await first.repo.put('categories', { ...dining, name: 'Eating Out' });
  await first.repo.delete('categories', 'c-gifts');
  const second = await setup({ adapter });
  const names = second.store.getState().categories.map((c) => c.name);
  assert.ok(names.includes('Eating Out') && !names.includes('Dining Out') && !names.includes('Gifts'));
});

test('addTransaction validates, saves, and notifies', async () => {
  const { store, repo } = await setup();
  const seen = [];
  store.subscribe((s) => seen.push(s.transactions.length));
  const result = await store.addTransaction(coffee);
  assert.equal(result.ok, true);
  assert.deepEqual(result.record, { id: 'id-1', type: 'expense', amountCents: 475, categoryId: 'c-dining', date: '2026-10-28', note: 'Coffee', source: 'manual', importId: null, fingerprint: null, createdAt: 1000, updatedAt: 1000 });
  assert.deepEqual(await repo.get('transactions', 'id-1'), result.record);
  assert.deepEqual(seen, [1]);
});

test('invalid input is not saved', async () => {
  const { store, repo } = await setup();
  const result = await store.addTransaction({ ...coffee, amount: '-1' });
  assert.equal(result.ok, false);
  assert.equal(result.errors.amount, 'Enter an amount like 12.50');
  assert.deepEqual(await repo.getAll('transactions'), []);
});

test('transactions are sorted newest day first, then newest added', async () => {
  const { store } = await setup();
  await store.addTransaction({ ...coffee, date: '2026-10-26', note: 'a' });
  await store.addTransaction({ ...coffee, date: '2026-10-28', note: 'b' });
  await store.addTransaction({ ...coffee, date: '2026-10-28', note: 'c' });
  await store.addTransaction({ ...coffee, date: '2026-10-27', note: 'd' });
  assert.deepEqual(store.getState().transactions.map((t) => t.note), ['c', 'b', 'd', 'a']);
});

test('undo after add removes it', async () => {
  const { store, repo } = await setup();
  const { undo } = await store.addTransaction(coffee);
  await undo();
  assert.equal(store.getState().transactions.length, 0);
  assert.deepEqual(await repo.getAll('transactions'), []);
});

test('update changes fields, keeps id and createdAt, and can be undone', async () => {
  const { store, repo } = await setup();
  const { record } = await store.addTransaction(coffee);
  const updated = await store.updateTransaction(record.id, { ...coffee, amount: '5.25', note: 'Latte' });
  assert.equal(updated.ok, true);
  assert.equal(updated.record.amountCents, 525);
  assert.equal(updated.record.createdAt, record.createdAt);
  assert.ok(updated.record.updatedAt > record.updatedAt);
  await updated.undo();
  assert.deepEqual(await repo.get('transactions', record.id), record);
  assert.deepEqual(store.getState().transactions, [record]);
});

test('delete removes it, and undo brings back the exact record', async () => {
  const { store, repo } = await setup();
  const { record } = await store.addTransaction(coffee);
  const deleted = await store.deleteTransaction(record.id);
  assert.equal(deleted.ok, true);
  assert.deepEqual(await repo.getAll('transactions'), []);
  await deleted.undo();
  assert.deepEqual(await repo.get('transactions', record.id), record);
});

test('update or delete of a missing entry fails politely', async () => {
  const { store } = await setup();
  assert.equal((await store.updateTransaction('nope', coffee)).errors.form, 'This entry no longer exists.');
  assert.equal((await store.deleteTransaction('nope')).errors.form, 'This entry no longer exists.');
});

test('a failing database write keeps state unchanged and says what to do', async () => {
  const adapter = createMemoryAdapter();
  const { store } = await setup({ adapter });
  adapter.putMany = async () => { throw new Error('QuotaExceededError'); };
  const result = await store.addTransaction(coffee);
  assert.equal(result.ok, false);
  assert.match(result.errors.form, /Couldn’t save on this device/);
  assert.equal(store.getState().transactions.length, 0);
});

test('stored records are copies: changing a returned record does not change the database', async () => {
  const { store, repo } = await setup();
  const { record } = await store.addTransaction(coffee);
  record.amountCents = 1;
  assert.equal((await repo.get('transactions', record.id)).amountCents, 475);
});

test('editing an entry whose category was hidden still works; moving to a hidden one does not', async () => {
  const { store, repo } = await setup();
  const { record } = await store.addTransaction({ ...coffee, categoryId: 'c-gifts' });
  const gifts = store.getState().categories.find((c) => c.id === 'c-gifts');
  await repo.put('categories', { ...gifts, archived: true });
  await store.init(); // reload categories
  const edit = await store.updateTransaction(record.id, { ...coffee, categoryId: 'c-gifts', note: 'Fixed note' });
  assert.equal(edit.ok, true);
  const { record: other } = await store.addTransaction(coffee);
  const move = await store.updateTransaction(other.id, { ...coffee, categoryId: 'c-gifts' });
  assert.equal(move.errors.categoryId, 'Pick a category');
});

test('repository only allows known stores', async () => {
  const repo = createRepository(createMemoryAdapter());
  assert.throws(() => repo.getAll('__proto__'), /Unknown store/);
  assert.throws(() => repo.put('users', {}), /Unknown store/);
});

test('replaceAll swaps everything at once, and undo puts it back', async () => {
  const { store, repo } = await setup();
  const { record } = await store.addTransaction(coffee);
  const before = store.snapshot();
  const restored = { ...before, transactions: [{ ...record, id: 'restored-1', note: 'From backup' }], meta: [{ key: 'seededCategories', value: 1 }, { key: 'lastBackupAt', value: 42 }] };
  const result = await store.replaceAll(restored);
  assert.equal(result.ok, true);
  assert.deepEqual(store.getState().transactions.map((t) => t.note), ['From backup']);
  assert.equal(store.getState().meta.lastBackupAt, 42);
  assert.deepEqual((await repo.getAll('transactions')).map((t) => t.id), ['restored-1']);
  await result.undo();
  assert.deepEqual(store.getState().transactions, [record]);
  assert.deepEqual(await repo.getAll('transactions'), [record]);
});

test('a failed restore changes nothing', async () => {
  const adapter = createMemoryAdapter();
  const { store, repo } = await setup({ adapter });
  await store.addTransaction(coffee);
  adapter.replaceAll = async () => { throw new Error('quota'); };
  const failed = await store.replaceAll({ transactions: [], categories: [], meta: [] });
  assert.equal(failed.ok, false);
  assert.match(failed.errors.form, /Couldn’t save/);
  assert.equal(store.getState().transactions.length, 1);
  assert.equal((await repo.getAll('transactions')).length, 1);
});

test('setMeta saves and updates state', async () => {
  const { store, repo } = await setup();
  await store.setMeta('lastBackupAt', 123);
  assert.equal(store.getState().meta.lastBackupAt, 123);
  assert.deepEqual(await repo.get('meta', 'lastBackupAt'), { key: 'lastBackupAt', value: 123 });
});
