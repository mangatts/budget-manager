// Needs / Wants / Savings meters vs. the 50/30/20 guideline (dataviz: meter form, one accent,
// status shown by color + ⚠ + words, guideline as a marker, table view for screen readers).
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { fiftyThirtyTwenty, MIN_ENTRIES } from '../services/insights/split.js';

const STATUS_TEXT = { high: '⚠ Above guideline', low: '⚠ Below guideline', ok: '✓ Within guideline' };
const INCOME_TEXT = { recorded: 'money in this month', 'take-home': 'your take-home pay', estimated: 'your usual monthly income (estimated)' };

function meter(group, incomeCents) {
  const fill = el('span', { class: `meter-fill meter-${group.status === 'ok' ? 'ok' : 'warn'}` });
  fill.style.width = `${Math.min(group.percent, 100)}%`; // CSSOM: allowed by our CSP (style="" isn't)
  const marker = el('span', { class: 'meter-marker', 'aria-hidden': 'true' });
  marker.style.left = `${group.guideline}%`;
  const tip = el('span', { class: 'meter-tip', role: 'tooltip', id: `tip-${group.key}` },
    `${formatCents(group.cents)} of ${formatCents(incomeCents)} income`);

  return el('li', { class: 'meter', id: `meter-${group.key}`, tabindex: '0', 'aria-describedby': `tip-${group.key}` },
    el('div', { class: 'meter-head' },
      el('span', { class: 'meter-label' }, group.label),
      el('span', { class: 'meter-value' }, `${group.percent}%`, el('span', { class: 'meter-guide' }, ` · guideline ${group.guideline}%`)),
    ),
    el('span', { class: `meter-track${group.status === 'ok' ? '' : ' meter-track-warn'}`, 'aria-hidden': 'true' }, fill, marker),
    el('span', { class: `meter-status ${group.status === 'ok' ? 'meter-status-ok' : 'meter-status-warn'}` }, STATUS_TEXT[group.status]),
    tip,
  );
}

export function splitChart(state, month) {
  const split = fiftyThirtyTwenty(state, month);
  const title = el('h2', { class: 'section-title', id: 'split-title' }, 'Needs, wants, savings');
  if (!split.available) {
    const why = split.reason === 'no-income'
      ? 'Add your take-home pay to see how your spending splits between needs, wants, and savings.'
      : `This appears after ${MIN_ENTRIES} entries in a month (${split.entries} so far), so it reflects your habits, not just timing.`;
    return el('section', { class: 'section', id: 'split', 'aria-labelledby': 'split-title' }, title, el('p', { class: 'field-hint', id: 'split-empty' }, why));
  }

  const table = el('table', { class: 'data-table', id: 'split-table' },
    el('caption', {}, `Share of ${INCOME_TEXT[split.incomeSource]} (${formatCents(split.incomeCents)})`),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Group'), el('th', { scope: 'col' }, 'Spent'), el('th', { scope: 'col' }, 'Share'), el('th', { scope: 'col' }, 'Guideline'))),
    el('tbody', {}, split.groups.map((g) => el('tr', {},
      el('th', { scope: 'row' }, g.label), el('td', {}, formatCents(g.cents)), el('td', {}, `${g.percent}%`), el('td', {}, `${g.guideline}%`),
    ))),
  );

  return el('section', { class: 'card', id: 'split', 'aria-labelledby': 'split-title' },
    title,
    el('p', { id: 'split-headline' }, split.headline),
    el('ul', { class: 'meters', 'aria-label': 'Share of income by group' }, split.groups.map((g) => meter(g, split.incomeCents))),
    el('p', { class: 'field-hint' }, `Share of ${INCOME_TEXT[split.incomeSource]}. The line on each bar marks the guideline.`),
    el('details', { class: 'why' },
      el('summary', {}, 'Show as a table'),
      el('div', { class: 'table-scroll', tabindex: '0', 'aria-label': 'Table, scrolls sideways if needed' }, table),
    ),
    el('details', { class: 'why' },
      el('summary', {}, 'Why 50/30/20?'),
      el('p', {}, 'A common rule of thumb: about half of take-home pay for needs, 30% for wants, and 20% for savings or extra debt payoff. Each category’s group is set in More → Categories. Savings counts money you’ve recorded in savings categories.'),
      el('p', { class: 'field-hint' }, 'Source: Elizabeth Warren and Amelia Warren Tyagi, All Your Worth (2005). General guidance, not financial advice.'),
    ),
  );
}
