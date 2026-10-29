// E11-S1: the optional money profile (emergency savings, 401(k) match) and debts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { parseApr, parseAmountOrZero, validateDebt, validateProfile } from '../js/services/validate.js';
import { buildPayload, validatePayload } from '../js/services/backup.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';
import { formatApr } from '../js/views/debts.js';

async function setup({ adapter = createMemoryAdapter() } = {}) {
  let clock = 1000;
  let ids = 0;
  const repo = createRepository(adapter);
  const store = createStore({ repo, now: () => clock++, newId: () => `id-${++ids}`, today: () => '2026-10-28' });
  await store.init();
  return { store, repo, adapter };
}

const visa = { name: 'Visa', balance: '2,400', apr: '24.99%', minPayment: '75' };
const debt = (over = {}) => ({
  id: '3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c', name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500, createdAt: 1000, updatedAt: 1000, ...over,
});
const state = (over = {}) => ({ transactions: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), meta: [{ key: 'seededCategories', value: 1 }], ...over });

test('parseApr reads rates as text into basis points (no floating point)', () => {
  assert.deepEqual(parseApr('24.99'), { bps: 2499 });
  assert.deepEqual(parseApr(' 7.5 % '), { bps: 750 });
  assert.deepEqual(parseApr('0'), { bps: 0 });
  assert.deepEqual(parseApr('99.99'), { bps: 9999 });
  for (const bad of ['', '100', '-5', '24.999', 'abc', '1e2']) assert.ok(parseApr(bad).error, bad);
});

test('parseAmountOrZero allows "I have none", but still rejects junk', () => {
  for (const zero of ['0', '0.00', '$0', '.0']) assert.deepEqual(parseAmountOrZero(zero), { cents: 0 }, zero);
  assert.deepEqual(parseAmountOrZero('1,200.50'), { cents: 120050 });
  for (const bad of ['', '.', 'none', '-1']) assert.ok(parseAmountOrZero(bad).error, bad);
});

test('validateDebt: name, balance, and rate are required; minimum is optional', () => {
  assert.deepEqual(validateDebt(visa), { ok: true, value: { name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500 } });
  assert.equal(validateDebt({ ...visa, minPayment: '' }).value.minPaymentCents, 0);
  assert.equal(validateDebt({ ...visa, minPayment: '0.00' }).value.minPaymentCents, 0);
  const bad = validateDebt({ name: '  ', balance: '0', apr: 'high', minPayment: 'x' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['apr', 'balance', 'minPayment', 'name']);
  assert.match(validateDebt({ ...visa, name: 'x'.repeat(41) }).errors.name, /40 characters/);
  assert.match(validateDebt({ ...visa, balance: '0' }).errors.balance, /Paid off/);
  assert.equal(validateDebt({ ...visa, apr: '390' }).errors.apr, 'Rates can be up to 99.99%');
  assert.equal(validateDebt(null).ok, false);
});

test('validateProfile: emergency savings and 401(k) match are optional extras', () => {
  const base = { takeHome: '4500', savingsPercent: '20' };
  assert.deepEqual(validateProfile(base).value, { monthlyTakeHomeCents: 450000, savingsPercent: 20 }); // untouched when not sent
  assert.deepEqual(validateProfile({ ...base, emergencyFund: '', employerMatch: null }).value, { monthlyTakeHomeCents: 450000, savingsPercent: 20, emergencyFundCents: null, employerMatch: null });
  assert.equal(validateProfile({ ...base, emergencyFund: '0.00' }).value.emergencyFundCents, 0);
  assert.equal(validateProfile({ ...base, emergencyFund: '1,500' }).value.emergencyFundCents, 150000);
  assert.equal(validateProfile({ ...base, employerMatch: 'partial' }).value.employerMatch, 'partial');
  assert.equal(validateProfile({ ...base, employerMatch: 'lots' }).value.employerMatch, null);
  assert.match(validateProfile({ ...base, emergencyFund: 'some' }).errors.emergencyFund, /amount/);
});

test('setProfile saves the extras, and undo removes ones that were never set', async () => {
  const { store, repo } = await setup();
  const result = await store.setProfile({ takeHome: '4500', savingsPercent: '20', emergencyFund: '0', employerMatch: 'none' });
  assert.equal(store.getState().meta.emergencyFundCents, 0);
  assert.equal((await repo.get('meta', 'employerMatch')).value, 'none');
  await result.undo();
  assert.equal(store.getState().meta.emergencyFundCents, undefined);
  assert.equal(await repo.get('meta', 'employerMatch'), undefined);
});

test('debts: add, edit, delete, each with undo; highest rate listed first', async () => {
  const { store, repo } = await setup();
  const added = await store.addDebt(visa);
  assert.deepEqual(added.record, { id: 'id-1', name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500, createdAt: 1000, updatedAt: 1000 });
  await store.addDebt({ name: 'Car loan', balance: '9000', apr: '6.5' });
  await store.addDebt({ name: 'Store card', balance: '300', apr: '29.99' });
  assert.deepEqual(store.getState().debts.map((d) => d.name), ['Store card', 'Visa', 'Car loan']);

  const edited = await store.updateDebt('id-1', { ...visa, balance: '2,000' });
  assert.equal(store.getState().debts.find((d) => d.id === 'id-1').balanceCents, 200000);
  await edited.undo();
  assert.equal((await repo.get('debts', 'id-1')).balanceCents, 240000);

  const removed = await store.deleteDebt('id-1');
  assert.equal(store.getState().debts.length, 2);
  await removed.undo();
  assert.deepEqual(await repo.get('debts', 'id-1'), added.record);

  await added.undo();
  assert.equal(await repo.get('debts', 'id-1'), undefined);
  assert.deepEqual(store.getState().debts.map((d) => d.name), ['Store card', 'Car loan']);
});

test('debts: bad input and missing debts fail politely, with nothing saved', async () => {
  const { store, repo } = await setup();
  assert.equal((await store.addDebt({ ...visa, apr: '' })).errors.apr, 'Enter the interest rate, like 24.99');
  assert.deepEqual(await repo.getAll('debts'), []);
  assert.match((await store.updateDebt('nope', visa)).errors.form, /no longer exists/);
  assert.match((await store.deleteDebt('nope')).errors.form, /no longer exists/);
});

test('debts survive a reload and are in the snapshot', async () => {
  const adapter = createMemoryAdapter();
  const first = await setup({ adapter });
  await first.store.addDebt(visa);
  const second = await setup({ adapter });
  assert.equal(second.store.getState().debts[0].name, 'Visa');
  assert.equal(second.store.snapshot().debts[0].aprBps, 2499);
});

test('backups carry debts and the new profile settings', () => {
  const meta = [{ key: 'seededCategories', value: 1 }, { key: 'emergencyFundCents', value: 0 }, { key: 'employerMatch', value: 'full' }, { key: 'skippedSteps', value: ['match'] }];
  const result = validatePayload(buildPayload(state({ meta, debts: [debt()] }), 9));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.debts, [debt()]);
  assert.deepEqual(result.data.meta.filter((m) => m.key !== 'lastBackupAt' && m.key !== 'seededCategories'), meta.slice(1));
});

test('older (version 3) backups, made before debts existed, still restore', () => {
  const v3 = { ...buildPayload(state(), 9), schemaVersion: 3 };
  delete v3.data.debts;
  const result = validatePayload(v3);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.debts, []);
});

test('one bad or repeated debt rejects the whole backup', () => {
  for (const bad of [debt({ id: 'x' }), debt({ balanceCents: 0 }), debt({ aprBps: 10000 }), debt({ aprBps: 1.5 }), debt({ name: '' }), debt({ minPaymentCents: -1 })]) {
    assert.match(validatePayload(buildPayload(state({ debts: [bad] }), 9)).error, /debt that isn’t valid/, JSON.stringify(bad));
  }
  assert.match(validatePayload(buildPayload(state({ debts: [debt(), debt()] }), 9)).error, /repeated debt/);
  const damaged = buildPayload(state(), 9);
  damaged.data.debts = 'nope';
  assert.match(validatePayload(damaged).error, /damaged/);
  // A bad setting is dropped (like other settings), not restored.
  const badMeta = validatePayload(buildPayload(state({ meta: [{ key: 'employerMatch', value: 'lots' }, { key: 'skippedSteps', value: ['<b>'] }] }), 9));
  assert.deepEqual(badMeta.data.meta.map((m) => m.key), ['seededCategories', 'lastBackupAt']);
});

test('formatApr drops trailing zeros', () => {
  assert.equal(formatApr(2499), '24.99%');
  assert.equal(formatApr(650), '6.5%');
  assert.equal(formatApr(500), '5%');
  assert.equal(formatApr(0), '0%');
});
