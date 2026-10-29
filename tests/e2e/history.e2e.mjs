// History + Edit: months, search, grouping, edit with Undo, delete with Undo, bad links, keyboard (E1-S5).

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

export async function historySuite({ page, check, base }) {
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(200); };
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const rows = () => page.eval(`[...document.querySelectorAll('.list-row-link')].map((a) => a.textContent)`);
  const headings = () => page.eval(`[...document.querySelectorAll('.day-heading')].map((h) => h.textContent)`);

  await page.goto(`${base}#/history`);
  const dates = await page.eval(`(() => {
    const iso = (d) => d.toLocaleDateString('en-CA');
    const now = new Date();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    return { today: iso(now), yesterday: iso(yesterday), lastMonth: iso(lastMonth), sameMonth: iso(yesterday).slice(0, 7) === iso(now).slice(0, 7) };
  })()`);
  check('Empty month shows a friendly message and an Add button', (await text('main .lead'))?.startsWith('No entries in') && !!(await page.eval(`document.querySelector('main a[href="#/add"]')`)));

  const ids = await page.eval(inStore(`
    const add = async (x) => (await store.addTransaction(x)).record.id;
    return {
      coffee: await add({ type: 'expense', amount: '4.75', categoryId: 'c-dining', date: ${JSON.stringify(dates.today)}, note: 'Coffee with Sam' }),
      pay: await add({ type: 'income', amount: '1850', categoryId: 'c-paycheck', date: ${JSON.stringify(dates.today)} }),
      groceries: await add({ type: 'expense', amount: '86.42', categoryId: 'c-groceries', date: ${JSON.stringify(dates.yesterday)}, note: '<img src=x onerror=alert(1)>' }),
      old: await add({ type: 'expense', amount: '12', categoryId: 'c-dining', date: ${JSON.stringify(dates.lastMonth)}, note: 'Old lunch' }),
    };
  `));
  await page.sleep(200);

  // The list updates live (the store was changed while the screen was open).
  let r = await rows();
  const expectThisMonth = dates.sameMonth ? 3 : 2;
  check('List updates live and shows this month only', r.length === expectThisMonth && !r.some((x) => x.includes('Old lunch')), JSON.stringify(r));
  const h = await headings();
  check('Grouped under "Today" (and "Yesterday")', h[0] === 'Today' && (!dates.sameMonth || h[1] === 'Yesterday'), JSON.stringify(h));
  check('Amounts are signed: +$1,850.00 in, −$4.75 out', r.some((x) => x.includes('+$1,850.00')) && r.some((x) => x.includes('−$4.75')));
  const summary = await text('.history-summary');
  check('Month summary shows money in and out', summary.includes('+$1,850.00') && summary.includes(dates.sameMonth ? '−$91.17' : '−$4.75'), summary);
  check('A note that looks like HTML is shown as text, never run', !dates.sameMonth || (r.some((x) => x.includes('<img src=x onerror=alert(1)>')) && !(await page.eval(`!!document.querySelector('main img')`))));

  // Search
  await page.eval(`(() => { const s = document.getElementById('history-search'); s.value = 'COFFEE'; s.dispatchEvent(new Event('input')); })()`);
  r = await rows();
  check('Search by note (any case)', r.length === 1 && r[0].includes('Coffee with Sam'));
  await page.eval(`(() => { const s = document.getElementById('history-search'); s.value = 'paycheck'; s.dispatchEvent(new Event('input')); })()`);
  check('Search by category name', (await rows()).length === 1);
  await page.eval(`(() => { const s = document.getElementById('history-search'); s.value = 'zzz'; s.dispatchEvent(new Event('input')); })()`);
  check('No match says so', (await text('main .lead'))?.startsWith('Nothing matches'));
  await page.eval(`(() => { const s = document.getElementById('history-search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);

  // Months
  await click('#prev-month');
  r = await rows();
  check('Previous month shows last month’s entries', r.some((x) => x.includes('Old lunch')), JSON.stringify(r));
  await click('#next-month');
  check('Next month comes back', (await rows()).length === expectThisMonth);

  // Edit: tap a row → prefilled form → change → Save → back to History, updated, undoable
  await click(`a[href="#/edit/${ids.coffee}"]`);
  const form = await page.eval(`({ hash: location.hash, h1: document.querySelector('main h1')?.textContent, amount: document.getElementById('amount')?.value, cat: document.querySelector('input[name="categoryId"]:checked')?.value, note: document.getElementById('note')?.value, tab: document.querySelector('nav a[aria-current="page"]')?.dataset.route })`);
  check('Tapping a row opens Edit, prefilled (History tab stays highlighted)', form.hash === `#/edit/${ids.coffee}` && form.h1 === 'Edit' && form.amount === '4.75' && form.cat === 'c-dining' && form.note === 'Coffee with Sam' && form.tab === 'history', JSON.stringify(form));
  await page.eval(`document.getElementById('amount').value = '5.25'`);
  await click('form button[type="submit"]');
  await page.sleep(200);
  check('Save changes → back to History with the new amount', (await page.eval('location.hash')) === '#/history' && (await rows()).some((x) => x.includes('−$5.25')) && (await text('.toast-message')) === 'Saved changes');
  await click('.toast-action');
  check('Undo restores the old amount', (await rows()).some((x) => x.includes('−$4.75')) && !(await rows()).some((x) => x.includes('−$5.25')));

  // Moving an entry to another month: History follows it there
  await click(`a[href="#/edit/${ids.coffee}"]`);
  await page.eval(`document.getElementById('date').value = ${JSON.stringify(dates.lastMonth)}`);
  await click('form button[type="submit"]');
  await page.sleep(200);
  check('Changing the date to last month → History shows last month, with the entry', (await rows()).some((x) => x.includes('Coffee with Sam')) && (await rows()).some((x) => x.includes('Old lunch')));
  await click('.toast-action');
  await click('#next-month');

  // Delete with Undo
  await click(`a[href="#/edit/${ids.pay}"]`);
  await click('.btn-danger');
  await page.sleep(200);
  check('Delete → back to History, gone, toast names it', !(await rows()).some((x) => x.includes('+$1,850.00')) && (await text('.toast-message')) === 'Deleted +$1,850.00 · Paycheck');
  await click('.toast-action');
  check('Undo brings it back', (await rows()).some((x) => x.includes('+$1,850.00')));

  // Bad and stale links
  for (const [label, hash] of [['junk', '#/edit/<img src=x onerror=alert(1)>'], ['unknown id', '#/edit/3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c'], ['missing id', '#/edit']]) {
    await page.goto(`${base}${hash}`);
    check(`Edit link with ${label} → "no longer exists" + way back`, (await text('main .lead'))?.startsWith('This entry no longer exists') && !(await page.eval(`!!document.querySelector('main form')`)));
  }

  // Persistence and keyboard
  await page.goto(`${base}#/history`); await page.reload();
  check('Reload → everything still listed', (await rows()).length === expectThisMonth);
  await page.eval(`document.getElementById('history-search').focus()`);
  await page.key('Tab', 'Tab', 9);
  await page.key('Enter', 'Enter', 13);
  check('Keyboard: Tab from search to the first row, Enter opens Edit', (await page.eval('location.hash')).startsWith('#/edit/'));

  // Extra large text
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  for (const hash of ['#/history', `#/edit/${ids.coffee}`]) {
    await page.goto(`${base}${hash}`); await page.reload();
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
    check(`Extra large "${hash.split('/')[1]}": no sideways scroll, nothing clipped`, fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
