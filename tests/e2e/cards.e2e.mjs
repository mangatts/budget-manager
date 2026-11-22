// The whole app, the way a person uses it: Setup → Check-in → Home plan → edit, delete, undo → Delete everything.

export async function cardsSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(250); };
  const fill = (values) => page.eval(`(() => { for (const [id, v] of Object.entries(${JSON.stringify(values)})) document.getElementById(id).value = v; })()`);
  const submit = async (id) => { await page.eval(`document.getElementById(${JSON.stringify(id)}).requestSubmit()`); await page.sleep(300); };
  const focused = () => page.eval('document.activeElement?.id');
  const today = await page.eval(`new Date().toLocaleDateString('en-CA')`);

  // ── Fresh start ──
  await page.goto(`${base}#/home`);
  await page.sleep(300);
  check('Fresh Home shows the 3 setup steps', !!(await text('#welcome')) && !!(await text('#welcome-income')) && !!(await text('#welcome-card')));
  await page.goto(`${base}#/checkin`);
  await page.sleep(250);
  check('Check-in with no cards points you to add one', !!(await text('#checkin-add-card')));

  // ── Income ──
  await page.goto(`${base}#/setup`);
  await page.sleep(250);
  await click('#add-income');
  await submit('income-form');
  check('Empty income → errors, focus on name', !!(await text('#income-name-error')) && !!(await text('#income-amount-error')) && (await focused()) === 'income-name');
  await fill({ 'income-name': 'Paycheck', 'income-amount': '2,000' });
  check('Pay frequency defaults to every 2 weeks', await page.eval(`document.getElementById('frequency-biweekly').checked`));
  await submit('income-form');
  check('Add income → back to Setup with Undo, monthly amount shown', (await page.eval('location.hash')) === '#/setup' && (await text('.toast-message')) === 'Added Paycheck' && (await text('#income-total'))?.includes('$4,333.33'));

  // ── Expenses ──
  await click('#add-expense');
  await fill({ 'expense-name': 'Rent', 'expense-amount': '1400', 'expense-day': '41' });
  await submit('expense-form');
  check('A due day over 31 is explained', (await text('#expense-day-error'))?.includes('1 to 31') && (await focused()) === 'expense-day');
  await fill({ 'expense-day': '1' });
  await submit('expense-form');
  await click('#add-expense');
  await fill({ 'expense-name': 'Groceries', 'expense-amount': '400' });
  await submit('expense-form');
  check('Expenses listed by due day, with the monthly total', (await text('#expense-list'))?.match(/Rent.*Due on the 1st.*Groceries.*No set day/) && (await text('#expense-total'))?.includes('$1,800.00'));

  // ── Cards ──
  await click('#add-card');
  await fill({ 'card-name': 'Chase', 'card-apr': '24.99%', 'card-limit': '5000' });
  await submit('card-form');
  check('A card without a minimum payment is explained', (await text('#card-min-error'))?.includes('0 if none') && (await focused()) === 'card-min');
  await fill({ 'card-min': '35' });
  await submit('card-form');
  await click('#add-card');
  await fill({ 'card-name': 'Discover', 'card-apr': '19.99', 'card-min': '25' });
  await submit('card-form');
  const cardRows = await page.eval(`[...document.querySelectorAll('#card-list li')].map((li) => li.textContent)`);
  check('Cards listed highest interest first, with rate and limit', cardRows.length === 2 && cardRows[0].includes('Chase') && cardRows[0].includes('24.99%') && cardRows[0].includes('$5,000.00 limit') && cardRows[1].includes('Discover'), JSON.stringify(cardRows));

  // ── Before any check-in, Home doesn't claim you're debt-free ──
  await page.goto(`${base}#/home`);
  await page.sleep(300);
  check('Before a check-in: no "debt-free" claim, minimums still counted', (await text('#debt-free'))?.includes('Check in with your card balances') && (await text('#line-minimums'))?.includes('$60.00'), await text('#debt-free'));

  // ── Check-in ──
  await page.goto(`${base}#/checkin`);
  await page.sleep(300);
  check('Check-in opens on today', (await page.eval(`document.getElementById('checkin-date').value`)) === today);
  const ids = await page.eval(`[...document.querySelectorAll('#checkin-form .input-money')].map((i) => i.id)`);
  await page.eval(`document.getElementById('${ids[0]}').value = '3,000'`);
  await submit('checkin-form');
  check('A missing balance is explained, focus on it', !!(await text(`#${ids[1]}-error`)) && (await focused()) === ids[1]);
  await page.eval(`document.getElementById('${ids[1]}').value = '1000'`);
  await submit('checkin-form');
  check('Save check-in → Home', (await page.eval('location.hash')) === '#/home' && (await text('.toast-message'))?.startsWith('Checked in'));

  // ── Home plan ──
  await page.sleep(300);
  check('Setup steps are gone once everything is added', !(await text('#welcome')));
  check('Each month: income, fixed expenses, minimums, left over', (await text('#line-income'))?.includes('$4,333.33') && (await text('#line-expenses'))?.includes('$1,800.00') && (await text('#line-minimums'))?.includes('$60.00') && (await text('#line-left'))?.includes('$2,473.33'), await text('#month'));
  const pay = await page.eval(`[...document.querySelectorAll('#pay-list li')].map((li) => li.textContent)`);
  check('Pay this month: Chase (highest rate) gets the extra, Discover the minimum', pay[0]?.includes('Chase') && pay[0].includes('Focus here') && pay[0].includes('$2,508.33') && pay[1]?.includes('Discover') && pay[1].includes('$25.00'), JSON.stringify(pay));
  check('Warns when a card uses over 30% of its limit', pay[0]?.includes('over 30%'));
  check('Card debt total and a debt-free estimate', (await text('#debt-total')) === '$4,000.00' && /About \d+ months?/.test(await text('#debt-free')), await text('#debt-free'));
  check('Keep paying: fixed expenses listed', (await text('#bills-list'))?.includes('Rent') && (await text('#bills-list'))?.includes('Groceries'));

  // ── An earlier check-in shows progress ──
  await page.goto(`${base}#/checkin/2026-10-01`);
  await page.sleep(300);
  check('Opening a past day for a new check-in starts blank', (await page.eval(`document.getElementById('checkin-date').value`)) === '2026-10-01' && (await page.eval(`document.getElementById('${ids[0]}').value`)) === '');
  await page.eval(`document.getElementById('${ids[0]}').value = '3500'; document.getElementById('${ids[1]}').value = '1200'`);
  await submit('checkin-form');
  await page.sleep(200);
  check('Home shows the drop since the last check-in', (await text('#debt-change'))?.includes('↓ $700.00'), await text('#debt-change'));
  check('Past check-ins listed newest first with totals', (await page.eval(`[...document.querySelectorAll('#history-list li')].map((li) => li.textContent)`)).join('|').match(/\$4,000\.00.*\|.*\$4,700\.00/));

  // ── Edit, delete, undo ──
  await click('#history-list li:last-child a');
  check('An existing day shows its balances and says saving updates it', (await page.eval(`document.getElementById('${ids[0]}').value`)) === '3500.00' && (await text('#checkin-status'))?.includes('already checked in'));
  await click('#delete-checkin');
  check('Delete a check-in → gone from Home', (await page.eval(`document.querySelectorAll('#history-list li').length`)) === 1);
  await click('.toast-action');
  await page.sleep(300);
  check('…Undo brings it back', (await page.eval(`document.querySelectorAll('#history-list li').length`)) === 2);

  await page.goto(`${base}#/setup`);
  await page.sleep(250);
  await click('#card-list li:last-child a');
  await click('#delete-card');
  check('Delete a card', !(await text('#card-list'))?.includes('Discover'));
  await click('.toast-action');
  await page.sleep(300);
  check('…Undo brings it back', (await text('#card-list'))?.includes('Discover'));
  await page.goto(`${base}#/card/does-not-exist`);
  await page.sleep(250);
  check('A missing card says so politely', (await text('main'))?.includes('no longer exists'));

  // ── Extra large text with real data ──
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  for (const route of ['home', 'checkin', 'setup']) {
    await page.goto(`${base}#/${route}`);
    await page.reload();
    await page.sleep(300);
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
    check(`Extra large text with data: ${route} fits, nothing clipped`, fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);

  // ── Delete everything ──
  await page.goto(`${base}#/more`);
  await click('#wipe-link');
  check('Delete everything says what will go', (await text('#wipe-form'))?.includes('2 cards, 2 check-ins'));
  await page.eval(`const i = document.getElementById('wipe-confirm'); i.value = 'DELETE'; i.dispatchEvent(new Event('input'))`);
  await page.eval(`document.getElementById('wipe-form').requestSubmit()`);
  await page.sleep(1200);
  const after = await page.eval(`(async () => { const { getStore } = await import(new URL('js/appStore.js', location.href)); const s = (await getStore()).getState(); return s.cards.length + s.checkins.length + s.incomes.length + s.expenses.length; })()`);
  check('After deleting: back to the setup steps, nothing left', after === 0 && !!(await text('#welcome')));
}
