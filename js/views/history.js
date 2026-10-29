// History: browse by month, search, and tap an entry to edit it.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey, shiftMonth, formatDay, formatMonth } from '../utils/dates.js';
import { filterTransactions, groupByDay, totals } from '../services/history.js';
import { getStore } from '../appStore.js';

// Remembered while the app is open, so coming back from Edit keeps your place.
let month = null;
let query = '';

function row(t, category) {
  const signed = formatCents(t.type === 'income' ? t.amountCents : -t.amountCents, { sign: true });
  const name = category?.name ?? 'Unknown';
  return el('li', {},
    el('a', { class: 'list-row list-row-link', href: `#/edit/${t.id}`, 'aria-label': `${name}${t.note ? `, ${t.note}` : ''}, ${signed}. Edit` },
      el('span', { class: 'swatch-label' },
        el('span', { class: 'row-icon', 'aria-hidden': 'true' }, category?.icon ?? '•'),
        el('span', { class: 'list-row-main' },
          el('span', {}, name),
          t.note ? el('span', { class: 'list-row-sub' }, t.note) : null,
        ),
      ),
      el('span', { class: `money ${t.type === 'income' ? 'money-in' : 'money-out'}` }, signed),
    ),
  );
}

function renderList(target, state) {
  clear(target);
  const inMonth = filterTransactions(state.transactions, { month, categories: state.categories });
  const shown = filterTransactions(inMonth, { query, categories: state.categories });
  const { inCents, outCents } = totals(inMonth);
  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const today = todayLocal();

  target.append(el('p', { class: 'history-summary' },
    'Money in ', el('span', { class: 'money money-in' }, formatCents(inCents, { sign: true })),
    ' · Money out ', el('span', { class: 'money money-out' }, formatCents(-outCents)),
  ));

  if (!inMonth.length) {
    target.append(
      el('p', { class: 'lead' }, `No entries in ${formatMonth(month)} yet.`),
      el('a', { class: 'btn btn-primary', href: '#/add' }, '＋ Add your first one'),
    );
    return;
  }
  if (!shown.length) {
    target.append(el('p', { class: 'lead' }, `Nothing matches “${query.trim()}” in ${formatMonth(month)}.`));
    return;
  }
  for (const group of groupByDay(shown)) {
    target.append(el('section', { class: 'section day-group' },
      el('h2', { class: 'day-heading' }, formatDay(group.date, today)),
      el('ul', { class: 'list' }, group.items.map((t) => row(t, byId.get(t.categoryId)))),
    ));
  }
}

function historyScreen(store) {
  month ??= monthKey(todayLocal());
  const listSlot = el('div', { class: 'section', 'aria-live': 'polite' });
  const monthLabel = el('h2', { class: 'month-label', id: 'month-label' }, formatMonth(month));
  const search = el('input', { class: 'input', id: 'history-search', type: 'search', autocomplete: 'off', placeholder: 'Coffee, Groceries…', value: query || null });

  const refresh = () => {
    monthLabel.textContent = formatMonth(month);
    renderList(listSlot, store.getState());
  };
  const step = (n) => () => { month = shiftMonth(month, n); refresh(); };

  search.addEventListener('input', () => { query = search.value; refresh(); });

  const root = el('div', { class: 'section' },
    el('div', { class: 'month-switcher' },
      el('button', { class: 'btn btn-secondary', type: 'button', id: 'prev-month', 'aria-label': 'Previous month' }, '‹'),
      monthLabel,
      el('button', { class: 'btn btn-secondary', type: 'button', id: 'next-month', 'aria-label': 'Next month' }, '›'),
    ),
    el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'history-search' }, 'Search notes and categories'), search),
    listSlot,
  );
  root.querySelector('#prev-month').addEventListener('click', step(-1));
  root.querySelector('#next-month').addEventListener('click', step(1));

  // Stay in sync with changes (e.g. Undo from a toast) while this screen is open.
  const unsubscribe = store.subscribe(() => {
    if (!root.isConnected) return unsubscribe();
    renderList(listSlot, store.getState());
  });
  refresh();
  return root;
}

export function historyView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    clear(body);
    body.append(historyScreen(store));
  }, () => {
    clear(body);
    body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device. Try turning off private browsing, or use Chrome or Safari.'));
  });
  return el('div', { class: 'screen' }, el('h1', { tabindex: '-1' }, 'History'), body);
}
