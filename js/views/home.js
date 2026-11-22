// Home: what you earn, what's fixed, what's left, and what to pay on each card this month.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey, shiftMonth, formatMonth, formatDay } from '../utils/dates.js';
import { getStore } from '../appStore.js';
import { buildPlan } from '../services/planner.js';
import { backupReminder } from '../ui/backupReminder.js';
import { storageError, formatApr } from '../ui/form.js';
import { dueText } from './setup.js';

const HIGH_USE = 30; // % of a limit; above this, credit scores start to suffer

const line = (label, cents, id, extra = '') => el('li', { class: `math-line ${extra}`, id },
  el('span', {}, label), el('span', { class: 'money' }, formatCents(cents, { sign: true })),
);

function welcome({ incomes, expenses, cards }) {
  const step = (done, href, text, id) => el('li', {}, done ? el('span', {}, `✓ ${text}`) : el('a', { href, id }, text));
  return el('section', { class: 'card', id: 'welcome', 'aria-labelledby': 'welcome-title' },
    el('h2', { id: 'welcome-title' }, 'Let’s set things up'),
    el('p', {}, 'Three quick steps, then this screen tells you what to pay on each card.'),
    el('ol', { class: 'steps' },
      step(incomes.length, '#/income/new', 'Add your income', 'welcome-income'),
      step(expenses.length, '#/expense/new', 'Add your fixed expenses', 'welcome-expense'),
      step(cards.length, '#/card/new', 'Add your credit cards', 'welcome-card'),
    ),
  );
}

function monthCard(plan) {
  const short = plan.leftoverCents < 0;
  return el('section', { class: 'card', id: 'month', 'aria-labelledby': 'month-title' },
    el('h2', { id: 'month-title' }, 'Each month'),
    el('ul', { class: 'math' },
      line('Money coming in', plan.incomeCents, 'line-income'),
      line('Fixed expenses', -plan.expensesCents, 'line-expenses'),
      line('Card minimums', -plan.minimumsCents, 'line-minimums'),
      el('li', { class: 'math-line math-total', id: 'line-left' },
        el('span', {}, short ? 'Short by' : 'Left for paying down cards'),
        el('span', { class: `money ${short ? 'money-out' : 'money-in'}` }, formatCents(Math.abs(plan.leftoverCents))),
      ),
    ),
    short ? el('div', { class: 'card warning-card', id: 'short-warning' },
      el('span', { class: 'pill pill-critical' }, '⚠ Not enough this month'),
      el('p', {}, `Your bills and card minimums are ${formatCents(-plan.leftoverCents)} more than you bring in. Pay at least the minimums to avoid late fees and penalty rates, and see if a fixed expense can shrink.`),
    ) : null,
  );
}

function payCard(plan) {
  const focus = plan.cards.find((c) => c.extraCents > 0);
  const rows = plan.cards.map((c) => {
    const parts = [`${formatApr(c.aprBps)} interest`, `owes ${formatCents(c.balanceCents)}`];
    if (c.usedPercent !== null) parts.push(`${c.usedPercent}% of limit`);
    const how = c.balanceCents === 0 ? 'Paid off' : c.extraCents ? `${formatCents(c.minCents)} minimum + ${formatCents(c.extraCents)} extra` : 'Minimum';
    return el('li', { class: 'list-row', 'data-card': c.id },
      el('span', { class: 'list-row-main' },
        el('span', {}, c.name, c === focus ? el('span', { class: 'pill pill-good' }, ' Focus here') : null),
        el('span', { class: 'list-row-sub' }, `${how} · ${parts.join(' · ')}`),
        c.usedPercent > HIGH_USE ? el('span', { class: 'pill pill-warning' }, `⚠ Using over ${HIGH_USE}% of the limit`) : null,
      ),
      el('span', { class: 'money pay-amount' }, formatCents(c.payCents)),
    );
  });
  return el('section', { class: 'section', id: 'pay', 'aria-labelledby': 'pay-title' },
    el('h2', { class: 'section-title', id: 'pay-title' }, 'Pay this month'),
    rows.length ? el('ul', { class: 'list', id: 'pay-list' }, rows) : null,
    focus ? el('p', { class: 'field-hint' }, `Every card gets its minimum. The rest goes to ${focus.name} because it charges the most interest, which saves you the most money.`) : null,
    plan.afterCardsCents > 0 ? el('p', { class: 'field-hint', id: 'after-cards' }, `That pays every card in full, with ${formatCents(plan.afterCardsCents)} still left over.`) : null,
    plan.missing.length ? el('p', { class: 'field-hint', id: 'missing' }, `No balance yet for ${plan.missing.map((c) => `${c.name} (pay at least its ${formatCents(c.minCents)} minimum)`).join(', ')}. `, el('a', { href: '#/checkin' }, 'Check in'), ' to include them.') : null,
  );
}

function debtCard(plan, today) {
  let payoff;
  if (!plan.lastCheckin) payoff = 'Check in with your card balances to see this.';
  else if (plan.missing.length) payoff = 'Check in with every card’s balance to see this.';
  else if (plan.totalDebtCents === 0) payoff = 'No card debt. Nice work!';
  else if (plan.payoffMonths === null) payoff = 'At this rate the balances won’t go down. Paying more than the minimums is the way out.';
  else payoff = `About ${plan.payoffMonths} ${plan.payoffMonths === 1 ? 'month' : 'months'} (${formatMonth(shiftMonth(monthKey(today), plan.payoffMonths))}) if you stick to this plan.`;
  const change = plan.change;
  return el('section', { class: 'card', id: 'debt', 'aria-labelledby': 'debt-title' },
    el('h2', { id: 'debt-title' }, 'Your card debt'),
    el('div', { class: 'stat' },
      el('span', { class: 'stat-label' }, plan.lastCheckin ? `As of ${formatDay(plan.lastCheckin, today)}` : 'No check-ins yet'),
      el('span', { class: 'money money-hero', id: 'debt-total' }, formatCents(plan.totalDebtCents)),
    ),
    change ? el('p', { id: 'debt-change' }, change.cents <= 0
      ? el('span', { class: 'pill pill-good' }, `↓ ${formatCents(-change.cents)} since ${formatDay(change.sinceDate, today)}`)
      : el('span', { class: 'pill pill-warning' }, `↑ ${formatCents(change.cents)} since ${formatDay(change.sinceDate, today)}`)) : null,
    plan.usedPercent !== null ? el('p', { class: 'field-hint', id: 'debt-used' }, `Using ${plan.usedPercent}% of your total credit limit. Under ${HIGH_USE}% is best for your credit score.`) : null,
    el('p', { id: 'debt-free' }, el('strong', {}, 'Debt-free: '), payoff),
  );
}

function billsSection(plan) {
  if (!plan.bills.length) return null;
  return el('section', { class: 'section', id: 'bills', 'aria-labelledby': 'bills-title' },
    el('h2', { class: 'section-title', id: 'bills-title' }, 'Keep paying every month'),
    el('ul', { class: 'list', id: 'bills-list' }, plan.bills.map((b) => el('li', { class: 'list-row' },
      el('span', { class: 'list-row-main' }, el('span', {}, b.name), el('span', { class: 'list-row-sub' }, dueText(b.dayOfMonth))),
      el('span', { class: 'money' }, formatCents(b.amountCents)),
    ))),
  );
}

// Totals count only cards you still have, so they match "Your card debt".
function historySection({ checkins, cards }, today) {
  if (!checkins.length) return null;
  const current = new Set(cards.map((c) => c.id));
  return el('section', { class: 'section', id: 'history', 'aria-labelledby': 'history-title' },
    el('h2', { class: 'section-title', id: 'history-title' }, 'Past check-ins'),
    el('ul', { class: 'list', id: 'history-list' }, checkins.slice(0, 12).map((c) => {
      const balances = c.balances.filter((b) => current.has(b.cardId));
      return el('li', {},
        el('a', { class: 'list-row list-row-link', href: `#/checkin/${c.date}` },
          el('span', { class: 'list-row-main' }, el('span', {}, formatDay(c.date, today)), el('span', { class: 'list-row-sub' }, `${balances.length} ${balances.length === 1 ? 'card' : 'cards'}`)),
          el('span', { class: 'money' }, formatCents(balances.reduce((sum, b) => sum + b.balanceCents, 0))),
        ),
      );
    })),
  );
}

function render(target, state) {
  clear(target);
  const today = todayLocal();
  const plan = buildPlan(state);
  const ready = state.incomes.length && state.cards.length;
  if (!state.incomes.length || !state.expenses.length || !state.cards.length) target.append(welcome(state));
  if (ready) {
    target.append(monthCard(plan));
    target.append(payCard(plan));
    target.append(el('a', { class: 'btn btn-primary btn-block', href: '#/checkin', id: 'home-checkin' }, 'Check in: update balances'));
    target.append(debtCard(plan, today));
  }
  target.append(billsSection(plan) ?? '', historySection(state, today) ?? '');
  const reminder = backupReminder(state);
  if (reminder) target.append(reminder);
}

export function homeView() {
  const body = el('div', { class: 'screen' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    render(body, store.getState());
    const stop = store.subscribe((state) => { if (!body.isConnected) return stop(); render(body, state); });
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, el('h1', { tabindex: '-1' }, 'Home'), body);
}
