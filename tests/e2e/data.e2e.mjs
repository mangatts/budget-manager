// On-device data with the real IndexedDB: saving, carrying over old data, and surviving a reload and a full browser restart.
import { removeProfile } from './browser.mjs';

// Runs inside the page: loads the app's own store module.
const withStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

const snapshot = withStore(`
  const s = store.getState();
  return { ready: s.ready, cards: s.cards.map((c) => c.name), mins: s.cards.map((c) => c.minPaymentCents), carried: s.meta.carriedOver };
`);

export async function dataSuite({ page, check, base, launch, newProfile }) {
  await page.goto(`${base}#/home`);
  let s = await page.eval(snapshot);
  check('Database opens empty and ready', s.ready && s.cards.length === 0 && s.carried === 1, JSON.stringify(s));

  const added = await page.eval(withStore(`
    const a = await store.addCard({ name: 'Chase', apr: '24.99', minPayment: '35' });
    const b = await store.addIncome({ name: 'Paycheck', amount: '1,850.00', frequency: 'biweekly' });
    const bad = await store.addCard({ name: 'Bad', apr: '24.99', minPayment: '-3' });
    const xss = await store.addCard({ name: '<img src=x onerror=alert(1)>', apr: '1', minPayment: '1' });
    return { a: a.ok, b: b.ok, bad: bad.ok, badError: bad.errors?.minPayment, xss: xss.ok };
  `));
  check('Valid records save; invalid ones are rejected with a message', added.a && added.b && added.xss && added.bad === false && added.badError === 'Enter an amount like 12.50', JSON.stringify(added));

  await page.reload();
  s = await page.eval(snapshot);
  check('Reload → cards still there', s.cards.length === 2 && s.cards.includes('Chase') && s.mins.includes(3500), JSON.stringify(s));
  check('Markup in a name is shown as text, never run', await page.eval(`document.querySelectorAll('main img').length === 0`));

  const undone = await page.eval(withStore(`
    const { undo } = await store.addCard({ name: 'Undo me', apr: '1', minPayment: '1' });
    await undo();
    return store.getState().cards.some((c) => c.name === 'Undo me');
  `));
  await page.reload();
  check('Undo removes it from the database too', !undone && !(await page.eval(snapshot)).cards.includes('Undo me'));

  // A device that used the earlier version: its debts, bills and pay come over on first open.
  const legacy = await page.eval(`(async () => {
    const name = 'bm-legacy-test';
    const { openIndexedDb, MIGRATIONS } = await import(new URL('js/db/indexeddb.js', location.href));
    const { createRepository } = await import(new URL('js/db/repository.js', location.href));
    const { createStore } = await import(new URL('js/store.js', location.href));
    // Build a version-7 database by hand, like the old app left it.
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 7);
      req.onupgradeneeded = () => { for (let v = 0; v < 7; v++) MIGRATIONS[v](req.result); };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['debts', 'bills', 'meta'], 'readwrite');
        tx.objectStore('debts').put({ id: '00000000-0000-4000-8000-000000000001', name: 'Visa', balanceCents: 240000, aprBps: 2499, minPaymentCents: 7500, createdAt: 1, updatedAt: 1 });
        tx.objectStore('bills').put({ id: '00000000-0000-4000-8000-000000000002', name: 'Rent', amountCents: 140000, categoryId: 'c-housing', dayOfMonth: 1, active: true, createdAt: 1, updatedAt: 1 });
        tx.objectStore('meta').put({ key: 'monthlyTakeHomeCents', value: 450000 });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
    const adapter = await openIndexedDb({ name });
    const store = createStore({ repo: createRepository(adapter) });
    await store.init();
    const st = store.getState();
    adapter.close();
    await new Promise((r) => { const d = indexedDB.deleteDatabase(name); d.onsuccess = d.onerror = d.onblocked = r; });
    return { cards: st.cards.map((c) => c.name), balance: st.checkins[0]?.balances[0]?.balanceCents, expenses: st.expenses.map((e) => e.name), income: st.incomes[0]?.amountCents };
  })()`);
  check('Upgrading from the earlier version carries debts, bills and pay over', legacy.cards.join() === 'Visa' && legacy.balance === 240000 && legacy.expenses.join() === 'Rent' && legacy.income === 450000, JSON.stringify(legacy));

  const atomic = await page.eval(`(async () => {
    const { openIndexedDb } = await import(new URL('js/db/indexeddb.js', location.href));
    const db = await openIndexedDb();
    let failed = false;
    try { await db.putMany('meta', [{ key: 'atomic-a', value: 1 }, { value: 'no key' }]); } catch { failed = true; }
    const leaked = await db.get('meta', 'atomic-a');
    db.close();
    return { failed, leaked: leaked !== undefined };
  })()`);
  check('putMany is all-or-nothing: one bad record saves none', atomic.failed && !atomic.leaked, JSON.stringify(atomic));

  const retry = await page.eval(`(async () => {
    const { getStore } = await import(new URL('js/appStore.js', location.href) + '?retry');
    const real = indexedDB.open.bind(indexedDB);
    let calls = 0;
    indexedDB.open = (...args) => { calls++; if (calls === 1) throw new Error('simulated failure'); return real(...args); };
    let firstFailed = false;
    try { await getStore(); } catch { firstFailed = true; }
    const store = await getStore();
    indexedDB.open = real;
    return { firstFailed, recovered: store.getState().ready, calls };
  })()`);
  // 3 opens: the failed try, then the people list and that person's data.
  check('If opening the database fails once, the next try works (not stuck)', retry.firstFailed && retry.recovered && retry.calls === 3, JSON.stringify(retry));

  // Full browser restart with the same profile: the real "close the app and come back tomorrow" test.
  const profile = newProfile();
  try {
    const first = await launch({ profile });
    await first.goto(`${base}#/home`);
    await first.eval(withStore(`
      await store.addCard({ name: 'Survives restart', apr: '12.34', minPayment: '12.34' });
    `));
    await first.close();

    const second = await launch({ profile });
    await second.goto(`${base}#/home`);
    const after = await second.eval(snapshot);
    check('Close Chrome completely and reopen → card still there', after.cards.includes('Survives restart') && after.mins.includes(1234), JSON.stringify(after));
    const problems = [...first.problems, ...second.problems];
    await second.close();
    check('No errors across the restart', problems.length === 0, problems.join(' | '));
  } finally {
    removeProfile(profile);
  }
}
