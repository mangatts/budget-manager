// The math behind Home: monthly income, what's left after bills and minimums, and which card gets
// the extra. Pure functions (data in, plan out), so they're easy to test.
//
// Strategy: pay every card's minimum, then put everything left on the card with the highest
// interest rate ("avalanche"). That costs the least interest overall.

// How many times a year each frequency pays.
const PER_YEAR = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
export const MAX_PAYOFF_MONTHS = 600; // 50 years: past this we say "not at this rate"

// 100000 every two weeks → 216667 a month (rounded to the cent).
export const monthlyCents = (amountCents, frequency) => Math.round((amountCents * PER_YEAR[frequency]) / 12);

// Monthly interest on a balance: APR in basis points / 12 months / 10,000.
const interest = (balanceCents, aprBps) => Math.round((balanceCents * aprBps) / 120_000);

// Highest rate first; ties go to the smaller balance (paid off sooner), then by name.
const avalanche = (a, b) => b.aprBps - a.aprBps || a.balanceCents - b.balanceCents || a.name.localeCompare(b.name);

const total = (list, key) => list.reduce((sum, item) => sum + item[key], 0);

// Newest check-in first.
export const sortCheckins = (checkins) => [...checkins].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

// Each card's balance from the newest check-in that includes it (null if it was never checked in).
export function latestBalances(cards, checkins) {
  const latest = new Map(cards.map((c) => [c.id, null]));
  for (const checkin of sortCheckins(checkins)) {
    for (const { cardId, balanceCents } of checkin.balances) {
      if (latest.has(cardId) && latest.get(cardId) === null) latest.set(cardId, { balanceCents, date: checkin.date });
    }
  }
  return latest;
}

// Splits `budgetCents` across cards: minimums first, the rest to the highest rate. Mutates nothing.
function allocate(cards, budgetCents) {
  const plan = cards.map((c) => ({ ...c, minCents: Math.min(c.minPaymentCents, c.balanceCents), extraCents: 0 }));
  let spare = budgetCents - total(plan, 'minCents');
  for (const card of [...plan].sort(avalanche)) {
    if (spare <= 0) break;
    const extra = Math.min(spare, card.balanceCents - card.minCents);
    card.extraCents = extra;
    spare -= extra;
  }
  return { plan, spareCents: spare };
}

// Months until every card is $0 if you keep paying `budgetCents` a month (minimums + extra, avalanche).
// Returns 0 with no debt, or null if the payments don't outrun the interest within 50 years.
export function monthsToPayoff(cards, budgetCents) {
  let balances = cards.filter((c) => c.balanceCents > 0).map((c) => ({ ...c }));
  if (!balances.length) return 0;
  for (let month = 1; month <= MAX_PAYOFF_MONTHS; month++) {
    for (const card of balances) card.balanceCents += interest(card.balanceCents, card.aprBps);
    const { plan, spareCents } = allocate(balances, budgetCents);
    if (spareCents < 0) return null; // can't even cover the minimums
    for (const card of plan) card.balanceCents -= card.minCents + card.extraCents;
    balances = plan.filter((c) => c.balanceCents > 0).map(({ minCents, extraCents, ...c }) => c);
    if (!balances.length) return month;
  }
  return null;
}

export const monthlyIncomeCents = (incomes) => incomes.reduce((sum, i) => sum + monthlyCents(i.amountCents, i.frequency), 0);

export function buildPlan({ cards, checkins, incomes, expenses }) {
  const incomeCents = monthlyIncomeCents(incomes);
  const expensesCents = total(expenses, 'amountCents');
  const latest = latestBalances(cards, checkins);
  const known = cards.filter((c) => latest.get(c.id)).map((c) => ({ ...c, balanceCents: latest.get(c.id).balanceCents }));
  const missing = cards.filter((c) => !latest.get(c.id));

  // Cards without a balance yet still need their minimum paid, so it's set aside first.
  const missingMinCents = total(missing, 'minPaymentCents');
  const forCards = incomeCents - expensesCents - missingMinCents; // what's available for checked-in cards
  const { plan, spareCents } = allocate(known, Math.max(0, forCards));
  const minimumsCents = total(plan, 'minCents') + missingMinCents;
  const leftoverCents = incomeCents - expensesCents - minimumsCents; // after bills and minimums; negative = short

  // Highest rate first, so the list reads in the order you should focus on.
  const rows = plan.sort(avalanche).map((c) => ({
    id: c.id,
    name: c.name,
    aprBps: c.aprBps,
    balanceCents: c.balanceCents,
    limitCents: c.limitCents,
    minCents: c.minCents,
    extraCents: c.extraCents,
    payCents: c.minCents + c.extraCents,
    // Share of the limit used, in whole percent (null when no limit was given).
    usedPercent: c.limitCents ? Math.round((c.balanceCents * 100) / c.limitCents) : null,
  }));

  const ordered = sortCheckins(checkins);
  const totalDebtCents = total(rows, 'balanceCents');
  // Change between the two newest check-ins, counting only cards in both.
  let change = null;
  if (ordered.length >= 2) {
    const [now, before] = ordered;
    const prev = new Map(before.balances.map((b) => [b.cardId, b.balanceCents]));
    const shared = now.balances.filter((b) => prev.has(b.cardId) && latest.has(b.cardId));
    if (shared.length) change = { sinceDate: before.date, cents: shared.reduce((sum, b) => sum + b.balanceCents - prev.get(b.cardId), 0) };
  }

  const limits = rows.filter((r) => r.limitCents);
  return {
    incomeCents,
    expensesCents,
    minimumsCents,
    leftoverCents,
    // Money still free after every card is paid in full this month.
    afterCardsCents: Math.max(0, spareCents),
    cards: rows,
    missing: missing.map((c) => ({ id: c.id, name: c.name, minCents: c.minPaymentCents })),
    totalDebtCents,
    usedPercent: limits.length ? Math.round((total(limits, 'balanceCents') * 100) / total(limits, 'limitCents')) : null,
    change,
    payoffMonths: leftoverCents < 0 ? null : monthsToPayoff(known, forCards),
    bills: [...expenses].sort((a, b) => (a.dayOfMonth ?? 99) - (b.dayOfMonth ?? 99) || a.name.localeCompare(b.name)),
    lastCheckin: ordered[0]?.date ?? null,
  };
}
