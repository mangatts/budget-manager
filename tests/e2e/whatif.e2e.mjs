// Goals + What-If (E12-S1–S3).

// Last month: $300 on Dining Out. A $3,000 car goal ($500 saved, $250 a month) and a $2,400 Visa at 24% ($75 minimum).
const SEED = `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  const t = new Date();
  const date = new Date(t.getFullYear(), t.getMonth() - 1, 15).toLocaleDateString('en-CA');
  await store.addTransaction({ type: 'expense', categoryId: 'c-dining', amount: '300', date });
  await store.addDebt({ name: 'Visa', balance: '2400', apr: '24', minPayment: '75' });
})()`;

export async function whatIfSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(300); };
  const submit = async (form) => { await page.eval(`document.getElementById(${JSON.stringify(form)}).requestSubmit()`); await page.sleep(300); };

  // ── Empty states ──
  await page.goto(`${base}#/more`);
  await click('#whatif-link');
  check('What-If with no data: invites a goal and a debt; growth still works', !!(await page.eval(`document.getElementById('whatif-add-goal') && document.getElementById('whatif-add-debt')`)) && (await text('#whatif-growth-result'))?.includes('$200 a month for 20 years'));

  // ── Goals ──
  await page.goto(`${base}#/more`);
  await click('#goals-link');
  check('Goals starts empty', (await text('main'))?.includes('No goals yet'));
  await click('#add-goal');
  await submit('goal-form');
  check('Empty form → name and target errors', !!(await text('#goal-name-error')) && !!(await text('#goal-target-error')) && (await page.eval(`document.activeElement.id`)) === 'goal-name');
  await page.eval(`document.getElementById('goal-name').value = 'New car'; document.getElementById('goal-target').value = '3,000'; document.getElementById('goal-saved').value = '500'; document.getElementById('goal-monthly').value = '250'`);
  await submit('goal-form');
  check('Add a goal → Goals, with Undo', (await page.eval('location.hash')) === '#/goals' && (await text('.toast-message')) === 'Added New car');
  check('Shows progress and when you’ll get there', (await text('#goal-list'))?.includes('$500.00 of $3,000.00') && (await text('#goal-list')).includes('(10 months) at $250.00 a month'), await text('#goal-list'));

  // ── What-If ──
  await page.eval(SEED);
  await page.goto(`${base}#/whatif`);
  await page.sleep(300);
  // Default cut: a quarter of $300, rounded to $10 → $80 → $330 a month → 8 months instead of 10.
  check('Goal: cutting Dining Out by $80 → 8 months instead of 10', (await text('#whatif-goal-result'))?.includes('Spend $80 less on Dining Out ($300 → $220)') && (await text('#whatif-goal-result')).includes('in 8 months') && (await text('#whatif-goal-result')).includes('instead of 10 months. That’s 2 months sooner.'), await text('#whatif-goal-result'));
  await page.eval(`(() => { const s = document.getElementById('whatif-cut'); s.value = '0'; s.dispatchEvent(new Event('input')); })()`);
  check('Slider at $0 shows the current pace', (await text('#whatif-goal-result'))?.includes('At $250 a month, you’ll reach New car in 10 months') && (await text('#whatif-cut-value')) === '$0');
  check('Slider has a readable value for screen readers', (await page.eval(`document.getElementById('whatif-cut').getAttribute('aria-valuetext')`)) === '$0');

  // $2,400 at 24% with $75 + $50 extra → 25 months, $810.83 less interest (unit-tested math).
  check('Debt: $50 extra → 25 months, 27 sooner, $810.83 less interest', (await text('#whatif-debt-result'))?.includes('debt-free in 25 months') && (await text('#whatif-debt-result')).includes('27 months sooner, and $810.83 less interest'), await text('#whatif-debt-result'));
  await page.eval(`(() => { const s = document.getElementById('whatif-extra'); s.value = '0'; s.dispatchEvent(new Event('input')); })()`);
  check('Minimums only: 52 months', (await text('#whatif-debt-result'))?.startsWith('Paying the minimums only: debt-free in 52 months'));
  check('Payoff order is listed', (await text('#whatif-debt-order'))?.includes('Visa'));

  await page.eval(`(() => { const s = document.getElementById('whatif-years'); s.value = '30'; s.dispatchEvent(new Event('input')); })()`);
  check('Growth: $200 a month for 30 years ≈ $200,900, with its assumptions', (await text('#whatif-growth-result'))?.includes('could grow to about $200,900') && (await text('#whatif-assumption')).includes('6% average yearly return') && (await text('#whatif-assumption')).includes('aren’t guaranteed'), await text('#whatif-growth-result'));

  // Next Best Step's last step now has somewhere to go.
  check('Debts screen links to the payoff plan', await page.eval(`(async () => { location.hash = '#/debts'; await new Promise((r) => setTimeout(r, 300)); return !!document.getElementById('debts-whatif'); })()`));
  await page.eval(`document.documentElement.dataset.textSize = 'extra-large'`);
  await page.goto(`${base}#/whatif`);
  await page.sleep(300);
  check('Extra large text: no sideways scrolling', await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`));
}
