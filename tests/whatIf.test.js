// E12 What-If math: goal timelines, debt payoff, long-term growth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsToGoal, goalWithCut, payoffPlan, payoffComparison, growth, monthAfter, MAX_MONTHS } from '../js/services/insights/whatIf.js';

const debt = (over) => ({ id: 'd', name: 'Visa', balanceCents: 240000, aprBps: 2400, minPaymentCents: 7500, ...over });

test('monthsToGoal rounds up, and says when a goal is out of reach', () => {
  assert.equal(monthsToGoal({ targetCents: 300000, savedCents: 50000 }, 25000), 10);
  assert.equal(monthsToGoal({ targetCents: 300000, savedCents: 50000 }, 24000), 11);
  assert.equal(monthsToGoal({ targetCents: 300000, savedCents: 300000 }, 0), 0);
  assert.equal(monthsToGoal({ targetCents: 300000, savedCents: 0 }, 0), null);
  assert.equal(monthsToGoal({ targetCents: 100000000, savedCents: 0 }, 100), null); // > 50 years
});

test('goalWithCut: a $100 cut reaches a $3,000 goal sooner', () => {
  const goal = { targetCents: 300000, savedCents: 0, monthlyCents: 10000 };
  assert.deepEqual(goalWithCut(goal, 10000), { now: 30, withCut: 15, sooner: 15 });
  assert.deepEqual(goalWithCut({ ...goal, monthlyCents: 0 }, 10000), { now: null, withCut: 30, sooner: null });
});

test('payoffPlan: one card at 24%, minimums only, then with $50 extra', () => {
  const base = payoffPlan([debt()], 0);
  // $2,400 at 2%/month paying $75: n = −ln(1 − 0.02 × 2400 / 75) / ln(1.02) ≈ 51.6 → 52 months, ≈ 51.6 × $75 paid
  assert.deepEqual([base.months, base.interestCents], [52, 146952]);
  const faster = payoffComparison([debt()], 5000);
  // $125/month: n ≈ 24.5 → 25 months
  assert.deepEqual([faster.plan.months, faster.interestSavedCents], [25, 81083]);
  assert.equal(faster.monthsSooner, base.months - faster.plan.months);
});

test('payoffPlan: avalanche pays the highest rate first, then rolls its payment over', () => {
  const card = debt({ id: 'a', name: 'Card', balanceCents: 50000, aprBps: 2999, minPaymentCents: 2500 });
  const loan = debt({ id: 'b', name: 'Loan', balanceCents: 300000, aprBps: 500, minPaymentCents: 10000 });
  const plan = payoffPlan([loan, card], 10000);
  assert.deepEqual(plan.order.map((o) => o.name), ['Card', 'Loan']);
  assert.ok(plan.order[0].month <= 5, JSON.stringify(plan.order));
});

test('payoffPlan: a minimum that doesn’t cover the interest never ends', () => {
  const plan = payoffPlan([debt({ minPaymentCents: 4000 })], 0); // interest is $48/month
  assert.equal(plan.months, null);
  assert.equal(payoffComparison([debt({ minPaymentCents: 4000 })], 10000).interestSavedCents, null);
  assert.ok(payoffPlan([debt({ minPaymentCents: 4000 })], 10000).months < MAX_MONTHS);
  assert.deepEqual(payoffPlan([], 0), { months: 0, interestCents: 0, order: [] });
});

test('growth: $200 a month for 20 years at 6% (shown as an assumption)', () => {
  const g = growth(20000, 20);
  assert.equal(g.putInCents, 4800000);
  // Future value of an ordinary annuity: 200 × ((1.005^240 − 1) / 0.005) ≈ $92,408.18
  assert.ok(Math.abs(g.valueCents - 9240818) < 100, String(g.valueCents));
  assert.equal(g.growthCents, g.valueCents - g.putInCents);
  assert.equal(growth(10000, 1, 0).valueCents, 120000);
});

test('monthAfter crosses years', () => {
  assert.equal(monthAfter('2026-10', 0), '2026-10');
  assert.equal(monthAfter('2026-10', 3), '2027-01');
  assert.equal(monthAfter('2026-10', 20), '2028-06');
});

test('cuttableCategories: wants only, usual month averaged, biggest first', async () => {
  const { cuttableCategories } = await import('../js/services/insights/whatIf.js');
  const { DEFAULT_CATEGORIES } = await import('../js/services/categories.js');
  const tx = (categoryId, cents, date) => ({ id: `${categoryId}${date}`, type: 'expense', amountCents: cents, categoryId, date });
  const transactions = [tx('c-dining', 30000, '2026-09-10'), tx('c-dining', 20000, '2026-08-10'), tx('c-housing', 120000, '2026-09-01'), tx('c-shopping', 500, '2026-09-02'), tx('c-entertainment', 9000, '2026-10-05')];
  assert.deepEqual(cuttableCategories({ transactions, categories: DEFAULT_CATEGORIES }, '2026-10-28'), [{ id: 'c-dining', name: 'Dining Out', icon: '🍽️', usualCents: 25000 }]);
  assert.deepEqual(cuttableCategories({ transactions: [], categories: DEFAULT_CATEGORIES }, '2026-10-28'), []);
});
