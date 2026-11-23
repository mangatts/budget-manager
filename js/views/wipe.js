// More → Delete everything on this device (every person). Offers a backup first; needs "DELETE" typed to confirm.
import { el, clear } from '../utils/dom.js';
import { getStore, getPeople } from '../appStore.js';
import { PREFS_KEY } from '../services/preferences.js';
import { confirmDeleteForm } from '../ui/form.js';

// Deletes every person's database (which also removes data left from the earlier version) and the
// people list, then settings and reminders. App files stay cached, so it still works offline.
// Deleting whole databases (not emptying them) means a retry after a partial failure still works.
export async function wipeDevice(people) {
  try {
    await people.removeEveryone();
  } catch {
    return { ok: false, errors: { form: 'Some people’s data couldn’t be deleted. Close other Budget Manager tabs, then try again.' } };
  }
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('bm:') || key === PREFS_KEY) localStorage.removeItem(key);
  } catch { /* storage blocked: nothing saved there anyway */ }
  return { ok: true };
}

export function wipeView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  Promise.all([getStore(), getPeople()]).then(([store, people]) => {
    const { cards, checkins } = store.getState();
    const count = people.list().length;
    const what = count > 1
      ? `This permanently removes everyone’s data from this device: all ${count} people, with their cards, check-ins, income, expenses, and settings. It can’t be undone.`
      : `This permanently removes your ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}, ${checkins.length} ${checkins.length === 1 ? 'check-in' : 'check-ins'}, income, expenses, and settings from this device. It can’t be undone.`;
    const form = confirmDeleteForm({
      id: 'wipe',
      buttonLabel: 'Delete everything',
      content: [
        el('p', { id: 'wipe-what' }, what),
        el('div', { class: 'card warning-card' },
          el('span', { class: 'pill pill-warning' }, '⚠ Back up first?'),
          el('p', {}, count > 1 ? 'A backup saves one person. Switch to each person you want to keep and make a backup for them.' : 'A backup lets you bring everything back later, here or on another phone.'),
          el('a', { class: 'btn btn-secondary', href: '#/backup' }, 'Make a backup'),
        ),
      ],
      async onConfirm() {
        const result = await wipeDevice(people);
        if (result.ok) {
          location.hash = '#/home';
          location.reload();
        }
        return result;
      },
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
