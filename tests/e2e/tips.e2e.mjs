// Smart Coach tips (E4-S4, E4-S5, E5-S1).

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

export async function tipsSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);

  await page.goto(`${base}#/tips`);
  check('No data yet: explains what unlocks tips, with an Add button', (await text('#tips-empty'))?.includes('at least 10 expenses') && !!(await page.eval(`document.querySelector('#tips-empty a[href="#/add"]')`)));
  check('Says tips are not financial advice', (await text('main'))?.includes('not financial advice'));

  // Ten days of everyday spending, dining out heavy.
  await page.eval(inStore(`
    // Last month (a complete month), so this check works on any day of the month.
    const day = (n) => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() - 1, 5 + n).toLocaleDateString('en-CA'); };
    for (let n = 0; n < 10; n++) {
      await store.addTransaction({ type: 'expense', amount: '40', categoryId: 'c-dining', date: day(n), note: 'Lunch out' });
      await store.addTransaction({ type: 'expense', amount: '60', categoryId: 'c-groceries', date: day(n) });
      await store.addTransaction({ type: 'expense', amount: '30', categoryId: 'c-gas', date: day(n) });
      await store.addTransaction({ type: 'expense', amount: '70', categoryId: 'c-shopping', date: day(n) });
    }
  `));
  await page.sleep(300);
  const tips = await page.eval(`[...document.querySelectorAll('#tips-list .tip')].map((t) => ({ title: t.querySelector('h3').textContent, text: t.querySelector('p').textContent }))`);
  const dining = tips.find((t) => t.title.startsWith('Dining Out'));
  check('Tips appear live, biggest first, with a summary line', tips.length >= 2 && (await text('#tips-summary'))?.includes('Biggest first'), JSON.stringify(tips.map((t) => t.title)));
  check('Dining out tip compares share of SPENDING to typical households, with dollars', dining?.text.startsWith('Dining Out is 20% of your spending. A typical household spends about 6%.') && /free up about \$\d+ a month/.test(dining.text), dining?.text);
  check('Gas (below typical) gets no tip', !tips.some((t) => t.title.startsWith('Gas')));
  check('Shopping (too broad to compare with any typical figure) gets no comparison tip', !tips.some((t) => t.title.startsWith('Shopping is above typical')));

  await page.eval(`document.querySelector('#tips-list .tip details').open = true`);
  const why = await page.eval(`(() => { const d = document.querySelector('#tips-list .tip details'); return { lines: [...d.querySelectorAll('.math-line')].map((l) => l.textContent), notes: [...d.querySelectorAll('.field-hint')].map((p) => p.textContent) }; })()`);
  check('"Why am I seeing this?" shows the math and the source', why.lines.length >= 4 && why.notes.some((n) => n.includes('Source:')), JSON.stringify(why));

  // Home shows the top 2, never more
  await page.goto(`${base}#/home`);
  const home = await page.eval(`({ count: document.querySelectorAll('#home-tips .tip').length, link: !!document.getElementById('all-tips') })`);
  check('Home shows the top 2 tips and "See all tips"', home.count === 2 && home.link, JSON.stringify(home));

  // Extra large text
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  for (const hash of ['#/tips', '#/home']) {
    await page.goto(`${base}${hash}`); await page.reload();
    await page.eval(`document.querySelectorAll('.tip details').forEach((d) => { d.open = true; })`);
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
    check(`Extra large "${hash}": fits`, fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
