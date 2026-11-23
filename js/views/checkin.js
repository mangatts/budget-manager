// Check-in: pick a date and type what each card owes that day. Takes about 30 seconds.
// #/checkin opens today; #/checkin/2026-11-01 opens that day (to fix or delete it).
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, formatDay, isIsoDate } from '../utils/dates.js';
import { getStore } from '../appStore.js';
import { latestBalances } from '../services/planner.js';
import { addedOn } from '../services/validate.js';
import { storageError, field, moneyInput, centsToInput, showErrors, oneAtATime, finish, formatApr } from '../ui/form.js';
import { personTag } from '../ui/personTag.js';

function checkinForm(store, startDate) {
  const { cards, checkins } = store.getState();
  const today = todayLocal();
  const date = el('input', { class: 'input', id: 'checkin-date', type: 'date', max: today, min: '2000-01-01', value: startDate, required: true });
  const balanceInputs = cards.map((card) => [card, moneyInput(`balance-${card.id}`, null)]);
  const hints = new Map();
  const del = el('button', { class: 'btn btn-danger btn-block', type: 'button', id: 'delete-checkin', hidden: true }, 'Delete this check-in');
  const status = el('p', { class: 'field-hint', id: 'checkin-status', 'aria-live': 'polite' });

  const cardFields = balanceInputs.map(([card, input]) => {
    const node = field(input.id, card.name, input, ' ');
    hints.set(card.id, node.querySelector('.field-hint'));
    return node;
  });

  // Shows the chosen day's balances if it already has a check-in; otherwise blank fields, with the
  // last known balance as a hint (never pre-filled, so old numbers can't be saved by accident).
  let shownDate = null; // the check-in the Delete button belongs to
  const fill = () => {
    const existing = checkins.find((c) => c.date === date.value);
    shownDate = existing?.date ?? null;
    const before = latestBalances(cards, checkins.filter((c) => c.date < date.value));
    for (const [card, input] of balanceInputs) {
      const saved = existing?.balances.find((b) => b.cardId === card.id);
      input.value = saved ? centsToInput(saved.balanceCents) : '';
      const last = before.get(card.id);
      const optional = date.value < addedOn(card) ? ' · optional: added after this day' : '';
      hints.get(card.id).textContent = `${formatApr(card.aprBps)} interest${last ? ` · was ${formatCents(last.balanceCents)} on ${formatDay(last.date)}` : ''}${optional}`;
    }
    del.hidden = !existing;
    const when = date.value === todayLocal() ? 'today' : `on ${formatDay(date.value)}`;
    status.textContent = existing ? `You already checked in ${when}. Saving updates it.` : '';
  };
  date.addEventListener('change', () => {
    if (isIsoDate(date.value)) return fill();
    shownDate = null;
    del.hidden = true;
    status.textContent = '';
  });

  const form = el('form', { class: 'section', novalidate: true, id: 'checkin-form' },
    field('checkin-date', 'Date', date),
    status,
    el('p', { class: 'lead' }, 'What does each card owe right now? Check the card’s app for the current balance.'),
    cardFields,
    el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save check-in'),
    del,
  );
  fill();

  const inputs = [['date', date], ...balanceInputs.map(([card, input]) => [`balance-${card.id}`, input])];
  const once = oneAtATime();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    once(async () => {
      const balances = Object.fromEntries(balanceInputs.map(([card, input]) => [card.id, input.value]));
      const result = await store.saveCheckin({ date: date.value, balances });
      if (!finish(result, `Checked in for ${formatDay(date.value)}`, '#/home')) showErrors(form, inputs, result.errors);
    });
  });
  del.addEventListener('click', () => once(async () => {
    const day = shownDate;
    if (!day) return;
    const result = await store.deleteCheckin(day);
    if (!finish(result, `Deleted the check-in for ${formatDay(day)}`, '#/home')) showErrors(form, inputs, result.errors);
  }));
  return form;
}

export function checkinView(param) {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    clear(body);
    if (!store.getState().cards.length) {
      return body.append(
        el('p', { class: 'lead' }, 'Add your credit cards first. Then check in here whenever you want to update their balances.'),
        el('a', { class: 'btn btn-primary btn-block', href: '#/card/new', id: 'checkin-add-card' }, '＋ Add a card'),
      );
    }
    const today = todayLocal();
    const start = isIsoDate(param) && param <= today ? param : today;
    body.append(checkinForm(store, start));
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, el('h1', { tabindex: '-1' }, 'Check-in'), personTag(), body);
}
