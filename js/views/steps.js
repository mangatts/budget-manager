// Money steps (#/steps) and Money Checkup (#/checkup): the advisor's order of operations and a monthly health check.
import { el, clear } from '../utils/dom.js';
import { todayLocal, formatMonth } from '../utils/dates.js';
import { getStore } from '../appStore.js';
import { stepsList, whyDetails, checkupSummary } from '../ui/nextStep.js';
import { moneyCheckup, MIN_SIGNALS } from '../services/insights/checkup.js';

const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.');
const disclaimer = () => el('p', { class: 'field-hint' }, 'General guidance from your own entries, not financial advice.');

// Re-renders whenever the data changes, while the screen is open.
function live(body, render) {
  getStore().then((store) => {
    const draw = () => { clear(body); render(store); };
    draw();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); draw(); });
  }, () => { clear(body); body.append(storageError()); });
}

export function stepsView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  live(body, (store) => body.append(
    el('p', { class: 'lead' }, 'The order many advisors suggest. Each step makes the next one easier. You can skip any step that doesn’t fit you.'),
    stepsList(store, todayLocal()),
    disclaimer(),
  ));
  return el('div', { class: 'screen' }, el('a', { class: 'btn btn-quiet back-link', href: '#/home' }, '‹ Home'), el('h1', { tabindex: '-1' }, 'Your money steps'), body);
}

const STATUS = {
  good: ['pill-good', '🟢 Good'],
  ok: ['pill-warning', '🟡 Okay'],
  poor: ['pill-critical', '🔴 Needs attention'],
  unknown: ['', '— Not measured'],
};

function signalCard(s) {
  const [pill, label] = STATUS[s.status];
  return el('article', { class: 'card', id: `signal-${s.id}`, 'data-status': s.status },
    el('span', { class: `pill ${pill}` }, label),
    el('h3', {}, s.label),
    el('p', {}, s.message),
    s.status === 'unknown' ? null : whyDetails({ lines: s.lines, note: s.note, source: s.source }, 'Why?'),
  );
}

export function checkupView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  live(body, (store) => {
    const c = moneyCheckup(store.getState(), todayLocal());
    if (!c.available) {
      body.append(el('div', { class: 'card', id: 'checkup-empty' },
        el('h2', { class: 'section-title' }, 'Your first checkup is on the way'),
        el('p', {}, c.reason === 'no-month'
          ? 'The checkup looks at a whole month. It starts after your first full month of entries.'
          : c.reason === 'no-income'
            ? 'Add your take-home pay (or your income entries) so we can compare spending with what comes in.'
            : `We can measure fewer than ${MIN_SIGNALS} of the 5 signals so far. Adding your emergency savings helps.`),
        el('a', { class: 'btn btn-primary', href: c.reason === 'no-month' ? '#/add' : '#/profile' }, c.reason === 'no-month' ? '＋ Add an expense' : 'Your money'),
      ));
      if (c.signals) body.append(...c.signals.map(signalCard));
      return body.append(disclaimer());
    }
    body.append(
      el('section', { class: 'card', id: 'checkup-score', 'aria-labelledby': 'checkup-month' },
        el('p', { class: 'stat-label', id: 'checkup-month' }, formatMonth(c.month)),
        el('p', { class: 'money-hero', id: 'checkup-value' }, checkupSummary(c)),
        el('p', { class: 'field-hint' }, `From ${c.measured} of 5 signals: 🟢 counts fully, 🟡 half, 🔴 not at all.`),
      ),
      ...c.signals.map(signalCard),
      disclaimer(),
    );
  });
  return el('div', { class: 'screen' }, el('a', { class: 'btn btn-quiet back-link', href: '#/home' }, '‹ Home'), el('h1', { tabindex: '-1' }, 'Money Checkup'), body);
}
