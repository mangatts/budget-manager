import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeToSpend, billDueDate, billsForMonth, upcomingBills } from '../js/services/insights/safeToSpend.js';
import { validateBill } from '../js/services/validate.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

let n = 0;
const tx = (date, type, amountCents, categoryId) => ({ id: `t${++n}`, date, type, amountCents, categoryId: categoryId ?? (type === 'income' ? 'c-paycheck' : 'c-dining') });
const bill = (name, amountCents, dayOfMonth, categoryId, active = true) => ({ id: name, name, amountCents, dayOfMonth, categoryId, active });
const base = (over = {}) => ({ transactions: [], categories: DEFAULT_CATEGORIES, bills: [], meta: {}, ...over });

test('no income anywhere → not available, with a reason', () => {
  assert.deepEqual(safeToSpend(base(), '2026-10-15'), { available: false, reason: 'no-income' });
});

test('the worked example from PRODUCT.md adds up exactly', () => {
  const s = safeToSpend(base({
    meta: { monthlyTakeHomeCents: 450000, savingsPercent: 20 },
    bills: [bill('Rent', 140000, 1, 'c-housing'), bill('Phone', 6500, 20, 'c-utilities')],
    transactions: [tx('2026-10-01', 'expense', 140000, 'c-housing'), tx('2026-10-05', 'expense', 6218, 'c-groceries'), tx('2026-10-08', 'expense', 475)],
  }), '2026-10-15');
  // income 4,500 − phone 65 (unpaid) − 20% 900 − spent 1,466.93 = 2,068.07; Oct 15..31 = 17 days
  assert.equal(s.incomeCents, 450000);
  assert.equal(s.incomeSource, 'take-home');
  assert.equal(s.billsDueCents, 6500);
  assert.equal(s.setAsideCents, 90000);
  assert.equal(s.spentCents, 146693);
  assert.equal(s.leftCents, 206807);
  assert.equal(s.daysLeft, 17);
  assert.equal(s.perDayCents, 12165); // $121.65, rounded down so you never go over
  assert.equal(s.leftCents, s.incomeCents - s.billsDueCents - s.setAsideCents - s.spentCents);
});

test('income: recorded beats take-home when higher; estimated when nothing is set', () => {
  const higher = safeToSpend(base({ meta: { monthlyTakeHomeCents: 100000 }, transactions: [tx('2026-10-02', 'income', 300000)] }), '2026-10-15');
  assert.equal(higher.incomeCents, 300000);
  assert.equal(higher.incomeSource, 'recorded');
  const est = safeToSpend(base({ transactions: [tx('2026-09-15', 'income', 400000)] }), '2026-10-15');
  assert.equal(est.incomeCents, 400000);
  assert.equal(est.incomeSource, 'estimated');
});

test('savings: the goal is protected; saving more than the goal counts as set aside', () => {
  const income = { meta: { monthlyTakeHomeCents: 400000, savingsPercent: 10 } };
  assert.equal(safeToSpend(base(income), '2026-10-15').setAsideCents, 40000);
  const saved = safeToSpend(base({ ...income, transactions: [tx('2026-10-03', 'expense', 100000, 'c-savings')] }), '2026-10-15');
  assert.equal(saved.setAsideCents, 100000);
  assert.equal(saved.spentCents, 0); // savings aren't counted twice
  assert.equal(safeToSpend(base({ meta: { monthlyTakeHomeCents: 400000 } }), '2026-10-15').savingsPercent, 20); // default
  assert.equal(safeToSpend(base({ meta: { monthlyTakeHomeCents: 400000, savingsPercent: 0 } }), '2026-10-15').setAsideCents, 0);
});

test('overspent: left goes negative and per-day is $0 (never negative)', () => {
  const s = safeToSpend(base({ meta: { monthlyTakeHomeCents: 100000, savingsPercent: 0 }, transactions: [tx('2026-10-03', 'expense', 108500)] }), '2026-10-15');
  assert.equal(s.leftCents, -8500);
  assert.equal(s.perDayCents, 0);
});

test('days left: first, last, and February (leap and non-leap)', () => {
  const s = (today) => safeToSpend(base({ meta: { monthlyTakeHomeCents: 310000, savingsPercent: 0 } }), today);
  assert.equal(s('2026-10-01').daysLeft, 31);
  assert.equal(s('2026-10-01').perDayCents, 10000);
  assert.equal(s('2026-10-31').daysLeft, 1);
  assert.equal(s('2026-10-31').perDayCents, 310000);
  assert.equal(s('2027-02-01').daysLeft, 28);
  assert.equal(s('2028-02-01').daysLeft, 29);
});

test('bill due dates clamp to short months', () => {
  const b = bill('Insurance', 1000, 31, 'c-health');
  assert.equal(billDueDate(b, '2026-02'), '2026-02-28');
  assert.equal(billDueDate(b, '2028-02'), '2028-02-29');
  assert.equal(billDueDate(b, '2026-04'), '2026-04-30');
  assert.equal(billDueDate(b, '2026-10'), '2026-10-31');
});

test('paid detection: same category within ±10%, one payment pays one bill', () => {
  const bills = [bill('Phone', 6500, 20, 'c-utilities'), bill('Internet', 6500, 25, 'c-utilities')];
  const one = billsForMonth(bills, [tx('2026-10-19', 'expense', 6800, 'c-utilities')], '2026-10', '2026-10-28');
  assert.deepEqual(one.map((b) => [b.bill.name, b.paid, b.overdue]), [['Phone', true, false], ['Internet', false, true]]);
  const off = billsForMonth(bills, [tx('2026-10-19', 'expense', 7200, 'c-utilities'), tx('2026-10-19', 'expense', 6500, 'c-dining')], '2026-10', '2026-10-10');
  assert.deepEqual(off.map((b) => b.paid), [false, false]); // 10.8% off, or wrong category
  const lastMonth = billsForMonth(bills, [tx('2026-09-30', 'expense', 6500, 'c-utilities')], '2026-10', '2026-10-01');
  assert.deepEqual(lastMonth.map((b) => b.paid), [false, false]);
  assert.equal(billsForMonth([bill('Old', 100, 1, 'c-utilities', false)], [], '2026-10', '2026-10-10').length, 0); // inactive
});

test('upcoming: unpaid bills due within 7 days, including overdue, across the month end', () => {
  const bills = [bill('Rent', 140000, 1, 'c-housing'), bill('Phone', 6500, 27, 'c-utilities'), bill('Gym', 3000, 15, 'c-health')];
  const up = upcomingBills(bills, [], '2026-10-26');
  assert.deepEqual(up.map((u) => [u.bill.name, u.dueDate]), [['Rent', '2026-10-01'], ['Gym', '2026-10-15'], ['Phone', '2026-10-27'], ['Rent', '2026-11-01']]);
  const paidRent = upcomingBills(bills, [tx('2026-10-01', 'expense', 140000, 'c-housing')], '2026-10-26');
  assert.deepEqual(paidRent.map((u) => u.dueDate), ['2026-10-15', '2026-10-27', '2026-11-01']);
});

test('bill validation: plain words, money-out categories only', () => {
  const ok = validateBill({ name: ' Rent ', amount: '1,400', categoryId: 'c-housing', dayOfMonth: '1' }, { categories: DEFAULT_CATEGORIES });
  assert.deepEqual(ok.value, { name: 'Rent', amountCents: 140000, categoryId: 'c-housing', dayOfMonth: 1, active: true });
  const e = validateBill({ name: '', amount: 'x', categoryId: 'c-paycheck', dayOfMonth: '32' }, { categories: DEFAULT_CATEGORIES }).errors;
  assert.deepEqual(e, { name: 'Give it a name, like Rent or Phone', amount: 'Enter an amount like 12.50', categoryId: 'Pick a category', dayOfMonth: 'Enter a day from 1 to 31' });
  for (const bad of ['0', '1.5', '-1', '', 'first']) assert.ok(validateBill({ name: 'x', amount: '1', categoryId: 'c-housing', dayOfMonth: bad }, { categories: DEFAULT_CATEGORIES }).errors.dayOfMonth, bad);
});
