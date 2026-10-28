// #/design: a living reference of every token and component (not in the tab bar).
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { contrast } from '../utils/contrast.js';
import { choiceGroup } from '../ui/choiceGroup.js';

const COLOR_TOKENS = [
  ['--bg', 'Page background'],
  ['--surface', 'Cards and inputs'],
  ['--surface-sunken', 'Tab bar'],
  ['--text', 'Text'],
  ['--text-muted', 'Secondary text'],
  ['--border', 'Dividers'],
  ['--border-strong', 'Input outlines'],
  ['--accent', 'Accent (teal)'],
  ['--accent-soft', 'Selected background'],
  ['--money-in', 'Money in'],
  ['--good', 'Good'],
  ['--warning', 'Warning'],
  ['--critical', 'Critical'],
];

const TYPE_STEPS = [
  ['--text-hero', 'Hero number'],
  ['--text-2xl', 'Extra large'],
  ['--text-xl', 'Screen title'],
  ['--text-lg', 'Section title'],
  ['--text-md', 'Body'],
  ['--text-sm', 'Small'],
];

function swatches() {
  const styles = getComputedStyle(document.documentElement);
  const bg = styles.getPropertyValue('--bg').trim();
  return el('ul', { class: 'list' },
    COLOR_TOKENS.map(([token, use]) => {
      const value = styles.getPropertyValue(token).trim();
      const chip = el('span', { class: 'swatch', 'aria-hidden': 'true' });
      chip.style.background = `var(${token})`; // CSSOM is allowed by the CSP; style="" attributes are not
      return el('li', { class: 'list-row' },
        el('div', { class: 'swatch-label' }, chip,
          el('div', { class: 'list-row-main' }, el('span', {}, use), el('code', { class: 'list-row-sub' }, `${token} ${value}`))),
        el('span', { class: 'list-row-sub money' }, `${contrast(value, bg).toFixed(1)}:1`),
      );
    }),
  );
}

function typeScale() {
  return el('div', { class: 'section' },
    TYPE_STEPS.map(([token, name]) => {
      const sample = el('p', {}, `${name}: Safe to spend today`);
      sample.style.fontSize = `var(${token})`;
      return sample;
    }),
  );
}

function demoRow(title, detail, cents) {
  return el('li', { class: 'list-row' },
    el('div', { class: 'list-row-main' }, el('span', {}, title), el('span', { class: 'list-row-sub' }, detail)),
    el('span', { class: `money ${cents > 0 ? 'money-in' : 'money-out'}` }, formatCents(cents, { sign: true })),
  );
}

export function designView() {
  return el('div', { class: 'screen' },
    el('h1', { tabindex: '-1' }, 'Design reference'),
    el('p', { class: 'lead' }, 'Every color, size, and component the app uses. Switch text size or theme in More to see them change. Ratios are contrast against the page background.'),

    el('section', { class: 'section' }, el('h2', { class: 'section-title' }, 'Colors'), swatches()),
    el('section', { class: 'section' }, el('h2', { class: 'section-title' }, 'Type scale'), typeScale()),

    el('section', { class: 'section' },
      el('h2', { class: 'section-title' }, 'Hero number'),
      el('div', { class: 'card' },
        el('p', { class: 'field-hint' }, 'Safe to spend today (example)'),
        el('p', { class: 'money money-hero' }, formatCents(4250)),
      ),
    ),

    el('section', { class: 'section' },
      el('h2', { class: 'section-title' }, 'Buttons'),
      el('div', { class: 'button-row' },
        el('button', { class: 'btn btn-primary', type: 'button' }, 'Save'),
        el('button', { class: 'btn btn-secondary', type: 'button' }, 'Edit'),
        el('button', { class: 'btn btn-quiet', type: 'button' }, 'Cancel'),
        el('button', { class: 'btn btn-danger', type: 'button' }, 'Delete'),
        el('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Disabled'),
      ),
    ),

    el('section', { class: 'section' },
      el('h2', { class: 'section-title' }, 'Fields'),
      el('div', { class: 'field' },
        el('label', { class: 'field-label', for: 'demo-amount' }, 'Amount'),
        el('input', { class: 'input input-money', id: 'demo-amount', inputmode: 'decimal', placeholder: '$0.00', 'aria-describedby': 'demo-amount-hint' }),
        el('span', { class: 'field-hint', id: 'demo-amount-hint' }, 'Dollars and cents, like 12.50'),
      ),
      el('div', { class: 'field' },
        el('label', { class: 'field-label', for: 'demo-note' }, 'Note'),
        el('input', { class: 'input', id: 'demo-note', value: 'x'.repeat(210), 'aria-invalid': 'true', 'aria-describedby': 'demo-note-error' }),
        el('span', { class: 'field-error', id: 'demo-note-error' }, 'Notes can be up to 200 characters. Shorten it by 10.'),
      ),
      choiceGroup({ name: 'demoType', legend: 'Type', options: [['out', 'Money out'], ['in', 'Money in']], value: 'out', onChange: () => {} }),
    ),

    el('section', { class: 'section' },
      el('h2', { class: 'section-title' }, 'List with money'),
      el('ul', { class: 'list' },
        demoRow('Paycheck', 'Paycheck · Oct 24', 185000),
        demoRow('Groceries', 'Groceries · Oct 26', -8642),
        demoRow('Coffee', 'Dining Out · Today', -475),
      ),
    ),

    el('section', { class: 'section' },
      el('h2', { class: 'section-title' }, 'Status'),
      el('div', { class: 'button-row' },
        el('span', { class: 'pill pill-good' }, '✓ On track'),
        el('span', { class: 'pill pill-warning' }, '⚠ Running high'),
        el('span', { class: 'pill pill-critical' }, '✕ Over guideline'),
      ),
    ),

    el('section', { class: 'section' },
      el('h2', { class: 'section-title' }, 'Card (tip)'),
      el('article', { class: 'card' },
        el('span', { class: 'pill pill-warning' }, '⚠ Running high'),
        el('h3', {}, 'Dining Out is above the usual guideline'),
        el('p', {}, 'At this pace you’ll spend $410 this month. Getting to $300 would put $110 toward your emergency fund.'),
        el('div', { class: 'button-row' },
          el('button', { class: 'btn btn-primary', type: 'button' }, 'I’m on it'),
          el('button', { class: 'btn btn-quiet', type: 'button' }, 'Why?'),
        ),
      ),
    ),
  );
}
