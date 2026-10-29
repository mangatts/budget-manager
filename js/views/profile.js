// More → Your money: take-home pay and how much to set aside for savings. Both optional.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { DEFAULT_SAVINGS_PERCENT, MAX_SAVINGS_PERCENT } from '../services/validate.js';
import { monthlyIncome } from '../services/insights/month.js';

function profileForm(store) {
  const { meta } = store.getState();
  const takeHome = el('input', {
    class: 'input input-money', id: 'take-home', inputmode: 'decimal', autocomplete: 'off', placeholder: '0.00',
    value: meta.monthlyTakeHomeCents ? (meta.monthlyTakeHomeCents / 100).toFixed(2) : null, 'aria-describedby': 'take-home-hint take-home-error',
  });
  const savings = el('input', {
    class: 'input', id: 'savings-percent', inputmode: 'numeric', autocomplete: 'off',
    value: String(meta.savingsPercent ?? DEFAULT_SAVINGS_PERCENT), 'aria-describedby': 'savings-percent-hint savings-percent-error',
  });
  const estimate = monthlyIncome({ ...store.getState(), meta: {} }, monthKey(todayLocal()));
  const error = (id) => el('span', { class: 'field-error', id: `${id}-error`, hidden: true });

  const form = el('form', { class: 'section', novalidate: true, id: 'profile-form' },
    el('p', { class: 'lead' }, 'Optional. These make Safe to Spend and your coach tips more accurate. They stay on this device.'),
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'take-home' }, 'Monthly take-home pay'),
      el('div', { class: 'money-field' }, el('span', { 'aria-hidden': 'true' }, '$'), takeHome),
      el('span', { class: 'field-hint', id: 'take-home-hint' },
        estimate ? `What lands in your account each month after taxes. Leave it blank and we’ll use about ${formatCents(estimate.cents)}, based on your recent money in.` : 'What lands in your account each month after taxes.'),
      error('take-home'),
    ),
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'savings-percent' }, 'Set aside for savings (%)'),
      savings,
      el('span', { class: 'field-hint', id: 'savings-percent-hint' }, `Part of each month’s income you want to protect for savings or extra debt payoff. The 50/30/20 guideline suggests ${DEFAULT_SAVINGS_PERCENT}%. Any whole number from 0 to ${MAX_SAVINGS_PERCENT}.`),
      error('savings-percent'),
    ),
    el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save'),
  );

  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    try {
      const result = await store.setProfile({ takeHome: takeHome.value, savingsPercent: savings.value });
      for (const [field, input] of [['takeHome', takeHome], ['savingsPercent', savings]]) {
        const message = result.errors?.[field];
        const box = form.querySelector(`#${input.id}-error`);
        box.textContent = message ?? '';
        box.hidden = !message;
        if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
      }
      if (!result.ok) {
        if (result.errors.form) showToast({ message: result.errors.form });
        return (result.errors.takeHome ? takeHome : savings).focus();
      }
      showToast({ message: 'Saved', action: { label: 'Undo', run: async () => { await result.undo(); return 'Undone'; } } });
      location.hash = '#/home';
    } finally {
      busy = false;
    }
  });
  return form;
}

export function profileView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => { clear(body); body.append(profileForm(store)); },
    () => { clear(body); body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.')); });
  return el('div', { class: 'screen' },
    el('a', { class: 'btn btn-quiet back-link', href: '#/more' }, '‹ More'),
    el('h1', { tabindex: '-1' }, 'Your money'),
    body,
  );
}
