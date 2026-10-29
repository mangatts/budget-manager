// Home: the month at a glance. Money in, money out, what's left, and recent entries.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey, shiftMonth, formatMonth, formatDay } from '../utils/dates.js';
import { getStore } from '../appStore.js';
import { backupReminder } from '../ui/backupReminder.js';
import { showHistoryMonth } from './history.js';
import { inMonth, monthSummary } from '../services/insights/month.js';
import { upcomingBills } from '../services/insights/safeToSpend.js';
import { safeToSpendCard } from '../ui/safeToSpendCard.js';
import { splitChart } from '../ui/splitChart.js';
import { billStatusPill } from './bills.js';
import { topTips } from './tips.js';
import { cutPlanHome } from '../ui/cutPlan.js';
import { nextStepHome } from '../ui/nextStep.js';

// Remembered while the app is open.
let month = null;

const stat = (id, label, cents, kind) => el('div', { class: 'stat', id },
  el('span', { class: 'stat-label' }, label),
  el('span', { class: `money stat-value ${kind}` }, formatCents(cents, { sign: true })),
);

function recentRow(t, category) {
  const signed = formatCents(t.type === 'income' ? t.amountCents : -t.amountCents, { sign: true });
  return el('li', {},
    el('a', { class: 'list-row list-row-link', href: `#/edit/${t.id}` },
      el('span', { class: 'swatch-label' },
        el('span', { class: 'row-icon', 'aria-hidden': 'true' }, category?.icon ?? '•'),
        el('span', { class: 'list-row-main' },
          el('span', {}, category?.name ?? 'Unknown'),
          el('span', { class: 'list-row-sub' }, [formatDay(t.date), t.note].filter(Boolean).join(' · ')),
        ),
      ),
      el('span', { class: `money ${t.type === 'income' ? 'money-in' : 'money-out'}` }, signed),
    ),
  );
}

function render(target, state) {
  clear(target);
  const { inCents, outCents, leftCents } = monthSummary(state.transactions, month);
  const entries = inMonth(state.transactions, month);
  const byId = new Map(state.categories.map((c) => [c.id, c]));

  target.append(el('section', { class: 'card', 'aria-labelledby': 'month-label', id: 'month-summary' },
    el('div', { class: 'stat-grid' },
      stat('stat-in', 'Money in', inCents, 'money-in'),
      stat('stat-out', 'Money out', -outCents, 'money-out'),
      stat('stat-left', 'Left', leftCents, leftCents < 0 ? 'money-out' : ''),
    ),
    leftCents < 0 ? el('p', { class: 'field-hint' }, `You’ve spent ${formatCents(-leftCents)} more than came in this month.`) : null,
  ));

  target.append(splitChart(state, month));

  if (!state.meta.monthlyTakeHomeCents) {
    target.append(el('p', { class: 'field-hint' }, 'Tip: ', el('a', { href: '#/profile' }, 'add your take-home pay'), ' for more accurate numbers.'));
  }

  if (!entries.length) {
    target.append(el('p', { class: 'lead' }, `No entries in ${formatMonth(month)} yet.`));
    return;
  }
  const seeAll = el('a', { class: 'btn btn-quiet', href: '#/history', id: 'see-all' }, `See all ${entries.length} in History ›`);
  seeAll.addEventListener('click', () => showHistoryMonth(month, { clearSearch: true }));
  target.append(el('section', { class: 'section', 'aria-labelledby': 'recent-title' },
    el('h2', { class: 'section-title', id: 'recent-title' }, 'Recent'),
    el('ul', { class: 'list' }, entries.slice(0, 5).map((t) => recentRow(t, byId.get(t.categoryId)))),
    seeAll,
  ));
}

function upcomingSection(state, today) {
  const upcoming = upcomingBills(state.bills, state.transactions, today);
  if (!upcoming.length) return null;
  return el('section', { class: 'section', 'aria-labelledby': 'upcoming-title', id: 'upcoming' },
    el('h2', { class: 'section-title', id: 'upcoming-title' }, 'Bills coming up'),
    el('ul', { class: 'list' }, upcoming.map((u) => el('li', {},
      el('a', { class: 'list-row list-row-link', href: `#/bill/${u.bill.id}` },
        el('span', { class: 'list-row-main' }, el('span', {}, u.bill.name), billStatusPill(u, today)),
        el('span', { class: 'money money-out' }, formatCents(-u.bill.amountCents)),
      ),
    ))),
  );
}

export function homeView() {
  month ??= monthKey(todayLocal());
  const reminderSlot = el('div', { hidden: true }); // takes no space unless there's a reminder
  const todaySlot = el('div', { class: 'section', id: 'today' });
  const body = el('div', { class: 'section', 'aria-live': 'polite' }, el('p', { class: 'lead' }, 'Loading…'));
  const label = el('h2', { class: 'month-label', id: 'month-label' }, formatMonth(month));
  const prev = el('button', { class: 'btn btn-secondary', type: 'button', id: 'home-prev', 'aria-label': 'Previous month' }, '‹');
  const next = el('button', { class: 'btn btn-secondary', type: 'button', id: 'home-next', 'aria-label': 'Next month' }, '›');

  getStore().then((store) => {
    const refresh = () => {
      const state = store.getState();
      const today = todayLocal();
      clear(todaySlot);
      todaySlot.append(safeToSpendCard(state, today));
      todaySlot.append(nextStepHome(store, today));
      const upcoming = upcomingSection(state, today);
      if (upcoming) todaySlot.append(upcoming);
      const challenges = cutPlanHome(store, today);
      if (challenges) todaySlot.append(challenges);
      const tips = topTips(store, today);
      if (tips) todaySlot.append(tips);
      label.textContent = formatMonth(month);
      render(body, state);
    };
    prev.addEventListener('click', () => { month = shiftMonth(month, -1); refresh(); });
    next.addEventListener('click', () => { month = shiftMonth(month, 1); refresh(); });
    const reminder = backupReminder(store.getState());
    if (reminder) { reminderSlot.append(reminder); reminderSlot.hidden = false; }
    refresh();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); refresh(); });
  }, () => {
    clear(body);
    body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device. Try turning off private browsing, or use Chrome or Safari.'));
  });

  return el('div', { class: 'screen' },
    el('h1', { tabindex: '-1' }, 'Home'),
    reminderSlot,
    todaySlot,
    el('div', { class: 'month-switcher' }, prev, label, next),
    body,
    el('a', { class: 'btn btn-primary btn-block', href: '#/add' }, '＋ Add money in or out'),
  );
}
