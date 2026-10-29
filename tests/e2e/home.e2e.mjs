// Home dashboard and Your money (E3-S1, E3-S2, E4-S2).

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

export async function homeSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(200); };

  await page.goto(`${base}#/home`);
  check('Empty month: zeros and a friendly message', (await text('#stat-in')).includes('$0.00') && (await text('main .lead'))?.startsWith('No entries in'));
  check('Suggests adding take-home pay', !!(await page.eval(`[...document.querySelectorAll('main a[href="#/profile"]')].some((a) => a.textContent === 'add your take-home pay')`)));

  const dates = await page.eval(`(() => {
    const now = new Date(); const iso = (d) => d.toLocaleDateString('en-CA');
    return { today: iso(now), lastMonth: iso(new Date(now.getFullYear(), now.getMonth() - 1, 10)) };
  })()`);
  await page.eval(inStore(`
    for (const [type, amount, categoryId, date, note] of [
      ['income', '2250', 'c-paycheck', '${dates.today}', 'Paycheck'],
      ['expense', '1400', 'c-housing', '${dates.today}', 'Rent'],
      ['expense', '4.75', 'c-dining', '${dates.today}', 'Coffee'],
      ['expense', '62.18', 'c-groceries', '${dates.today}', ''],
      ['expense', '15.49', 'c-subscriptions', '${dates.today}', 'Netflix'],
      ['expense', '38', 'c-gas', '${dates.today}', ''],
      ['expense', '12', 'c-dining', '${dates.today}', 'Lunch'],
      ['expense', '99', 'c-shopping', '${dates.lastMonth}', 'Last month'],
    ]) await store.addTransaction({ type, amount, categoryId, date, note });
  `));
  await page.sleep(200);
  check('Home updates live: Money in +$2,250.00', (await text('#stat-in')).includes('+$2,250.00'));
  check('Money out −$1,532.42 (this month only)', (await text('#stat-out')).includes('−$1,532.42'));
  check('Left +$717.58', (await text('#stat-left')).includes('+$717.58'));
  const recent = await page.eval(`[...document.querySelectorAll('#recent-title ~ .list .list-row-link')].length`);
  check('Shows the 5 most recent, with "See all 7 in History"', recent === 5 && (await text('#see-all')).includes('See all 7'));

  await click('#home-prev');
  check('Previous month: only last month’s numbers', (await text('#stat-out')).includes('−$99.00') && (await text('#stat-in')).includes('$0.00'));
  await click('#see-all');
  check('"See all" opens History on that same month', (await page.eval('location.hash')) === '#/history' && (await page.eval(`[...document.querySelectorAll('.list-row-link')].some((a) => a.textContent.includes('Last month'))`)));
  await page.goto(`${base}#/home`);
  await click('#home-next');

  // Overspent month: kind wording
  await page.eval(inStore(`await store.addTransaction({ type: 'expense', amount: '1000', categoryId: 'c-shopping', date: '${dates.today}', note: 'Big buy' });`));
  await page.sleep(200);
  check('Overspent: "You’ve spent $282.42 more than came in" (information, not blame)', (await text('#month-summary')).includes('You’ve spent $282.42 more than came in this month.'));

  // Your money
  await page.goto(`${base}#/more`);
  await click('#profile-link');
  check('Your money explains itself and suggests 20%', (await page.eval(`document.getElementById('savings-percent').value`)) === '20' && (await text('#take-home-hint')).includes('after taxes'));
  await page.eval(`document.getElementById('savings-percent').value = '75'`);
  await page.eval(`document.getElementById('profile-form').requestSubmit()`);
  await page.sleep(200);
  check('Out-of-range savings % is explained', (await text('#savings-percent-error')).includes('0 to 50'));
  await page.eval(`document.getElementById('take-home').value = '$4,500'; document.getElementById('savings-percent').value = '15'`);
  await page.eval(`document.getElementById('profile-form').requestSubmit()`);
  await page.sleep(300);
  const meta = await page.eval(inStore(`return store.getState().meta;`));
  check('Saves take-home $4,500 and 15%, back to Home', meta.monthlyTakeHomeCents === 450000 && meta.savingsPercent === 15 && (await page.eval('location.hash')) === '#/home');
  check('Home stops suggesting take-home pay once it’s set', !(await page.eval(`!![...document.querySelectorAll('main a[href="#/profile"]')].some((a) => a.textContent === 'add your take-home pay')`)));
  await page.reload();
  check('Profile survives reload', (await page.eval(inStore(`return store.getState().meta.savingsPercent;`))) === 15);

  // Extra large text
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  for (const hash of ['#/home', '#/profile']) {
    await page.goto(`${base}${hash}`); await page.reload();
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
    check(`Extra large "${hash}": fits`, fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
