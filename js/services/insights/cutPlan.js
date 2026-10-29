// Cut Plan (PRODUCT.md §2 ③): 1–2 monthly challenges built from your own history.
// Pure functions; money is integer cents.
import { monthKey, shiftMonth } from '../../utils/dates.js';
import { inMonth } from './month.js';
import { usualFor } from './engine.js';

export const MAX_SUGGESTIONS = 2;
const MIN_USUAL = 5000; // $50: smaller categories aren't worth a challenge
const MIN_CUT = 1500; // and the cut should be at least $15

const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const spentIn = (transactions, categoryId, month) => inMonth(transactions, month)
  .filter((t) => t.type === 'expense' && t.categoryId === categoryId).reduce((s, t) => s + t.amountCents, 0);
const roundDown5 = (cents) => Math.floor(cents / 500) * 500;

// Target = your best recent month, kept between a 10% and a 25% cut: always a real step down,
// never a punishing one.
export function suggestChallenges({ transactions, categories, bills = [], challenges = [] }, today, limit = MAX_SUGGESTIONS) {
  const month = monthKey(today);
  const taken = new Set(challenges.filter((c) => c.month === month).map((c) => c.categoryId));
  const billCats = new Set(bills.filter((b) => b.active).map((b) => b.categoryId));
  const out = [];
  for (const c of categories) {
    if (c.type !== 'expense' || c.bucket !== 'want' || c.archived || taken.has(c.id) || billCats.has(c.id)) continue;
    const usual = usualFor(transactions, c.id, month);
    if (!usual || usual < MIN_USUAL) continue;
    const past = [1, 2, 3, 4, 5, 6].map((n) => spentIn(transactions, c.id, shiftMonth(month, -n))).filter((v) => v > 0);
    const best = past.length ? Math.min(...past) : usual;
    const target = roundDown5(Math.min(Math.max(best, usual * 0.75), usual * 0.9));
    if (usual - target < MIN_CUT) continue;
    out.push({ categoryId: c.id, name: c.name, icon: c.icon, month, fromCents: usual, targetCents: target, savingsCents: usual - target });
  }
  return out.sort((a, b) => b.savingsCents - a.savingsCents).slice(0, limit);
}

// Where a challenge stands. For past months it's a result: 'won' or 'missed'.
export function challengeProgress(challenge, transactions, today) {
  const month = monthKey(today);
  const spent = spentIn(transactions, challenge.categoryId, challenge.month);
  const left = challenge.targetCents - spent;
  if (challenge.month < month) {
    return { spent, left, done: true, result: spent <= challenge.targetCents ? 'won' : 'missed', savedCents: challenge.fromCents - spent };
  }
  const day = challenge.month === month ? Number(today.slice(8, 10)) : 0;
  const days = daysIn(challenge.month);
  // On track if spending so far is within the target's share of the month so far (with a little slack).
  const allowance = Math.round((challenge.targetCents * day) / days);
  return { spent, left, done: false, daysLeft: days - day + (day ? 1 : 0), status: spent > challenge.targetCents ? 'over' : spent > allowance * 1.1 ? 'ahead' : 'on-track' };
}

// Challenges to show now: active ones this month, and last month's results during the first week.
export function visibleChallenges({ challenges = [] }, today) {
  const month = monthKey(today);
  const last = shiftMonth(month, -1);
  const firstWeek = Number(today.slice(8, 10)) <= 7;
  return {
    current: challenges.filter((c) => c.month === month && c.status === 'active'),
    results: firstWeek ? challenges.filter((c) => c.month === last && c.status === 'active') : [],
  };
}
