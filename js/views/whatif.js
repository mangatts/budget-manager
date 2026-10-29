// What-If (#/whatif): sliders that turn small changes into real outcomes (E12-S1–S3).
// Goal timelines, a debt payoff plan, and long-term growth. Every result names its assumptions.
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { todayLocal, monthKey, formatMonth } from '../utils/dates.js';
import { getStore } from '../appStore.js';
import { goalWithCut, payoffComparison, growth, monthAfter, cuttableCategories, GROWTH_RATE_BPS } from '../services/insights/whatIf.js';

const months = (n) => `${n} ${n === 1 ? 'month' : 'months'}`;
const when = (n, today) => formatMonth(monthAfter(monthKey(today), n));
const dollars = (cents) => formatCents(cents).replace(/\.00$/, '');

// A labeled range slider. onInput(valueCents) runs as it moves; the label shows the value.
function slider({ id, label, min, max, step, value, format, onInput }) {
  const shown = el('span', { class: 'slider-value', id: `${id}-value` }, format(value));
  const input = el('input', { type: 'range', class: 'slider', id, min: String(min), max: String(max), step: String(step), value: String(value), 'aria-valuetext': format(value) });
  input.addEventListener('input', () => {
    const v = Number(input.value);
    shown.textContent = format(v);
    input.setAttribute('aria-valuetext', format(v));
    onInput(v);
  });
  return el('div', { class: 'field' }, el('label', { class: 'field-label slider-label', for: id }, el('span', {}, label), shown), input);
}

const result = (id) => el('p', { class: 'whatif-result', id, 'aria-live': 'polite' });
const card = (id, title, ...children) => el('section', { class: 'card whatif', id, 'aria-labelledby': `${id}-title` }, el('h2', { class: 'section-title', id: `${id}-title` }, title), ...children);

// ── E12-S1: cut a category → reach a goal sooner ──
function goalCard(state, today) {
  if (!state.goals.length) {
    return card('whatif-goal', 'Reach a goal sooner',
      el('p', {}, 'Add something you’re saving for, and see how small cuts bring it closer.'),
      el('a', { class: 'btn btn-primary', href: '#/goal/new', id: 'whatif-add-goal' }, '＋ Add a goal'));
  }
  const categories = cuttableCategories(state, today);
  const goalSelect = el('select', { class: 'input', id: 'whatif-goal-select' }, state.goals.map((g) => el('option', { value: g.id }, g.name)));
  const catSelect = el('select', { class: 'input', id: 'whatif-category' },
    categories.length ? categories.map((c) => el('option', { value: c.id }, `${c.icon} ${c.name} (usually ${dollars(c.usualCents)})`)) : el('option', { value: '' }, 'Any spending'));
  const out = result('whatif-goal-result');
  const sliderSlot = el('div', {});
  let cut = 0;

  const update = () => {
    const goal = state.goals.find((g) => g.id === goalSelect.value);
    const cat = categories.find((c) => c.id === catSelect.value);
    const r = goalWithCut(goal, cut);
    const from = cat ? `Spend ${dollars(cut)} less on ${cat.name} (${dollars(cat.usualCents)} → ${dollars(cat.usualCents - cut)})` : `Put ${dollars(cut)} more a month toward it`;
    if (r.now === 0) out.textContent = `${goal.name} is already reached. Nice work!`;
    else if (cut === 0) out.textContent = r.now === null ? `At your current pace you won’t reach ${goal.name}. Move the slider to see what a cut does.` : `At ${dollars(goal.monthlyCents)} a month, you’ll reach ${goal.name} in ${months(r.now)} (${when(r.now, today)}).`;
    else if (r.withCut === null) out.textContent = `${from}: still more than 50 years. Try a bigger change.`;
    else if (r.now === null) out.textContent = `${from} and put it toward ${goal.name}: you’ll reach it in ${months(r.withCut)} (${when(r.withCut, today)}).`;
    else out.textContent = `${from} and put it toward ${goal.name}: reach it in ${months(r.withCut)} (${when(r.withCut, today)}) instead of ${months(r.now)}. That’s ${months(r.sooner)} sooner.`;
  };
  const drawSlider = () => {
    const cat = categories.find((c) => c.id === catSelect.value);
    const max = cat ? Math.max(1000, Math.floor(cat.usualCents / 1000) * 1000) : 50000;
    cut = Math.min(max, cat ? Math.round(cat.usualCents / 4 / 1000) * 1000 : 10000);
    clear(sliderSlot);
    sliderSlot.append(slider({ id: 'whatif-cut', label: 'Cut each month', min: 0, max, step: 1000, value: cut, format: dollars, onInput: (v) => { cut = v; update(); } }));
    update();
  };
  goalSelect.addEventListener('change', update);
  catSelect.addEventListener('change', drawSlider);
  drawSlider();
  return card('whatif-goal', 'Reach a goal sooner',
    el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'whatif-goal-select' }, 'Goal'), goalSelect),
    el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'whatif-category' }, 'Cut back on'), catSelect),
    sliderSlot, out,
    el('p', { class: 'field-hint' }, 'Assumes the money you don’t spend goes straight to the goal, on top of what you already put in each month.'));
}

// ── E12-S2: debt payoff plan ──
function debtCard(state, today) {
  if (!state.debts.length) {
    return card('whatif-debt', 'Pay off debt faster',
      el('p', {}, 'Add your credit cards and loans to see when you’ll be debt-free, and how much interest paying extra saves.'),
      el('a', { class: 'btn btn-primary', href: '#/debt/new', id: 'whatif-add-debt' }, '＋ Add a debt'));
  }
  const out = result('whatif-debt-result');
  const order = el('ol', { class: 'list', id: 'whatif-debt-order' });
  const missingMin = state.debts.some((d) => d.minPaymentCents === 0);
  const update = (extra) => {
    const c = payoffComparison(state.debts, extra);
    clear(order);
    if (c.plan.months === null) {
      out.textContent = extra ? 'Even with this extra, payments don’t keep up with interest. Try more.' : 'Minimum payments alone don’t keep up with the interest, so the balance would never go down. Move the slider to see what extra does.';
      return;
    }
    const free = `debt-free in ${months(c.plan.months)} (${when(c.plan.months, today)}), paying ${formatCents(c.plan.interestCents)} in interest`;
    if (!extra) out.textContent = `Paying the minimums only: ${free}.`;
    else if (c.base.months === null) out.textContent = `Paying ${dollars(extra)} extra a month: ${free}. With minimums alone, you’d never finish.`;
    else out.textContent = `Paying ${dollars(extra)} extra a month: ${free}. That’s ${months(c.monthsSooner)} sooner, and ${formatCents(c.interestSavedCents)} less interest.`;
    order.append(...c.plan.order.map((o) => el('li', { class: 'list-row' }, el('span', {}, o.name), el('span', { class: 'list-row-sub' }, `paid off ${when(o.month, today)}`))));
  };
  const s = slider({ id: 'whatif-extra', label: 'Extra each month', min: 0, max: 100000, step: 2500, value: 5000, format: dollars, onInput: update });
  update(5000);
  return card('whatif-debt', 'Pay off debt faster', s, out, order,
    el('p', { class: 'field-hint' }, `Extra goes to the highest interest rate first (the “avalanche” method). When a debt is paid off, its payment rolls to the next. Interest is charged monthly at each debt’s APR.${missingMin ? ' Some debts have no minimum payment, so add those for a more accurate plan.' : ''}`));
}

// ── E12-S3: long-term growth ──
function growthCard() {
  const out = result('whatif-growth-result');
  let monthly = 20000;
  let years = 20;
  const update = () => {
    const g = growth(monthly, years);
    out.textContent = `${dollars(monthly)} a month for ${years} years could grow to about ${dollars(Math.round(g.valueCents / 10000) * 10000)}. You’d put in ${dollars(g.putInCents)}; growth adds about ${dollars(Math.round(g.growthCents / 10000) * 10000)}.`;
  };
  const a = slider({ id: 'whatif-monthly', label: 'Save each month', min: 2500, max: 200000, step: 2500, value: monthly, format: dollars, onInput: (v) => { monthly = v; update(); } });
  const b = slider({ id: 'whatif-years', label: 'For', min: 1, max: 40, step: 1, value: years, format: (v) => `${v} ${v === 1 ? 'year' : 'years'}`, onInput: (v) => { years = v; update(); } });
  update();
  return card('whatif-growth', 'See long-term growth', a, b, out,
    el('p', { class: 'field-hint', id: 'whatif-assumption' }, `Assumes a ${GROWTH_RATE_BPS / 100}% average yearly return, compounded monthly, before taxes and fees, and not adjusted for inflation. Real returns go up and down and aren’t guaranteed. This is an illustration, not financial advice.`));
}

export function whatIfView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    // Drawn once per visit, so sliders aren't reset while you use them.
    const state = store.getState();
    const today = todayLocal();
    clear(body);
    body.append(
      el('p', { class: 'lead' }, 'Move the sliders to see how small changes add up. Nothing here changes your data.'),
      goalCard(state, today), debtCard(state, today), growthCard(),
    );
  }, () => { clear(body); body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.')); });
  return el('div', { class: 'screen' }, el('a', { class: 'btn btn-quiet back-link', href: '#/more' }, '‹ More'), el('h1', { tabindex: '-1' }, 'What if…'), body);
}
