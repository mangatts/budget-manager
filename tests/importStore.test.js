// E7-S5, S6: the review queue (add / skip / undo / finish later / cancel) and merchant rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { prepareImport } from '../js/services/statementImport/prepare.js';
import { buildPayload, validatePayload } from '../js/services/backup.js';

async function setup(adapter = createMemoryAdapter()) {
  let clock = 1000;
  let ids = 0;
  const store = createStore({ repo: createRepository(adapter), now: () => clock++, newId: () => `id-${++ids}`, today: () => '2026-10-28' });
  await store.init();
  return store;
}

const M = { date: 0, description: 1, amount: 2, signs: 'out-negative' };
const ROWS = [['10/01/2026', 'POS CHIPOTLE 1234 AUSTIN TX', '-12.50'], ['10/02/2026', 'PAYROLL ACME', '2000'], ['10/03/2026', 'SQ *BLUE BOTTLE', '-4.75']];
async function start(store, rows = ROWS) {
  const prepared = await prepareImport(rows, M, store.getState());
  return store.startImport({ fileName: 'chase.csv', items: prepared.items });
}

test('startImport saves a queue; only one at a time; nothing new → refused', async () => {
  const store = await setup();
  const r = await start(store);
  assert.equal(r.ok, true);
  assert.deepEqual(store.getState().imports.map((i) => [i.fileName, i.rowCount, i.status]), [['chase.csv', 3, 'reviewing']]);
  assert.deepEqual(store.getState().pending.map((p) => [p.order, p.merchant, p.decision]), [[0, 'Chipotle', 'pending'], [1, 'Payroll Acme', 'pending'], [2, 'Blue Bottle', 'pending']]);
  assert.match((await start(store)).errors.form, /Finish or cancel/);
  assert.match((await store.startImport({ fileName: 'x.csv', items: [] })).errors.form, /nothing new/);
});

test('add files an entry (source import, merchant as note), skip skips, undo reopens; done when all handled', async () => {
  const store = await setup();
  await start(store);
  const [chipotle, pay, coffee] = store.getState().pending;
  const added = await store.addPending(chipotle.id, 'c-dining');
  const entry = store.getState().transactions[0];
  assert.deepEqual([entry.source, entry.note, entry.amountCents, entry.categoryId, entry.fingerprint], ['import', 'Chipotle', 1250, 'c-dining', chipotle.fingerprint]);
  assert.match((await store.addPending(chipotle.id, 'c-dining')).errors.form, /already handled/);
  assert.match((await store.addPending(pay.id, 'c-dining')).errors.form, /Pick a category/); // money in needs an income category
  await store.addPending(pay.id, 'c-paycheck');
  const skipped = await store.skipPending(coffee.id);
  assert.equal(store.getState().imports[0].status, 'done');
  await skipped.undo();
  assert.equal(store.getState().imports[0].status, 'reviewing');
  assert.equal(store.getState().pending[2].decision, 'pending');
  await added.undo();
  assert.equal(store.getState().transactions.some((t) => t.id === entry.id), false);
  assert.equal(store.getState().pending[0].decision, 'pending');
});

test('finish later: the queue survives a reload', async () => {
  const adapter = createMemoryAdapter();
  const first = await setup(adapter);
  await start(first);
  await first.skipPending(first.getState().pending[0].id);
  const second = await setup(adapter);
  assert.deepEqual(second.getState().pending.map((p) => p.decision), ['skipped', 'pending', 'pending']);
});

test('importing the same file again only offers rows not yet added', async () => {
  const store = await setup();
  await start(store);
  await store.addPending(store.getState().pending[0].id, 'c-dining');
  await store.cancelImport(store.getState().imports[0].id);
  const again = await prepareImport(ROWS, M, store.getState());
  assert.equal(again.alreadyImported, 1);
  assert.equal(again.items.length, 2);
});

test('cancel drops unhandled rows, keeps added entries, and can be undone', async () => {
  const store = await setup();
  await start(store);
  await store.addPending(store.getState().pending[0].id, 'c-dining');
  const cancelled = await store.cancelImport(store.getState().imports[0].id);
  assert.deepEqual([store.getState().imports.length, store.getState().pending.length, store.getState().transactions.length], [0, 0, 1]);
  await cancelled.undo();
  assert.deepEqual([store.getState().imports.length, store.getState().pending.length], [1, 3]);
});

test('merchant rules: learn, confirm again, undo; they drive suggestions on the next import', async () => {
  const store = await setup();
  const learned = await store.learnRule('Chipotle', 'c-dining');
  assert.deepEqual(learned.record, { pattern: 'CHIPOTLE', categoryId: 'c-dining', timesConfirmed: 1, updatedAt: learned.record.updatedAt });
  assert.equal((await store.learnRule('Chipotle', 'c-dining')).record.timesConfirmed, 2);
  assert.equal((await store.learnRule('Chipotle', 'c-groceries')).record.timesConfirmed, 1); // changed your mind
  const prepared = await prepareImport(ROWS, M, store.getState());
  assert.equal(prepared.items[0].suggestedCategoryId, 'c-groceries');
  assert.equal(prepared.items[2].suggestedCategoryId, null);
  const last = await store.learnRule('Chipotle', 'c-dining');
  await last.undo();
  assert.equal(store.getState().merchantRules[0].categoryId, 'c-groceries');
  assert.match((await store.learnRule('', 'c-dining')).errors.form, /can’t be remembered/);
});

test('deleting a category removes its rules, so backups stay restorable', async () => {
  const store = await setup();
  const cat = (await store.addCategory({ name: 'Coffee', type: 'expense', icon: '☕', bucket: 'want' })).record;
  await store.learnRule('Blue Bottle', cat.id);
  assert.equal((await store.deleteCategory(cat.id)).ok, true);
  assert.deepEqual(store.getState().merchantRules, []);
});

test('backups carry merchant rules but not the review queue; restore clears the queue (undo brings it back)', async () => {
  const store = await setup();
  await start(store);
  await store.learnRule('Chipotle', 'c-dining');
  const payload = buildPayload(store.snapshot(), 9);
  assert.equal('pending' in payload.data, false);
  const result = validatePayload(payload);
  assert.deepEqual(result.data.merchantRules.map((r) => r.pattern), ['CHIPOTLE']);
  const bad = buildPayload({ ...store.snapshot(), merchantRules: [{ pattern: 'x y', categoryId: 'c-dining', timesConfirmed: 1, updatedAt: 1 }] }, 9);
  assert.match(validatePayload(bad).error, /merchant rule that isn’t valid/);
  const restored = await store.replaceAll(result.data);
  assert.deepEqual([store.getState().pending.length, store.getState().merchantRules.length], [0, 1]);
  await restored.undo();
  assert.equal(store.getState().pending.length, 3);
});
