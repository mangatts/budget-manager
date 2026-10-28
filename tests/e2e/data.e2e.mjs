// On-device data with the real IndexedDB: seeding, saving, and surviving a reload and a full browser restart (E1-S1, E1-S2).
import { rmSync } from 'node:fs';

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
    rmSync(profile, { recursive: true, force: true });
  }
}
