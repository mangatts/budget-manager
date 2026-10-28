// On-device data with the real IndexedDB: seeding, saving, and surviving a reload and a full browser restart (E1-S1, E1-S2).
import { removeProfile } from './browser.mjs';

// Runs inside the page: loads the app's own store module.
const withStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;

const snapshot = withStore(`
  const s = store.getState();
  return { ready: s.ready, categories: s.categories.length, notes: s.transactions.map((t) => t.note), cents: s.transactions.map((t) => t.amountCents) };
`);

export async function dataSuite({ page, check, base, launch, newProfile }) {
  await page.goto(`${base}#/home`);
  let s = await page.eval(snapshot);
  check('Database opens and seeds 21 default categories', s.ready && s.categories === 21, JSON.stringify(s));

  const added = await page.eval(withStore(`
    const today = new Date().toLocaleDateString('en-CA');
    const a = await store.addTransaction({ type: 'expense', amount: '4.75', categoryId: 'c-dining', date: today, note: 'Coffee' });
    const b = await store.addTransaction({ type: 'income', amount: '1,850.00', categoryId: 'c-paycheck', date: today, note: 'Paycheck' });
    const bad = await store.addTransaction({ type: 'expense', amount: '-3', categoryId: 'c-dining', date: today });
    const xss = await store.addTransaction({ type: 'expense', amount: '1', categoryId: 'c-other', date: today, note: '<img src=x onerror=alert(1)>' });
    return { a: a.ok, b: b.ok, bad: bad.ok, badError: bad.errors?.amount, xss: xss.ok };
  `));
  check('Valid entries save; invalid ones are rejected with a message', added.a && added.b && added.xss && added.bad === false && added.badError === 'Enter an amount like 12.50', JSON.stringify(added));

  await page.reload();
  s = await page.eval(snapshot);
  check('Reload → entries still there, categories not duplicated', s.categories === 21 && s.notes.length === 3 && s.notes.includes('Coffee') && s.cents.includes(185000), JSON.stringify(s));

  const undone = await page.eval(withStore(`
    const today = new Date().toLocaleDateString('en-CA');
    const { undo } = await store.addTransaction({ type: 'expense', amount: '9.99', categoryId: 'c-shopping', date: today, note: 'Undo me' });
    await undo();
    return store.getState().transactions.some((t) => t.note === 'Undo me');
  `));
  await page.reload();
  check('Undo removes it from the database too', !undone && !(await page.eval(snapshot)).notes.includes('Undo me'));

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
  check('If opening the database fails once, the next try works (not stuck)', retry.firstFailed && retry.recovered && retry.calls === 2, JSON.stringify(retry));

  // Full browser restart with the same profile: the real "close the app and come back tomorrow" test.
  const profile = newProfile();
  try {
    const first = await launch({ profile });
    await first.goto(`${base}#/home`);
    await first.eval(withStore(`
      await store.addTransaction({ type: 'expense', amount: '12.34', categoryId: 'c-groceries', date: new Date().toLocaleDateString('en-CA'), note: 'Survives restart' });
    `));
    await first.close();

    const second = await launch({ profile });
    await second.goto(`${base}#/home`);
    const after = await second.eval(snapshot);
    check('Close Chrome completely and reopen → entry still there', after.notes.includes('Survives restart') && after.cents.includes(1234) && after.categories === 21, JSON.stringify(after));
    const problems = [...first.problems, ...second.problems];
    await second.close();
    check('No errors across the restart', problems.length === 0, problems.join(' | '));
  } finally {
    removeProfile(profile);
  }
}
