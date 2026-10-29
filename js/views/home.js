import { el } from '../utils/dom.js';
import { getStore } from '../appStore.js';
import { backupReminder } from '../ui/backupReminder.js';

// Temporary Home until the dashboard (Sprint 3): points straight to Add so it's never a dead end.
export function homeView() {
  const reminderSlot = el('div', {});
  getStore().then((store) => {
    const reminder = backupReminder(store.getState());
    if (reminder) reminderSlot.append(reminder);
  }, () => {});
  return el('div', { class: 'screen' },
    el('h1', { tabindex: '-1' }, 'Home'),
    reminderSlot,
    el('p', { class: 'lead' }, 'Your month at a glance is coming in Sprint 3. For now, start by adding what you spend and earn.'),
    el('a', { class: 'btn btn-primary btn-block', href: '#/add' }, '\uff0b Add money in or out'),
  );
}
