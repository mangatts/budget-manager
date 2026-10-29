// Money profile extras + Debts (E11-S1).

export async function debtsSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(250); };
  const meta = () => page.eval(`(async () => {
    const { getStore } = await import(new URL('js/appStore.js', location.href));
    const m = (await getStore()).getState().meta;
    return { fund: m.emergencyFundCents ?? 'unset', match: m.employerMatch ?? 'unset' };
  })()`);

  // ── 1. Your money: emergency savings + 401(k) match ──
  await page.goto(`${base}#/more`);
  await click('#profile-link');
  check('Your money asks about emergency savings and a 401(k) match', !!(await page.eval(`document.getElementById('emergency-fund') && document.querySelectorAll('input[name="employer-match"]').length === 4`)));
  await page.eval(`document.querySelector('#emergency-fund').value = 'lots'`);
  await page.eval(`document.getElementById('profile-form').requestSubmit()`);
  await page.sleep(250);
  check('A bad emergency amount shows an error next to the field, and nothing is saved', (await text('#emergency-fund-error'))?.includes('amount') && (await page.eval(`document.activeElement.id`)) === 'emergency-fund' && (await meta()).fund === 'unset');
  await page.eval(`document.querySelector('#emergency-fund').value = '0'`);
  await click('#employer-match-partial');
  await page.eval(`document.getElementById('profile-form').requestSubmit()`);
  await page.sleep(300);
  const saved = await meta();
  check('"0" savings and "partial" match are saved', saved.fund === 0 && saved.match === 'partial', JSON.stringify(saved));
  await page.goto(`${base}#/profile`);
  await page.sleep(300);
  check('Coming back shows what was saved', (await page.eval(`document.getElementById('emergency-fund').value`)) === '0.00' && (await page.eval(`document.getElementById('employer-match-partial').checked`)));
  await page.eval(`document.getElementById('profile-form').requestSubmit()`);
  await page.sleep(300);
  check('Saving again with $0.00 still works', (await page.eval('location.hash')) === '#/home' && (await meta()).fund === 0);

  // ── 2. Debts ──
  await page.goto(`${base}#/more`);
  await click('#debts-link');
  check('Debts starts empty, with a calm message', (await text('main'))?.includes('No debts added'));
  await click('#add-debt');
  await page.eval(`document.getElementById('debt-form').requestSubmit()`);
  await page.sleep(250);
  check('Empty form → errors for name, balance, and rate; focus on name', (await text('#debt-name-error')) && (await text('#debt-balance-error')) && (await text('#debt-apr-error')) && (await page.eval(`document.activeElement.id`)) === 'debt-name');
  await page.eval(`document.querySelector('#debt-name').value = 'Visa'`);
  await page.eval(`document.querySelector('#debt-balance').value = '2,400'`);
  await page.eval(`document.querySelector('#debt-apr').value = '24.99%'`);
  await page.eval(`document.querySelector('#debt-min').value = '75'`);
  await page.eval(`document.getElementById('debt-form').requestSubmit()`);
  await page.sleep(300);
  check('Add a debt → back to Debts, with Undo', (await page.eval('location.hash')) === '#/debts' && (await text('.toast-message')) === 'Added Visa');
  await click('#add-debt');
  await page.eval(`document.querySelector('#debt-name').value = 'Car loan'`);
  await page.eval(`document.querySelector('#debt-balance').value = '9000'`);
  await page.eval(`document.querySelector('#debt-apr').value = '6.5'`);
  await page.eval(`document.getElementById('debt-form').requestSubmit()`);
  await page.sleep(300);
  const rows = await page.eval(`[...document.querySelectorAll('#debt-list li')].map((li) => li.textContent)`);
  check('Highest rate first, with rate, minimum, and balance', rows.length === 2 && rows[0].includes('Visa') && rows[0].includes('24.99%') && rows[0].includes('$75.00') && rows[1].includes('6.5%'), JSON.stringify(rows));
  check('Shows the total owed', (await text('#debt-total'))?.includes('$11,400.00'));

  await click('#debt-list a');
  await page.eval(`document.querySelector('#debt-balance').value = '2000'`);
  await page.eval(`document.getElementById('debt-form').requestSubmit()`);
  await page.sleep(300);
  check('Edit a debt', (await text('#debt-list'))?.includes('$2,000.00'));
  await click('#debt-list a');
  await click('#delete-debt');
  check('Delete a debt, then Undo brings it back', !(await text('#debt-list'))?.includes('Visa'));
  await click('.toast-action');
  await page.sleep(300);
  check('…it’s back', (await text('#debt-list'))?.includes('Visa'));

  await page.goto(`${base}#/debt/does-not-exist`);
  await page.sleep(250);
  check('A missing debt says so politely', (await text('main'))?.includes('no longer exists'));
  await page.goto(`${base}#/debts`);
  await page.sleep(300);
  check('Debts are still there after a reload', (await page.eval(`document.querySelectorAll('#debt-list li').length`)) === 2);
}
