// More → Categories: see, rename, add, hide, or delete categories.
import { el, clear } from '../utils/dom.js';
import { choiceGroup } from '../ui/choiceGroup.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { CATEGORY_ICONS } from '../services/validate.js';

const BUCKET_OPTIONS = [
  ['need', 'Need'],
  ['want', 'Want'],
  ['savings', 'Savings'],
];
const BUCKET_HELP = 'Needs are must-pays like rent and groceries. Wants are nice-to-haves like dining out. Savings is money set aside or extra debt payoff. The coach uses this to compare you with the 50/30/20 guideline.';

const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device. Try turning off private browsing, or use Chrome or Safari.');
const back = (href, label) => el('a', { class: 'btn btn-quiet back-link', href }, `‹ ${label}`);

function categoryRow(category, uses) {
  return el('li', {},
    el('a', { class: 'list-row list-row-link', href: `#/category/${category.id}` },
      el('span', { class: 'swatch-label' },
        el('span', { class: 'row-icon', 'aria-hidden': 'true' }, category.icon),
        el('span', { class: 'list-row-main' },
          el('span', {}, category.name),
          el('span', { class: 'list-row-sub' }, `${uses} ${uses === 1 ? 'entry' : 'entries'}`),
        ),
      ),
      category.archived ? el('span', { class: 'pill pill-warning' }, 'Hidden') : el('span', { 'aria-hidden': 'true' }, '›'),
    ),
  );
}

export function categoriesView() {
  const body = el('div', { class: 'screen' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const render = () => {
      const { categories } = store.getState();
      clear(body);
      body.append(el('a', { class: 'btn btn-primary btn-block', href: '#/category/new', id: 'add-category' }, '＋ Add a category'));
      for (const [type, title] of [['expense', 'Money out'], ['income', 'Money in']]) {
        body.append(el('section', { class: 'section', 'aria-labelledby': `cat-${type}` },
          el('h2', { class: 'section-title', id: `cat-${type}` }, title),
          el('ul', { class: 'list' }, categories.filter((c) => c.type === type).map((c) => categoryRow(c, store.usedBy(c.id)))),
        ));
      }
    };
    render();
    // Stay in sync with changes (e.g. Undo from a toast) while this screen is open.
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(); });
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/more', 'More'), el('h1', { tabindex: '-1' }, 'Categories'), body);
}

function categoryForm(store, category) {
  const editing = Boolean(category);
  const uses = editing ? store.usedBy(category.id) : 0;
  let type = category?.type ?? 'expense';
  let bucket = category?.bucket ?? 'want';
  let icon = category?.icon ?? CATEGORY_ICONS[0];

  const name = el('input', { class: 'input', id: 'category-name', autocomplete: 'off', value: category?.name ?? null, 'aria-describedby': 'category-name-error' });
  const nameError = el('span', { class: 'field-error', id: 'category-name-error', hidden: true });
  const formError = el('p', { class: 'field-error', role: 'alert', hidden: true });
  const bucketSlot = el('div', {});

  const iconPicker = el('fieldset', { class: 'choices icon-grid', id: 'category-icon' },
    el('legend', {}, 'Icon'),
    CATEGORY_ICONS.map((i, n) => el('label', { class: 'choice' },
      el('input', { type: 'radio', name: 'icon', value: i, id: `icon-${n}`, checked: i === icon, 'aria-label': `Icon ${n + 1}: ${i}` }),
      el('span', { 'aria-hidden': 'true' }, i),
    )),
  );
  iconPicker.addEventListener('change', (e) => { icon = e.target.value; });

  const showBucket = () => {
    clear(bucketSlot);
    if (type !== 'expense') return;
    bucketSlot.append(
      choiceGroup({ name: 'bucket', legend: 'Kind of spending', options: BUCKET_OPTIONS, value: bucket, onChange: (v) => { bucket = v; } }),
      el('p', { class: 'field-hint' }, BUCKET_HELP),
    );
  };
  showBucket();

  const typeControl = editing && uses
    ? el('p', { class: 'field-hint' }, `${type === 'income' ? 'Money in' : 'Money out'} · can’t change because ${uses} ${uses === 1 ? 'entry uses' : 'entries use'} it`)
    : choiceGroup({ name: 'category-type', legend: 'Type', value: type, options: [['expense', 'Money out'], ['income', 'Money in']], onChange: (v) => { type = v; showBucket(); } });

  const saveButton = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, editing ? 'Save changes' : 'Add category');
  const hideButton = editing ? el('button', { class: 'btn btn-secondary btn-block', type: 'button', id: 'toggle-hidden' }, category.archived ? 'Show it again' : 'Hide it') : null;
  const deleteButton = editing && !uses ? el('button', { class: 'btn btn-danger btn-block', type: 'button', id: 'delete-category' }, 'Delete') : null;

  const form = el('form', { class: 'section', novalidate: true, id: 'category-form' },
    el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'category-name' }, 'Name'), name, nameError),
    typeControl,
    iconPicker,
    bucketSlot,
    formError,
    saveButton,
    hideButton,
    editing && category.archived ? el('p', { class: 'field-hint' }, 'Hidden categories don’t show up when adding, but past entries keep them.') : null,
    deleteButton,
    editing && uses ? el('p', { class: 'field-hint' }, 'Categories with entries can’t be deleted, so your history stays complete. Hide it instead.') : null,
  );

  const done = (result, message) => {
    if (!result.ok) {
      nameError.textContent = result.errors.name ?? '';
      nameError.hidden = !result.errors.name;
      formError.textContent = result.errors.form ?? result.errors.icon ?? result.errors.bucket ?? '';
      formError.hidden = !formError.textContent;
      if (result.errors.name) name.focus();
      return;
    }
    showToast({ message, action: { label: 'Undo', run: async () => { await result.undo(); return 'Undone'; } } });
    location.hash = '#/categories';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = { name: name.value, icon, type, bucket };
    const result = editing ? await store.updateCategory(category.id, input) : await store.addCategory(input);
    done(result, editing ? 'Saved changes' : `Added ${result.record?.name}`);
  });
  hideButton?.addEventListener('click', async () => {
    done(await store.setCategoryHidden(category.id, !category.archived), category.archived ? `${category.name} is back` : `${category.name} is hidden`);
  });
  deleteButton?.addEventListener('click', async () => {
    done(await store.deleteCategory(category.id), `Deleted ${category.name}`);
  });
  return form;
}

export function categoryView(id) {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  const title = el('h1', { tabindex: '-1' }, id === 'new' ? 'Add a category' : 'Edit category');
  getStore().then((store) => {
    clear(body);
    if (id === 'new') return body.append(categoryForm(store, null));
    const category = store.getState().categories.find((c) => c.id === id);
    if (!category) {
      body.append(el('p', { class: 'lead' }, 'This category no longer exists.'), el('a', { class: 'btn btn-secondary', href: '#/categories' }, 'Back to Categories'));
      return;
    }
    body.append(categoryForm(store, category));
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/categories', 'Categories'), title, body);
}
