// Smart Coach, levels 1–2 (INSIGHTS.md): turns your data into a few plain, sourced tips about
// where to cut back, each with the money it could free up and a "Why?" that shows the math.
// Pure functions; money is integer cents. Not financial advice, and the UI says so.
import { monthKey, shiftMonth, addDays } from '../../utils/dates.js';
import { inMonth, incomeForMonth } from './month.js';
import { SPENDING_BENCHMARKS, INCOME_BENCHMARKS, CATEGORY_BENCHMARK, BLS_2024 } from './benchmarkData.js';

const MIN_ENTRIES = 10; // fewer and the mix says more about timing than habits
const MIN_SPENDING = 30000; // $300 in the window
const MIN_MONTHLY_GAIN = 2500; // don't bother people over less than $25 a month
const MIX_MARGIN = 1.25; // 25% above typical before we mention it
const PACE_MARGIN = 1.2;
const PACE_MIN_DAY = 7;

const pct = (share) => Math.round(share * 100);
const sum = (list) => list.reduce((s, t) => s + t.amountCents, 0);
const median = (values) => {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2);
};
const daysIn = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// The history tips look at, in WHOLE calendar months so monthly bills like rent count exactly once:
// - your last 1–3 complete months that have spending, averaged per month; or
// - for brand-new users with no complete month yet: this month so far, from the 20th on (not scaled up).
// Returns null when there isn't enough yet.
export const MIN_DAY_FIRST_MONTH = 20;

export function spendingWindow(transactions, today) {
  const month = monthKey(today);
  const expenses = transactions.filter((t) => t.type === 'expense' && t.date <= today);
  const withSpending = new Set(expenses.map((t) => monthKey(t.date)));
  const complete = [1, 2, 3].map((n) => shiftMonth(month, -n)).filter((m) => withSpending.has(m));
  if (complete.length) {
    const set = new Set(complete);
    return { kind: 'months', months: complete.length, label: complete.length === 1 ? 'last month' : `last ${complete.length} months, per month`, entries: expenses.filter((t) => set.has(monthKey(t.date))) };
  }
  if (Number(today.slice(8, 10)) < MIN_DAY_FIRST_MONTH || !withSpending.has(month)) return null;
  return { kind: 'month-to-date', months: 1, label: 'this month so far', entries: expenses.filter((t) => monthKey(t.date) === month) };
}

// ── Level 1: your spending mix vs. typical households (BLS, share of SPENDING, never of income) ──
function mixTips({ transactions, categories }, today) {
  const window = spendingWindow(transactions, today);
  if (!window || window.entries.length < MIN_ENTRIES) return [];
  const byId = new Map(categories.map((c) => [c.id, c]));
  // Base = everyday spending: not money set aside for savings, not debt payments (BLS excludes those too).
  const everyday = window.entries.filter((t) => {
    const c = byId.get(t.categoryId);
    return c?.bucket !== 'savings' && c?.benchmarkKey !== 'debt';
  });
  const baseCents = sum(everyday);
  if (baseCents < MIN_SPENDING) return [];
  const monthlyBase = baseCents / window.months;
  
  const groups = new Map(); // BLS key → { cents, names }
  for (const t of everyday) {
    const key = CATEGORY_BENCHMARK[byId.get(t.categoryId)?.benchmarkKey];
    if (!key) continue;
    const g = groups.get(key) ?? { cents: 0, names: new Set() };
    g.cents += t.amountCents;
    g.names.add(byId.get(t.categoryId).name);
    groups.set(key, g);
  }

  const tips = [];
  for (const [key, g] of groups) {
    const bench = SPENDING_BENCHMARKS[key];
    const share = g.cents / baseCents;
    const gainCents = Math.round((share - bench.share) * monthlyBase);
    if (share <= bench.share * MIX_MARGIN || gainCents < MIN_MONTHLY_GAIN) continue;
    const label = [...g.names].join(' and ');
    const changeable = key !== 'housing'; // housing is a long-term decision; mention it, rank it lower
    tips.push({
      id: `mix:${key}:${monthKey(today)}`,
      type: 'spending_mix',
      level: 1,
      key,
      title: `${label} ${g.names.size > 1 ? 'are' : 'is'} above typical`,
      message: `${label} ${g.names.size > 1 ? 'are' : 'is'} ${pct(share)}% of your spending. A typical household spends about ${pct(bench.share)}%. Getting to ${pct(bench.share)}% would free up about ${dollars(gainCents)} a month.`
        + (changeable ? '' : ' Housing is hard to change quickly, so wants may be an easier place to start.'),
      estimatedMonthlySavingsCents: gainCents,
      confidence: (window.kind === 'months' ? 0.6 + 0.1 * window.months : 0.5) * (changeable ? 1 : 0.3),
      why: {
        lines: [
          [`Your ${label.toLowerCase()}, ${window.label}`, Math.round(g.cents / window.months)],
          [`All your everyday spending, ${window.label}`, Math.round(baseCents / window.months)],
          ['Your share', `${(share * 100).toFixed(1)}%`],
          ['Typical household share', `${(bench.share * 100).toFixed(1)}%`],
          ['Monthly difference', gainCents],
        ],
        note: `Typical share = ${bench.label.toLowerCase()} as a share of household spending, leaving out payroll deductions (base $${BLS_2024.base.toLocaleString('en-US')}/year).`,
        source: `${bench.source} (bls.gov), published ${bench.asOf}`,
      },
    });
  }
  return tips;
}

// ── Level 1: housing vs. income (HUD 30%) ──
function housingTip(state, today) {
  const window = spendingWindow(state.transactions, today);
  const income = incomeForMonth(state, monthKey(today));
  // Housing is a monthly bill: only judge it over complete months.
  if (window?.kind !== 'months' || !income) return [];
  const housingIds = new Set(state.categories.filter((c) => CATEGORY_BENCHMARK[c.benchmarkKey] === 'housing').map((c) => c.id));
  const monthly = Math.round(sum(window.entries.filter((t) => housingIds.has(t.categoryId))) / window.months);
  const share = monthly / income.cents;
  const hud = INCOME_BENCHMARKS.housing;
  if (share <= hud.share) return [];
  const excess = Math.round(monthly - hud.share * income.cents);
  return [{
    id: `housing:${monthKey(today)}`,
    type: 'housing_burden',
    level: 1,
    key: 'housing',
    title: 'Housing takes a big share of your income',
    message: `Housing and utilities are about ${pct(share)}% of your income. HUD considers more than 30% "cost-burdened"${share > hud.severeShare ? ', and more than 50% severely' : ''}. This is hard to change quickly, so trimming wants may be the easier place to start.`,
    estimatedMonthlySavingsCents: excess,
    confidence: 0.25,
    why: {
      lines: [
        ['Housing and utilities, per month', monthly],
        ['Monthly income used', income.cents],
        ['Share of income', `${pct(share)}%`],
        ['HUD guideline', '30%'],
      ],
      note: 'HUD measures against income before taxes. The app uses take-home pay, so this check is a little stricter.',
      source: `${hud.source} (huduser.gov)`,
    },
  }];
}

// ── Level 2: this month's pace vs. your usual (median of your last 3 months) ──
export function usualFor(transactions, categoryId, month) {
  // Only months where you recorded spending count; a month with just a paycheck isn't a $0 "usual".
  const active = [1, 2, 3].map((n) => shiftMonth(month, -n)).filter((m) => inMonth(transactions, m).some((t) => t.type === 'expense'));
  if (active.length < 2) return null;
  return median(active.map((m) => sum(inMonth(transactions, m).filter((t) => t.type === 'expense' && t.categoryId === categoryId))));
}

function paceTips({ transactions, categories, bills = [] }, today) {
  const month = monthKey(today);
  const day = Number(today.slice(8, 10));
  if (day < PACE_MIN_DAY) return [];
  const billCategories = new Set(bills.filter((b) => b.active).map((b) => b.categoryId));
  const thisMonth = inMonth(transactions, month).filter((t) => t.type === 'expense' && t.date <= today);
  const tips = [];
  for (const c of categories) {
    // Bills, housing, and savings aren't day-to-day choices, so pacing them would mislead.
    if (c.type !== 'expense' || c.bucket === 'savings' || billCategories.has(c.id) || CATEGORY_BENCHMARK[c.benchmarkKey] === 'housing') continue;
    const spent = sum(thisMonth.filter((t) => t.categoryId === c.id));
    if (!spent) continue;
    const usual = usualFor(transactions, c.id, month);
    if (usual === null) continue;
    const projected = Math.round((spent * daysIn(month)) / day);
    const gain = projected - usual;
    if (projected < usual * PACE_MARGIN || gain < MIN_MONTHLY_GAIN) continue;
    tips.push({
      id: `pace:${c.id}:${month}`,
      type: 'pace',
      level: 2,
      key: c.id,
      title: `${c.name} is running ahead of your usual`,
      message: `At this pace, ${c.name} will be about ${dollars(projected)} this month, ${dollars(gain)} more than your usual ${dollars(usual)}.`,
      estimatedMonthlySavingsCents: gain,
      confidence: 0.7,
      why: {
        lines: [
          [`Spent on ${c.name} so far (day ${day} of ${daysIn(month)})`, spent],
          ['At this pace, by month end', projected],
          ['Your usual month (middle of your last 3)', usual],
          ['Difference', gain],
        ],
        note: 'Pace = spent so far ÷ days so far × days in the month.',
        source: 'Your own entries on this device',
      },
    });
  }
  return tips;
}

// ── Level 2 patterns (E5-S2 to E5-S6): each compares you only with yourself ──

const isEveryday = (c, billCategories) => c && c.type === 'expense' && c.bucket !== 'savings'
  && !billCategories.has(c.id) && CATEGORY_BENCHMARK[c.benchmarkKey] !== 'housing' && c.benchmarkKey !== 'debt';
const activeBillCategories = (bills = []) => new Set(bills.filter((b) => b.active).map((b) => b.categoryId));
const categoryById = (categories) => new Map(categories.map((c) => [c.id, c]));

// E5-S2: last (complete) month was well above your usual for a category.
function higherThanUsualTips({ transactions, categories, bills }, today) {
  const last = shiftMonth(monthKey(today), -1);
  const billCats = activeBillCategories(bills);
  const tips = [];
  for (const c of categories) {
    if (!isEveryday(c, billCats)) continue;
    const spent = sum(inMonth(transactions, last).filter((t) => t.type === 'expense' && t.categoryId === c.id));
    const usual = usualFor(transactions, c.id, last);
    if (!spent || usual === null || spent < usual * PACE_MARGIN || spent - usual < MIN_MONTHLY_GAIN) continue;
    tips.push({
      id: `higher:${c.id}:${last}`, type: 'higher_than_usual', level: 2, key: c.id,
      title: `${c.name} was higher than usual last month`,
      message: `${c.name} was ${dollars(spent)} last month, ${dollars(spent - usual)} more than your usual ${dollars(usual)}.`,
      estimatedMonthlySavingsCents: spent - usual, confidence: 0.5,
      why: { lines: [[`${c.name}, last month`, spent], ['Your usual month (middle of the 3 before)', usual], ['Difference', spent - usual]], note: 'Usual = the middle value of your 3 months before, counting only months with spending.', source: 'Your own entries on this device' },
    });
  }
  return tips;
}

// E5-S3: one charge much bigger than your usual for that category (last 14 days).
function spikeTips({ transactions, categories, bills }, today) {
  const billCats = activeBillCategories(bills);
  const byId = categoryById(categories);
  const since = addDays(today, -13);
  const history = transactions.filter((t) => t.type === 'expense' && t.date >= addDays(today, -120) && t.date <= today);
  const tips = [];
  for (const t of history.filter((x) => x.date >= since)) {
    const c = byId.get(t.categoryId);
    if (!isEveryday(c, billCats)) continue;
    const others = history.filter((x) => x.categoryId === t.categoryId && x.id !== t.id).map((x) => x.amountCents);
    if (others.length < 5) continue;
    const typical = median(others);
    if (t.amountCents < Math.max(typical * 3, 5000)) continue;
    tips.push({
      id: `spike:${t.id}`, type: 'spike', level: 2, key: `spike:${t.id}`,
      title: `A bigger ${c.name} charge than usual`,
      message: `${dollars(t.amountCents)} for ${c.name}${t.note ? ` (${t.note})` : ''} on ${t.date.slice(5).replace('-', '/')} is much more than your usual ${dollars(typical)}. Was it planned? If not, it may be worth a second look.`,
      estimatedMonthlySavingsCents: 0, confidence: 0, // informational: shown after the money-saving tips
      why: { lines: [['This charge', t.amountCents], [`Your usual ${c.name} charge (last 4 months)`, typical], ['Times bigger', `${(t.amountCents / typical).toFixed(1)}×`]], note: 'Flagged when a charge is at least 3 times your usual one in that category, and at least $50.', source: 'Your own entries on this device' },
    });
  }
  return tips;
}

// E5-S4: lots of small purchases that add up (last complete month).
const SMALL = 1500; // under $15
function smallStuffTips({ transactions, categories, bills }, today) {
  const last = shiftMonth(monthKey(today), -1);
  const billCats = activeBillCategories(bills);
  const tips = [];
  for (const c of categories) {
    if (!isEveryday(c, billCats)) continue;
    const small = inMonth(transactions, last).filter((t) => t.type === 'expense' && t.categoryId === c.id && t.amountCents < SMALL);
    const total = sum(small);
    if (small.length < 8 || total < 6000) continue;
    const half = Math.round(total / 2);
    tips.push({
      id: `small:${c.id}:${last}`, type: 'small_stuff', level: 2, key: `small:${c.id}`,
      title: 'Small purchases add up',
      message: `${small.length} ${c.name} purchases under $15 came to ${dollars(total)} last month. That\u2019s about ${dollars(total * 12)} a year. Cutting them in half would save about ${dollars(half)} a month.`,
      estimatedMonthlySavingsCents: half, confidence: 0.5,
      why: { lines: [[`${c.name} purchases under $15, last month`, `${small.length}`], ['Together', total], ['Over a year at this rate', total * 12]], note: 'Small, frequent purchases are easy to miss and often the easiest to trim.', source: 'Your own entries on this device' },
    });
  }
  return tips;
}

// E5-S5: the same charge (same category + note, within 5%) in 3 of the last 4 months: likely a subscription.
function repeatingTips({ transactions, categories, bills = [] }, today) {
  const month = monthKey(today);
  const months = [0, 1, 2, 3].map((n) => shiftMonth(month, -n));
  const byId = categoryById(categories);
  const groups = new Map();
  for (const t of transactions) {
    if (t.type !== 'expense' || !months.includes(monthKey(t.date)) || t.date > today) continue;
    const key = `${t.categoryId}|${(t.note ?? '').trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const tips = [];
  for (const list of groups.values()) {
    const amounts = list.map((t) => t.amountCents);
    const typical = median(amounts);
    const steady = list.filter((t) => Math.abs(t.amountCents - typical) <= typical * 0.05);
    const inMonths = new Set(steady.map((t) => monthKey(t.date)));
    if (inMonths.size < 3 || steady.length > inMonths.size + 1 || typical < 300) continue; // ~monthly, $3+
    const c = byId.get(list[0].categoryId);
    if (!c || c.bucket === 'savings' || c.bucket === 'need') continue; // wants: subscriptions, memberships…
    // Already tracked as a bill? Then the person knows about it.
    if (bills.some((b) => b.active && b.categoryId === c.id && Math.abs(b.amountCents - typical) <= typical * 0.1)) continue;
    const name = (list[0].note ?? '').trim() || c.name;
    tips.push({
      id: `repeat:${c.id}:${name.toLowerCase()}`, type: 'repeating', level: 2, key: `repeat:${c.id}:${name.toLowerCase()}`,
      title: `${name}: about ${dollars(typical)} every month`,
      message: `You\u2019ve paid about ${dollars(typical)} for ${name} in ${inMonths.size} of the last 4 months. That\u2019s about ${dollars(typical * 12)} a year. Still using it? If yes, adding it as a bill keeps Safe to Spend accurate.`,
      estimatedMonthlySavingsCents: typical, confidence: 0.4,
      why: { lines: [['Typical charge', typical], ['Months seen (of the last 4)', `${inMonths.size}`], ['Per year', typical * 12]], note: 'Same category and note, within 5% of the same amount, about once a month.', source: 'Your own entries on this device' },
    });
  }
  return tips;
}

// E5-S6: your best recent month for a "want" is a realistic target.
function bestMonthTips({ transactions, categories, bills }, today) {
  const month = monthKey(today);
  const billCats = activeBillCategories(bills);
  const tips = [];
  for (const c of categories) {
    if (!isEveryday(c, billCats) || c.bucket !== 'want') continue;
    const past = [1, 2, 3, 4, 5, 6].map((n) => shiftMonth(month, -n))
      .filter((m) => inMonth(transactions, m).some((t) => t.type === 'expense'))
      .map((m) => sum(inMonth(transactions, m).filter((t) => t.type === 'expense' && t.categoryId === c.id)));
    if (past.length < 3) continue;
    const usual = median(past);
    const best = Math.min(...past.filter((v) => v > 0));
    if (!Number.isFinite(best) || usual - best < 4000) continue;
    tips.push({
      id: `best:${c.id}:${month}`, type: 'best_month', level: 2, key: c.id,
      title: `You\u2019ve done ${c.name} for less before`,
      message: `Your lowest ${c.name} month recently was ${dollars(best)}, against a usual ${dollars(usual)}. Matching it would free up about ${dollars(usual - best)} a month.`,
      estimatedMonthlySavingsCents: usual - best, confidence: 0.4,
      why: { lines: [[`Your lowest ${c.name} month (last 6)`, best], ['Your usual month', usual], ['Difference', usual - best]], note: 'Based only on months where you recorded spending.', source: 'Your own entries on this device' },
    });
  }
  return tips;
}

function dollars(cents) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(cents / 100));
}

// Why there are no tips: 'not-enough' (we couldn't compare yet) vs 'none' (we compared; nothing stands out).
export function coachStatus(state, today) {
  const tips = coachTips(state, today);
  if (tips.length) return { tips, reason: null };
  const window = spendingWindow(state.transactions, today);
  const enough = window && window.entries.length >= MIN_ENTRIES && sum(window.entries) >= MIN_SPENDING;
  return { tips, reason: enough ? 'none' : 'not-enough' };
}

// All tips, most valuable first. Score = monthly money freed × confidence.
export function coachTips(state, today) {
  const tips = [
    ...paceTips(state, today), ...mixTips(state, today), ...housingTip(state, today),
    ...higherThanUsualTips(state, today), ...bestMonthTips(state, today), ...smallStuffTips(state, today),
    ...repeatingTips(state, today), ...spikeTips(state, today),
  ]
    .map((t) => ({ ...t, score: Math.round(t.estimatedMonthlySavingsCents * t.confidence) }));
  // One tip per topic: if dining out is both "above typical" and "running ahead", keep the stronger one.
  const seen = new Set();
  return tips.sort((a, b) => b.score - a.score).filter((t) => {
    const perCategory = ['pace', 'higher_than_usual', 'best_month'].includes(t.type);
    const topic = perCategory ? CATEGORY_BENCHMARK[state.categories.find((c) => c.id === t.key)?.benchmarkKey] ?? t.key : t.key;
    if (seen.has(topic)) return false;
    seen.add(topic);
    return true;
  });
}
