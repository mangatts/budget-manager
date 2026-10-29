// More → Debts: credit cards and loans, so Next Best Step knows what you owe and at what rate.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';

const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.');
const back = (href, label) => el('a', { class: 'btn btn-quiet back-link', href }, `‹ ${label}`);
// 2499 → "24.99%", 500 → "5%"
export const formatApr = (bps) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, '')}%`;

export function debtsView() {
  const body = el('div', { class: 'screen' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const render = () => {
      const { debts } = store.getState();
      clear(body);
      body.append(
        el('p', { class: 'lead' }, 'Credit cards and loans you’re paying off. Optional, and it stays on this device. Your next step uses it to tell you which one to pay first.'),
        el('a', { class: 'btn btn-primary btn-block', href: '#/debt/new', id: 'add-debt' }, '＋ Add a debt'),
      );
      if (!debts.length) {
        body.append(el('p', { class: 'field-hint' }, 'No debts added. If you don’t owe anything, you’re all set.'));
        return;
      }
      const total = debts.reduce((sum, d) => sum + d.balanceCents, 0);
      body.append(
        el('ul', { class: 'list', id: 'debt-list' }, debts.map((d) => el('li', {},
          el('a', { class: 'list-row list-row-link', href: `#/debt/${d.id}` },
            el('span', { class: 'list-row-main' },
              el('span', {}, d.name),
              el('span', { class: 'list-row-sub' }, `${formatApr(d.aprBps)} interest${d.minPaymentCents ? ` · ${formatCents(d.minPaymentCents)} a month minimum` : ''}`),
            ),
            el('span', { class: 'money money-out' }, formatCents(-d.balanceCents)),
          ),
        ))),
        el('p', { class: 'field-hint', id: 'debt-total' }, `Total owed: ${formatCents(total)}. Highest interest is listed first.`),
      );
    };
    render();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(); });
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/more', 'More'), el('h1', { tabindex: '-1' }, 'Debts'), body);
}

function debtForm(store, debt) {
  const editing = Boolean(debt);
  const field = (id, label, input, hint) => el('div', { class: 'field' },
    el('label', { class: 'field-label', for: id }, label), input,
    hint ? el('span', { class: 'field-hint' }, hint) : null,
    el('span', { class: 'field-error', id: `${id}-error`, hidden: true }),
  );
  const money = (input) => el('div', { class: 'money-field' }, el('span', { 'aria-hidden': 'true' }, '$'), input);
  const name = el('input', { class: 'input', id: 'debt-name', autocomplete: 'off', placeholder: 'Visa', value: debt?.name ?? null });
  const balance = el('input', { class: 'input input-money', id: 'debt-balance', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: debt ? (debt.balanceCents / 100).toFixed(2) : null });
  const apr = el('input', { class: 'input', id: 'debt-apr', inputmode: 'decimal', autocomplete: 'off', placeholder: '24.99', value: debt ? (debt.aprBps / 100).toFixed(2) : null });
  const min = el('input', { class: 'input input-money', id: 'debt-min', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: debt ? (debt.minPaymentCents / 100).toFixed(2) : null });
  const save = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, editing ? 'Save changes' : 'Add debt');
  const del = editing ? el('button', { class: 'btn btn-danger btn-block', type: 'button', id: 'delete-debt' }, 'Delete') : null;

  const form = el('form', { class: 'section', novalidate: true, id: 'debt-form' },
    field('debt-name', 'Name', name),
    field('debt-balance', 'How much you owe now', money(balance), 'Your latest statement balance is fine.'),
    field('debt-apr', 'Interest rate (APR %)', apr, 'On your statement or in the lender’s app. Use 0 for an interest-free loan.'),
    field('debt-min', 'Minimum monthly payment', money(min), 'Optional.'),
    save,
    del,
  );

  const inputs = [['name', name], ['balance', balance], ['apr', apr], ['minPayment', min]];
  const show = (errors = {}) => {
    for (const [key, input] of inputs) {
      const box = form.querySelector(`#${input.id}-error`);
      box.textContent = errors[key] ?? '';
      box.hidden = !errors[key];
      if (errors[key]) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    inputs.find(([k]) => errors[k])?.[1].focus();
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
    location.hash = '#/debts';
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    once(async () => {
      const input = { name: name.value, balance: balance.value, apr: apr.value, minPayment: min.value };
      const result = editing ? await store.updateDebt(debt.id, input) : await store.addDebt(input);
      finish(result, editing ? 'Saved changes' : `Added ${result.record?.name}`);
    });
  });
  del?.addEventListener('click', () => once(async () => finish(await store.deleteDebt(debt.id), `Deleted ${debt.name}`)));
  return form;
}

export function debtView(id) {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    clear(body);
    if (id === 'new') return body.append(debtForm(store, null));
    const debt = store.getState().debts.find((d) => d.id === id);
    if (!debt) return body.append(el('p', { class: 'lead' }, 'This debt no longer exists.'), el('a', { class: 'btn btn-secondary', href: '#/debts' }, 'Back to Debts'));
    body.append(debtForm(store, debt));
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/debts', 'Debts'), el('h1', { tabindex: '-1' }, id === 'new' ? 'Add a debt' : 'Edit debt'), body);
}
