// Cut Plan (E10-S1, E10-S2). Month-end results (E10-S3) depend on the date, so they're unit-tested.

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

export async function cutPlanSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(300); };

  await page.goto(`${base}#/tips`);
  check('No history yet: no Cut Plan', !(await page.eval(`!!document.getElementById('cut-plan')`)));

  // Three past months of Dining Out (~$310) and Entertainment ($200)
  await page.eval(inStore(`
    const month = (n, day) => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth() - n, day).toLocaleDateString('en-CA'); };
    for (const [n, dining] of [[1, '310'], [2, '300'], [3, '320']]) {
      await store.addTransaction({ type: 'expense', amount: dining, categoryId: 'c-dining', date: month(n, 10) });
      await store.addTransaction({ type: 'expense', amount: '200', categoryId: 'c-entertainment', date: month(n, 12) });
    }
  `));
  await page.sleep(300);
  const suggestions = await page.eval(`[...document.querySelectorAll('#cut-plan [id^="suggest-"] h3')].map((h) => h.textContent)`);
  check('Suggests two realistic challenges from your own history', suggestions.length === 2 && suggestions[0].includes('Dining Out: $310.00 → $275.00') && suggestions[1].includes('Entertainment: $200.00 → $180.00'), JSON.stringify(suggestions));

  await click('#suggest-c-dining .btn-primary');
  check('Take the challenge → toast with Undo', (await text('.toast-message'))?.startsWith('Challenge on: Dining Out $275.00'));
  const active = await page.eval(`(() => { const c = document.querySelector('#cut-plan [id^="challenge-"]'); return c ? { h: c.querySelector('h3').textContent, pill: c.querySelector('.pill').textContent } : null; })()`);
  check('Active challenge shows with "On track"', active?.h.includes('Dining Out: $275.00 this month') && active.pill.includes('On track'), JSON.stringify(active));

  await click('#suggest-c-entertainment .btn-quiet');
  check('"Not this month" removes the suggestion', !(await page.eval(`!!document.getElementById('suggest-c-entertainment')`)));

  // Progress on Home
  await page.eval(inStore(`await store.addTransaction({ type: 'expense', amount: '300', categoryId: 'c-dining', date: new Date().toLocaleDateString('en-CA') });`));
  await page.goto(`${base}#/home`);
  const home = await page.eval(`(() => { const c = document.querySelector('#home-challenges [id^="challenge-"]'); return c ? { pill: c.querySelector('.pill').textContent, head: c.querySelector('.meter-head').textContent, warn: !!c.querySelector('.meter-warn') } : null; })()`);
  check('Home shows the challenge; going over shows ⚠ and how much', home?.pill.includes('Over the target') && home.head.includes('$300.00 spent') && home.head.includes('$25.00 over') && home.warn, JSON.stringify(home));

  // Stop + Undo
  await click('#home-challenges .btn-quiet');
  check('Stop the challenge', !(await page.eval(`!!document.getElementById('home-challenges')`)));
  await click('.toast-action');
  check('Undo brings it back', await page.eval(`!!document.getElementById('home-challenges')`));

  // Extra large text
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  for (const hash of ['#/home', '#/tips']) {
    await page.goto(`${base}${hash}`); await page.reload();
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
    check(`Extra large "${hash}": fits`, fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
