// Tips: the Smart Coach. Where you could cut back, most valuable first, each with its reasons.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey } from '../utils/dates.js';
import { getStore } from '../appStore.js';
import { coachTips, coachStatus, MIN_DAY_FIRST_MONTH } from '../services/insights/engine.js';
import { tipCard, disclaimer } from '../ui/tipCard.js';
import { categoryChart } from '../ui/categoryChart.js';

function render(body, state) {
  clear(body);
  const today = todayLocal();
  body.append(categoryChart(state, monthKey(today)));
  const { tips, reason } = coachStatus(state, today);
  if (!tips.length) {
    const few = reason === 'not-enough';
    body.append(el('div', { class: 'card', id: 'tips-empty' },
      el('h2', { class: 'section-title' }, few ? 'Tips are on the way' : 'Nothing stands out right now'),
      el('p', {}, few
        ? `Tips compare whole months, so they start once you have a full month of spending (or from the ${MIN_DAY_FIRST_MONTH}th of your first month), with at least 10 expenses adding up to $300 or more.`
        : 'Your spending looks close to typical households and to your usual months. Nice work. Check back as you add more.'),
      few ? el('a', { class: 'btn btn-primary', href: '#/add' }, '＋ Add an expense') : null,
    ));
  } else {
    // Tips can overlap (coffee runs are part of Dining Out), so don't add them up: name the biggest.
    const biggest = Math.max(...tips.map((t) => t.estimatedMonthlySavingsCents));
    body.append(
      el('p', { class: 'lead', id: 'tips-summary' }, `${tips.length} ${tips.length === 1 ? 'idea' : 'ideas'}, biggest first.${biggest > 0 ? ` The biggest could free up about ${formatCents(Math.round(biggest / 100) * 100)} a month.` : ''}`),
      el('div', { class: 'section', id: 'tips-list' }, tips.map(tipCard)),
    );
  }
  body.append(disclaimer());
}

export function tipsView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    render(body, store.getState());
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(body, store.getState()); });
  }, () => { clear(body); body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.')); });
  return el('div', { class: 'screen' }, el('h1', { tabindex: '-1' }, 'Tips'), body);
}

// Home shows the top two (never more than three, so it doesn't overwhelm).
export function topTips(state, today, count = 2) {
  const tips = coachTips(state, today).slice(0, count);
  if (!tips.length) return null;
  return el('section', { class: 'section', id: 'home-tips', 'aria-labelledby': 'home-tips-title' },
    el('h2', { class: 'section-title', id: 'home-tips-title' }, 'Where you could cut back'),
    tips.map(tipCard),
    el('a', { class: 'btn btn-quiet', href: '#/tips', id: 'all-tips' }, 'See all tips ›'),
  );
}
