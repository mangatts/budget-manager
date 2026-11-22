import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPassphrase, buildPayload, validatePayload, createBackupFile, openBackupFile, backupFileName, MAX_FILE_BYTES, BackupTooLargeError } from '../js/services/backup.js';
import { encryptJson } from '../js/services/crypto.js';

const PASS = 'blue river coffee lamp';
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const card = (over = {}) => ({ id: uuid(1), name: 'Chase', limitCents: 500000, aprBps: 2499, minPaymentCents: 3500, createdAt: 1000, updatedAt: 1000, ...over });
const checkin = (over = {}) => ({ date: '2026-11-01', balances: [{ cardId: uuid(1), balanceCents: 120000 }], createdAt: 1000, ...over });
const income = (over = {}) => ({ id: uuid(2), name: 'Pay', amountCents: 200000, frequency: 'biweekly', createdAt: 1000, updatedAt: 1000, ...over });
const expense = (over = {}) => ({ id: uuid(3), name: 'Rent', amountCents: 140000, dayOfMonth: 1, createdAt: 1000, updatedAt: 1000, ...over });
const state = (over = {}) => ({ cards: [card()], checkins: [checkin()], incomes: [income()], expenses: [expense()], meta: [{ key: 'carriedOver', value: 1 }, { key: 'lastBackupAt', value: 5 }], ...over });
const payload = (s = state()) => buildPayload(s, 1761650000000);
const open = (p) => validatePayload(p, { today: '2026-11-22', now: 7000 });

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
  assert.deepEqual(result.data.cards, [card()]);
  assert.deepEqual(result.data.checkins, [checkin()]);
  assert.deepEqual(result.data.incomes, [income()]);
  assert.deepEqual(result.data.expenses, [expense()]);
  assert.deepEqual(result.summary, { cards: 1, checkins: 1, firstDate: '2026-11-01', lastDate: '2026-11-01', exportedAt: 1761650000000, legacy: false });
  // After restoring, old leftovers aren't carried over again, and the backup counts as the last backup.
  assert.deepEqual(result.data.meta, [{ key: 'carriedOver', value: 1 }, { key: 'lastBackupAt', value: 1761650000000 }]);
});

test('wrong passphrase and non-backup files give plain answers', async () => {
  const text = await createBackupFile(state(), PASS);
  assert.match((await openBackupFile(text, 'wrong passphrase here')).error, /passphrase doesn’t match/);
  assert.match((await openBackupFile('hello', PASS)).error, /isn’t a Budget Manager backup/);
  assert.match((await openBackupFile('x'.repeat(MAX_FILE_BYTES + 1), PASS)).error, /too large/);
});

test('one bad record rejects the whole backup (nothing partial)', () => {
  const bad = [
    ['cards', card({ id: 'not-a-uuid' })], ['cards', card({ aprBps: 10000 })], ['cards', card({ minPaymentCents: -1 })], ['cards', card({ limitCents: 0 })], ['cards', card({ name: '' })],
    ['checkins', checkin({ date: '2026-02-30' })], ['checkins', checkin({ balances: [{ cardId: uuid(1), balanceCents: 1.5 }] })], ['checkins', checkin({ balances: 'lots' })],
    ['checkins', checkin({ balances: [{ cardId: uuid(1), balanceCents: 1 }, { cardId: uuid(1), balanceCents: 2 }] })],
    ['incomes', income({ frequency: 'yearly' })], ['incomes', income({ amountCents: 0 })],
    ['expenses', expense({ dayOfMonth: 32 })], ['expenses', expense({ amountCents: 100000001 })], ['expenses', expense({ createdAt: -1 })],
  ];
  for (const [list, record] of bad) {
    const result = open(payload(state({ [list]: [record] })));
    assert.equal(result.ok, false, `${list} ${JSON.stringify(record)}`);
    assert.match(result.error, /isn’t valid/);
  }
});

test('repeated ids or days are rejected', () => {
  assert.match(open(payload(state({ cards: [card(), card()] }))).error, /repeated card/);
  assert.match(open(payload(state({ checkins: [checkin(), checkin()] }))).error, /repeated check-in/);
});

test('unknown fields are dropped, names cleaned, deleted cards’ balances dropped', () => {
  const result = open(payload(state({
    cards: [card({ name: ' Chase\u202e ', extra: '<script>' })],
    checkins: [checkin({ balances: [{ cardId: uuid(1), balanceCents: 5 }, { cardId: uuid(99), balanceCents: 9 }], note: 'x' })],
  })));
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.cards[0], card({ name: 'Chase' }));
  assert.deepEqual(result.data.checkins[0], checkin({ balances: [{ cardId: uuid(1), balanceCents: 5 }] }));
});

test('newer app versions and other apps are refused', () => {
  assert.match(open({ ...payload(), schemaVersion: 99 }).error, /newer version/);
  assert.match(open({ ...payload(), app: 'other' }).error, /isn’t a Budget Manager backup/);
  assert.match(open({ ...payload(), data: null }).error, /damaged/);
});

test('an encrypted file with a damaged payload is refused', async () => {
  const text = JSON.stringify(await encryptJson({ app: 'budget-manager', schemaVersion: 8, data: { cards: 'nope' } }, PASS));
  assert.match((await openBackupFile(text, PASS)).error, /damaged/);
});

test('empty backup is valid', () => {
  const result = open(payload(state({ cards: [], checkins: [], incomes: [], expenses: [] })));
  assert.equal(result.ok, true);
  assert.equal(result.summary.cards, 0);
});

test('a backup too large to restore is never made', async () => {
  await assert.rejects(createBackupFile(state(), PASS, Date.now(), { maxBytes: 100 }), BackupTooLargeError);
});

test('backups from the earlier version bring over debts, active bills and take-home pay', () => {
  const old = {
    app: 'budget-manager', schemaVersion: 7, exportedAt: 5000,
    data: {
      transactions: [{ id: uuid(50), note: 'ignored' }], categories: [],
      debts: [{ id: uuid(60), name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500, createdAt: 5, updatedAt: 6 }],
      bills: [
        { id: uuid(61), name: 'Rent', amountCents: 140000, categoryId: 'c-housing', dayOfMonth: 1, active: true, createdAt: 5, updatedAt: 6 },
        { id: uuid(62), name: 'Gym', amountCents: 3000, categoryId: 'c-other', dayOfMonth: 9, active: false, createdAt: 5, updatedAt: 6 },
      ],
      meta: [{ key: 'monthlyTakeHomeCents', value: 450000 }, { key: 'savingsPercent', value: 20 }],
    },
  };
  const result = open(old);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.cards.map((c) => [c.name, c.aprBps, c.limitCents]), [['Visa', 2499, null]]);
  assert.deepEqual(result.data.checkins, [{ date: '2026-11-22', balances: [{ cardId: uuid(60), balanceCents: 240000 }], createdAt: 7000 }]);
  assert.deepEqual(result.data.expenses.map((e) => e.name), ['Rent']);
  assert.deepEqual(result.data.incomes.map((i) => [i.amountCents, i.frequency]), [[450000, 'monthly']]);
  assert.deepEqual(result.data.meta, [{ key: 'carriedOver', value: 1 }, { key: 'lastBackupAt', value: 5000 }]);
  assert.equal(result.summary.legacy, true);

  const bad = structuredClone(old);
  bad.data.debts[0].aprBps = -1;
  assert.match(open(bad).error, /debt that isn’t valid/);
  // Version 1 had no debts or bills at all.
  assert.equal(open({ app: 'budget-manager', schemaVersion: 1, data: { transactions: [], categories: [], meta: [] } }).ok, true);
});
