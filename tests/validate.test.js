import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, parseAmountOrZero, parseApr, cleanNote, validateCard, validateIncome, validateExpense, validateCheckin } from '../js/services/validate.js';

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

test('parseAmountOrZero: 0 is allowed, junk is not', () => {
  for (const zero of ['0', '0.00', '$0', '.0']) assert.deepEqual(parseAmountOrZero(zero), { cents: 0 }, zero);
  assert.deepEqual(parseAmountOrZero('12.50'), { cents: 1250 });
  assert.ok(parseAmountOrZero('-1').error);
  assert.ok(parseAmountOrZero('').error);
});

test('parseApr: text to basis points, no floating point', () => {
  assert.deepEqual(parseApr('24.99'), { bps: 2499 });
  assert.deepEqual(parseApr('24.99%'), { bps: 2499 });
  assert.deepEqual(parseApr('0'), { bps: 0 });
  assert.deepEqual(parseApr('5.5'), { bps: 550 });
  assert.match(parseApr('100').error, /99.99/);
  assert.match(parseApr('abc').error, /like 24.99/);
  assert.ok(parseApr('1.234').error);
});

test('validateCard: name, rate and minimum are needed; limit is optional', () => {
  assert.deepEqual(validateCard({ name: ' Chase ', apr: '24.99', minPayment: '35', limit: '' }), { ok: true, value: { name: 'Chase', limitCents: null, aprBps: 2499, minPaymentCents: 3500 } });
  assert.deepEqual(validateCard({ name: 'Amex', apr: '0', minPayment: '0', limit: '5,000' }).value, { name: 'Amex', limitCents: 500000, aprBps: 0, minPaymentCents: 0 });
  const { errors } = validateCard({});
  assert.deepEqual(Object.keys(errors).sort(), ['apr', 'minPayment', 'name']);
  assert.match(errors.minPayment, /0 if none/);
  assert.ok(validateCard({ name: 'x'.repeat(41), apr: '1', minPayment: '1' }).errors.name);
  assert.ok(validateCard({ name: 'A', apr: '1', minPayment: '1', limit: 'lots' }).errors.limit);
  assert.equal(validateCard(null).ok, false);
});

test('validateIncome: amount and a known frequency', () => {
  assert.deepEqual(validateIncome({ name: 'Paycheck', amount: '1,850', frequency: 'biweekly' }).value, { name: 'Paycheck', amountCents: 185000, frequency: 'biweekly' });
  const { errors } = validateIncome({ name: '', amount: '0', frequency: 'yearly' });
  assert.deepEqual(Object.keys(errors).sort(), ['amount', 'frequency', 'name']);
});

test('validateExpense: due day is optional, 1 to 31', () => {
  assert.deepEqual(validateExpense({ name: 'Rent', amount: '1400', dayOfMonth: '1' }).value, { name: 'Rent', amountCents: 140000, dayOfMonth: 1 });
  assert.equal(validateExpense({ name: 'Groceries', amount: '400', dayOfMonth: '' }).value.dayOfMonth, null);
  for (const day of ['0', '32', '1.5', 'x']) assert.ok(validateExpense({ name: 'Rent', amount: '1', dayOfMonth: day }).errors.dayOfMonth, day);
});

const cards = [{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 1 }];
test('validateCheckin: every card needs a balance (0 is fine), date not in the future', () => {
  const ok = validateCheckin({ date: '2026-11-22', balances: { a: '1,200.50', b: '0' } }, { cards, today: '2026-11-22' });
  assert.deepEqual(ok, { ok: true, value: { date: '2026-11-22', balances: [{ cardId: 'a', balanceCents: 120050 }, { cardId: 'b', balanceCents: 0 }] } });
  const bad = validateCheckin({ date: '2026-11-23', balances: { a: '' , b: '-4' } }, { cards, today: '2026-11-22' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['balance-a', 'balance-b', 'date']);
  assert.ok(validateCheckin({ date: '2026-02-30', balances: { a: '1', b: '1' } }, { cards, today: '2026-11-22' }).errors.date);
  // Balances for cards that don't exist are ignored, never stored.
  assert.deepEqual(validateCheckin({ date: '2026-11-01', balances: { a: '1', b: '2', zzz: '3' } }, { cards, today: '2026-11-22' }).value.balances.map((b) => b.cardId), ['a', 'b']);
  assert.match(validateCheckin({ date: '2026-11-01', balances: {} }, { cards: [], today: '2026-11-22' }).errors.form, /Add a card/);
});

test('validateCheckin: a card added after that day may be left blank', () => {
  const added = new Date(2026, 9, 15, 12).getTime(); // Oct 15 local
  const list = [{ id: 'a', createdAt: 1 }, { id: 'late', createdAt: added }];
  const early = validateCheckin({ date: '2026-09-01', balances: { a: '5', late: '' } }, { cards: list, today: '2026-11-22' });
  assert.deepEqual(early.value.balances, [{ cardId: 'a', balanceCents: 500 }]);
  const after = validateCheckin({ date: '2026-10-15', balances: { a: '5', late: '' } }, { cards: list, today: '2026-11-22' });
  assert.ok(after.errors['balance-late']);
});
