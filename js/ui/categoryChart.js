// "Where your money went": money out by category, biggest first (dataviz: horizontal bars, one hue —
// a single series needs no legend — 4px rounded data-end from one baseline, values as text,
// focus/hover readout, table view).
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { formatMonth } from '../utils/dates.js';
import { spendingByCategory } from '../services/insights/month.js';

export function categoryChart(state, month) {
  const { totalCents, rows } = spendingByCategory(state, month);
  const title = el('h2', { class: 'section-title', id: 'where-title' }, `Where your money went · ${formatMonth(month)}`);
  if (!rows.length) {
    return el('section', { class: 'section', id: 'where', 'aria-labelledby': 'where-title' }, title, el('p', { class: 'field-hint', id: 'where-empty' }, 'No money out recorded this month yet.'));
  }
  // Scale to the largest row: "Everything else" (last) can be bigger than any single category.
  const max = Math.max(...rows.map((r) => r.cents));
  const bars = rows.map((r) => {
    const bar = el('span', { class: 'cat-bar' });
    bar.style.width = `${Math.min(100, Math.max(1, Math.round((r.cents / max) * 100)))}%`; // largest = full width
    return el('li', { class: 'cat-row', id: `cat-${r.id}`, tabindex: '0', 'aria-describedby': `cat-tip-${r.id}` },
      el('div', { class: 'meter-head' },
        el('span', {}, el('span', { 'aria-hidden': 'true' }, `${r.icon} `), r.name),
        el('span', { class: 'money cat-value' }, formatCents(r.cents)),
      ),
      el('span', { class: 'cat-track', 'aria-hidden': 'true' }, bar),
      el('span', { class: 'meter-tip', role: 'tooltip', id: `cat-tip-${r.id}` }, `${Math.round(r.share * 100)}% of ${formatCents(totalCents)} money out`),
    );
  });
  return el('section', { class: 'card', id: 'where', 'aria-labelledby': 'where-title' },
    title,
    el('p', { class: 'field-hint' }, `${formatCents(totalCents)} money out. Biggest categories first; smaller ones grouped at the end.`),
    el('ul', { class: 'meters', 'aria-label': 'Money out by category' }, bars),
    el('details', { class: 'why' },
      el('summary', {}, 'Show as a table'),
      el('div', { class: 'table-scroll', tabindex: '0', 'aria-label': 'Table, scrolls sideways if needed' },
        el('table', { class: 'data-table', id: 'where-table' },
          el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Category'), el('th', { scope: 'col' }, 'Money out'), el('th', { scope: 'col' }, 'Share'))),
          el('tbody', {}, rows.map((r) => el('tr', {}, el('th', { scope: 'row' }, r.name), el('td', {}, formatCents(r.cents)), el('td', {}, `${Math.round(r.share * 100)}%`)))),
        ),
      ),
    ),
  );
}
