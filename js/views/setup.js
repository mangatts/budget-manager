// Setup: your income, fixed expenses, and credit cards. Entered once, edited when they change.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { getStore } from '../appStore.js';
import { choiceGroup } from '../ui/choiceGroup.js';
import { monthlyIncomeCents } from '../services/planner.js';
import { storageError, backLink, formatApr, field, moneyInput, textInput, showErrors, oneAtATime, finish } from '../ui/form.js';

export const FREQUENCY_LABELS = { weekly: 'Every week', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Every month' };
const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`;
export const dueText = (day) => (day ? `Due on the ${ordinal(day)}` : 'No set day');

const row = (href, title, sub, cents) => el('li', {},
  el('a', { class: 'list-row list-row-link', href },
    el('span', { class: 'list-row-main' }, el('span', {}, title), el('span', { class: 'list-row-sub' }, sub)),
    el('span', { class: 'money' }, formatCents(cents)),
  ),
);

function section({ id, title, intro, addHref, addLabel, items, empty, footer }) {
  return el('section', { class: 'section', 'aria-labelledby': `${id}-title` },
    el('h2', { class: 'section-title', id: `${id}-title` }, title),
    el('p', { class: 'field-hint' }, intro),
    items.length ? el('ul', { class: 'list', id: `${id}-list` }, items) : el('p', { class: 'lead' }, empty),
    footer && items.length ? el('p', { class: 'field-hint', id: `${id}-total` }, footer) : null,
    el('a', { class: 'btn btn-secondary btn-block', href: addHref, id: `add-${id}` }, addLabel),
  );
}

export function setupView() {
  const body = el('div', { class: 'screen' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const render = () => {
      const { incomes, expenses, cards } = store.getState();
      const monthlyIncome = monthlyIncomeCents(incomes);
      const monthlyExpenses = expenses.reduce((sum, e) => sum + e.amountCents, 0);
      clear(body);
      body.append(
        section({
          id: 'income', title: 'Money coming in', intro: 'What you take home after taxes.',
          addHref: '#/income/new', addLabel: '＋ Add income', empty: 'No income added yet.',
          items: incomes.map((i) => row(`#/income/${i.id}`, i.name, FREQUENCY_LABELS[i.frequency], i.amountCents)),
          footer: `About ${formatCents(monthlyIncome)} a month.`,
        }),
        section({
          id: 'expense', title: 'Fixed expenses', intro: 'Bills you pay every month: rent, phone, car, insurance. Add groceries and gas too, so the plan leaves money for them.',
          addHref: '#/expense/new', addLabel: '＋ Add an expense', empty: 'No fixed expenses added yet.',
          items: expenses.map((e) => row(`#/expense/${e.id}`, e.name, dueText(e.dayOfMonth), e.amountCents)),
          footer: `${formatCents(monthlyExpenses)} a month.`,
        }),
        section({
          id: 'card', title: 'Credit cards', intro: 'Your cards and their interest rates. You update the balances on Check-in.',
          addHref: '#/card/new', addLabel: '＋ Add a card', empty: 'No cards added yet.',
          items: cards.map((c) => row(`#/card/${c.id}`, c.name, `${formatApr(c.aprBps)} interest${c.limitCents ? ` · ${formatCents(c.limitCents)} limit` : ''} · minimum`, c.minPaymentCents)),
          footer: 'Highest interest is listed first.',
        }),
      );
    };
    render();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(); });
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, el('h1', { tabindex: '-1' }, 'Setup'), body);
}

// One add/edit screen, configured per kind (card, income, expense).
function recordScreen({ kind, list, title, noun, build, add, update, remove }) {
  return (id) => {
    const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
    getStore().then((store) => {
      clear(body);
      const record = id === 'new' ? null : store.getState()[list].find((r) => r.id === id);
      if (id !== 'new' && !record) {
        return body.append(el('p', { class: 'lead' }, `This ${noun} no longer exists.`), el('a', { class: 'btn btn-secondary', href: '#/setup' }, 'Back to Setup'));
      }
      const { fields, inputs, read } = build(record);
      const save = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, record ? 'Save changes' : `Add ${noun}`);
      const del = record ? el('button', { class: 'btn btn-danger btn-block', type: 'button', id: `delete-${kind}` }, 'Delete') : null;
      const form = el('form', { class: 'section', novalidate: true, id: `${kind}-form` }, fields, save, del);
      const once = oneAtATime();
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        once(async () => {
          const result = record ? await store[update](record.id, read()) : await store[add](read());
          if (!finish(result, record ? 'Saved changes' : `Added ${result.record?.name}`, '#/setup')) showErrors(form, inputs, result.errors);
        });
      });
      del?.addEventListener('click', () => once(async () => {
        const result = await store[remove](record.id);
        if (!finish(result, `Deleted ${record.name}`, '#/setup')) showErrors(form, inputs, result.errors);
      }));
      body.append(form);
    }, () => { clear(body); body.append(storageError()); });
    return el('div', { class: 'screen' }, backLink('#/setup', 'Setup'), el('h1', { tabindex: '-1' }, id === 'new' ? `Add ${title}` : `Edit ${noun}`), body);
  };
}

export const cardView = recordScreen({
  kind: 'card', list: 'cards', title: 'a card', noun: 'card', add: 'addCard', update: 'updateCard', remove: 'deleteCard',
  build(card) {
    const name = textInput('card-name', card?.name, 'Chase Freedom');
    const apr = el('input', { class: 'input', id: 'card-apr', inputmode: 'decimal', autocomplete: 'off', placeholder: '24.99', value: card ? (card.aprBps / 100).toFixed(2) : null });
    const min = moneyInput('card-min', card?.minPaymentCents);
    const limit = moneyInput('card-limit', card?.limitCents);
    return {
      fields: [
        field('card-name', 'Card name', name),
        field('card-apr', 'Interest rate (APR %)', apr, 'On your statement or in the card’s app.'),
        field('card-min', 'Minimum payment', min, 'From your latest statement. Use 0 if nothing is due.'),
        field('card-limit', 'Credit limit', limit, 'Optional. Shows how much of the limit you’re using.'),
      ],
      inputs: [['name', name], ['apr', apr], ['minPayment', min], ['limit', limit]],
      read: () => ({ name: name.value, apr: apr.value, minPayment: min.value, limit: limit.value }),
    };
  },
});

export const incomeView = recordScreen({
  kind: 'income', list: 'incomes', title: 'income', noun: 'income', add: 'addIncome', update: 'updateIncome', remove: 'deleteIncome',
  build(income) {
    const name = textInput('income-name', income?.name, 'Paycheck');
    const amount = moneyInput('income-amount', income?.amountCents);
    // Always has a choice selected, so there's no error to show.
    let frequency = income?.frequency ?? 'biweekly';
    const group = choiceGroup({ name: 'frequency', legend: 'How often?', options: Object.entries(FREQUENCY_LABELS), value: frequency, onChange: (v) => { frequency = v; } });
    return {
      fields: [
        field('income-name', 'Name', name),
        field('income-amount', 'Amount you take home each time', amount, 'After taxes, what lands in your bank.'),
        group,
      ],
      inputs: [['name', name], ['amount', amount]],
      read: () => ({ name: name.value, amount: amount.value, frequency }),
    };
  },
});

export const expenseView = recordScreen({
  kind: 'expense', list: 'expenses', title: 'an expense', noun: 'expense', add: 'addExpense', update: 'updateExpense', remove: 'deleteExpense',
  build(expense) {
    const name = textInput('expense-name', expense?.name, 'Rent');
    const amount = moneyInput('expense-amount', expense?.amountCents);
    const day = el('input', { class: 'input', id: 'expense-day', inputmode: 'numeric', autocomplete: 'off', placeholder: '1', value: expense?.dayOfMonth ?? null });
    return {
      fields: [
        field('expense-name', 'Name', name),
        field('expense-amount', 'Amount each month', amount),
        field('expense-day', 'Day of the month it’s due', day, 'Optional, 1 to 31.'),
      ],
      inputs: [['name', name], ['amount', amount], ['dayOfMonth', day]],
      read: () => ({ name: name.value, amount: amount.value, dayOfMonth: day.value }),
    };
  },
});
