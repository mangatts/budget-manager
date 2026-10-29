// Money Checkup (PRODUCT.md §4): a monthly health check scored 0–100 from 5 signals, each 🟢 / 🟡 / 🔴
// with a plain explanation and its source. Scores the last complete month with spending.
// Pure functions; money is integer cents. General education, not financial advice.
import { monthKey, shiftMonth } from '../../utils/dates.js';
import { inMonth } from './month.js';
import { monthFigures, HIGH_APR_BPS } from './nextStep.js';
import { INCOME_BENCHMARKS } from './benchmarkData.js';

export const MIN_SIGNALS = 3; // fewer known signals and a score would mislead
const POINTS = { good: 20, ok: 10, poor: 0 };
const pct = (part, whole) => Math.round((part / whole) * 100);

// The month the checkup is about: last month if it has spending, else the one before (up to 3 back).
export function checkupMonth(transactions, today) {
  const month = monthKey(today);
  return [1, 2, 3].map((n) => shiftMonth(month, -n))
    .find((m) => inMonth(transactions, m).some((t) => t.type === 'expense')) ?? null;
}

function spending(f) {
  const out = f.spentCents;
  const over = out - f.inCents;
  const lines = [['Money in', f.inCents], ['Spending (not counting savings)', out]];
  const base = { id: 'spending', label: 'Spending vs. income', source: 'Basic cash flow', lines };
  if (over <= 0) return { ...base, status: 'good', message: `You spent less than came in, with ${pct(-over, f.inCents)}% to spare.` };
  if (over <= f.inCents * 0.05) return { ...base, status: 'ok', message: `You spent a little more than came in (${pct(over, f.inCents)}% over).` };
  return { ...base, status: 'poor', message: `You spent ${pct(over, f.inCents)}% more than came in.` };
}

function savingsRate(f) {
  const rate = pct(f.savedCents, f.inCents);
  const base = { id: 'savings', label: 'Savings rate', source: 'Retirement guidance and the 50/30/20 rule of thumb', lines: [['Money in', f.inCents], ['Put into savings', f.savedCents], ['Savings rate', `${rate}%`]] };
  if (rate >= 15) return { ...base, status: 'good', message: `You saved ${rate}% of what came in. The guideline is 15–20%.` };
  if (rate >= 5) return { ...base, status: 'ok', message: `You saved ${rate}%. Building toward 15% is a strong next goal.` };
  return { ...base, status: 'poor', message: rate > 0 ? `You saved ${rate}%. Even a small automatic transfer helps.` : 'Nothing went into savings. Even a small automatic transfer helps.' };
}

function emergency(fund, f) {
  const base = { id: 'emergency', label: 'Emergency fund', source: INCOME_BENCHMARKS.emergency.source };
  if (fund === null) return { ...base, status: 'unknown', message: 'Add your emergency savings under More → Your money to include this.' };
  if (f.needsCents <= 0) return { ...base, status: 'unknown', message: 'Add a month of needs (rent, groceries, bills) to include this.' };
  const months = Math.floor((fund / f.needsCents) * 10) / 10;
  const lines = [['Emergency savings', fund], ['Essentials that month', f.needsCents], ['Months covered', String(months)]];
  if (months >= 3) return { ...base, lines, status: 'good', message: `${months} months of essentials saved. The guideline is 3 to 6.` };
  if (months >= 1) return { ...base, lines, status: 'ok', message: `${months} months of essentials saved. The guideline is 3 to 6.` };
  return { ...base, lines, status: 'poor', message: `Less than a month of essentials saved (${months}). A starter goal of $1,000 is a good first step.` };
}

function housing(f) {
  const base = { id: 'housing', label: 'Housing cost', source: INCOME_BENCHMARKS.housing.source };
  if (f.housingCents <= 0) return { ...base, status: 'unknown', message: 'No housing or utilities entries that month.' };
  const share = pct(f.housingCents, f.inCents);
  const lines = [['Housing and utilities', f.housingCents], ['Money in', f.inCents], ['Share of income', `${share}%`]];
  const note = 'HUD measures against income before taxes; we use take-home, so this reads a little high.';
  if (share <= 30) return { ...base, lines, note, status: 'good', message: `Housing took ${share}% of income. The guideline is 30% or less.` };
  if (share <= 50) return { ...base, lines, note, status: 'ok', message: `Housing took ${share}% of income, above the 30% guideline.` };
  return { ...base, lines, note, status: 'poor', message: `Housing took ${share}% of income, more than half.` };
}

function debt(f, debts) {
  const base = { id: 'debt', label: 'Debt payments', source: INCOME_BENCHMARKS.debt.source };
  const share = pct(f.debtPaymentsCents, f.inCents);
  const high = debts.filter((d) => d.aprBps >= HIGH_APR_BPS);
  const lines = [['Debt payments that month', f.debtPaymentsCents], ['Share of income', `${share}%`], ['Debts above 8% interest', String(high.length)]];
  const note = 'Lenders measure against income before taxes; we use take-home, so this reads a little high.';
  if (share > 36) return { ...base, lines, note, status: 'poor', message: `Debt payments took ${share}% of income, above the 36% limit lenders use.` };
  if (share > 20 || high.length) {
    return { ...base, lines, note, status: 'ok', message: high.length ? `You have ${high.length === 1 ? 'a debt' : `${high.length} debts`} above 8% interest. Paying ${high.length === 1 ? 'it' : 'them'} down is a top priority.` : `Debt payments took ${share}% of income. Under 20% leaves more room.` };
  }
  return { ...base, lines, note, status: 'good', message: debts.length || share ? `Debt payments took ${share}% of income, with no high-interest debt.` : 'No debt payments or high-interest debts.' };
}

export function moneyCheckup(state, today) {
  const month = checkupMonth(state.transactions, today);
  if (!month) return { available: false, reason: 'no-month' };
  const f = monthFigures(state, month);
  if (f.inCents <= 0) return { available: false, reason: 'no-income', month };
  const fund = Number.isSafeInteger(state.meta.emergencyFundCents) ? state.meta.emergencyFundCents : null;
  const signals = [spending(f), savingsRate(f), emergency(fund, f), housing(f), debt(f, state.debts ?? [])];
  const known = signals.filter((s) => s.status !== 'unknown');
  if (known.length < MIN_SIGNALS) return { available: false, reason: 'few-signals', month, signals };
  // Scaled to 100 over the signals we can measure, so a missing answer doesn't count against you.
  const score = Math.round((known.reduce((s, x) => s + POINTS[x.status], 0) / (known.length * 20)) * 100);
  return { available: true, month, score, signals, measured: known.length };
}

export const scoreLabel = (score) => (score >= 80 ? 'Strong' : score >= 50 ? 'Getting there' : 'Needs attention');
