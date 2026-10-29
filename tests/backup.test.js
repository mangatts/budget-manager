import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassphrase, buildPayload, validatePayload, createBackupFile, openBackupFile, backupFileName, MAX_FILE_BYTES, BackupTooLargeError } from '../js/services/backup.js';
import { encryptJson } from '../js/services/crypto.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

const PASS = 'blue river coffee lamp';
const tx = (over = {}) => ({
  id: '3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c', type: 'expense', amountCents: 475, categoryId: 'c-dining', date: '2026-10-28', note: 'Coffee',
  source: 'manual', importId: null, fingerprint: null, createdAt: 1000, updatedAt: 1000, ...over,
});
const state = (transactions = [tx()]) => ({ transactions, categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })), meta: [{ key: 'seededCategories', value: 1 }, { key: 'lastBackupAt', value: 5 }] });

test('passphrase rules: length, common choices, repeated characters, confirmation', () => {
  assert.match(checkPassphrase('short', 'short').passphrase, /at least 12/);
  assert.match(checkPassphrase('password1234', 'password1234').passphrase, /too easy/);
  assert.match(checkPassphrase('Password 1234', 'Password 1234').passphrase, /too easy/);
  assert.match(checkPassphrase('aaaaaaaaaaaaaa', 'aaaaaaaaaaaaaa').passphrase, /too easy/);
  assert.match(checkPassphrase(PASS, 'blue river coffee').confirm, /don’t match/);
  assert.deepEqual(checkPassphrase(PASS, PASS), {});
  assert.deepEqual(checkPassphrase('🍕🍕🍕🍕🍕🍕🍕🍕🍕🍕🍕x', '🍕🍕🍕🍕🍕🍕🍕🍕🍕🍕🍕x'), {});
});

test('file name includes the date', () => {
  assert.equal(backupFileName('2026-10-28'), 'budget-manager-backup-2026-10-28.bmbackup');
});

test('full round trip: backup file → open → same data, ready to restore', async () => {
  const text = await createBackupFile(state(), PASS, 1761650000000);
  const result = await openBackupFile(text, PASS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.transactions, [tx()]);
  assert.equal(result.data.categories.length, 21);
  assert.deepEqual(result.summary, { entries: 1, bills: 0, firstDate: '2026-10-28', lastDate: '2026-10-28', exportedAt: 1761650000000 });
  // After restoring, defaults aren't re-added, and the backup counts as the last backup.
  assert.deepEqual(result.data.meta, [{ key: 'seededCategories', value: 1 }, { key: 'lastBackupAt', value: 1761650000000 }]);
});

test('wrong passphrase and non-backup files give plain answers', async () => {
  const text = await createBackupFile(state(), PASS);
  assert.match((await openBackupFile(text, 'wrong passphrase here')).error, /passphrase doesn’t match/);
  assert.match((await openBackupFile('hello', PASS)).error, /isn’t a Budget Manager backup/);
  assert.match((await openBackupFile('x'.repeat(MAX_FILE_BYTES + 1), PASS)).error, /too large/);
});

const open = async (payload) => validatePayload(payload);
const payload = (s = state()) => buildPayload(s, 1761650000000);

test('one bad entry rejects the whole backup (nothing partial)', async () => {
  const bad = [
    tx({ id: 'not-a-uuid' }), tx({ amountCents: -5 }), tx({ amountCents: 4.75 }), tx({ amountCents: 100000001 }),
    tx({ type: 'gift' }), tx({ categoryId: 'c-paycheck' }), tx({ categoryId: 'c-missing' }), tx({ date: '2026-02-30' }),
    tx({ note: 'x'.repeat(201) }), tx({ note: 42 }), tx({ source: 'bank' }), tx({ createdAt: -1 }), tx({ fingerprint: '<script>' }),
  ];
  for (const t of bad) {
    const result = await open(payload(state([tx({ id: 'a1b2c3d4-0000-4000-8000-000000000000' }), t])));
    assert.equal(result.ok, false, JSON.stringify(t));
    assert.match(result.error, /entry that isn’t valid/);
  }
});

test('duplicate ids and bad categories are rejected', async () => {
  assert.match((await open(payload(state([tx(), tx()])))).error, /repeated entry/);
  const s = state();
  s.categories.push({ ...s.categories[0] });
  assert.match((await open(payload(s))).error, /repeated category/);
  for (const bad of [{ id: '../x' }, { name: '' }, { name: 'x'.repeat(31) }, { type: 'gift' }, { bucket: 'luxury' }, { archived: 'no' }, { benchmarkKey: 'DROP TABLE' }]) {
    const s2 = state();
    s2.categories[0] = { ...s2.categories[0], ...bad };
    assert.match((await open(payload(s2))).error, /category that isn’t valid/, JSON.stringify(bad));
  }
});

test('unknown fields are dropped and notes are cleaned', async () => {
  const result = await open(payload(state([tx({ extra: 'x', __proto__: { polluted: true }, note: 'Lunch‮ evil' })])));
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.data.transactions[0]).sort(), Object.keys(tx()).sort());
  assert.equal(result.data.transactions[0].note, 'Lunch evil');
  assert.equal({}.polluted, undefined);
});

test('newer app versions and other apps are refused', async () => {
  assert.match((await open({ ...payload(), schemaVersion: 99 })).error, /newer version/);
  assert.match((await open({ ...payload(), app: 'other' })).error, /isn’t a Budget Manager backup/);
  assert.match((await open({ ...payload(), data: { transactions: 'x' } })).error, /damaged/);
});

test('an encrypted file with a damaged payload is refused', async () => {
  const text = JSON.stringify(await encryptJson({ app: 'budget-manager', schemaVersion: 1, data: null }, PASS));
  assert.match((await openBackupFile(text, PASS)).error, /damaged/);
});

test('empty backup (no entries yet) is valid', async () => {
  const result = await open(payload(state([])));
  assert.equal(result.ok, true);
  assert.deepEqual(result.summary.entries, 0);
});

test('a backup too large to restore is never made', async () => {
  await assert.rejects(createBackupFile(state(), PASS, 1, { maxBytes: 1000 }), BackupTooLargeError);
  const ok = await createBackupFile(state(), PASS, 1);
  assert.ok(ok.length <= MAX_FILE_BYTES);
});

test('profile settings travel in backups; bad values are dropped', async () => {
  const s = state();
  s.meta.push({ key: 'monthlyTakeHomeCents', value: 450000 }, { key: 'savingsPercent', value: 0 });
  const ok = validatePayload(buildPayload(s, 9));
  assert.deepEqual(ok.data.meta.filter((m) => m.key !== 'seededCategories' && m.key !== 'lastBackupAt'), [{ key: 'monthlyTakeHomeCents', value: 450000 }, { key: 'savingsPercent', value: 0 }]);
  const bad = state();
  bad.meta.push({ key: 'savingsPercent', value: 99 }, { key: 'monthlyTakeHomeCents', value: -5 }, { key: 'evil', value: 1 });
  const dropped = validatePayload(buildPayload(bad, 9)).data.meta.map((m) => m.key);
  assert.deepEqual(dropped.sort(), ['lastBackupAt', 'seededCategories']);
});

const bill = (over = {}) => ({ id: 'b1b2c3d4-0000-4000-8000-000000000001', name: 'Rent', amountCents: 140000, categoryId: 'c-housing', dayOfMonth: 1, active: true, createdAt: 5, updatedAt: 5, ...over });

test('bills travel in backups (version 2)', async () => {
  const s = { ...state(), bills: [bill()] };
  const text = await createBackupFile(s, PASS, 7);
  const result = await openBackupFile(text, PASS);
  assert.deepEqual(result.data.bills, [bill()]);
  assert.equal(result.summary.bills, 1);
});

test('older (version 1) backups, made before bills existed, still restore', async () => {
  const v1 = { ...buildPayload(state(), 9), schemaVersion: 1 };
  delete v1.data.bills;
  const result = validatePayload(v1);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.bills, []);
});

test('one bad bill rejects the whole backup', async () => {
  for (const bad of [bill({ id: 'x' }), bill({ amountCents: 0 }), bill({ categoryId: 'c-paycheck' }), bill({ dayOfMonth: 32 }), bill({ name: '' }), bill({ active: 'yes' })]) {
    const result = validatePayload(buildPayload({ ...state(), bills: [bad] }, 9));
    assert.match(result.error, /bill that isn’t valid/, JSON.stringify(bad));
  }
  const missing = buildPayload(state(), 9);
  missing.data.bills = 'nope';
  assert.match(validatePayload(missing).error, /damaged/);
});
