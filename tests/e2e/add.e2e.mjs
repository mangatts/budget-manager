// Add screen: the "under 5 seconds" flow, money in, validation, Undo, persistence, and safety (E1-S3, E1-S4).

const stored = `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  return (await getStore()).getState().transactions.map((t) => ({ type: t.type, cents: t.amountCents, cat: t.categoryId, note: t.note, date: t.date }));
})()`;

export async function addSuite({ page, check, base }) {
  const ready = () => page.eval(`!!document.querySelector('form #amount')`);
  const focused = () => page.eval('document.activeElement?.id || document.activeElement?.tagName');
  const toast = () => page.eval(`document.querySelector('.toast-message')?.textContent ?? ''`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(150); };
  const today = await page.eval(`new Date().toLocaleDateString('en-CA')`);

  await page.goto(`${base}#/add`);
  check('Add screen loads with Amount focused (keypad opens)', (await ready()) && (await focused()) === 'amount');
  check('Defaults: Money out, today’s date', await page.eval(`document.getElementById('type-expense').checked && document.getElementById('date').value === ${JSON.stringify(today)}`));

  // Fast path: amount → category → Save
  await page.type('4.75');
  await click('#category-c-dining');
  await click('form button[type="submit"]');
  let rows = await page.eval(stored);
  check('Fast path saves: 4.75 → Dining Out → Save', rows.length === 1 && rows[0].cents === 475 && rows[0].cat === 'c-dining' && rows[0].type === 'expense' && rows[0].date === today, JSON.stringify(rows));
  check('Toast says "Added −$4.75 · Dining Out" with Undo', (await toast()) === 'Added −$4.75 · Dining Out' && await page.eval(`document.querySelector('.toast-action')?.textContent === 'Undo'`));
  check('Form is ready for the next one (amount cleared, focused, still Money out)', await page.eval(`document.getElementById('amount').value === '' && document.activeElement.id === 'amount' && document.getElementById('type-expense').checked && !document.querySelector('input[name="categoryId"]:checked')`));
  check('Most-used category moves to the front', await page.eval(`document.querySelector('input[name="categoryId"]').value === 'c-dining'`));

  // Double-tap protection
  await page.eval(`document.getElementById('amount').value = '2.50'`);
  await click('#category-c-dining');
  await page.eval(`(() => { const f = document.querySelector('form'); f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); })()`);
  await page.sleep(300);
  rows = await page.eval(stored);
  check('Double-tapping Save records it only once', rows.filter((r) => r.cents === 250).length === 1, JSON.stringify(rows.map((r) => r.cents)));
  check('The toast region exists before the first message (screen readers announce it)', await page.eval(`document.querySelectorAll('.toast-region[role="status"]').length === 1`));
  await click('.toast-action'); // undo the 2.50
  await page.sleep(100);

  // Undo
  rows = await page.eval(stored);
  check('Undo removes only that entry', rows.length === 1 && rows[0].cents === 475, JSON.stringify(rows.map((r) => r.cents)));
  await page.eval(`(async () => { const { getStore } = await import(new URL('js/appStore.js', location.href)); const s = await getStore(); await s.deleteTransaction(s.getState().transactions[0].id); })()`);
  await page.goto(`${base}#/home`); await page.goto(`${base}#/add`);
  await page.eval(`document.getElementById('amount').focus()`);
  await page.type('4.75');
  await click('#category-c-dining');
  await click('form button[type="submit"]');
  await click('.toast-action');
  rows = await page.eval(stored);
  check('Undo removes it', rows.length === 0 && (await toast()) === 'Removed');

  // Keyboard only: type amount, Tab to categories, Space to pick, Tab to note, type, Enter
  await page.goto(`${base}#/home`); await page.goto(`${base}#/add`);
  await page.eval(`document.getElementById('amount').focus()`);
  await page.type('12');
  await page.key('Tab', 'Tab', 9);
  await page.key(' ', 'Space', 32);
  // Tab past the date (Chrome gives month, day, year, and the calendar button their own stops) to Note.
  for (let i = 0; i < 8 && (await focused()) !== 'note'; i++) await page.key('Tab', 'Tab', 9);
  await page.type('Keyboard only');
  await page.key('Enter', 'Enter', 13);
  await page.sleep(150);
  rows = await page.eval(stored);
  check('Keyboard only: amount → Tab → Space → Tab to note → Enter saves', rows.length === 1 && rows[0].cents === 1200 && rows[0].note === 'Keyboard only', JSON.stringify(rows));

  // Money in
  await click('#type-income');
  const incomeCats = await page.eval(`[...document.querySelectorAll('input[name="categoryId"]')].map((i) => i.value)`);
  check('Money in shows only income categories', incomeCats.length === 5 && incomeCats.includes('c-paycheck') && !incomeCats.includes('c-dining'));
  await page.eval(`document.getElementById('amount').focus()`);
  await page.type('$1,850');
  await click('#category-c-paycheck');
  await click('form button[type="submit"]');
  rows = await page.eval(stored);
  check('Adds income: "$1,850" → +$1,850.00 Paycheck', rows.some((r) => r.type === 'income' && r.cents === 185000 && r.cat === 'c-paycheck') && (await toast()) === 'Added +$1,850.00 · Paycheck');
  check('Money in stays selected for the next entry', await page.eval(`document.getElementById('type-income').checked`));

  // Validation: nothing saved, errors shown, focus on first problem
  await click('#type-expense');
  const before = (await page.eval(stored)).length;
  await click('form button[type="submit"]');
  const errors = await page.eval(`({
    amount: document.getElementById('amount-error').hidden ? null : document.getElementById('amount-error').textContent,
    category: document.getElementById('categoryId-error').hidden ? null : document.getElementById('categoryId-error').textContent,
    invalid: document.getElementById('amount').getAttribute('aria-invalid'),
    focus: document.activeElement.id,
  })`);
  check('Empty Save shows errors in plain words, focuses Amount, saves nothing', errors.amount === 'Enter an amount' && errors.category === 'Pick a category' && errors.invalid === 'true' && errors.focus === 'amount' && (await page.eval(stored)).length === before, JSON.stringify(errors));
  await page.type('12.345');
  await click('#category-c-groceries');
  await click('form button[type="submit"]');
  check('Too many decimals → explained, still not saved', (await page.eval(`document.getElementById('amount-error').textContent`)) === 'Use at most 2 decimal places, like 12.50' && (await page.eval(stored)).length === before);
  await page.eval(`document.getElementById('amount').value = ''; document.getElementById('amount').focus()`);
  await page.type('3');
  await click('#category-c-groceries');
  await page.eval(`document.getElementById('note').value = '<img src=x onerror=alert(1)>'`);
  await click('form button[type="submit"]');
  check('Fixing the error clears it and saves', await page.eval(`document.getElementById('amount-error').hidden && !document.getElementById('amount').hasAttribute('aria-invalid')`) && (await page.eval(stored)).length === before + 1);
  check('A note that looks like HTML is saved as plain text and never runs', (await page.eval(stored)).some((r) => r.note === '<img src=x onerror=alert(1)>') && !(await page.eval(`!!document.querySelector('img')`)));

  // Persistence
  await page.reload();
  check('Reload → everything added is still there', (await page.eval(stored)).length === before + 1);

  // Extra large text: the whole form fits
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  await page.reload();
  const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '#' + e.id).slice(0, 3) })`);
  check('Extra large text: no sideways scroll, nothing clipped', fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
