import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, cleanNote, validateTransaction } from '../js/services/validate.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

test('parseAmount: common ways people type money', () => {
  const cases = { '12': 1200, '12.5': 1250, '12.50': 1250, '12.': 1200, '.5': 50, '0.01': 1, '$4.75': 475, '$ 4.75': 475, ' 4.75 ': 475, '1,250.00': 125000, '1000000': 100000000, '007.10': 710 };
  for (const [input, cents] of Object.entries(cases)) assert.deepEqual(parseAmount(input), { cents }, input);
});

test('parseAmount: never uses floating point (classic 0.1 + 0.2 and x.x5 traps)', () => {
  assert.equal(parseAmount('0.29').cents, 29); // 0.29 * 100 = 28.999999999999996 in floating point
  assert.equal(parseAmount('1.15').cents, 115);
  assert.equal(parseAmount('4.35').cents, 435);
  assert.equal(parseAmount('999999.99').cents, 99999999);
});

test('parseAmount: rejects anything that is not a plain positive amount', () => {
  const errors = {
    '': 'Enter an amount', '   ': 'Enter an amount', null: 'Enter an amount',
    'abc': 'Enter an amount like 12.50', '-5': 'Enter an amount like 12.50', '1e5': 'Enter an amount like 12.50',
    '12.3.4': 'Enter an amount like 12.50', '1,25': 'Enter an amount like 12.50', '12,5000': 'Enter an amount like 12.50',
    '٣': 'Enter an amount like 12.50', '.': 'Enter an amount like 12.50', '$': 'Enter an amount', 'Infinity': 'Enter an amount like 12.50',
    '12.345': 'Use at most 2 decimal places, like 12.50',
    '0': 'Enter an amount more than $0', '0.00': 'Enter an amount more than $0',
    '1000000.01': 'Amounts can’t be more than $1,000,000', '99999999999999999999': 'Amounts can’t be more than $1,000,000',
  };
  for (const [input, error] of Object.entries(errors)) assert.deepEqual(parseAmount(input === 'null' ? null : input), { error }, input);
});

test('cleanNote: removes control and text-direction characters, keeps emoji', () => {
  assert.equal(cleanNote('  Lunch\n\twith  Sam  '), 'Lunch with Sam');
  assert.equal(cleanNote('Coffee ‮evil‬'), 'Coffee evil');
  assert.equal(cleanNote('Pizza 🍕'), 'Pizza 🍕');
  assert.equal(cleanNote(undefined), '');
  assert.equal(cleanNote('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>'); // stored as text, rendered as text
});

const ctx = { categories: DEFAULT_CATEGORIES, today: '2026-10-28' };
const valid = { type: 'expense', amount: '4.75', categoryId: 'c-dining', date: '2026-10-28', note: ' Coffee ' };

test('validateTransaction: accepts a normal expense and income', () => {
  assert.deepEqual(validateTransaction(valid, ctx), { ok: true, value: { type: 'expense', amountCents: 475, categoryId: 'c-dining', date: '2026-10-28', note: 'Coffee' } });
  assert.equal(validateTransaction({ ...valid, type: 'income', categoryId: 'c-paycheck' }, ctx).ok, true);
  assert.equal(validateTransaction({ ...valid, amount: undefined, amountCents: 475 }, ctx).value.amountCents, 475);
});

test('validateTransaction: every field error at once, in plain words', () => {
  const result = validateTransaction({ type: 'gift', amount: 'x', categoryId: 'nope', date: '2026-02-30', note: 'x'.repeat(212) }, ctx);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, {
    type: 'Choose money in or money out',
    amount: 'Enter an amount like 12.50',
    categoryId: 'Pick a category',
    date: 'Pick a date',
    note: 'Notes can be up to 200 characters. Shorten it by 12.',
  });
});

test('validateTransaction: category must match money in/out and not be hidden', () => {
  assert.equal(validateTransaction({ ...valid, categoryId: 'c-paycheck' }, ctx).errors.categoryId, 'Pick a category');
  const hidden = DEFAULT_CATEGORIES.map((c) => (c.id === 'c-dining' ? { ...c, archived: true } : c));
  assert.equal(validateTransaction(valid, { ...ctx, categories: hidden }).errors.categoryId, 'Pick a category');
});

test('validateTransaction: date range is 2000-01-01 to one year ahead', () => {
  const date = (d) => validateTransaction({ ...valid, date: d }, ctx);
  assert.equal(date('2000-01-01').ok, true);
  assert.equal(date('1999-12-31').errors.date, 'Pick a date');
  assert.equal(date('2027-10-28').ok, true);
  assert.equal(date('2027-10-29').errors.date, 'Pick a date');
  for (const bad of ['10/28/2026', '2026-10-28T00:00', '', null, 20261028]) assert.equal(date(bad).errors.date, 'Pick a date', String(bad));
});

test('validateTransaction: note length counts characters, not bytes', () => {
  assert.equal(validateTransaction({ ...valid, note: '🍕'.repeat(200) }, ctx).ok, true);
  assert.equal(validateTransaction({ ...valid, note: '🍕'.repeat(201) }, ctx).errors.note, 'Notes can be up to 200 characters. Shorten it by 1.');
});

test('validateTransaction: rejects bad amountCents and junk input', () => {
  for (const amountCents of [0, -5, 100000001]) assert.ok(validateTransaction({ ...valid, amount: undefined, amountCents }, ctx).errors.amount);
  assert.equal(validateTransaction(null, ctx).ok, false);
  assert.equal(validateTransaction('x', ctx).ok, false);
});
