// More → Goals: things you're saving for (a car, a trip, a house), and when you'll get there.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey, formatMonth } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { monthsToGoal, monthAfter } from '../services/insights/whatIf.js';

const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.');
const back = (href, label) => el('a', { class: 'btn btn-quiet back-link', href }, `‹ ${label}`);

// "About June 2028 (20 months)", or why there's no date.
export function goalEta(goal, today = todayLocal()) {
  const months = monthsToGoal(goal, goal.monthlyCents);
  if (months === 0) return 'Reached. Nice work!';
  if (months === null) return goal.monthlyCents ? 'More than 50 years at this pace.' : 'Add a monthly amount to see when you’ll get there.';
  return `About ${formatMonth(monthAfter(monthKey(today), months))} (${months} ${months === 1 ? 'month' : 'months'}) at ${formatCents(goal.monthlyCents)} a month.`;
}

function goalMeter(goal) {
  const fill = el('span', { class: 'meter-fill meter-ok' });
  fill.style.width = `${Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100))}%`;
  return el('span', { class: 'meter-track', 'aria-hidden': 'true' }, fill);
}

export function goalsView() {
  const body = el('div', { class: 'screen' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    const render = () => {
      const { goals } = store.getState();
      clear(body);
      body.append(
        el('p', { class: 'lead' }, 'What you’re saving for. We’ll show when you’ll get there, and What-If shows how to get there sooner.'),
        el('a', { class: 'btn btn-primary btn-block', href: '#/goal/new', id: 'add-goal' }, '＋ Add a goal'),
      );
      if (!goals.length) {
        body.append(el('p', { class: 'field-hint' }, 'No goals yet. A car, a trip, a home, or a cushion for the holidays are all good ones.'));
        return;
      }
      body.append(
        el('ul', { class: 'list', id: 'goal-list' }, goals.map((g) => el('li', {},
          el('a', { class: 'list-row list-row-link', href: `#/goal/${g.id}` },
            el('span', { class: 'list-row-main' },
              el('span', {}, g.name),
              el('span', { class: 'list-row-sub' }, `${formatCents(g.savedCents)} of ${formatCents(g.targetCents)}. ${goalEta(g)}`),
              goalMeter(g),
            ),
          ),
        ))),
        el('a', { class: 'btn btn-secondary btn-block', href: '#/whatif', id: 'goals-whatif' }, 'What if I saved more? ›'),
      );
    };
    render();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(); });
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/more', 'More'), el('h1', { tabindex: '-1' }, 'Goals'), body);
}

function goalForm(store, goal) {
  const editing = Boolean(goal);
  const field = (id, label, input, hint) => el('div', { class: 'field' },
    el('label', { class: 'field-label', for: id }, label), input,
    hint ? el('span', { class: 'field-hint' }, hint) : null,
    el('span', { class: 'field-error', id: `${id}-error`, hidden: true }),
  );
  const money = (input) => el('div', { class: 'money-field' }, el('span', { 'aria-hidden': 'true' }, '$'), input);
  const amount = (id, cents) => el('input', { class: 'input input-money', id, inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00', value: goal ? (cents / 100).toFixed(2) : null });
  const name = el('input', { class: 'input', id: 'goal-name', autocomplete: 'off', placeholder: 'New car', value: goal?.name ?? null });
  const target = amount('goal-target', goal?.targetCents);
  const saved = amount('goal-saved', goal?.savedCents);
  const monthly = amount('goal-monthly', goal?.monthlyCents);
  const save = el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, editing ? 'Save changes' : 'Add goal');
  const del = editing ? el('button', { class: 'btn btn-danger btn-block', type: 'button', id: 'delete-goal' }, 'Delete') : null;

  const form = el('form', { class: 'section', novalidate: true, id: 'goal-form' },
    field('goal-name', 'Name', name),
    field('goal-target', 'How much you need', money(target)),
    field('goal-saved', 'Saved so far', money(saved), 'Optional. Update it whenever you add to it.'),
    field('goal-monthly', 'How much you’ll put toward it each month', money(monthly), 'Optional. This is how we work out the date.'),
    save,
    del,
  );

  const inputs = [['name', name], ['target', target], ['saved', saved], ['monthly', monthly]];
  const show = (errors = {}) => {
    for (const [key, input] of inputs) {
      const box = form.querySelector(`#${input.id}-error`);
      box.textContent = errors[key] ?? '';
      box.hidden = !errors[key];
      if (errors[key]) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    }
    inputs.find(([k]) => errors[k])?.[1].focus();
    if (errors.form) showToast({ message: errors.form });
  };

  let busy = false;
  const once = async (action) => {
    if (busy) return;
    busy = true;
    try { await action(); } finally { busy = false; }
  };
  const finish = (result, message) => {
    if (!result.ok) return show(result.errors);
    showToast({ message, action: { label: 'Undo', run: async () => { await result.undo(); return 'Undone'; } } });
    location.hash = '#/goals';
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    once(async () => {
      const input = { name: name.value, target: target.value, saved: saved.value, monthly: monthly.value };
      const result = editing ? await store.updateGoal(goal.id, input) : await store.addGoal(input);
      finish(result, editing ? 'Saved changes' : `Added ${result.record?.name}`);
    });
  });
  del?.addEventListener('click', () => once(async () => finish(await store.deleteGoal(goal.id), `Deleted ${goal.name}`)));
  return form;
}

export function goalView(id) {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    clear(body);
    if (id === 'new') return body.append(goalForm(store, null));
    const goal = store.getState().goals.find((g) => g.id === id);
    if (!goal) return body.append(el('p', { class: 'lead' }, 'This goal no longer exists.'), el('a', { class: 'btn btn-secondary', href: '#/goals' }, 'Back to Goals'));
    body.append(goalForm(store, goal));
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, back('#/goals', 'Goals'), el('h1', { tabindex: '-1' }, id === 'new' ? 'Add a goal' : 'Edit goal'), body);
}
