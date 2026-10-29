// E11-S2 Next Best Step and E11-S3 Money Checkup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moneySteps, currentStep, recentMonths, monthlyInterest } from '../js/services/insights/nextStep.js';
import { moneyCheckup, scoreLabel } from '../js/services/insights/checkup.js';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

const TODAY = '2026-10-28';
let n = 0;
const tx = (categoryId, dollars, date = '2026-09-15') => ({
  id: `t${++n}`, type: categoryId === 'c-paycheck' ? 'income' : 'expense', amountCents: dollars * 100, categoryId, date, note: '', createdAt: n, updatedAt: n,
});
// September: $4,000 in; housing $1,200, groceries $400, card minimum $100, dining $300; $200 to savings.
const september = () => [tx('c-paycheck', 4000), tx('c-housing', 1200), tx('c-groceries', 400), tx('c-debt-min', 100), tx('c-dining', 300), tx('c-savings', 200)];
const state = ({ transactions = september(), meta = {}, debts = [] } = {}) => ({ categories: DEFAULT_CATEGORIES, transactions, meta, debts, bills: [], challenges: [] });
const visa = { id: 'd1', name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500, createdAt: 1, updatedAt: 1 };
const byId = (steps) => Object.fromEntries(steps.map((s) => [s.id, s]));

test('recentMonths: averages complete months, keeps savings apart from spending', () => {
  const r = recentMonths(state(), TODAY);
  assert.deepEqual(r, { months: 1, label: 'last month', inCents: 400000, spentCents: 200000, savedCents: 20000, needsCents: 170000, housingCents: 120000, debtPaymentsCents: 10000 });
  assert.equal(recentMonths(state({ transactions: [tx('c-dining', 5, TODAY)] }), TODAY), null); // this month only
  // Take-home counts when it's higher than recorded money in.
  assert.equal(recentMonths(state({ meta: { monthlyTakeHomeCents: 450000 } }), TODAY).inCents, 450000);
});

test('with no history, step 1 asks for pay and a month of spending', () => {
  const s = currentStep(state({ transactions: [] }), TODAY);
  assert.equal(s.id, 'spend-less');
  assert.equal(s.status, 'ask');
  assert.deepEqual(s.action, { label: 'Add your pay', href: '#/profile' });
});

test('spending more than you earn: step 1, with the gap and where to look', () => {
  const s = currentStep(state({ transactions: [...september(), tx('c-shopping', 2100)] }), TODAY);
  assert.equal(s.id, 'spend-less');
  assert.match(s.message, /You spent \$100\.00 more than came in \(last month\)/);
  assert.equal(s.action.href, '#/tips');
  assert.deepEqual(s.why.lines.at(-1), ['Left over', -10000]);
});

test('the order of operations, one answer at a time', () => {
  // Spending is fine; no emergency answer yet → step 2 asks.
  let s = currentStep(state(), TODAY);
  assert.deepEqual([s.id, s.status, s.number], ['starter-fund', 'ask', 2]);

  s = currentStep(state({ meta: { emergencyFundCents: 40000 } }), TODAY);
  assert.equal(s.message, 'You’re $600.00 away from a $1,000.00 starter safety net.');
  assert.deepEqual(s.progress, { current: 40000, target: 100000 });

  s = currentStep(state({ meta: { emergencyFundCents: 150000 } }), TODAY);
  assert.deepEqual([s.id, s.status], ['match', 'ask']);
  s = currentStep(state({ meta: { emergencyFundCents: 150000, employerMatch: 'partial' } }), TODAY);
  assert.deepEqual([s.id, s.status], ['match', 'todo']);

  // No match offered → doesn't apply; no debts → done; full fund = 3 × $1,700 essentials.
  s = currentStep(state({ meta: { emergencyFundCents: 150000, employerMatch: 'none' } }), TODAY);
  assert.equal(s.id, 'full-fund');
  assert.equal(s.message, '0.8 of 3 months of essentials saved. $3,600.00 to go.');

  s = currentStep(state({ meta: { emergencyFundCents: 600000, employerMatch: 'full' } }), TODAY);
  assert.equal(s.id, 'save-15');
  assert.equal(s.message, 'You’re saving 5%. Another $400.00 a month gets you to 15%.');

  const saver = state({ transactions: [...september(), tx('c-savings', 500)], meta: { emergencyFundCents: 600000, employerMatch: 'full' } });
  s = currentStep(saver, TODAY);
  assert.equal(s.id, 'goals');
  assert.equal(moneySteps(saver, TODAY).filter((x) => x.status === 'done').length, 6);
});

test('high-interest debt: highest rate first, with the monthly interest it costs', () => {
  assert.equal(monthlyInterest(visa), 4998); // $2,400 × 24.99% ÷ 12
  const car = { ...visa, id: 'd2', name: 'Car loan', aprBps: 650, balanceCents: 900000 };
  const store = { ...visa, id: 'd3', name: 'Store card', aprBps: 2999, balanceCents: 30000 };
  const s = currentStep(state({ meta: { emergencyFundCents: 150000, employerMatch: 'full' }, debts: [visa, car, store] }), TODAY);
  assert.equal(s.id, 'high-interest');
  assert.match(s.message, /^Your Store card at 29\.99% costs about \$7\.50 a month/);
  assert.equal(s.why.lines.length, 4); // two high-interest debts (car loan at 6.5% isn't), total, interest
  assert.deepEqual(s.why.lines.at(-1), ['Interest each month, about', 4998 + 750]);
});

test('skipped steps are passed over, and done steps can’t be skipped', () => {
  const steps = byId(moneySteps(state({ meta: { skippedSteps: ['starter-fund', 'spend-less'] } }), TODAY));
  assert.equal(steps['spend-less'].skipped, false); // already done
  assert.equal(steps['starter-fund'].skipped, true);
  assert.equal(steps.match.current, true);
  assert.equal(moneySteps(state(), TODAY).filter((s) => s.current).length, 1);
});

test('store: skip a step and undo it; unknown steps are refused', async () => {
  const store = createStore({ repo: createRepository(createMemoryAdapter()), now: () => 1, newId: () => 'x', today: () => TODAY });
  await store.init();
  const result = await store.setStepSkipped('match', true);
  assert.deepEqual(store.getState().meta.skippedSteps, ['match']);
  await store.setStepSkipped('match', true); // no duplicates
  assert.deepEqual(store.getState().meta.skippedSteps, ['match']);
  await result.undo();
  assert.deepEqual(store.getState().meta.skippedSteps, []);
  assert.match((await store.setStepSkipped('<script>', true)).errors.form, /doesn’t exist/);
});

test('checkup: scores last month from 5 signals, scaled over the ones we can measure', () => {
  // Spending 🟢, savings 5% 🟡, housing 30% 🟢, debt 2.5% 🟢; emergency not answered → 70 of 80 → 88
  const unanswered = moneyCheckup(state(), TODAY);
  assert.equal(unanswered.available, true);
  assert.equal(unanswered.month, '2026-09');
  assert.deepEqual(unanswered.signals.map((s) => s.status), ['good', 'ok', 'unknown', 'good', 'good']);
  assert.equal(unanswered.score, 88);
  assert.equal(unanswered.measured, 4);

  // $1,500 saved against $1,700 of essentials = 0.8 months → 🔴 → 70 of 100
  const c = moneyCheckup(state({ meta: { emergencyFundCents: 150000 } }), TODAY);
  assert.equal(c.score, 70);
  assert.match(c.signals[2].message, /Less than a month of essentials saved \(0\.8\)/);
  assert.equal(scoreLabel(70), 'Getting there');
});

test('checkup: debt and housing thresholds', () => {
  const withVisa = moneyCheckup(state({ debts: [visa] }), TODAY).signals.find((s) => s.id === 'debt');
  assert.equal(withVisa.status, 'ok');
  assert.match(withVisa.message, /a debt above 8% interest/);
  const heavy = moneyCheckup(state({ transactions: [...september(), tx('c-debt-min', 1400)] }), TODAY).signals;
  assert.equal(heavy.find((s) => s.id === 'debt').status, 'poor'); // $1,500 of $4,000 = 38%
  const rent = (extra) => moneyCheckup(state({ transactions: [...september(), tx('c-housing', extra)] }), TODAY).signals.find((s) => s.id === 'housing').status;
  assert.equal(rent(500), 'ok'); // $1,700 of $4,000 = 43%
  assert.equal(rent(1000), 'poor'); // $2,200 of $4,000 = 55%
});

test('checkup waits for a full month, and for some money in', () => {
  assert.deepEqual(moneyCheckup(state({ transactions: [tx('c-dining', 5, TODAY)] }), TODAY), { available: false, reason: 'no-month' });
  assert.equal(moneyCheckup(state({ transactions: [tx('c-dining', 50)] }), TODAY).reason, 'no-income');
});
