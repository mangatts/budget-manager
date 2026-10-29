// Cut Plan UI: suggestions (Accept / Not this month), active challenges with progress, month-end results.
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { formatMonth } from '../utils/dates.js';
import { showToast } from './toast.js';
import { suggestChallenges, challengeProgress, visibleChallenges } from '../services/insights/cutPlan.js';

const STATUS = {
  'on-track': ['pill-good', '✓ On track'],
  ahead: ['pill-warning', '⚠ Spending ahead of plan'],
  over: ['pill-warning', '⚠ Over the target'],
};

function progressMeter(challenge, p) {
  const fill = el('span', { class: `meter-fill ${p.status === 'on-track' ? 'meter-ok' : 'meter-warn'}` });
  fill.style.width = `${Math.min(100, Math.round((p.spent / challenge.targetCents) * 100))}%`;
  return el('span', { class: `meter-track${p.status === 'on-track' ? '' : ' meter-track-warn'}`, 'aria-hidden': 'true' }, fill);
}

function activeCard(store, challenge, category, today) {
  const p = challengeProgress(challenge, store.getState().transactions, today);
  const [pill, label] = STATUS[p.status];
  const stop = el('button', { class: 'btn btn-quiet', type: 'button' }, 'Stop this challenge');
  stop.addEventListener('click', async () => {
    const result = await store.setChallengeStatus(challenge.id, 'stopped');
    if (result.ok) showToast({ message: 'Challenge stopped', action: { label: 'Undo', run: async () => { await result.undo(); return 'Back on'; } } });
  });
  return el('article', { class: 'card challenge', id: `challenge-${challenge.id}` },
    el('span', { class: `pill ${pill}` }, label),
    el('h3', {}, `${category?.icon ?? ''} ${category?.name ?? 'Category'}: ${formatCents(challenge.targetCents)} this month`),
    el('div', { class: 'meter' },
      el('div', { class: 'meter-head' },
        el('span', {}, `${formatCents(p.spent)} spent`),
        el('span', { class: 'meter-guide' }, p.left >= 0 ? `${formatCents(p.left)} left · ${p.daysLeft} days` : `${formatCents(-p.left)} over`),
      ),
      progressMeter(challenge, p),
    ),
    el('p', { class: 'field-hint' }, `Your usual is ${formatCents(challenge.fromCents)}. Hitting the target frees up ${formatCents(challenge.fromCents - challenge.targetCents)} for savings.`),
    stop,
  );
}

function resultCard(challenge, category, transactions, today) {
  const p = challengeProgress(challenge, transactions, today);
  const name = category?.name ?? 'Category';
  return el('article', { class: 'card challenge', id: `result-${challenge.id}` },
    p.result === 'won'
      ? el('span', { class: 'pill pill-good' }, '🎉 You did it')
      : el('span', { class: 'pill pill-warning' }, 'Close'),
    el('p', {}, p.result === 'won'
      ? `${name} in ${formatMonth(challenge.month)}: ${formatCents(p.spent)}, under your ${formatCents(challenge.targetCents)} target. That’s ${formatCents(p.savedCents)} less than usual. Nice work!`
      : `${name} in ${formatMonth(challenge.month)}: ${formatCents(p.spent)} against a ${formatCents(challenge.targetCents)} target. ${p.savedCents > 0 ? `Still ${formatCents(p.savedCents)} less than usual.` : ''} Want to try again this month?`),
  );
}

function suggestionCard(store, s) {
  const accept = el('button', { class: 'btn btn-primary', type: 'button' }, 'Take the challenge');
  const skip = el('button', { class: 'btn btn-quiet', type: 'button' }, 'Not this month');
  const run = (fn) => async () => { accept.disabled = skip.disabled = true; try { await fn(); } finally { accept.disabled = skip.disabled = false; } };
  accept.addEventListener('click', run(async () => {
    const result = await store.addChallenge(s);
    if (result.ok) showToast({ message: `Challenge on: ${s.name} ${formatCents(s.targetCents)}`, action: { label: 'Undo', run: async () => { await result.undo(); return 'Removed'; } } });
    else showToast({ message: result.errors.form ?? 'Couldn’t start it. Please try again.' });
  }));
  skip.addEventListener('click', run(async () => {
    const result = await store.addChallenge(s);
    if (result.ok) await store.setChallengeStatus(result.record.id, 'skipped');
  }));
  return el('article', { class: 'card challenge', id: `suggest-${s.categoryId}` },
    el('h3', {}, `${s.icon} ${s.name}: ${formatCents(s.fromCents)} → ${formatCents(s.targetCents)}`),
    el('p', {}, `Your usual month is ${formatCents(s.fromCents)}. Bringing it to ${formatCents(s.targetCents)} this month frees up ${formatCents(s.savingsCents)} for savings. It’s a 10–25% step down, based on your own months.`),
    el('div', { class: 'button-row' }, accept, skip),
  );
}

// Full Cut Plan section (Tips screen).
export function cutPlanSection(store, today) {
  const state = store.getState();
  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const { current, results } = visibleChallenges(state, today);
  const suggestions = current.length >= 2 ? [] : suggestChallenges(state, today, 2 - current.length);
  if (!current.length && !results.length && !suggestions.length) return null;
  return el('section', { class: 'section', id: 'cut-plan', 'aria-labelledby': 'cut-plan-title' },
    el('h2', { class: 'section-title', id: 'cut-plan-title' }, 'Cut Plan'),
    results.map((c) => resultCard(c, byId.get(c.categoryId), state.transactions, today)),
    current.map((c) => activeCard(store, c, byId.get(c.categoryId), today)),
    suggestions.length ? el('p', { class: 'field-hint' }, 'One or two small challenges a month, based on your own best months.') : null,
    suggestions.map((s) => suggestionCard(store, s)),
  );
}

// Home: active challenges and fresh results only (suggestions live on Tips).
export function cutPlanHome(store, today) {
  const state = store.getState();
  const byId = new Map(state.categories.map((c) => [c.id, c]));
  const { current, results } = visibleChallenges(state, today);
  if (!current.length && !results.length) return null;
  return el('section', { class: 'section', id: 'home-challenges', 'aria-labelledby': 'home-challenges-title' },
    el('h2', { class: 'section-title', id: 'home-challenges-title' }, 'Your challenges'),
    results.map((c) => resultCard(c, byId.get(c.categoryId), state.transactions, today)),
    current.map((c) => activeCard(store, c, byId.get(c.categoryId), today)),
  );
}
