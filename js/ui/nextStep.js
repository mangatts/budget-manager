// Next Best Step UI: the one-step card on Home, the full list of steps, and "Why?" details.
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { formatMonth } from '../utils/dates.js';
import { showToast } from './toast.js';
import { moneySteps } from '../services/insights/nextStep.js';
import { moneyCheckup, scoreLabel } from '../services/insights/checkup.js';

export function whyDetails(why, summary = 'Why this step?') {
  if (!why) return null;
  return el('details', { class: 'why' },
    el('summary', {}, summary),
    why.lines?.length ? el('ul', { class: 'math' }, why.lines.map(([label, value]) => el('li', { class: 'math-line' },
      el('span', {}, label),
      el('span', { class: 'money' }, typeof value === 'number' ? formatCents(value) : value),
    ))) : null,
    why.note ? el('p', { class: 'field-hint' }, why.note) : null,
    el('p', { class: 'field-hint' }, `Source: ${why.source}.`),
  );
}

function progressMeter({ current, target }) {
  const fill = el('span', { class: 'meter-fill meter-ok' });
  fill.style.width = `${Math.min(100, Math.round((current / target) * 100))}%`;
  return el('div', { class: 'meter' },
    el('div', { class: 'meter-head' },
      el('span', {}, `${formatCents(current)} saved`),
      el('span', { class: 'meter-guide' }, `Goal ${formatCents(target)}`),
    ),
    el('span', { class: 'meter-track', 'aria-hidden': 'true' }, fill),
  );
}

const skipButton = (store, step, skipped) => {
  const button = el('button', { class: 'btn btn-quiet', type: 'button', id: `${skipped ? 'unskip' : 'skip'}-${step.id}` }, skipped ? 'Bring this step back' : 'Skip this step');
  button.addEventListener('click', async () => {
    button.disabled = true;
    const result = await store.setStepSkipped(step.id, !skipped);
    if (result.ok) showToast({ message: skipped ? 'Step is back' : 'Step skipped', action: { label: 'Undo', run: async () => { await result.undo(); return 'Undone'; } } });
    else { button.disabled = false; showToast({ message: result.errors.form }); }
  });
  return button;
};

export function stepCard(store, step, total) {
  return el('article', { class: 'card next-step', id: 'next-step' },
    el('span', { class: 'pill pill-good' }, `Step ${step.number} of ${total}`),
    el('h3', {}, step.title),
    el('p', { id: 'next-step-message' }, step.message),
    step.progress ? progressMeter(step.progress) : null,
    el('div', { class: 'button-row' },
      step.action ? el('a', { class: 'btn btn-primary', href: step.action.href, id: 'next-step-action' }, step.action.label) : null,
      skipButton(store, step, false),
    ),
    whyDetails(step.why),
  );
}

// Home: your one next step, plus a link to this month's checkup.
export function nextStepHome(store, today) {
  const state = store.getState();
  const steps = moneySteps(state, today);
  const current = steps.find((s) => s.current);
  const checkup = moneyCheckup(state, today);
  return el('section', { class: 'section', 'aria-labelledby': 'next-step-title', id: 'home-next-step' },
    el('h2', { class: 'section-title', id: 'next-step-title' }, 'Your next step'),
    current ? stepCard(store, current, steps.length) : el('p', { class: 'lead' }, 'You’ve done or skipped every step. Nice work.'),
    el('a', { class: 'btn btn-quiet', href: '#/steps', id: 'all-steps' }, `See all ${steps.length} steps ›`),
    checkup.available
      ? el('a', { class: 'btn btn-quiet', href: '#/checkup', id: 'checkup-link' }, `Money Checkup for ${formatMonth(checkup.month)}: ${checkup.score}/100 ›`)
      : null,
  );
}

const MARK = { done: '✓', skipped: '↷', current: '➜', ask: '?', todo: '○' };
const LABEL = { done: 'Done', skipped: 'Skipped', current: 'You are here', ask: 'Needs one answer', todo: 'Still to do' };

export function stepsList(store, today) {
  const steps = moneySteps(store.getState(), today);
  return el('ol', { class: 'list', id: 'steps-list' }, steps.map((s) => {
    const kind = s.current ? 'current' : s.status === 'done' ? 'done' : s.skipped ? 'skipped' : s.status === 'ask' ? 'ask' : 'todo';
    return el('li', { class: 'list-row step-row', id: `step-${s.id}`, 'data-status': kind },
      el('span', { class: 'swatch-label' },
        el('span', { class: 'row-icon', 'aria-hidden': 'true' }, MARK[kind]),
        el('span', { class: 'list-row-main' },
          el('span', {}, `${s.number}. ${s.title}`),
          el('span', { class: 'list-row-sub' }, `${LABEL[kind]}. ${s.message}`),
          s.skipped ? skipButton(store, s, true) : null,
          kind === 'current' && s.action ? el('a', { href: s.action.href }, s.action.label) : null,
        ),
      ),
    );
  }));
}

export const checkupSummary = (checkup) => `${checkup.score}/100 · ${scoreLabel(checkup.score)}`;
