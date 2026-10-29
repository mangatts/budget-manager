// More → Delete everything on this device. Offers a backup first; needs "DELETE" typed to confirm.
import { el, clear } from '../utils/dom.js';
import { getStore } from '../appStore.js';
import { PREFS_KEY } from '../services/preferences.js';

const CONFIRM_WORD = 'DELETE';

// Clears entries, categories, settings, and reminders. App files stay cached, so it still works offline.
// On reload the app starts fresh (default categories are added again).
export async function wipeDevice(store) {
  const result = await store.replaceAll({ transactions: [], categories: [], meta: [] });
  if (!result.ok) return result;
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('bm:') || key === PREFS_KEY) localStorage.removeItem(key);
  } catch { /* storage blocked: nothing saved there anyway */ }
  return { ok: true };
}

export function wipeView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const count = store.getState().transactions.length;
    const input = el('input', { class: 'input', id: 'wipe-confirm', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'aria-describedby': 'wipe-hint' });
    const button = el('button', { class: 'btn btn-danger btn-block', type: 'submit', id: 'wipe-button', disabled: true }, 'Delete everything');
    const error = el('p', { class: 'field-error', role: 'alert', hidden: true });
    const form = el('form', { class: 'section', novalidate: true, id: 'wipe-form' },
      el('p', {}, `This permanently removes ${count} ${count === 1 ? 'entry' : 'entries'}, your categories, and your settings from this device. It can’t be undone.`),
      el('div', { class: 'card warning-card' },
        el('span', { class: 'pill pill-warning' }, '⚠ Back up first?'),
        el('p', {}, 'A backup lets you bring everything back later, here or on another phone.'),
        el('a', { class: 'btn btn-secondary', href: '#/backup' }, 'Make a backup'),
      ),
      el('div', { class: 'field' },
        el('label', { class: 'field-label', for: 'wipe-confirm' }, `Type ${CONFIRM_WORD} to confirm`),
        input,
        el('span', { class: 'field-hint', id: 'wipe-hint' }, 'In capital letters'),
      ),
      error,
      button,
    );
    input.addEventListener('input', () => { button.disabled = input.value.trim() !== CONFIRM_WORD; });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (input.value.trim() !== CONFIRM_WORD) return;
      button.disabled = true;
      const result = await wipeDevice(store);
      if (!result.ok) {
        error.textContent = result.errors.form;
        error.hidden = false;
        button.disabled = false;
        return;
      }
      location.hash = '#/home';
      location.reload();
    });
    clear(body);
    body.append(form);
  }, () => { clear(body); body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.')); });
  return el('div', { class: 'screen' },
    el('a', { class: 'btn btn-quiet back-link', href: '#/more' }, '‹ More'),
    el('h1', { tabindex: '-1' }, 'Delete everything'),
    body,
  );
}
