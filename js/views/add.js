// Add or edit money in/out. Fast path to add: type the amount → tap a category → Save.
// Editing uses the same form, prefilled, with "Save changes" and "Delete" (both undoable).
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, addYears, monthKey } from '../utils/dates.js';
import { showHistoryMonth } from './history.js';
import { isUuid } from '../utils/id.js';
import { choiceGroup } from '../ui/choiceGroup.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { MIN_DATE } from '../services/validate.js';

const FIELDS = ['type', 'amount', 'categoryId', 'date', 'note'];

// Most-used categories first, so everyday ones are the easiest to reach.
// `keepId` keeps an entry's current category in the list while editing, even if it's been hidden.
function categoriesFor(type, { categories, transactions }, keepId = null) {
  const uses = new Map();
  for (const t of transactions) uses.set(t.categoryId, (uses.get(t.categoryId) ?? 0) + 1);
  return categories
    .filter((c) => c.type === type && (!c.archived || c.id === keepId))
    .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.order - b.order);
}

const fieldError = (name) => el('span', { class: 'field-error', id: `${name}-error`, hidden: true });

function categoryPicker(categories, selectedId) {
  return el('fieldset', { class: 'choices category-grid', id: 'categoryId', 'aria-describedby': 'categoryId-error' },
    el('legend', {}, 'Category'),
    categories.map((c) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'categoryId', value: c.id, id: `category-${c.id}`, checked: c.id === selectedId }),
      el('span', {}, el('span', { 'aria-hidden': 'true' }, c.icon), c.name),
    )),
    fieldError('categoryId'),
  );
}

const signedAmount = (record) => formatCents(record.type === 'income' ? record.amountCents : -record.amountCents, { sign: true });
const categoryName = (store, id) => store.getState().categories.find((c) => c.id === id)?.name ?? 'Unknown';
const centsToInput = (cents) => (cents / 100).toFixed(2);

function transactionForm(store, record = null) {
  const editing = Boolean(record);
  const today = todayLocal();
  let type = record?.type ?? 'expense';
  const pickerFor = (selectedId) => categoryPicker(categoriesFor(type, store.getState(), record?.categoryId), selectedId);

  const amount = el('input', {
    class: 'input input-money', id: 'amount', name: 'amount', inputmode: 'decimal', autocomplete: 'off',
    placeholder: '0.00', 'aria-describedby': 'amount-error', value: record ? centsToInput(record.amountCents) : null,
  });
  const date = el('input', { class: 'input', id: 'date', name: 'date', type: 'date', value: record?.date ?? today, min: MIN_DATE, max: addYears(today, 1), 'aria-describedby': 'date-error' });
  const note = el('input', { class: 'input', id: 'note', name: 'note', autocomplete: 'off', placeholder: 'Coffee with Sam', 'aria-describedby': 'note-error', value: record?.note || null });
  const pickerSlot = el('div', {}, pickerFor(record?.categoryId));
  const formError = el('p', { class: 'field-error', id: 'form-error', role: 'alert', hidden: true });
  const saveButton = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, editing ? 'Save changes' : 'Save');
  const deleteButton = editing ? el('button', { class: 'btn btn-danger btn-block', type: 'button' }, 'Delete') : null;

  const typeGroup = choiceGroup({
    name: 'type', legend: 'Type', value: type,
    options: [['expense', 'Money out'], ['income', 'Money in']],
    onChange: (value) => {
      type = value;
      clear(pickerSlot);
      pickerSlot.append(pickerFor(null));
    },
  });

  const form = el('form', { class: 'section', novalidate: true },
    typeGroup,
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'amount' }, 'Amount'),
      el('div', { class: 'money-field' }, el('span', { 'aria-hidden': 'true' }, '$'), amount),
      fieldError('amount'),
    ),
    pickerSlot,
    el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'date' }, 'Date'), date, fieldError('date')),
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'note' }, 'Note ', el('span', { class: 'field-hint' }, '(optional)')),
      note, fieldError('note'),
    ),
    formError,
    saveButton,
    deleteButton,
  );

  function showErrors(errors) {
    for (const name of FIELDS) {
      const message = errors[name];
      const errorEl = form.querySelector(`#${name}-error`);
      const control = form.querySelector(`#${name}`);
      if (errorEl) { errorEl.textContent = message ?? ''; errorEl.hidden = !message; }
      if (control) { if (message) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid'); }
    }
    formError.textContent = errors.form ?? '';
    formError.hidden = !errors.form;
    const first = FIELDS.find((name) => errors[name]);
    if (first === 'categoryId') form.querySelector('input[name="categoryId"]')?.focus();
    else if (first) form.querySelector(`#${first}`)?.focus();
  }

  // One action at a time: a double-tap (or Enter then a tap) must not save or delete twice.
  let busy = false;
  async function once(action) {
    if (busy) return;
    busy = true;
    saveButton.disabled = true;
    if (deleteButton) deleteButton.disabled = true;
    try {
      await action();
    } finally {
      busy = false;
      saveButton.disabled = false;
      if (deleteButton) deleteButton.disabled = false;
    }
  }

  async function save() {
    const input = {
      type,
      amount: amount.value,
      categoryId: form.querySelector('input[name="categoryId"]:checked')?.value,
      date: date.value,
      note: note.value,
    };
    const result = editing ? await store.updateTransaction(record.id, input) : await store.addTransaction(input);
    if (!result.ok) return showErrors(result.errors);
    showErrors({});

    if (editing) {
      showHistoryMonth(monthKey(result.record.date));
      showToast({ message: 'Saved changes', action: { label: 'Undo', run: async () => { await result.undo(); return 'Changes undone'; } } });
      location.hash = '#/history';
      return;
    }
    showToast({
      message: `Added ${signedAmount(result.record)} · ${categoryName(store, result.record.categoryId)}`,
      action: { label: 'Undo', run: async () => { await result.undo(); return 'Removed'; } },
    });
    // Ready for the next one: keep money in/out and the date, clear the rest.
    amount.value = '';
    note.value = '';
    clear(pickerSlot);
    pickerSlot.append(pickerFor(null));
    amount.focus();
  }

  async function remove() {
    const result = await store.deleteTransaction(record.id);
    if (!result.ok) return showErrors(result.errors);
    showToast({
      message: `Deleted ${signedAmount(record)} · ${categoryName(store, record.categoryId)}`,
      action: { label: 'Undo', run: async () => { await result.undo(); return 'Restored'; } },
    });
    location.hash = '#/history';
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    once(save);
  });
  deleteButton?.addEventListener('click', () => once(remove));

  return { form, amount };
}

const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device. Try turning off private browsing, or use Chrome or Safari.');

export function addView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const { form, amount } = transactionForm(store);
    clear(body);
    body.append(form);
    // Open the keypad right away, unless the person has already moved focus elsewhere.
    if (!document.activeElement || document.activeElement === document.body || document.activeElement.tagName === 'H1') amount.focus();
  }, () => {
    clear(body);
    body.append(storageError());
  });
  return el('div', { class: 'screen' }, el('h1', { tabindex: '-1' }, 'Add'), body);
}

export function editView(id) {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const record = isUuid(id) ? store.getState().transactions.find((t) => t.id === id) : null;
    clear(body);
    if (!record) {
      body.append(
        el('p', { class: 'lead' }, 'This entry no longer exists. It may have been deleted.'),
        el('a', { class: 'btn btn-secondary', href: '#/history' }, 'Back to History'),
      );
      return;
    }
    body.append(transactionForm(store, record).form);
  }, () => {
    clear(body);
    body.append(storageError());
  });
  return el('div', { class: 'screen' },
    el('a', { class: 'btn btn-quiet back-link', href: '#/history' }, '‹ History'),
    el('h1', { tabindex: '-1' }, 'Edit'),
    body,
  );
}
