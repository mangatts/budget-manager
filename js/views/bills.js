// More → Bills: recurring bills (rent, phone, subscriptions) so Safe to Spend can plan for them.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey, formatDay } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { billsForMonth } from '../services/insights/safeToSpend.js';

const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.');
const back = (href, label) => el('a', { class: 'btn btn-quiet back-link', href }, `‹ ${label}`);
const ordinal = (n) => `${n}${({ 1: 'st', 2: 'nd', 3: 'rd', 21: 'st', 22: 'nd', 23: 'rd', 31: 'st' })[n] ?? 'th'}`;

export function billStatusPill({ paid, overdue, dueDate }, today) {
  if (paid) return el('span', { class: 'pill pill-good' }, '✓ Paid');
  if (overdue) return el('span', { class: 'pill pill-warning' }, `⚠ Due ${formatDay(dueDate, today)} · not paid yet`);
  return el('span', { class: 'list-row-sub' }, `Due ${formatDay(dueDate, today)}`);
}

export function billsView() {
  const body = el('div', { class: 'screen' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const render = () => {
      const state = store.getState();
      const today = todayLocal();
      const status = new Map(billsForMonth(state.bills, state.transactions, monthKey(today), today).map((s) => [s.bill.id, s]));
      const byId = new Map(state.categories.map((c) => [c.id, c]));
      clear(body);
      body.append(
        el('p', { class: 'lead' }, 'Bills you pay every month. Safe to Spend sets money aside for them until you add the payment.'),
        el('a', { class: 'btn btn-primary btn-block', href: '#/bill/new', id: 'add-bill' }, '＋ Add a bill'),
      );
      if (!state.bills.length) {
        body.append(el('p', { class: 'field-hint' }, 'No bills yet. Rent, phone, insurance, and streaming are good ones to add.'));
        return;
      }
      body.append(el('ul', { class: 'list', id: 'bill-list' }, state.bills.map((b) => el('li', {},
        el('a', { class: 'list-row list-row-link', href: `#/bill/${b.id}` },
          el('span', { class: 'swatch-label' },
            el('span', { class: 'row-icon', 'aria-hidden': 'true' }, byId.get(b.categoryId)?.icon ?? '•'),
            el('span', { class: 'list-row-main' },
              el('span', {}, b.name),
              b.active && status.get(b.id) ? billStatusPill(status.get(b.id), today) : el('span', { class: 'list-row-sub' }, `Paused · the ${ordinal(b.dayOfMonth)}`),
            ),
          ),
          el('span', { class: 'money money-out' }, formatCents(-b.amountCents)),
        ),
      ))));
      body.append(el('p', { class: 'field-hint' }, 'A bill counts as paid when you add an entry in its category within 10% of its amount.'));
    };
    render();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(); });
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/more', 'More'), el('h1', { tabindex: '-1' }, 'Bills'), body);
}

function billForm(store, bill) {
  const editing = Boolean(bill);
  const field = (id, label, input, hint) => el('div', { class: 'field' },
    el('label', { class: 'field-label', for: id }, label), input,
    hint ? el('span', { class: 'field-hint' }, hint) : null,
    el('span', { class: 'field-error', id: `${id}-error`, hidden: true }),
  );
  const name = el('input', { class: 'input', id: 'bill-name', autocomplete: 'off', placeholder: 'Rent', value: bill?.name ?? null });
  const amount = el('input', { class: 'input input-money', id: 'bill-amount', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: bill ? (bill.amountCents / 100).toFixed(2) : null });
  const day = el('input', { class: 'input', id: 'bill-day', inputmode: 'numeric', autocomplete: 'off', placeholder: '1', value: bill ? String(bill.dayOfMonth) : null });
  const active = el('input', { type: 'checkbox', id: 'bill-active', checked: bill ? bill.active : true });
  const categories = store.getState().categories.filter((c) => c.type === 'expense' && (!c.archived || c.id === bill?.categoryId));
  const category = el('select', { class: 'input', id: 'bill-category' },
    el('option', { value: '' }, 'Choose a category'),
    categories.map((c) => el('option', { value: c.id, selected: c.id === (bill?.categoryId ?? null) }, `${c.icon} ${c.name}`)),
  );
  const save = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, editing ? 'Save changes' : 'Add bill');
  const del = editing ? el('button', { class: 'btn btn-danger btn-block', type: 'button', id: 'delete-bill' }, 'Delete') : null;

  const form = el('form', { class: 'section', novalidate: true, id: 'bill-form' },
    field('bill-name', 'Name', name),
    field('bill-amount', 'Amount each month', el('div', { class: 'money-field' }, el('span', { 'aria-hidden': 'true' }, '$'), amount), 'If it changes a little month to month, use a typical amount.'),
    field('bill-category', 'Category', category, 'Use the category you’ll pick when you add the payment, so it’s marked paid.'),
    field('bill-day', 'Day of the month it’s due', day, '1 to 31. For the 31st, shorter months use their last day.'),
    el('label', { class: 'checkbox', for: 'bill-active' }, active, ' Active (uncheck to pause it)'),
    save,
    del,
  );

  const show = (errors = {}) => {
    for (const [key, input] of [['name', name], ['amount', amount], ['categoryId', category], ['dayOfMonth', day]]) {
      const box = form.querySelector(`#${input.id}-error`);
      box.textContent = errors[key] ?? '';
      box.hidden = !errors[key];
      if (errors[key]) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    const first = [['name', name], ['amount', amount], ['categoryId', category], ['dayOfMonth', day]].find(([k]) => errors[k]);
    first?.[1].focus();
    if (errors.form) showToast({ message: errors.form });
  };

  let busy = false;
  const once = async (action) => {
    if (busy) return;
    busy = true;
    try { await action(); } finally { busy = false; }
  };
  const finish = (result, message) => {
    if (!result.ok) return show(result.errors);
    showToast({ message, action: { label: 'Undo', run: async () => { await result.undo(); return 'Undone'; } } });
    location.hash = '#/bills';
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    once(async () => {
      const input = { name: name.value, amount: amount.value, categoryId: category.value, dayOfMonth: day.value, active: active.checked };
      const result = editing ? await store.updateBill(bill.id, input) : await store.addBill(input);
      finish(result, editing ? 'Saved changes' : `Added ${result.record?.name}`);
    });
  });
  del?.addEventListener('click', () => once(async () => finish(await store.deleteBill(bill.id), `Deleted ${bill.name}`)));
  return form;
}

export function billView(id) {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    clear(body);
    if (id === 'new') return body.append(billForm(store, null));
    const bill = store.getState().bills.find((b) => b.id === id);
    if (!bill) return body.append(el('p', { class: 'lead' }, 'This bill no longer exists.'), el('a', { class: 'btn btn-secondary', href: '#/bills' }, 'Back to Bills'));
    body.append(billForm(store, bill));
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/bills', 'Bills'), el('h1', { tabindex: '-1' }, id === 'new' ? 'Add a bill' : 'Edit bill'), body);
}
