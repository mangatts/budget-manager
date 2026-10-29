// Needs / Wants / Savings vs. 50/30/20 on Home (E4-S3).

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

export async function splitSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const today = await page.eval(`new Date().toLocaleDateString('en-CA')`);

  await page.goto(`${base}#/home`);
  check('Before any entries: explains when it will appear', (await text('#split-empty'))?.includes('5 entries'));
  await page.eval(inStore(`
    for (const [amount, categoryId] of [['1400', 'c-housing'], ['400', 'c-groceries'], ['1300', 'c-dining'], ['200', 'c-shopping'], ['400', 'c-savings']])
      await store.addTransaction({ type: 'expense', amount, categoryId, date: '${today}' });
  `));
  await page.sleep(200);
  check('With entries but no pay: asks for take-home pay', (await text('#split-empty'))?.includes('take-home pay'));
  await page.eval(inStore(`await store.setProfile({ takeHome: '4000', savingsPercent: '20' });`));
  await page.sleep(300);

  // needs 1,800 = 45% · wants 1,500 = 38% (37.5 rounds up) · savings 400 = 10%
  const meters = await page.eval(`[...document.querySelectorAll('.meter')].map((m) => {
    const track = m.querySelector('.meter-track').getBoundingClientRect();
    const fill = m.querySelector('.meter-fill').getBoundingClientRect();
    const marker = m.querySelector('.meter-marker').getBoundingClientRect();
    return { id: m.id, value: m.querySelector('.meter-value').textContent, status: m.querySelector('.meter-status').textContent,
      fillPct: Math.round((fill.width / track.width) * 100), markerPct: Math.round(((marker.left + marker.width / 2 - track.left) / track.width) * 100),
      warn: m.querySelector('.meter-fill').classList.contains('meter-warn'), height: track.height };
  })`);
  const byId = Object.fromEntries(meters.map((m) => [m.id, m]));
  check('Three meters with % of income and the guideline in words', byId['meter-need']?.value === '45% · guideline 50%' && byId['meter-want']?.value === '38% · guideline 30%' && byId['meter-savings']?.value === '10% · guideline 20%', JSON.stringify(meters.map((m) => m.value)));
  check('Bar lengths match the numbers (45 / 38 / 10)', byId['meter-need'].fillPct === 45 && byId['meter-want'].fillPct === 38 && byId['meter-savings'].fillPct === 10, JSON.stringify(meters.map((m) => m.fillPct)));
  check('Guideline markers sit at 50 / 30 / 20', byId['meter-need'].markerPct === 50 && byId['meter-want'].markerPct === 30 && byId['meter-savings'].markerPct === 20, JSON.stringify(meters.map((m) => m.markerPct)));
  check('Status uses color AND words: wants above, savings below, needs within', byId['meter-want'].warn && byId['meter-want'].status.includes('Above guideline') && byId['meter-savings'].warn && byId['meter-savings'].status.includes('Below guideline') && !byId['meter-need'].warn && byId['meter-need'].status.includes('Within'));
  check('Thin bars (≤ 24px)', meters.every((m) => m.height > 0 && m.height <= 24), JSON.stringify(meters.map((m) => m.height)));
  // Gaps: wants +8 points, savings −10 points → savings leads.
  check('One plain sentence leads with the biggest gap', (await text('#split-headline')) === 'You’ve put 10% of your income toward savings so far. The guideline is 20%.', await text('#split-headline'));

  // Readout on keyboard focus (and hover)
  // Reach it with the keyboard, so :focus-visible applies as it would for a real keyboard user.
  await page.eval(`document.getElementById('meter-need').focus()`);
  await page.key('Tab', 'Tab', 9);
  const tip = await page.eval(`(() => { const t = document.querySelector('#meter-want .meter-tip'); return { text: t.textContent, shown: getComputedStyle(t).opacity }; })()`);
  check('Tab to a meter → dollars readout appears ("$1,500.00 of $4,000.00 income")', tip.text === '$1,500.00 of $4,000.00 income' && tip.shown === '1', JSON.stringify(tip));

  // Table view
  const rows = await page.eval(`[...document.querySelectorAll('#split-table tbody tr')].map((r) => r.textContent)`);
  check('Table view has every number (for screen readers and anyone who prefers it)', rows.length === 3 && rows[1] === 'Wants$1,500.0038%30%', JSON.stringify(rows));
  check('Source and "not financial advice" are stated', (await text('#split'))?.includes('All Your Worth') && (await text('#split')).includes('not financial advice'));

  // Extra large text, both themes
  for (const theme of ['light', 'dark']) {
    await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: '${theme}' }))`);
    await page.reload();
    await page.eval(`document.querySelectorAll('#split details').forEach((d) => { d.open = true; })`);
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('#split *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
    check(`Extra large text, ${theme}: chart and table fit`, fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
