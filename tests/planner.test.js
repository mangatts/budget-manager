import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyCents, latestBalances, monthsToPayoff, buildPlan } from '../js/services/planner.js';

const card = (id, aprBps, minPaymentCents, limitCents = null) => ({ id, name: id, aprBps, minPaymentCents, limitCents });
const checkin = (date, balances) => ({ date, balances: Object.entries(balances).map(([cardId, balanceCents]) => ({ cardId, balanceCents })), createdAt: 1 });

test('monthlyCents: pay frequency to a monthly amount', () => {
  assert.equal(monthlyCents(100000, 'monthly'), 100000);
  assert.equal(monthlyCents(100000, 'semimonthly'), 200000);
  assert.equal(monthlyCents(100000, 'biweekly'), 216667); // 26 paychecks a year, not 24
  assert.equal(monthlyCents(100000, 'weekly'), 433333);
});

test('latestBalances: newest check-in that includes each card', () => {
  const cards = [card('a', 0, 0), card('b', 0, 0), card('c', 0, 0)];
  const latest = latestBalances(cards, [checkin('2026-10-01', { a: 500, b: 900 }), checkin('2026-11-01', { a: 300 })]);
  assert.deepEqual(latest.get('a'), { balanceCents: 300, date: '2026-11-01' });
  assert.deepEqual(latest.get('b'), { balanceCents: 900, date: '2026-10-01' });
  assert.equal(latest.get('c'), null);
});

test('buildPlan: minimums on every card, the rest to the highest rate (avalanche)', () => {
  const cards = [card('low', 1500, 4000), card('high', 2999, 7500), card('mid', 2200, 2500)];
  const plan = buildPlan({
    cards,
    checkins: [checkin('2026-11-22', { low: 200000, high: 150000, mid: 80000 })],
    incomes: [{ amountCents: 200000, frequency: 'biweekly' }], // $4,333.34 a month
    expenses: [{ name: 'Rent', amountCents: 140000, dayOfMonth: 1 }, { name: 'Food', amountCents: 60000, dayOfMonth: null }],
  });
  assert.equal(plan.incomeCents, 433333);
  assert.equal(plan.expensesCents, 200000);
  assert.equal(plan.minimumsCents, 14000);
  assert.equal(plan.leftoverCents, 433333 - 200000 - 14000);
  assert.deepEqual(plan.cards.map((c) => [c.id, c.minCents, c.extraCents]), [
    ['high', 7500, 142500], // extra fills the highest rate up to its full balance…
    ['mid', 2500, 76833], // …then the next highest gets what's left
    ['low', 4000, 0],
  ]);
  assert.equal(plan.afterCardsCents, 0);
  assert.equal(plan.totalDebtCents, 430000);
  assert.deepEqual(plan.bills.map((b) => b.name), ['Rent', 'Food']);
});

test('buildPlan: short month → minimums still listed, negative leftover, no payoff date', () => {
  const plan = buildPlan({
    cards: [card('a', 2000, 5000)], checkins: [checkin('2026-11-01', { a: 100000 })],
    incomes: [{ amountCents: 100000, frequency: 'monthly' }], expenses: [{ name: 'Rent', amountCents: 98000, dayOfMonth: 1 }],
  });
  assert.equal(plan.leftoverCents, -3000);
  assert.deepEqual(plan.cards.map((c) => [c.minCents, c.extraCents, c.payCents]), [[5000, 0, 5000]]);
  assert.equal(plan.payoffMonths, null);
});

test('buildPlan: money left after paying every card in full', () => {
  const plan = buildPlan({
    cards: [card('a', 2000, 2500)], checkins: [checkin('2026-11-01', { a: 10000 })],
    incomes: [{ amountCents: 300000, frequency: 'monthly' }], expenses: [],
  });
  assert.equal(plan.cards[0].payCents, 10000);
  assert.equal(plan.afterCardsCents, 290000);
  assert.equal(plan.payoffMonths, 1);
});

test('buildPlan: minimum never exceeds the balance; paid-off cards owe nothing', () => {
  const plan = buildPlan({
    cards: [card('a', 2000, 3500), card('b', 1000, 2500)], checkins: [checkin('2026-11-01', { a: 1000, b: 0 })],
    incomes: [], expenses: [],
  });
  assert.deepEqual(plan.cards.map((c) => [c.id, c.minCents]), [['a', 1000], ['b', 0]]);
});

test('buildPlan: change since the previous check-in, limit use, and cards missing a balance', () => {
  const plan = buildPlan({
    cards: [card('a', 2000, 2500, 500000), card('b', 1000, 2500, 500000), card('new', 1000, 2500)],
    checkins: [checkin('2026-10-01', { a: 200000, b: 100000 }), checkin('2026-11-01', { a: 150000, b: 110000 })],
    incomes: [{ amountCents: 100000, frequency: 'monthly' }], expenses: [],
  });
  assert.deepEqual(plan.change, { sinceDate: '2026-10-01', cents: -40000 });
  assert.equal(plan.usedPercent, 26); // 2,600 of 10,000
  assert.equal(plan.cards.find((c) => c.id === 'a').usedPercent, 30);
  assert.deepEqual(plan.missing, [{ id: 'new', name: 'new', minCents: 2500 }]);
  assert.equal(plan.lastCheckin, '2026-11-01');
});

test('buildPlan: deleted cards in old check-ins are ignored', () => {
  const plan = buildPlan({ cards: [card('a', 0, 0)], checkins: [checkin('2026-11-01', { a: 100, gone: 999999 })], incomes: [], expenses: [] });
  assert.equal(plan.totalDebtCents, 100);
});

test('monthsToPayoff: interest is charged, avalanche order, and "never" when payments lose to interest', () => {
  assert.equal(monthsToPayoff([], 1000), 0);
  // $1,000 at 0% paying $100 a month: 10 months.
  assert.equal(monthsToPayoff([{ ...card('a', 0, 2500), balanceCents: 100000 }], 10000), 10);
  // With 24% APR it takes longer (interest 2%/month): 11.3 months, so 12.
  assert.equal(monthsToPayoff([{ ...card('a', 2400, 2500), balanceCents: 100000 }], 10000), 12);
  // $10,000 at 24% is $200/month interest; $150 never gets there.
  assert.equal(monthsToPayoff([{ ...card('a', 2400, 2500), balanceCents: 1000000 }], 15000), null);
  // Budget below the minimums: can't plan.
  assert.equal(monthsToPayoff([{ ...card('a', 0, 5000), balanceCents: 100000 }], 4000), null);
});

test('buildPlan: a card with no balance yet still has its minimum set aside', () => {
  const plan = buildPlan({
    cards: [card('a', 2000, 2500), card('b', 1000, 15000)], checkins: [checkin('2026-11-01', { a: 100000 })],
    incomes: [{ amountCents: 40000, frequency: 'monthly' }], expenses: [{ name: 'Rent', amountCents: 20000, dayOfMonth: 1 }],
  });
  assert.equal(plan.minimumsCents, 17500); // a's 25 + b's 150
  assert.equal(plan.leftoverCents, 2500);
  assert.deepEqual(plan.cards.map((c) => [c.id, c.payCents]), [['a', 5000]]); // only the real leftover goes extra
});
