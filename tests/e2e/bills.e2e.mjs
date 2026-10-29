// Bills + Safe to Spend (E9-S1–S3), and the first real database upgrade (v1 → v2).

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;
const usd = (cents) => (cents < 0 ? '−' : '') + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(cents) / 100);

export async function billsSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(200); };
  const today = await page.eval(`new Date().toLocaleDateString('en-CA')`);
  const [y, m, d] = today.split('-').map(Number);
  const daysLeft = new Date(Date.UTC(y, m, 0)).getUTCDate() - d + 1;

  // ── 1. A Sprint 2 (v1) database upgrades without losing anything ──
  await page.goto(`${base}manifest.json`); // same site, but the app doesn't run here
  await page.eval(`(async () => {
    const { DEFAULT_CATEGORIES } = await import(new URL('js/services/categories.js', location.href));
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('budget-manager', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        const tx = db.createObjectStore('transactions', { keyPath: 'id' });
        tx.createIndex('date', 'date'); tx.createIndex('categoryId', 'categoryId');
        db.createObjectStore('categories', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const t = db.transaction(['transactions', 'categories', 'meta'], 'readwrite');
        for (const c of DEFAULT_CATEGORIES) t.objectStore('categories').put({ ...c });
        t.objectStore('meta').put({ key: 'seededCategories', value: 1 });
        t.objectStore('transactions').put({ id: '3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c', type: 'expense', amountCents: 475, categoryId: 'c-dining', date: '${today}', note: 'From version 1', source: 'manual', importId: null, fingerprint: null, createdAt: 1, updatedAt: 1 });
        t.oncomplete = () => { db.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });
  })()`);
  // Opening manifest.json directly makes Chrome ask for /favicon.ico (404). That's this setup step, not the app.
  page.problems.splice(0, page.problems.length, ...page.problems.filter((p) => !p.includes('404')));
  await page.goto(`${base}#/home`);
  await page.sleep(300);
  const upgraded = await page.eval(`(async () => {
    const version = await new Promise((r) => { const q = indexedDB.open('budget-manager'); q.onsuccess = () => { r({ v: q.result.version, stores: [...q.result.objectStoreNames] }); q.result.close(); }; });
    const { getStore } = await import(new URL('js/appStore.js', location.href));
    const s = (await getStore()).getState();
    return { ...version, notes: s.transactions.map((t) => t.note), categories: s.categories.length, bills: s.bills.length };
  })()`);
  check('v1 database upgrades to v2: entries and categories kept, bills store added', upgraded.v === 2 && upgraded.stores.includes('bills') && upgraded.notes.includes('From version 1') && upgraded.categories === 21 && upgraded.bills === 0, JSON.stringify(upgraded));

  // ── 2. Safe to Spend ──
  check('No pay yet → friendly prompt instead of a number', (await text('#safe-card'))?.includes('Add your pay'));
  await page.eval(inStore(`
    await store.setProfile({ takeHome: '4500', savingsPercent: '20' });
    await store.addBill({ name: 'Phone', amount: '65', categoryId: 'c-utilities', dayOfMonth: 28 });
    await store.addTransaction({ type: 'expense', amount: '62.18', categoryId: 'c-groceries', date: '${today}' });
  `));
  await page.sleep(300);
  // 4,500 − phone 65 − 20% 900 − spent (4.75 + 62.18) = 3,468.07
  const left = 450000 - 6500 - 90000 - 6693;
  check(`Safe to spend today = ${usd(Math.floor(left / daysLeft))} (${usd(left)} ÷ ${daysLeft} days)`, (await text('#safe-amount')) === usd(Math.floor(left / daysLeft)), await text('#safe-amount'));
  await page.eval(`document.getElementById('safe-why').open = true`);
  const why = await page.eval(`Object.fromEntries([...document.querySelectorAll('#safe-why .math-line')].map((li) => [li.id, li.lastElementChild.textContent]))`);
  check('"Why?" shows every step with real numbers', why['why-income'] === '+ $4,500.00' && why['why-bills'] === '− $65.00' && why['why-savings'] === '− $900.00' && why['why-spent'] === '− $66.93' && why['why-left'] === '+' + usd(left), JSON.stringify(why));

  // Paying the bill: the reserve is released, the payment counts as spending instead (net unchanged)
  await page.eval(inStore(`await store.addTransaction({ type: 'expense', amount: '66.10', categoryId: 'c-utilities', date: '${today}', note: 'Phone bill' });`));
  await page.sleep(300);
  const afterPay = await page.eval(`Object.fromEntries([...document.querySelectorAll('#safe-why .math-line')].map((li) => [li.id, li.lastElementChild.textContent]))`);
  check('Logging the phone payment (within 10%) marks it paid: bills due → $0', afterPay['why-bills'] === '− $0.00' && afterPay['why-left'] === '+' + usd(left - 110), JSON.stringify(afterPay));

  // ── 3. Bills screen ──
  await page.goto(`${base}#/more`);
  await click('#bills-link');
  check('Bills list shows Phone as paid', (await text('#bill-list'))?.includes('Phone') && (await text('#bill-list')).includes('Paid'));
  await click('#add-bill');
  await page.eval(`document.getElementById('bill-form').requestSubmit()`);
  await page.sleep(200);
  check('Empty bill form explains every field', (await text('#bill-name-error'))?.includes('Give it a name') && (await text('#bill-amount-error')) === 'Enter an amount' && (await text('#bill-category-error')) === 'Pick a category' && (await text('#bill-day-error')) === 'Enter a day from 1 to 31');
  const soon = await page.eval(`(() => { const t = new Date(); t.setDate(t.getDate() + 2); return t.getDate(); })()`);
  await page.eval(`document.getElementById('bill-name').value = 'Rent'; document.getElementById('bill-amount').value = '1,400'; document.getElementById('bill-category').value = 'c-housing'; document.getElementById('bill-day').value = '${soon}'`);
  await page.eval(`document.getElementById('bill-form').requestSubmit()`);
  await page.sleep(300);
  check('Add a bill → back to Bills, with Undo', (await page.eval('location.hash')) === '#/bills' && (await text('.toast-message')) === 'Added Rent');
  await page.goto(`${base}#/home`);
  check('Home lists it under "Bills coming up"', (await text('#upcoming'))?.includes('Rent') && (await text('#upcoming')).includes('$1,400.00'));
  const rentId = await page.eval(inStore(`return store.getState().bills.find((b) => b.name === 'Rent').id;`));
  await page.goto(`${base}#/bill/${rentId}`);
  await click('#delete-bill');
  check('Delete a bill', !(await text('#bill-list'))?.includes('Rent'));
  await click('.toast-action');
  check('Undo brings the bill back (list updates live)', (await text('#bill-list'))?.includes('Rent'));

  // ── 4. Over for the month: information, not blame ──
  await page.eval(inStore(`await store.setProfile({ takeHome: '100', savingsPercent: '0' }); await store.addTransaction({ type: 'income', amount: '1', categoryId: 'c-paycheck', date: '${today}' });`));
  await page.goto(`${base}#/home`);
  check('Overspent → $0.00 a day and a calm "Over for the month" note', (await text('#safe-amount')) === '$0.00' && (await text('#safe-detail')).includes('Over for the month') && (await text('#safe-detail')).includes('catch it up'));

  // ── 5. Extra large text ──
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  for (const hash of ['#/home', '#/bills', '#/bill/new']) {
    await page.goto(`${base}${hash}`); await page.reload();
    if (hash === '#/home') await page.eval(`document.getElementById('safe-why') && (document.getElementById('safe-why').open = true)`);
    const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
    check(`Extra large "${hash}": fits`, fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  }
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
