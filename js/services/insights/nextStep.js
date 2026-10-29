// Next Best Step (PRODUCT.md §2 ①): an advisor's order of operations, worked out from your own numbers.
// Each step is done, current, still to do, skipped, or needs one answer from you. Exactly one step is
// "current" (the first not done or skipped). Pure functions; money is integer cents. Not financial advice.
import { monthKey, shiftMonth } from '../../utils/dates.js';
import { inMonth, monthlyIncome } from './month.js';
import { INCOME_BENCHMARKS } from './benchmarkData.js';

export const STARTER_FUND_CENTS = 100000; // $1,000 starter safety net
export const HIGH_APR_BPS = 800; // above ~8% APR counts as high-interest
export const FULL_FUND_MONTHS = 3;
export const SAVE_RATE_GOAL = 0.15;

export const STEP_IDS = Object.freeze(['spend-less', 'starter-fund', 'match', 'high-interest', 'full-fund', 'save-15', 'goals']);

const SOURCES = {
  cashflow: 'Basic cash flow: spend less than comes in',
  starter: 'Common starter emergency fund guidance (about $1,000, or one month of essentials)',
  match: 'Employer 401(k) matching: money you only get if you contribute',
  debt: 'Consumer Financial Protection Bureau (CFPB): pay down high-interest debt first',
  emergency: INCOME_BENCHMARKS.emergency.source,
  savings: 'Retirement guidance and the 50/30/20 rule of thumb (save 15–20% of income)',
};

// One month's figures. Money in is the higher of what was recorded and the take-home you entered
// (like Safe to Spend). Spending leaves out money moved to savings, which is counted separately.
export function monthFigures(state, month) {
  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const entries = inMonth(state.transactions, month);
  const recorded = entries.filter((t) => t.type === 'income').reduce((s, t) => s + t.amountCents, 0);
  const expected = Number.isSafeInteger(state.meta.monthlyTakeHomeCents) ? state.meta.monthlyTakeHomeCents : 0;
  const f = { inCents: Math.max(recorded, expected), spentCents: 0, savedCents: 0, needsCents: 0, housingCents: 0, debtPaymentsCents: 0 };
  for (const t of entries) {
    if (t.type !== 'expense') continue;
    const c = byId.get(t.categoryId);
    if (c?.bucket === 'savings') { f.savedCents += t.amountCents; continue; }
    f.spentCents += t.amountCents;
    if (c?.bucket === 'need') f.needsCents += t.amountCents;
    if (c?.benchmarkKey === 'housing' || c?.benchmarkKey === 'utilities') f.housingCents += t.amountCents;
    if (c?.benchmarkKey === 'debt') f.debtPaymentsCents += t.amountCents;
  }
  return f;
}

// The last 1–3 complete months that have spending, averaged per month. null if there's no complete month yet.
export function recentMonths(state, today) {
  const month = monthKey(today);
  const months = [1, 2, 3].map((n) => shiftMonth(month, -n))
    .filter((m) => inMonth(state.transactions, m).some((t) => t.type === 'expense'));
  if (!months.length) return null;
  const all = months.map((m) => monthFigures(state, m));
  const per = (key) => Math.round(all.reduce((s, f) => s + f[key], 0) / months.length);
  return {
    months: months.length, label: months.length === 1 ? 'last month' : `last ${months.length} months, per month`,
    ...Object.fromEntries(Object.keys(all[0]).map((k) => [k, per(k)])),
  };
}

// Interest a debt costs per month at its current balance (simple monthly rate).
export const monthlyInterest = (debt) => Math.round((debt.balanceCents * debt.aprBps) / 10000 / 12);

const pct = (part, whole) => Math.round((part / whole) * 100);
const fmt = (cents) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ask = (message, label, href) => ({ status: 'ask', message, action: { label, href } });

function spendLess(recent, income) {
  const step = { id: 'spend-less', title: 'Spend less than you earn' };
  if (!recent || recent.inCents <= 0) {
    return { ...step, status: 'ask', message: 'Add your take-home pay and a full month of spending, and we’ll find your step.', action: income ? { label: 'Add an expense', href: '#/add' } : { label: 'Add your pay', href: '#/profile' } };
  }
  // Money moved into savings is kept, not spent, so it doesn't count against you here.
  const gap = recent.inCents - recent.spentCents;
  const why = { lines: [[`Money in (${recent.label})`, recent.inCents], ['Spending (not counting savings)', recent.spentCents], ['Left over', gap]], source: SOURCES.cashflow };
  if (gap >= 0) return { ...step, status: 'done', message: `You kept ${fmt(gap)} more than you spent (${recent.label}).`, why };
  return { ...step, status: 'todo', message: `You spent ${fmt(-gap)} more than came in (${recent.label}). Let’s find it: your tips show where money went.`, action: { label: 'See where it went', href: '#/tips' }, why };
}

function starterFund(fund) {
  const step = { id: 'starter-fund', title: 'Starter emergency fund' };
  if (fund === null) return { ...step, ...ask('How much do you have saved for emergencies? One answer is all it takes.', 'Answer one question', '#/profile') };
  const why = { lines: [['Emergency savings', fund], ['Starter goal', STARTER_FUND_CENTS]], source: SOURCES.starter, note: 'A small cushion means a surprise bill doesn’t go on a credit card.' };
  const progress = { current: fund, target: STARTER_FUND_CENTS };
  if (fund >= STARTER_FUND_CENTS) return { ...step, status: 'done', message: `You have ${fmt(fund)} set aside. Starter safety net done.`, progress, why };
  return { ...step, status: 'todo', message: `You’re ${fmt(STARTER_FUND_CENTS - fund)} away from a ${fmt(STARTER_FUND_CENTS)} starter safety net.`, action: { label: 'Update your savings', href: '#/profile' }, progress, why };
}

function match(answer) {
  const step = { id: 'match', title: 'Get your full 401(k) match' };
  const why = { lines: [['Your answer', { full: 'Getting all of it', partial: 'Getting some of it', none: 'No match offered', unsure: 'Not sure' }[answer] ?? 'Not answered']], source: SOURCES.match, note: 'A match is part of your pay that you only get if you put money in yourself.' };
  if (answer === 'full') return { ...step, status: 'done', message: 'You’re getting your full match.', why };
  if (answer === 'none') return { ...step, status: 'done', message: 'No match offered, so this step doesn’t apply.', why };
  if (answer === 'partial') return { ...step, status: 'todo', message: 'Free money: raise your 401(k) contribution to at least what your employer matches. Ask HR or check your benefits site for the exact percent.', why };
  if (answer === 'unsure') return { ...step, status: 'todo', message: 'Worth a quick check: ask HR or your benefits site whether your job matches 401(k) savings, and how much you need to put in to get all of it.', action: { label: 'Update your answer', href: '#/profile' }, why };
  return { ...step, ...ask('Does your job match what you put in a 401(k)?', 'Answer one question', '#/profile') };
}

function highInterest(debts) {
  const step = { id: 'high-interest', title: 'Pay off high-interest debt' };
  const high = debts.filter((d) => d.aprBps >= HIGH_APR_BPS).sort((a, b) => b.aprBps - a.aprBps || b.balanceCents - a.balanceCents);
  if (!high.length) {
    return { ...step, status: 'done', message: debts.length ? 'No debts above 8% interest.' : 'No high-interest debts added. If you have credit card debt, add it under More → Debts.', why: { lines: [['Debts above 8% interest', '0']], source: SOURCES.debt } };
  }
  const first = high[0];
  const total = high.reduce((s, d) => s + d.balanceCents, 0);
  const interest = high.reduce((s, d) => s + monthlyInterest(d), 0);
  return {
    ...step, status: 'todo',
    message: `Your ${first.name} at ${(first.aprBps / 100).toFixed(2).replace(/\.?0+$/, '')}% costs about ${fmt(monthlyInterest(first))} a month in interest. Pay the minimum on everything else, and put any extra toward it first.`,
    action: { label: 'See your debts', href: '#/debts' },
    why: { lines: [...high.map((d) => [`${d.name} (${(d.aprBps / 100).toFixed(2)}%)`, d.balanceCents]), ['High-interest total', total], ['Interest each month, about', interest]], source: SOURCES.debt, note: 'Paying the highest rate first (the "avalanche" method) costs the least interest overall.' },
  };
}

function fullFund(fund, recent) {
  const step = { id: 'full-fund', title: `Full emergency fund (${FULL_FUND_MONTHS} months)` };
  if (fund === null) return { ...step, ...ask('How much do you have saved for emergencies?', 'Answer one question', '#/profile') };
  if (!recent || recent.needsCents <= 0) return { ...step, status: 'ask', message: 'Add a full month of needs (rent, groceries, bills) so we know what 3 months costs you.', action: { label: 'Add an expense', href: '#/add' } };
  const target = recent.needsCents * FULL_FUND_MONTHS;
  const months = Math.floor((fund / recent.needsCents) * 10) / 10;
  const why = { lines: [[`Essentials (${recent.label})`, recent.needsCents], [`× ${FULL_FUND_MONTHS} months`, target], ['Emergency savings', fund]], source: SOURCES.emergency, note: INCOME_BENCHMARKS.emergency.note };
  const progress = { current: fund, target };
  if (fund >= target) return { ...step, status: 'done', message: `${months} months of essentials saved. Well done.`, progress, why };
  return { ...step, status: 'todo', message: `${months} of ${FULL_FUND_MONTHS} months of essentials saved. ${fmt(target - fund)} to go.`, action: { label: 'Update your savings', href: '#/profile' }, progress, why };
}

function save15(recent, income) {
  const step = { id: 'save-15', title: 'Save 15% for the future' };
  if (!recent || recent.inCents <= 0) return { ...step, status: 'ask', message: 'Add your pay and a full month of entries to see your savings rate.', action: { label: 'Add your pay', href: '#/profile' } };
  const rate = recent.savedCents / recent.inCents;
  const goal = Math.round(recent.inCents * SAVE_RATE_GOAL);
  const why = { lines: [[`Money in (${recent.label})`, recent.inCents], ['Put into savings', recent.savedCents], ['15% would be', goal]], source: SOURCES.savings, note: 'Savings here means entries in your Savings category (including retirement or investing you add there).' };
  if (rate >= SAVE_RATE_GOAL) return { ...step, status: 'done', message: `You’re saving ${pct(recent.savedCents, recent.inCents)}% of what comes in.`, why };
  return { ...step, status: 'todo', message: `You’re saving ${pct(recent.savedCents, recent.inCents)}%. Another ${fmt(goal - recent.savedCents)} a month gets you to 15%.`, action: { label: 'Find money to save', href: '#/tips' }, why };
}

function goals(state) {
  const step = { id: 'goals', title: 'Save for bigger goals' };
  const list = state.goals ?? [];
  if (list.length) return { ...step, status: 'todo', message: `You’re saving for ${list.length === 1 ? list[0].name : `${list.length} goals`}. Keep it going.`, action: { label: 'See your goals', href: '#/goals' } };
  return { ...step, status: 'todo', message: 'You’ve covered the basics. Next: a house, car, travel, or anything that matters to you.', action: { label: 'Set a goal', href: '#/goals' } };
}

// All 7 steps in order, with exactly one marked current (unless all are done or skipped).
export function moneySteps(state, today) {
  const recent = recentMonths(state, today);
  const income = monthlyIncome(state, monthKey(today));
  const fund = Number.isSafeInteger(state.meta.emergencyFundCents) ? state.meta.emergencyFundCents : null;
  const skipped = new Set(Array.isArray(state.meta.skippedSteps) ? state.meta.skippedSteps : []);
  const steps = [
    spendLess(recent, income), starterFund(fund), match(state.meta.employerMatch ?? null),
    highInterest(state.debts ?? []), fullFund(fund, recent), save15(recent, income), goals(state),
  ].map((s, i) => ({ ...s, number: i + 1, skipped: s.status !== 'done' && skipped.has(s.id) }));
  const current = steps.find((s) => s.status !== 'done' && !s.skipped);
  return steps.map((s) => ({ ...s, current: s === current }));
}

export const currentStep = (state, today) => moneySteps(state, today).find((s) => s.current) ?? null;
