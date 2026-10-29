// What-If (PRODUCT.md §2 ④): turn small changes into real outcomes. Pure functions; money is integer cents.
// Every result carries its assumptions so the UI can show them. Estimates, not promises.
import { monthKey, shiftMonth } from '../../utils/dates.js';
import { inMonth } from './month.js';

export const MAX_MONTHS = 600; // 50 years: past this we say "not on this plan"
export const GROWTH_RATE_BPS = 600; // 6% a year average return, shown as an assumption

// Months to reach a goal, saving `monthlyCents` a month. null if it never gets there.
export function monthsToGoal({ targetCents, savedCents }, monthlyCents) {
  const left = targetCents - savedCents;
  if (left <= 0) return 0;
  if (monthlyCents <= 0) return null;
  const months = Math.ceil(left / monthlyCents);
  return months > MAX_MONTHS ? null : months;
}

// "Cut $100 a month from Dining Out → reach it 4 months sooner."
export function goalWithCut(goal, cutCents) {
  const now = monthsToGoal(goal, goal.monthlyCents);
  const withCut = monthsToGoal(goal, goal.monthlyCents + cutCents);
  return { now, withCut, sooner: now !== null && withCut !== null ? now - withCut : null };
}

// Pays every debt month by month: minimums on all, then everything extra to the highest rate first
// (the "avalanche" method). Freed-up minimums from paid-off debts roll into the next one.
// Returns { months, interestCents, order: [{ name, month }] } or { months: null } if it never ends.
export function payoffPlan(debts, extraCents = 0) {
  let balances = debts.filter((d) => d.balanceCents > 0).map((d) => ({ ...d, left: d.balanceCents }));
  if (!balances.length) return { months: 0, interestCents: 0, order: [] };
  const budget = balances.reduce((s, d) => s + d.minPaymentCents, 0) + extraCents;
  let interestCents = 0;
  const order = [];
  for (let month = 1; month <= MAX_MONTHS; month++) {
    for (const d of balances) {
      const interest = Math.round((d.left * d.aprBps) / 10000 / 12);
      d.left += interest;
      interestCents += interest;
    }
    let money = budget;
    // Minimums first (never more than what's owed), then the rest to the highest rate.
    for (const d of balances) {
      const pay = Math.min(d.minPaymentCents, d.left, money);
      d.left -= pay;
      money -= pay;
    }
    for (const d of [...balances].sort((a, b) => b.aprBps - a.aprBps || a.left - b.left)) {
      const pay = Math.min(d.left, money);
      d.left -= pay;
      money -= pay;
    }
    for (const d of balances) if (d.left <= 0) order.push({ name: d.name, month });
    balances = balances.filter((d) => d.left > 0);
    if (!balances.length) return { months: month, interestCents, order };
  }
  return { months: null, interestCents: null, order };
}

// Compare minimums-only with paying `extraCents` more each month.
export function payoffComparison(debts, extraCents) {
  const base = payoffPlan(debts, 0);
  const plan = payoffPlan(debts, extraCents);
  const comparable = base.months !== null && plan.months !== null;
  return {
    base, plan,
    monthsSooner: comparable ? base.months - plan.months : null,
    interestSavedCents: comparable ? base.interestCents - plan.interestCents : null,
  };
}

// Saving `monthlyCents` at the end of each month for `years`, growing at `rateBps` a year (compounded monthly).
export function growth(monthlyCents, years, rateBps = GROWTH_RATE_BPS) {
  const months = years * 12;
  const r = rateBps / 10000 / 12;
  const valueCents = Math.round(r === 0 ? monthlyCents * months : monthlyCents * ((1 + r) ** months - 1) / r);
  const putInCents = monthlyCents * months;
  return { valueCents, putInCents, growthCents: valueCents - putInCents, rateBps, years };
}

// "June 2028": the month `months` from `fromMonth` ("2026-10").
export function monthAfter(fromMonth, months) {
  const [y, m] = fromMonth.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Nice-to-have categories you could cut, with your usual month: the average of the last 1–3 complete
// months that have spending. Biggest first.
export function cuttableCategories({ transactions, categories }, today) {
  const month = monthKey(today);
  const months = [1, 2, 3].map((n) => shiftMonth(month, -n))
    .filter((m) => inMonth(transactions, m).some((t) => t.type === 'expense'));
  if (!months.length) return [];
  const wants = new Map(categories.filter((c) => c.type === 'expense' && c.bucket === 'want').map((c) => [c.id, c]));
  const totals = new Map();
  for (const m of months) {
    for (const t of inMonth(transactions, m)) {
      if (t.type === 'expense' && wants.has(t.categoryId)) totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + t.amountCents);
    }
  }
  return [...totals].map(([id, cents]) => ({ id, name: wants.get(id).name, icon: wants.get(id).icon, usualCents: Math.round(cents / months.length) }))
    .filter((c) => c.usualCents >= 1000)
    .sort((a, b) => b.usualCents - a.usualCents || a.name.localeCompare(b.name));
}
