// Carries data over from the earlier, bigger Budget Manager (database v7 and older, and old backups):
//   debts                → cards, with today's balances as the first check-in
//   active bills         → fixed expenses
//   monthly take-home pay → one monthly income
// Everything else (entries, categories, tips, goals) has no place in the simple app and is left out.
// Input must already be validated; this only reshapes it.

export function fromLegacy({ debts = [], bills = [], monthlyTakeHomeCents = null }, { today, now, newId }) {
  const cards = debts.map((d) => ({
    id: d.id, name: d.name, limitCents: null, aprBps: d.aprBps, minPaymentCents: d.minPaymentCents, createdAt: d.createdAt, updatedAt: d.updatedAt,
  }));
  const checkins = debts.length
    ? [{ date: today, balances: debts.map((d) => ({ cardId: d.id, balanceCents: d.balanceCents })), createdAt: now }]
    : [];
  const expenses = bills.filter((b) => b.active !== false).map((b) => ({
    id: b.id, name: b.name, amountCents: b.amountCents, dayOfMonth: b.dayOfMonth, createdAt: b.createdAt, updatedAt: b.updatedAt,
  }));
  const incomes = monthlyTakeHomeCents
    ? [{ id: newId(), name: 'Take-home pay', amountCents: monthlyTakeHomeCents, frequency: 'monthly', createdAt: now, updatedAt: now }]
    : [];
  return { cards, checkins, incomes, expenses };
}
