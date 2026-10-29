// Categories (E1-S6) and Delete everything (E2-S6).

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

export async function categoriesSuite({ page, check, base }) {
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(200); };
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const setName = (v) => page.eval(`document.getElementById('category-name').value = ${JSON.stringify(v)}`);
  const submit = async () => { await page.eval(`document.getElementById('category-form').requestSubmit()`); await page.sleep(250); };
  const today = await page.eval(`new Date().toLocaleDateString('en-CA')`);

  await page.goto(`${base}#/home`);
  await page.eval(inStore(`await store.addTransaction({ type: 'expense', amount: '12', categoryId: 'c-dining', date: '${today}', note: 'Lunch' });`));

  // List
  await page.goto(`${base}#/more`);
  await click('#manage-categories');
  const rows = await page.eval(`[...document.querySelectorAll('.list-row-link')].map((a) => a.textContent)`);
  check('Categories lists money out and money in with entry counts', rows.length === 21 && rows.some((r) => r.includes('Dining Out') && r.includes('1 entry')) && (await page.eval(`document.querySelector('nav a[aria-current="page"]').dataset.route`)) === 'more');

  // Rename → shows up in Add and History
  await click('a[href="#/category/c-dining"]');
  check('A used category explains why it can’t be deleted (no Delete button)', !(await page.eval(`!!document.getElementById('delete-category')`)) && (await page.eval(`document.querySelector('main').textContent.includes('can’t be deleted')`)));
  await setName('Eating Out');
  await submit();
  check('Rename saves with Undo and returns to the list', (await page.eval('location.hash')) === '#/categories' && (await text('.toast-message')) === 'Saved changes');
  await page.goto(`${base}#/history`);
  check('Renamed category shows in History', await page.eval(`[...document.querySelectorAll('.list-row-link')].some((a) => a.textContent.includes('Eating Out'))`));
  await page.goto(`${base}#/add`);
  check('Renamed category shows in Add', await page.eval(`document.getElementById('category-c-dining').parentElement.textContent.includes('Eating Out')`));

  // Duplicate name
  await page.goto(`${base}#/category/c-shopping`);
  await setName('eating out');
  await submit();
  check('Duplicate name is explained', (await text('#category-name-error')) === 'You already have a “eating out” category.');

  // Add a new category and use it
  await page.goto(`${base}#/category/new`);
  await setName('Pets');
  await page.eval(`[...document.querySelectorAll('input[name="icon"]')].find((i) => i.value === '\u{1f43e}').click()`);
  await page.eval(`document.getElementById('bucket-want').click()`);
  await submit();
  const pets = await page.eval(inStore(`return store.getState().categories.find((c) => c.name === 'Pets');`));
  check('Add a category (name, icon, Need/Want/Savings)', pets?.icon === '\u{1f43e}' && pets.bucket === 'want' && pets.type === 'expense' && (await text('.toast-message')) === 'Added Pets');
  await page.goto(`${base}#/add`);
  await page.eval(`document.getElementById('amount').focus()`);
  await page.type('20');
  await click(`#category-${pets.id}`);
  await click('form button[type="submit"]');
  check('New category can be used right away', (await text('.toast-message')) === 'Added −$20.00 · Pets');

  // Hide: gone from Add, history intact, can show again
  await page.goto(`${base}#/category/c-dining`);
  await click('#toggle-hidden');
  await page.goto(`${base}#/add`);
  check('Hidden category disappears from Add', !(await page.eval(`!!document.getElementById('category-c-dining')`)));
  await page.goto(`${base}#/history`);
  check('…but past entries keep it', await page.eval(`[...document.querySelectorAll('.list-row-link')].some((a) => a.textContent.includes('Eating Out'))`));
  await page.goto(`${base}#/categories`);
  check('List marks it Hidden', await page.eval(`document.querySelector('a[href="#/category/c-dining"]').textContent.includes('Hidden')`));
  await page.goto(`${base}#/category/c-dining`);
  await click('#toggle-hidden');
  await page.goto(`${base}#/add`);
  check('Show it again → back in Add', await page.eval(`!!document.getElementById('category-c-dining')`));

  // Delete an unused category, then Undo
  await page.goto(`${base}#/category/c-gifts`);
  await click('#delete-category');
  check('Unused category can be deleted', (await text('.toast-message')) === 'Deleted Gifts' && !(await page.eval(`!!document.querySelector('a[href="#/category/c-gifts"]')`)));
  await click('.toast-action');
  check('Undo brings it back, and the open list updates right away', await page.eval(`!!document.querySelector('a[href="#/category/c-gifts"]')`));

  // Bad link
  await page.goto(`${base}#/category/<script>`);
  check('Bad category link → friendly message', (await text('main .lead')) === 'This category no longer exists.');

  // Extra large text
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  for (const hash of ['#/categories', '#/category/new', '#/wipe']) {
    await page.goto(`${base}${hash}`); await page.reload();
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').length })`);
    check(`Extra large "${hash}": fits`, fit.sw <= fit.w && fit.clipped === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);

  // Delete everything
  await page.goto(`${base}#/more`);
  await click('#wipe-link');
  check('Delete everything offers a backup first and counts what goes', (await page.eval(`document.querySelector('main').textContent`)).includes('removes 2 entries') && !!(await page.eval(`document.querySelector('main a[href="#/backup"]')`)));
  check('Button stays off until DELETE is typed', await page.eval(`document.getElementById('wipe-button').disabled`));
  await page.eval(`(() => { const i = document.getElementById('wipe-confirm'); i.value = 'delete'; i.dispatchEvent(new Event('input')); })()`);
  check('Lowercase "delete" isn’t enough', await page.eval(`document.getElementById('wipe-button').disabled`));
  await page.eval(`(() => { const i = document.getElementById('wipe-confirm'); i.value = 'DELETE'; i.dispatchEvent(new Event('input')); })()`);
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'large', theme: 'dark' }))`);
  await page.eval(`document.getElementById('wipe-button').click()`);
  await page.sleep(1500);
  const after = await page.eval(inStore(`const s = store.getState(); return { entries: s.transactions.length, categories: s.categories.length, names: s.categories.map((c) => c.name) };`));
  check('Wiped: fresh start with the 21 default categories, renames gone', after.entries === 0 && after.categories === 21 && after.names.includes('Dining Out') && !after.names.includes('Pets'), JSON.stringify({ ...after, names: undefined }));
  check('Wiped: back on Home, display settings reset', (await page.eval('location.hash')) === '#/home' && !(await page.eval(`document.documentElement.hasAttribute('data-theme')`)));
}
