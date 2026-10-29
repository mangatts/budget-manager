// Encrypted backups: save on one device, restore on a brand-new one (E2-S2, E2-S3, E2-S4).
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PASS = 'blue river coffee lamp';

const inStore = (body) => `(async () => {
  const { getStore } = await import(new URL('js/appStore.js', location.href));
  const store = await getStore();
  ${body}
})()`;
const summary = inStore(`return store.getState().transactions.map((t) => [t.id, t.type, t.amountCents, t.categoryId, t.date, t.note]).sort().join('|');`);

async function chooseFile(page, selector, path) {
  const { root } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}

export async function backupSuite({ page, check, base, launch }) {
  const value = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const setValue = (p, id, v) => p.eval(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(v)}`);
  const submit = async (p, id) => { await p.eval(`document.getElementById(${JSON.stringify(id)}).requestSubmit()`); };
  const waitFor = async (p, expr, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await p.eval(expr)) return true; await p.sleep(100); } return false; };

  // Device A has some entries and no backup yet → reminder
  await page.goto(`${base}#/home`);
  await page.eval(inStore(`
    const today = new Date().toLocaleDateString('en-CA');
    await store.addTransaction({ type: 'expense', amount: '4.75', categoryId: 'c-dining', date: today, note: 'Coffee ☕ with Sam' });
    await store.addTransaction({ type: 'income', amount: '1850', categoryId: 'c-paycheck', date: today });
    await store.addTransaction({ type: 'expense', amount: '86.42', categoryId: 'c-groceries', date: '2026-01-03', note: 'Weekly shop' });
  `));
  await page.reload();
  check('Home reminds you when there’s no backup yet', (await value('#backup-reminder'))?.includes('Last backup: Never'));
  const original = await page.eval(summary);

  // Save a backup (capture the file instead of a real download/share sheet)
  await page.goto(`${base}#/backup`);
  await page.eval(`Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    const create = URL.createObjectURL.bind(URL); URL.createObjectURL = (blob) => { window.__backup = blob; return create(blob); };`);
  await setValue(page, 'backup-pass', 'short');
  await setValue(page, 'backup-confirm', 'short');
  await submit(page, 'backup-form');
  check('Too-short passphrase is explained', (await value('#backup-pass-error'))?.includes('at least 12'));
  await setValue(page, 'backup-pass', PASS);
  await setValue(page, 'backup-confirm', 'blue river coffee lamb');
  await submit(page, 'backup-form');
  check('Mismatched passphrases are caught', (await value('#backup-confirm-error')) === 'The two passphrases don’t match.');
  await setValue(page, 'backup-confirm', PASS);
  await submit(page, 'backup-form');
  const made = await waitFor(page, `!!window.__backup && document.querySelector('.toast-message')?.textContent === 'Backup saved'`);
  const fileText = await page.eval(`window.__backup.text()`);
  const file = JSON.parse(fileText);
  check('Backup saved: encrypted file, notes and amounts not readable inside', made && file.format === 'bm-backup' && file.kdf.iterations === 600000 && !fileText.includes('Coffee') && !fileText.includes('185000'));
  check('"Last backup: Today" and passphrase fields cleared', (await value('#last-backup')) === 'Last backup: Today' && (await page.eval(`document.getElementById('backup-pass').value === ''`)));
  await page.goto(`${base}#/home`);
  check('Reminder goes away after a backup', !(await page.eval(`!!document.getElementById('backup-reminder')`)));

  // Files on disk, as if saved to Files / iCloud
  const dir = mkdtempSync(join(tmpdir(), 'bm-backup-'));
  const good = join(dir, 'budget-manager-backup.bmbackup');
  const corrupt = join(dir, 'corrupt.bmbackup');
  writeFileSync(good, fileText);
  writeFileSync(corrupt, JSON.stringify({ ...file, ciphertext: (file.ciphertext[0] === 'A' ? 'B' : 'A') + file.ciphertext.slice(1) }));

  // Device B: a brand-new browser profile (a new phone)
  const phone = await launch();
  try {
    await phone.goto(`${base}#/backup`);
    await waitFor(phone, `!!document.getElementById('restore-file')`);
    await chooseFile(phone, '#restore-file', good);
    await setValue(phone, 'restore-pass', 'wrong passphrase here');
    await submit(phone, 'restore-form');
    await waitFor(phone, `!document.getElementById('restore-pass-error').hidden`);
    check('New phone: wrong passphrase → explained, nothing changes', (await phone.eval(`document.getElementById('restore-pass-error').textContent`)).includes('passphrase doesn’t match') && (await phone.eval(summary)) === '');

    await setValue(phone, 'restore-pass', PASS);
    await submit(phone, 'restore-form');
    await waitFor(phone, `!!document.getElementById('restore-summary')`);
    const preview = await phone.eval(`document.getElementById('restore-summary').textContent`);
    check('Preview before anything changes: 3 entries, date range, nothing lost', preview.includes('3 entries from') && preview.includes('Nothing on this device will be lost') && (await phone.eval(summary)) === '', preview);
    await phone.eval(`document.getElementById('restore-confirm').click()`);
    await waitFor(phone, `document.querySelector('.toast-message')?.textContent === 'Restored 3 entries'`);
    check('Restore on the new phone → identical entries', (await phone.eval(summary)) === original);
    check('Restored categories and backup date come along', await phone.eval(inStore(`const s = store.getState(); return s.categories.length === 21 && !!s.meta.lastBackupAt;`)));
    await phone.goto(`${base}#/history`);
    check('History on the new phone shows them', await phone.eval(`[...document.querySelectorAll('.list-row-link')].some((a) => a.textContent.includes('Coffee ☕ with Sam'))`));

    // Corrupted file
    await phone.goto(`${base}#/backup`);
    await waitFor(phone, `!!document.getElementById('restore-file')`);
    await chooseFile(phone, '#restore-file', corrupt);
    await setValue(phone, 'restore-pass', PASS);
    await submit(phone, 'restore-form');
    await waitFor(phone, `!document.getElementById('restore-pass-error').hidden || !document.getElementById('restore-file-error').hidden`);
    check('A changed/corrupted file is refused, nothing changes', (await phone.eval(`document.getElementById('restore-pass-error').textContent`)).includes('file has been changed') && (await phone.eval(summary)) === original);

    // Replace existing data, then Undo
    await phone.eval(inStore(`await store.addTransaction({ type: 'expense', amount: '9.99', categoryId: 'c-shopping', date: new Date().toLocaleDateString('en-CA'), note: 'Added later' });`));
    await phone.goto(`${base}#/home`); await phone.goto(`${base}#/backup`);
    await waitFor(phone, `!!document.getElementById('restore-file')`);
    await chooseFile(phone, '#restore-file', good);
    await setValue(phone, 'restore-pass', PASS);
    await submit(phone, 'restore-form');
    await waitFor(phone, `!!document.getElementById('restore-summary')`);
    check('Preview warns it replaces what’s here', (await phone.eval(`document.getElementById('restore-summary').textContent`)).includes('replaces the 4 entries'));
    await phone.eval(`document.getElementById('restore-confirm').click()`);
    // Wait for the data itself (an earlier "Restored" message may still be on screen).
    await waitFor(phone, inStore(`return store.getState().transactions.length === 3;`));
    const afterRestore = await phone.eval(summary);
    await phone.eval(`document.querySelector('.toast-action').click()`);
    await waitFor(phone, `document.querySelector('.toast-message')?.textContent === 'Restore undone'`);
    check('Undo restore brings back what was there (4 entries)', afterRestore === original && (await phone.eval(summary)).includes('Added later'));
    await phone.reload();
    check('Undo is saved, not just on screen', (await phone.eval(summary)).includes('Added later'));
    check('New phone: no errors or CSP violations', phone.problems.length === 0, phone.problems.join(' | '));
  } finally {
    await phone.close();
    rmSync(dir, { recursive: true, force: true });
  }

  // Extra large text
  await page.eval(`localStorage.setItem('bm:prefs', JSON.stringify({ textSize: 'xl', theme: 'system' }))`);
  await page.goto(`${base}#/backup`); await page.reload();
  const fit = await page.eval(`({ sw: document.documentElement.scrollWidth, w: innerWidth, clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').map((e) => e.tagName + '.' + e.className).slice(0, 3) })`);
  check('Extra large text: Backups fits, nothing clipped', fit.sw <= fit.w && fit.clipped.length === 0, JSON.stringify(fit));
  await page.eval(`localStorage.removeItem('bm:prefs')`);
}
