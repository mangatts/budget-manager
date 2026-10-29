import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { choiceGroup } from '../ui/choiceGroup.js';
import { readAppliedPrefs, savePref, applyPrefs } from '../services/preferences.js';
import { installState, promptInstall, requestPersistence, storageStatus } from '../services/pwa.js';
import { getStore } from '../appStore.js';
import { lastBackupText } from './backup.js';
import { backupReminder } from '../ui/backupReminder.js';

const COMING_SOON = [
  ['Bank statement import', 'Bring in transactions from a CSV file. Sprint 8.'],
];

const linkRow = (href, title, detail, id) => el('li', {},
  el('a', { class: 'list-row list-row-link', href, id },
    el('span', { class: 'list-row-main' }, el('span', {}, title), el('span', { class: 'list-row-sub' }, detail)),
    el('span', { 'aria-hidden': 'true' }, '\u203a'),
  ),
);

function installSection() {
  const body = el('div', { class: 'section', id: 'install-body' });
  // `result` overrides the browser check right after the install prompt: a normal tab still
  // reports "not standalone" after installing, so trust what the person chose.
  const render = (result = null) => {
    clear(body);
    const state = result === 'accepted' ? 'installed' : installState();
    if (result === 'dismissed') {
      body.append(el('p', { class: 'lead' }, 'No problem. You can install it any time from your browser\u2019s menu (\u201cInstall\u201d or \u201cAdd to Home Screen\u201d).'));
    } else if (state === 'installed') {
      body.append(el('p', {}, el('span', { class: 'pill pill-good' }, '\u2713 Installed'), ' You\u2019re using the app version.'));
    } else if (state === 'prompt') {
      const button = el('button', { class: 'btn btn-primary', type: 'button', id: 'install-button' }, 'Install Budget Manager');
      button.addEventListener('click', async () => render((await promptInstall()) ? 'accepted' : 'dismissed'));
      body.append(el('p', { class: 'lead' }, 'Open it from your home screen like any app. It works without internet, and it protects your data from automatic cleanup.'), button);
    } else if (state === 'ios') {
      body.append(
        el('p', { class: 'lead' }, 'On iPhone and iPad, install it from Safari. This also stops Safari from clearing your data after 7 days without a visit.'),
        el('ol', { class: 'steps' },
          el('li', {}, 'Tap the ', el('strong', {}, 'Share'), ' button (the square with an arrow).'),
          el('li', {}, 'Scroll down and tap ', el('strong', {}, 'Add to Home Screen'), '.'),
          el('li', {}, 'Tap ', el('strong', {}, 'Add'), '.'),
        ),
      );
    } else {
      body.append(el('p', { class: 'lead' }, 'Use your browser\u2019s menu and choose \u201cInstall\u201d or \u201cAdd to Home Screen\u201d. Installing makes it work without internet and protects your data from automatic cleanup.'));
    }
  };
  render();
  return el('section', { class: 'section', 'aria-labelledby': 'install-title' }, el('h2', { class: 'section-title', id: 'install-title' }, 'Install the app'), body);
}

function backupsSection() {
  const status = el('span', { class: 'list-row-sub', id: 'backup-status' }, 'Encrypted with a passphrase you choose');
  const reminderSlot = el('div', {});
  getStore().then((store) => {
    status.textContent = `Last backup: ${lastBackupText(store.getState().meta.lastBackupAt)} \u00b7 encrypted with your passphrase`;
    const reminder = backupReminder(store.getState());
    if (reminder) reminderSlot.append(reminder);
  }, () => {});
  return el('section', { class: 'section', 'aria-labelledby': 'backups-title' },
    el('h2', { class: 'section-title', id: 'backups-title' }, 'Backups'),
    reminderSlot,
    el('ul', { class: 'list' }, el('li', {},
      el('a', { class: 'list-row list-row-link', href: '#/backup' },
        el('span', { class: 'list-row-main' }, el('span', {}, 'Save or restore a backup'), status),
        el('span', { 'aria-hidden': 'true' }, '\u203a'),
      ),
    )),
  );
}

function formatBytes(bytes) {
  if (bytes == null) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function storageSection() {
  const status = el('div', { class: 'section', id: 'storage-status' }, el('p', { class: 'lead' }, 'Checking\u2026'));
  Promise.all([storageStatus(), getStore().catch(() => null)]).then(async ([info, store]) => {
    const entries = store?.getState().transactions.length ?? 0;
    // Ask again here: browsers often grant it once the app is installed or used regularly.
    const persisted = info.persisted || (entries > 0 && await requestPersistence());
    clear(status);
    status.append(
      persisted
        ? el('p', {}, el('span', { class: 'pill pill-good' }, '\u2713 Protected'), ' Your browser won\u2019t clean up this data automatically.')
        : el('p', {}, el('span', { class: 'pill pill-warning' }, '\u26a0 Not protected yet'), ' Install the app to protect it, and keep a backup.'),
      el('p', { class: 'field-hint' }, `${entries} ${entries === 1 ? 'entry' : 'entries'}${formatBytes(info.usage) ? ` \u00b7 ${formatBytes(info.usage)} used` : ''} \u00b7 stored only on this device`),
    );
  });
  return el('section', { class: 'section', 'aria-labelledby': 'storage-title' }, el('h2', { class: 'section-title', id: 'storage-title' }, 'Your data'), status);
}

export function moreView() {
  let prefs = readAppliedPrefs();
  const update = (name) => (value) => {
    prefs = savePref(name, value, prefs);
    applyPrefs(prefs);
  };

  return el('div', { class: 'screen' },
    el('h1', { tabindex: '-1' }, 'More'),

    el('section', { class: 'section', 'aria-labelledby': 'display-title' },
      el('h2', { class: 'section-title', id: 'display-title' }, 'Display'),
      choiceGroup({
        name: 'textSize',
        legend: 'Text size',
        options: [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']],
        value: prefs.textSize,
        onChange: update('textSize'),
      }),
      choiceGroup({
        name: 'theme',
        legend: 'Theme',
        options: [['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']],
        value: prefs.theme,
        onChange: update('theme'),
      }),
      el('div', { class: 'card', 'aria-label': 'Preview' },
        el('p', { class: 'field-hint' }, 'Preview'),
        el('div', { class: 'list-row' },
          el('div', { class: 'list-row-main' }, el('span', {}, 'Coffee'), el('span', { class: 'list-row-sub' }, 'Dining Out · Today')),
          el('span', { class: 'money money-out' }, formatCents(-475)),
        ),
      ),
    ),

    el('section', { class: 'section', 'aria-labelledby': 'money-title' },
      el('h2', { class: 'section-title', id: 'money-title' }, 'Your money'),
      el('ul', { class: 'list' },
        linkRow('#/profile', 'Pay, savings, and 401(k)', 'Makes your numbers more accurate', 'profile-link'),
        linkRow('#/bills', 'Bills', 'Rent, phone, subscriptions', 'bills-link'),
        linkRow('#/debts', 'Debts', 'Credit cards and loans', 'debts-link'),
        linkRow('#/goals', 'Goals', 'What you’re saving for', 'goals-link'),
        linkRow('#/whatif', 'What if…', 'See how small changes add up', 'whatif-link'),
      ),
    ),
    backupsSection(),
    el('section', { class: 'section', 'aria-labelledby': 'cats-title' },
      el('h2', { class: 'section-title', id: 'cats-title' }, 'Categories'),
      el('ul', { class: 'list' }, linkRow('#/categories', 'Manage categories', 'Rename, add, hide, or delete', 'manage-categories')),
    ),
    installSection(),
    storageSection(),
    el('section', { class: 'section', 'aria-labelledby': 'danger-title' },
      el('h2', { class: 'section-title', id: 'danger-title' }, 'Start over'),
      el('ul', { class: 'list' }, linkRow('#/wipe', 'Delete everything on this device', 'Offers a backup first', 'wipe-link')),
    ),

    el('section', { class: 'section', 'aria-labelledby': 'soon-title' },
      el('h2', { class: 'section-title', id: 'soon-title' }, 'Coming soon'),
      el('ul', { class: 'list' },
        COMING_SOON.map(([title, detail]) => el('li', { class: 'list-row' },
          el('div', { class: 'list-row-main' }, el('span', {}, title), el('span', { class: 'list-row-sub' }, detail)),
        )),
      ),
    ),
  );
}
