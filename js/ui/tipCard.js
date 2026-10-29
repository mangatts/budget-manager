// A coach tip: what we noticed, the money it could free up, and "Why?" with the math and source.
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';

const KIND = { 1: 'Compared with typical households', 2: 'Compared with your usual' };

export function tipCard(tip) {
  return el('article', { class: 'card tip', id: `tip-${tip.id.replace(/[^a-z0-9-]/gi, '-')}` },
    el('span', { class: 'pill pill-warning' }, '⚠ Worth a look'),
    el('h3', {}, tip.title),
    el('p', {}, tip.message),
    el('details', { class: 'why' },
      el('summary', {}, 'Why am I seeing this?'),
      el('ul', { class: 'math' }, tip.why.lines.map(([label, value]) => el('li', { class: 'math-line' },
        el('span', {}, label),
        el('span', { class: 'money' }, typeof value === 'number' ? formatCents(value) : value),
      ))),
      tip.why.note ? el('p', { class: 'field-hint' }, tip.why.note) : null,
      el('p', { class: 'field-hint' }, `${KIND[tip.level] ?? ''}. Source: ${tip.why.source}.`),
    ),
  );
}

export const disclaimer = () => el('p', { class: 'field-hint' }, 'Tips are general guidance from your own entries and public averages, not financial advice.');
