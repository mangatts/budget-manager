// Smart Coach level 3 (INSIGHTS.md): learns which tips help YOU, from your 👍 / 👎 / "I'm on it" / "Not now",
// and checks whether acting on a tip worked. Everything is worked out from your saved feedback, on this device,
// so it's easy to explain and to undo. Pure functions; money is integer cents.
import { monthKey, shiftMonth } from '../../utils/dates.js';
import { inMonth } from './month.js';
import { CATEGORY_BENCHMARK } from './benchmarkData.js';

export const REACTIONS = Object.freeze(['up', 'down', 'on-it', 'not-now']);
const STEP = { up: 1.25, 'on-it': 1.25, down: 0.8, 'not-now': 0.9 };
export const WEIGHT_MIN = 0.2;
export const WEIGHT_MAX = 3;

// The same advice from month to month: "Dining Out is running ahead" is one topic, whatever the month.
export const topicOf = (tip) => `${tip.type}|${tip.key}`.slice(0, 120);

// How much each kind of tip counts for you: starts at 1, ×1.25 for 👍 or "I'm on it", ×0.8 for 👎, ×0.9 for "Not now".
export function weightsFrom(feedback) {
  const weights = {};
  for (const f of [...feedback].sort((a, b) => a.createdAt - b.createdAt)) {
    const w = (weights[f.insightType] ?? 1) * STEP[f.reaction];
    weights[f.insightType] = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, w));
  }
  return weights;
}

// Which of your categories a tip is about (for "I'm on it" progress). [] when it isn't about spending you control.
export function tipCategories(tip, categories) {
  const expense = categories.filter((c) => c.type === 'expense');
  if (['pace', 'higher_than_usual', 'best_month'].includes(tip.type)) return expense.some((c) => c.id === tip.key) ? [tip.key] : [];
  if (tip.type === 'small_stuff' || tip.type === 'repeating') {
    const id = String(tip.key).split(':')[1];
    return expense.some((c) => c.id === id) ? [id] : [];
  }
  if (tip.type === 'spending_mix') return expense.filter((c) => CATEGORY_BENCHMARK[c.benchmarkKey] === tip.key).map((c) => c.id);
  if (tip.type === 'housing_burden') return expense.filter((c) => c.benchmarkKey === 'housing' || c.benchmarkKey === 'utilities').map((c) => c.id);
  return [];
}

const spentIn = (transactions, categoryIds, month) => {
  const ids = new Set(categoryIds);
  return inMonth(transactions, month).filter((t) => t.type === 'expense' && ids.has(t.categoryId)).reduce((s, t) => s + t.amountCents, 0);
};

// Your usual month in these categories: the average of the last 1–3 complete months that have any spending.
export function usualSpending(transactions, categoryIds, today) {
  const month = monthKey(today);
  const months = [1, 2, 3].map((n) => shiftMonth(month, -n)).filter((m) => inMonth(transactions, m).some((t) => t.type === 'expense'));
  if (!months.length || !categoryIds.length) return 0;
  return Math.round(months.reduce((s, m) => s + spentIn(transactions, categoryIds, m), 0) / months.length);
}

// Tips ranked for you: money freed × confidence × your weight for that kind of tip. 👎 and "Not now" hide a topic
// for the rest of the month; each tip carries your reaction this month (if any).
export function rankTips(tips, feedback, today) {
  const month = monthKey(today);
  const weights = weightsFrom(feedback);
  const thisMonth = new Map(feedback.filter((f) => f.month === month).map((f) => [f.topic, f]));
  return tips
    .map((t) => ({ ...t, weight: weights[t.type] ?? 1, reaction: thisMonth.get(topicOf(t))?.reaction ?? null, feedbackMonth: month }))
    .filter((t) => t.reaction !== 'down' && t.reaction !== 'not-now')
    .map((t) => ({ ...t, score: Math.round(t.score * t.weight) }))
    .sort((a, b) => b.score - a.score);
}

// "I'm on it" this month: how it's going so far.
export function onItProgress(entry, transactions, today) {
  const spentCents = spentIn(transactions, entry.categoryIds, entry.month);
  return { spentCents, baselineCents: entry.baselineCents, leftCents: entry.baselineCents - spentCents, month: entry.month, done: entry.month < monthKey(today) };
}

// Last month's "I'm on it" tips and whether they worked: "You cut Dining Out by $95". Shown all of this month.
export function onItResults(feedback, transactions, categories, today) {
  const last = shiftMonth(monthKey(today), -1);
  const names = new Map(categories.map((c) => [c.id, c.name]));
  return feedback
    .filter((f) => f.reaction === 'on-it' && f.month === last && f.categoryIds.length && f.baselineCents > 0)
    .map((f) => {
      const spentCents = spentIn(transactions, f.categoryIds, f.month);
      const savedCents = f.baselineCents - spentCents;
      const label = f.categoryIds.map((id) => names.get(id) ?? 'a category').join(' and ');
      return { id: f.id, label, month: f.month, spentCents, baselineCents: f.baselineCents, savedCents, worked: savedCents >= Math.max(500, Math.round(f.baselineCents * 0.05)) };
    });
}
