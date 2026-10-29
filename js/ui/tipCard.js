// A coach tip: what we noticed, the money it could free up, and "Why?" with the math and source.
// With a store, it also asks for feedback (👍 / 👎 / "I'm on it" / "Not now") so the coach learns (E6-S1),
// and shows how an "I'm on it" tip is going this month (E6-S3).
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal } from '../utils/dates.js';
import { showToast } from './toast.js';
import { onItProgress, topicOf } from '../services/insights/learning.js';

const KIND = { 1: 'Compared with typical households', 2: 'Compared with your usual' };
const roundDollars = (cents) => formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, '');
const slug = (tip) => tip.id.replace(/[^a-z0-9-]/gi, '-');

const FEEDBACK = [
  ['up', '👍 Helpful', 'Thanks. You’ll see more tips like this.'],
  ['on-it', 'I’m on it', 'Nice. We’ll check how it went next month.'],
  ['not-now', 'Not now', 'Hidden until next month.'],
  ['down', '👎 Not for me', 'Got it. You’ll see fewer tips like this.'],
];

function feedbackRow(store, tip) {
  const row = el('div', { class: 'button-row tip-feedback', role: 'group', 'aria-label': 'Was this tip useful?' },
    FEEDBACK.filter(([reaction]) => !(reaction === 'on-it' && tip.type === 'spike')).map(([reaction, label, thanks]) => {
      const button = el('button', { class: 'btn btn-quiet', type: 'button', id: `fb-${reaction}-${slug(tip)}`, 'aria-pressed': String(tip.reaction === reaction) }, label);
      button.addEventListener('click', async () => {
        for (const b of row.querySelectorAll('button')) b.disabled = true;
        const result = await store.setTipReaction(tip, reaction);
        if (!result.ok) {
          for (const b of row.querySelectorAll('button')) b.disabled = false;
          return showToast({ message: result.errors.form });
        }
        showToast({ message: thanks, action: { label: 'Undo', run: async () => { await result.undo(); return 'Undone'; } } });
      });
      return button;
    }));
  return row;
}

function onItLine(store, tip) {
  const entry = store.getState().feedback.find((f) => f.topic === topicOf(tip) && f.reaction === 'on-it' && f.month === tip.feedbackMonth);
  if (!entry?.categoryIds.length || !entry.baselineCents) return null;
  const p = onItProgress(entry, store.getState().transactions, todayLocal());
  return el('p', { class: 'field-hint', id: `onit-${slug(tip)}` }, p.leftCents >= 0
    ? `So far this month: ${formatCents(p.spentCents)}, against your usual ${formatCents(p.baselineCents)}. ${formatCents(p.leftCents)} to go.`
    : `So far this month: ${formatCents(p.spentCents)}, ${formatCents(-p.leftCents)} over your usual ${formatCents(p.baselineCents)}.`);
}

export function tipCard(tip, store = null) {
  const onIt = tip.reaction === 'on-it';
  return el('article', { class: 'card tip', id: `tip-${slug(tip)}` },
    el('div', { class: 'tip-pills' },
      onIt ? el('span', { class: 'pill pill-good' }, '✓ You’re on it') : el('span', { class: 'pill pill-warning' }, '⚠ Worth a look'),
      tip.estimatedMonthlySavingsCents >= 100 ? el('span', { class: 'pill pill-good tip-value' }, `About ${roundDollars(tip.estimatedMonthlySavingsCents)} a month`) : null,
    ),
    el('h3', {}, tip.title),
    el('p', {}, tip.message),
    store && onIt ? onItLine(store, tip) : null,
    el('details', { class: 'why' },
      el('summary', {}, 'Why am I seeing this?'),
      el('ul', { class: 'math' }, tip.why.lines.map(([label, value]) => el('li', { class: 'math-line' },
        el('span', {}, label),
        el('span', { class: 'money' }, typeof value === 'number' ? formatCents(value) : value),
      ))),
      tip.why.note ? el('p', { class: 'field-hint' }, tip.why.note) : null,
      el('p', { class: 'field-hint' }, `${KIND[tip.level] ?? ''}. Source: ${tip.why.source}.`),
      tip.weight && tip.weight !== 1 ? el('p', { class: 'field-hint' }, `Ranked ${tip.weight > 1 ? 'higher' : 'lower'} because of your feedback on tips like this.`) : null,
    ),
    store ? feedbackRow(store, tip) : null,
  );
}

// Last month's "I'm on it" results (E6-S3).
export function resultCard(r) {
  return el('article', { class: 'card', id: `onit-result-${r.id}` },
    r.worked ? el('span', { class: 'pill pill-good' }, '🎉 It worked') : el('span', { class: 'pill pill-warning' }, 'Close'),
    el('p', {}, r.worked
      ? `You cut ${r.label} by ${formatCents(r.savedCents)} last month: ${formatCents(r.spentCents)} against your usual ${formatCents(r.baselineCents)}. Nice work!`
      : `${r.label} came to ${formatCents(r.spentCents)} last month, against your usual ${formatCents(r.baselineCents)}. Want to try again this month?`),
  );
}

export const disclaimer = () => el('p', { class: 'field-hint' }, 'Tips are general guidance from your own entries and public averages, not financial advice.');
