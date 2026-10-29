import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { choiceGroup } from '../ui/choiceGroup.js';
import { readAppliedPrefs, savePref, applyPrefs } from '../services/preferences.js';
import { installState, promptInstall, requestPersistence, storageStatus } from '../services/pwa.js';
import { getStore } from '../appStore.js';

const COMING_SOON = [
  ['Backups', 'Save an encrypted copy of your data. Coming next.'],
  ['Categories', 'Rename, add, or hide categories. Coming soon.'],
  ['Bank statement import', 'Bring in transactions from a CSV file. Sprint 8.'],
];

function installSection() {
  const body = el('div', { class: 'section', id: 'install-body' });
  const render = () => {
    clear(body);
    const state = installState();
    if (state === 'installed') {
      body.append(el('p', {}, el('span', { class: 'pill pill-good' }, '\u2713 Installed'), ' You\u2019re using the app version.'));
    } else if (state === 'prompt') {
      const button = el('button', { class: 'btn btn-primary', type: 'button', id: 'install-button' }, 'Install Budget Manager');
      button.addEventListener('click', async () => { await promptInstall(); render(); });
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
        : el('p', {}, el('span', { class: 'pill pill-warning' }, '\u26a0 Not protected yet'), ' Install the app to protect it. Backups (coming next) keep a copy safe too.'),
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

    installSection(),
    storageSection(),

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
