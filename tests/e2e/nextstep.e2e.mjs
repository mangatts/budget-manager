// Next Best Step (E11-S2) and Money Checkup (E11-S3).

// Last month's entries: $4,000 in; housing $1,200, groceries $400, card minimum $100, dining $300; $200 to savings.
const SEED = `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  const t = new Date();
  const date = new Date(t.getFullYear(), t.getMonth() - 1, 15).toLocaleDateString('en-CA');
  for (const [type, categoryId, amount] of [['income', 'c-paycheck', '4000'], ['expense', 'c-housing', '1200'], ['expense', 'c-groceries', '400'], ['expense', 'c-debt-min', '100'], ['expense', 'c-dining', '300'], ['expense', 'c-savings', '200']]) {
    await store.addTransaction({ type, categoryId, amount, date });
  }
})()`;
const SET_FUND = `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  await (await getStore()).setProfile({ takeHome: '', savingsPercent: '20', emergencyFund: '400' });
})()`;

export async function nextStepSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(300); };

  await page.goto(`${base}#/home`);
  await page.sleep(300);
  check('New user: step 1 of 7 asks for pay', (await text('#next-step'))?.includes('Step 1 of 7') && (await text('#next-step-action')) === 'Add your pay');
  check('No checkup before a full month', !(await page.eval(`!!document.getElementById('checkup-link')`)));

  await page.eval(SEED);
  await page.sleep(300);
  check('After a month that balances: step 2 asks about emergency savings', (await text('#next-step'))?.includes('Step 2 of 7') && (await text('#next-step-action')) === 'Answer one question');
  await click('#next-step-action');
  check('…and the answer button opens Your money', (await page.eval('location.hash')) === '#/profile' && !!(await page.eval(`document.getElementById('emergency-fund')`)));

  await page.eval(SET_FUND);
  await page.goto(`${base}#/home`);
  await page.sleep(300);
  check('$400 saved: "$600.00 away" with a progress meter', (await text('#next-step-message')) === 'You’re $600.00 away from a $1,000.00 starter safety net.' && !!(await page.eval(`document.querySelector('#next-step .meter-fill')`)));
  await page.eval(`document.querySelector('#next-step details').open = true`);
  check('"Why this step?" shows the math and source', (await text('#next-step details'))?.includes('$1,000.00') && (await text('#next-step details')).includes('Source:'));

  await click('#skip-starter-fund');
  check('Skip → the next step (401(k) match) takes its place', (await text('#next-step'))?.includes('Step 3 of 7') && (await text('.toast-message')) === 'Step skipped');
  await click('.toast-action');
  await page.sleep(200);
  check('Undo brings step 2 back', (await text('#next-step'))?.includes('Step 2 of 7'));

  await click('#all-steps');
  const rows = await page.eval(`[...document.querySelectorAll('#steps-list li')].map((li) => li.dataset.status)`);
  check('All 7 steps listed: 1 done, 2 current', rows.length === 7 && rows[0] === 'done' && rows[1] === 'current' && rows.filter((r) => r === 'current').length === 1, JSON.stringify(rows));
  await page.eval(`(async () => {
    const { getStore } = await import(new URL('js/appStore.js', location.href));
    await (await getStore()).setStepSkipped('match', true);
  })()`);
  await page.sleep(300);
  check('A skipped step shows "Bring this step back"', (await page.eval(`document.querySelector('#step-match').dataset.status`)) === 'skipped' && !!(await page.eval(`document.getElementById('unskip-match')`)));
  await click('#unskip-match');
  check('…and bringing it back works', (await page.eval(`document.querySelector('#step-match').dataset.status`)) !== 'skipped');

  await page.goto(`${base}#/home`);
  await page.sleep(300);
  // Spending 🟢, savings 5% 🟡, emergency 0.2 months 🔴, housing 30% 🟢, debt 2.5% 🟢 → 70
  check('Home links to last month’s checkup with its score', (await text('#checkup-link'))?.includes('70/100'), await text('#checkup-link'));
  await click('#checkup-link');
  const signals = await page.eval(`[...document.querySelectorAll('[id^="signal-"]')].map((c) => c.dataset.status)`);
  check('Checkup: 70/100 · Getting there, with 5 signals 🟢🟡🔴', (await text('#checkup-value')) === '70/100 · Getting there' && JSON.stringify(signals) === '["good","ok","poor","good","good"]', JSON.stringify(signals));
  await page.eval(`document.querySelector('#signal-housing details').open = true`);
  check('Each signal explains itself, with the source', (await text('#signal-housing'))?.includes('30%') && (await text('#signal-housing')).includes('HUD'));

  await page.eval(`document.documentElement.dataset.textSize = 'extra-large'`);
  await page.sleep(200);
  check('Extra large text: no sideways scrolling', await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`));
}
