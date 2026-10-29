// Bank statement import + review (E7-S1–S6).
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function chooseFile(page, path) {
  const { root } = await page.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#import-file' });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}

const CHASE = [
  'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
  '10/01/2026,10/02/2026,POS CHIPOTLE 1234 AUSTIN TX,Food,Sale,-12.50,',
  '10/02/2026,10/02/2026,"PAYROLL ACME, INC",,Credit,2000.00,',
  '10/03/2026,10/03/2026,PAYMENT TO CARD 4111 1111 1111 1234,,Payment,-300.00,',
  'Pending,,UNKNOWN,,,abc,',
].join('\r\n');
// No headers (Wells Fargo style): date, amount, *, blank, description
const PLAIN = '"10/20/2026","-9.75","*","","CHIPOTLE 0999 DALLAS TX"\n"10/21/2026","-40.00","*","","SHELL OIL 5555"\n';

export async function importSuite({ page, check, base }) {
  const dir = mkdtempSync(join(tmpdir(), 'bm-import-'));
  try {
    const files = { chase: join(dir, 'chase.csv'), plain: join(dir, 'checking.csv'), notcsv: join(dir, 'statement.pdf') };
    writeFileSync(files.chase, CHASE);
    writeFileSync(files.plain, PLAIN);
    writeFileSync(files.notcsv, '%PDF-1.4');
    const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
    const click = async (selector) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(300); };
    const waitFor = async (expr, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await page.eval(expr)) return true; await page.sleep(100); } return false; };

    await page.goto(`${base}#/more`);
    await click('#import-link');
    await chooseFile(page, files.notcsv);
    await page.sleep(300);
    check('A non-CSV file gets a plain message', (await text('#import-file-error'))?.includes('Choose a .csv file'));

    await chooseFile(page, files.chase);
    await waitFor(`!!document.getElementById('import-summary')`);
    check('Chase file recognized: 3 new rows, 1 couldn’t be read', (await text('#import-summary')) === 'Looks like a Chase statement. 3 new rows to review. 1 couldn’t be read.', await text('#import-summary'));
    check('Preview shows cleaned names, and the card number is masked', (await text('#import-preview'))?.includes('Chipotle') && !(await page.eval(`document.body.textContent.includes('4111')`)));
    await page.eval(`document.getElementById('row-errors').open = true`);
    check('Row errors name the row', (await text('#row-errors'))?.includes('Row 5: “Pending” isn’t a date we can read'));

    await click('#start-review');
    check('Start review → one row at a time, 0 of 3 done', (await page.eval('location.hash')) === '#/review' && (await text('#review-count')) === '0 of 3 done' && (await text('#review-merchant')) === 'Chipotle');
    check('Nothing is pre-selected; Add waits for your choice', (await page.eval(`!document.querySelector('#review-categories input:checked') && document.getElementById('review-add').disabled`)));
    await click('#review-cat-c-dining');
    await click('#review-add');
    check('Add → "Added to Dining Out", offering to remember Chipotle', (await text('.toast-message')) === 'Added to Dining Out' && (await text('.toast-action')) === 'Always suggest for Chipotle');
    await click('.toast-action');
    check('…and the rule is saved', await page.eval(`(async () => { const { getStore } = await import(new URL('js/appStore.js', location.href)); return (await getStore()).getState().merchantRules.some((r) => r.pattern === 'CHIPOTLE' && r.categoryId === 'c-dining'); })()`));

    check('Money in shows only income categories', (await text('#review-merchant')) === 'Payroll Acme, Inc' && !(await page.eval(`!!document.getElementById('review-cat-c-dining')`)) && !!(await page.eval(`document.getElementById('review-cat-c-paycheck')`)), await text('#review-merchant'));
    await click('#review-skip');
    check('Skip → 2 of 3', (await text('#review-count')) === '2 of 3 done');
    await click('#review-undo');
    check('Undo last → back to the paycheck, 1 of 3', (await text('#review-count')) === '1 of 3 done' && (await text('#review-merchant')) === 'Payroll Acme, Inc');

    await click('#review-later');
    await page.goto(`${base}#/import`);
    await page.sleep(300);
    check('Finish later: the import page offers to continue (1 of 3 done)', (await text('#import-in-progress'))?.includes('1 of 3 done'));
    await click('#continue-review');
    await click('#review-cat-c-paycheck');
    await click('#review-add');
    await click('#review-skip');
    check('All done: added 2, skipped 1', (await text('#review-done'))?.includes('Added 2 entries, skipped 1.'));
    check('Imported entries are in History', await page.eval(`(async () => { const { getStore } = await import(new URL('js/appStore.js', location.href)); const t = (await getStore()).getState().transactions; return t.filter((x) => x.source === 'import').map((x) => x.note).sort().join('|') === 'Chipotle|Payroll Acme, Inc'; })()`));

    // Same file again: rows already added are left out.
    await page.goto(`${base}#/import`);
    await page.sleep(300);
    await chooseFile(page, files.chase);
    await waitFor(`!!document.getElementById('import-summary')`);
    check('Same file again: 2 already imported, only the skipped row is new', (await text('#import-summary'))?.startsWith('Looks like a Chase statement. 1 new row to review. 2 already imported (left out)'), await text('#import-summary'));

    // Unknown layout → match columns by hand.
    await chooseFile(page, files.plain);
    await waitFor(`!!document.getElementById('column-matching')`);
    check('Unknown layout → column matching', !!(await page.eval(`document.getElementById('column-matching')`)) && (await text('#mapping-status')) !== null);
    await page.eval(`(() => {
      const set = (id, v) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change')); };
      set('map-date', '0'); set('map-description', '4'); set('map-amount', '1');
    })()`);
    await waitFor(`!!document.getElementById('import-summary')`);
    check('…then 2 rows to review', (await text('#import-summary')) === '2 new rows to review.', await text('#import-summary'));
    await click('#start-review');
    check('Your rule suggests Dining Out for Chipotle: highlighted, not selected', !!(await page.eval(`document.querySelector('#review-categories .choice-suggested #review-cat-c-dining')`)) && !(await page.eval(`document.getElementById('review-cat-c-dining').checked`)));

    await page.eval(`document.documentElement.dataset.textSize = 'extra-large'`);
    await page.sleep(200);
    check('Extra large text: no sideways scrolling', await page.eval(`document.documentElement.scrollWidth <= window.innerWidth`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
