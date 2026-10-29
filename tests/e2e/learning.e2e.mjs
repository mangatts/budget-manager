// Tips that learn: feedback, ranking by money, and "did it work?" (E6-S1–S3).

// Last month: ten days of everyday spending, dining out heavy (same as the tips suite).
const SEED = `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  const day = (n) => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() - 1, 5 + n).toLocaleDateString('en-CA'); };
  for (let n = 0; n < 10; n++) {
    await store.addTransaction({ type: 'expense', amount: '40', categoryId: 'c-dining', date: day(n), note: 'Lunch out' });
    await store.addTransaction({ type: 'expense', amount: '60', categoryId: 'c-groceries', date: day(n) });
    await store.addTransaction({ type: 'expense', amount: '30', categoryId: 'c-gas', date: day(n) });
    await store.addTransaction({ type: 'expense', amount: '70', categoryId: 'c-shopping', date: day(n) });
  }
})()`;
// Last month you said "I'm on it" to Dining Out with a usual of $500; you spent $400 → cut by $100.
const LAST_MONTH_ON_IT = `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  const t = new Date();
  const last = new Date(t.getFullYear(), t.getMonth() - 1, 1).toLocaleDateString('en-CA').slice(0, 7);
  const snap = store.snapshot();
  await store.replaceAll({ ...snap, feedback: [...snap.feedback, { id: '3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c', topic: 'pace|c-dining', insightType: 'pace', month: last, reaction: 'on-it', categoryIds: ['c-dining'], baselineCents: 50000, createdAt: 1 }] });
})()`;

export async function learningSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(300); };
  const dining = '#tips-list .tip[id^="tip-mix-food-away"]';

  await page.goto(`${base}#/tips`);
  await page.eval(SEED);
  await page.sleep(400);
  check('Each tip shows what it could save a month', /^About \$\d+ a month$/.test((await text(`${dining} .tip-value`)) ?? ''), await text(`${dining} .tip-value`));
  check('Each tip asks for feedback', (await page.eval(`document.querySelectorAll('${dining} .tip-feedback button').length`)) === 4);

  await click(`${dining} [id^="fb-up-"]`);
  check('👍 → thanks, with Undo, and the button stays pressed', (await text('.toast-message')) === 'Thanks. You’ll see more tips like this.' && (await page.eval(`document.querySelector('${dining} [id^="fb-up-"]').getAttribute('aria-pressed')`)) === 'true');

  await click(`${dining} [id^="fb-on-it-"]`);
  check('"I’m on it" → marked, with this month’s progress against your usual', (await text(`${dining} .pill`)) === '✓ You’re on it' && (await text(`${dining} [id^="onit-"]`))?.includes('against your usual $400.00'), await text(`${dining} [id^="onit-"]`));

  const count = await page.eval(`document.querySelectorAll('#tips-list .tip').length`);
  const other = await page.eval(`[...document.querySelectorAll('#tips-list .tip')].find((t) => !t.id.startsWith('tip-mix-food-away')).id`);
  await click(`#${other} [id^="fb-not-now-"]`);
  check('"Not now" hides that tip this month', (await page.eval(`document.querySelectorAll('#tips-list .tip').length`)) === count - 1 && (await text('.toast-message')) === 'Hidden until next month.');
  await click('.toast-action');
  check('…and Undo brings it back', (await page.eval(`document.querySelectorAll('#tips-list .tip').length`)) === count);

  await page.eval(LAST_MONTH_ON_IT);
  await page.goto(`${base}#/tips`);
  await page.sleep(400);
  check('Next month: "You cut Dining Out by $100.00" 🎉', (await text('#onit-results'))?.includes('You cut Dining Out by $100.00 last month: $400.00 against your usual $500.00'), await text('#onit-results'));

  await page.goto(`${base}#/home`);
  await page.sleep(400);
  check('Home tips have feedback buttons too', (await page.eval(`document.querySelectorAll('#home-tips .tip-feedback').length`)) >= 1);
}
