// Add money in or out. Fast path: type the amount → tap a category → Save.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, addYears } from '../utils/dates.js';
import { choiceGroup } from '../ui/choiceGroup.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { MIN_DATE } from '../services/validate.js';

const FIELDS = ['type', 'amount', 'categoryId', 'date', 'note'];

// Most-used categories first, so everyday ones are the easiest to reach.
function categoriesFor(type, { categories, transactions }) {
  const uses = new Map();
  for (const t of transactions) uses.set(t.categoryId, (uses.get(t.categoryId) ?? 0) + 1);
  return categories
    .filter((c) => c.type === type && !c.archived)
    .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.order - b.order);
}

const fieldError = (name) => el('span', { class: 'field-error', id: `${name}-error`, hidden: true });

function categoryPicker(categories) {
  return el('fieldset', { class: 'choices category-grid', id: 'categoryId', 'aria-describedby': 'categoryId-error' },
    el('legend', {}, 'Category'),
    categories.map((c) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'categoryId', value: c.id, id: `category-${c.id}` }),
      el('span', {}, el('span', { 'aria-hidden': 'true' }, c.icon), c.name),
    )),
    fieldError('categoryId'),
  );
}

function addForm(store) {
  const today = todayLocal();
  let type = 'expense';

  const amount = el('input', {
    class: 'input input-money', id: 'amount', name: 'amount', inputmode: 'decimal', autocomplete: 'off',
    placeholder: '0.00', 'aria-describedby': 'amount-error',
  });
  const date = el('input', { class: 'input', id: 'date', name: 'date', type: 'date', value: today, min: MIN_DATE, max: addYears(today, 1), 'aria-describedby': 'date-error' });
  const note = el('input', { class: 'input', id: 'note', name: 'note', autocomplete: 'off', placeholder: 'Coffee with Sam', 'aria-describedby': 'note-error' });
  const pickerSlot = el('div', {}, categoryPicker(categoriesFor(type, store.getState())));
  const formError = el('p', { class: 'field-error', id: 'form-error', role: 'alert', hidden: true });

  const typeGroup = choiceGroup({
    name: 'type', legend: 'Type', value: type,
    options: [['expense', 'Money out'], ['income', 'Money in']],
    onChange: (value) => {
      type = value;
      clear(pickerSlot);
      pickerSlot.append(categoryPicker(categoriesFor(type, store.getState())));
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
    el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save'),
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

  const saveButton = form.querySelector('button[type="submit"]');
  let saving = false;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    // A double-tap (or Enter then a tap) must not save the same entry twice.
    if (saving) return;
    saving = true;
    saveButton.disabled = true;
    try {
      await save();
    } finally {
      saving = false;
      saveButton.disabled = false;
    }
  });

  async function save() {
    const input = {
      type,
      amount: amount.value,
      categoryId: form.querySelector('input[name="categoryId"]:checked')?.value,
      date: date.value,
      note: note.value,
    };
    const result = await store.addTransaction(input);
    if (!result.ok) return showErrors(result.errors);

    showErrors({});
    const { record } = result;
    const category = store.getState().categories.find((c) => c.id === record.categoryId);
    const signed = formatCents(record.type === 'income' ? record.amountCents : -record.amountCents, { sign: true });
    showToast({
      message: `Added ${signed} · ${category.name}`,
      action: { label: 'Undo', run: async () => { await result.undo(); return 'Removed'; } },
    });
    // Ready for the next one: keep money in/out and the date, clear the rest.
    amount.value = '';
    note.value = '';
    clear(pickerSlot);
    pickerSlot.append(categoryPicker(categoriesFor(type, store.getState())));
    amount.focus();
  }

  return { form, amount };
}

export function addView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const { form, amount } = addForm(store);
    clear(body);
    body.append(form);
    // Open the keypad right away, unless the person has already moved focus elsewhere.
    if (!document.activeElement || document.activeElement === document.body || document.activeElement.tagName === 'H1') amount.focus();
  }).catch(() => {
    clear(body);
    body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device. Try turning off private browsing, or use Chrome or Safari.'));
  });
  return el('div', { class: 'screen' }, el('h1', { tabindex: '-1' }, 'Add'), body);
}
