import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { choiceGroup } from '../ui/choiceGroup.js';
import { loadPrefs, savePref, applyPrefs } from '../services/preferences.js';

const COMING_SOON = [
  ['Backups', 'Save an encrypted copy of your data. Sprint 2.'],
  ['Categories', 'Rename, add, or hide categories. Sprint 2.'],
  ['Bank statement import', 'Bring in transactions from a CSV file. Sprint 8.'],
];

export function moreView() {
  const prefs = loadPrefs();
  const update = (name) => (value) => applyPrefs(savePref(name, value));

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
