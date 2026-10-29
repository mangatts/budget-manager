// Safe to spend today (PRODUCT.md §2 ②): one daily number, no budget to set up.
// Pure functions; money is integer cents. Every step is returned so "Why?" can show the math.
import { monthKey, addDays } from '../../utils/dates.js';
import { inMonth, monthlyIncome } from './month.js';

const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const pad = (n) => String(n).padStart(2, '0');

// A bill due on the 31st falls on the last day of shorter months.
export function billDueDate(bill, month) {
  return `${month}-${pad(Math.min(bill.dayOfMonth, daysIn(month)))}`;
}

// Paid this month = an entry in the bill's category within ±10% of its amount.
// Each entry can only pay one bill (closest amount first), so two similar bills aren't both marked paid by one payment.
export function billsForMonth(bills, transactions, month, today) {
  const candidates = inMonth(transactions, month).filter((t) => t.type === 'expense');
  const used = new Set();
  const active = bills.filter((b) => b.active).sort((a, b) => a.dayOfMonth - b.dayOfMonth);
  return active.map((bill) => {
    const tolerance = Math.round(bill.amountCents * 0.1);
    const match = candidates
      .filter((t) => !used.has(t.id) && t.categoryId === bill.categoryId && Math.abs(t.amountCents - bill.amountCents) <= tolerance)
      .sort((a, b) => Math.abs(a.amountCents - bill.amountCents) - Math.abs(b.amountCents - bill.amountCents))[0];
    if (match) used.add(match.id);
    const dueDate = billDueDate(bill, month);
    return { bill, dueDate, paid: Boolean(match), paidBy: match?.id ?? null, overdue: !match && dueDate < today };
  });
}

// Bills not yet paid that are due within `days` of today (including overdue ones).
export function upcomingBills(bills, transactions, today, days = 7) {
  const horizon = addDays(today, days);
  const thisMonth = monthKey(today);
  const nextMonth = monthKey(addDays(`${thisMonth}-01`, 32));
  const all = [
    ...billsForMonth(bills, transactions, thisMonth, today),
    ...billsForMonth(bills, transactions, nextMonth, today).filter((b) => b.dueDate <= horizon),
  ];
  return all.filter((b) => !b.paid && b.dueDate <= horizon).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/*
 * income      = max(money in recorded this month, monthly take-home)   (take-home may be estimated)
 * set aside   = max(income × savings %, already moved to savings this month)
 * left        = income − bills still due − set aside − other money out this month
 * safe today  = left ÷ days left in the month (including today)
 */
export function safeToSpend({ transactions, categories, bills = [], meta }, today) {
  const month = monthKey(today);
  const entries = inMonth(transactions, month);
  const savingsCategories = new Set(categories.filter((c) => c.bucket === 'savings').map((c) => c.id));

  const recordedCents = entries.filter((t) => t.type === 'income').reduce((s, t) => s + t.amountCents, 0);
  const expected = monthlyIncome({ transactions, meta }, month); // entered, or estimated from past months
  let incomeCents = recordedCents;
  let incomeSource = 'recorded';
  if (expected && expected.cents > recordedCents) {
    incomeCents = expected.cents;
    incomeSource = expected.estimated ? 'estimated' : 'take-home';
  }
  if (incomeCents <= 0) return { available: false, reason: 'no-income' };

  const savingsPercent = Number.isInteger(meta.savingsPercent) ? meta.savingsPercent : 20;
  const goalCents = Math.round((incomeCents * savingsPercent) / 100);
  const savedCents = entries.filter((t) => t.type === 'expense' && savingsCategories.has(t.categoryId)).reduce((s, t) => s + t.amountCents, 0);
  const setAsideCents = Math.max(goalCents, savedCents);

  const spentCents = entries.filter((t) => t.type === 'expense' && !savingsCategories.has(t.categoryId)).reduce((s, t) => s + t.amountCents, 0);
  const billStatus = billsForMonth(bills, transactions, month, today);
  const unpaid = billStatus.filter((b) => !b.paid);
  const billsDueCents = unpaid.reduce((s, b) => s + b.bill.amountCents, 0);

  const leftCents = incomeCents - billsDueCents - setAsideCents - spentCents;
  const daysLeft = daysIn(month) - Number(today.slice(8, 10)) + 1;
  const perDayCents = leftCents > 0 ? Math.floor(leftCents / daysLeft) : 0;

  return {
    available: true,
    month,
    incomeCents, incomeSource, recordedCents,
    savingsPercent, goalCents, savedCents, setAsideCents,
    spentCents,
    billsDueCents, unpaidBills: unpaid.length,
    leftCents, daysLeft, perDayCents,
  };
}
