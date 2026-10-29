// Home's hero: "Safe to spend today", with a "Why?" that shows every step of the math.
import { el } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { formatMonth } from '../utils/dates.js';
import { safeToSpend } from '../services/insights/safeToSpend.js';

const INCOME_LABEL = {
  recorded: 'Money in this month',
  'take-home': 'Your monthly take-home pay',
  estimated: 'Your usual monthly income (estimated)',
};

const line = (label, cents, sign, id) => el('li', { class: 'math-line', id },
  el('span', {}, label),
  el('span', { class: 'money' }, `${sign} ${formatCents(Math.abs(cents))}`),
);

export function safeToSpendCard(state, today) {
  const s = safeToSpend(state, today);
  if (!s.available) {
    return el('section', { class: 'card', id: 'safe-card', 'aria-labelledby': 'safe-title' },
      el('h2', { class: 'section-title', id: 'safe-title' }, 'Safe to spend today'),
      el('p', {}, 'Add your pay to see how much you can spend each day.'),
      el('div', { class: 'button-row' },
        el('a', { class: 'btn btn-primary', href: '#/profile' }, 'Add take-home pay'),
        el('a', { class: 'btn btn-quiet', href: '#/add' }, 'Or add money in'),
      ),
    );
  }

  const over = s.leftCents < 0;
  const why = el('details', { class: 'why', id: 'safe-why' },
    el('summary', {}, 'Why this number?'),
    el('ul', { class: 'math' },
      line(INCOME_LABEL[s.incomeSource], s.incomeCents, '+', 'why-income'),
      line(`Bills still due this month${s.unpaidBills ? ` (${s.unpaidBills})` : ''}`, s.billsDueCents, '−', 'why-bills'),
      line(`Set aside for savings (${s.savingsPercent}%${s.savedCents > s.goalCents ? ', you’ve saved more' : ''})`, s.setAsideCents, '−', 'why-savings'),
      line('Already spent this month', s.spentCents, '−', 'why-spent'),
      el('li', { class: 'math-line math-total', id: 'why-left' },
        el('span', {}, 'Left for the month'),
        el('span', { class: 'money' }, formatCents(s.leftCents, { sign: true })),
      ),
      over ? null : el('li', { class: 'math-line', id: 'why-days' },
        el('span', {}, `÷ ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'} left, including today`),
        el('span', { class: 'money' }, `= ${formatCents(s.perDayCents)}`),
      ),
    ),
    el('p', { class: 'field-hint' }, 'Rounded down, so you won’t go over. General guidance, not financial advice.'),
  );

  return el('section', { class: 'card', id: 'safe-card', 'aria-labelledby': 'safe-title' },
    el('h2', { class: 'field-hint safe-title', id: 'safe-title' }, 'Safe to spend today'),
    el('p', { class: 'money money-hero', id: 'safe-amount' }, formatCents(s.perDayCents)),
    over
      ? el('p', { id: 'safe-detail' }, el('span', { class: 'pill pill-warning' }, '⚠ Over for the month'),
        ` You’re ${formatCents(-s.leftCents)} past what’s left for ${formatMonth(s.month)}, counting bills and savings. Spending less for the rest of the month will catch it up.`)
      : el('p', { class: 'field-hint', id: 'safe-detail' }, `${formatCents(s.leftCents)} left for the rest of ${formatMonth(s.month)} · ${s.daysLeft} ${s.daysLeft === 1 ? 'day' : 'days'}`),
    why,
  );
}
