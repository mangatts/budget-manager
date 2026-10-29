// Browser acceptance checks at iPhone size (390×844). Runs locally and in CI.
//   npm start            (in another terminal)
//   npm run e2e          (or: BASE_URL=https://… node tests/e2e/run.mjs)
import { launch, newProfile } from './browser.mjs';
import { shellSuite } from './shell.e2e.mjs';
import { displaySuite } from './display.e2e.mjs';
import { dataSuite } from './data.e2e.mjs';
import { addSuite } from './add.e2e.mjs';
import { historySuite } from './history.e2e.mjs';
import { pwaSuite } from './pwa.e2e.mjs';
import { backupSuite } from './backup.e2e.mjs';
import { categoriesSuite } from './categories.e2e.mjs';
import { homeSuite } from './home.e2e.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5500/';
const suites = [['App shell', shellSuite], ['Display settings', displaySuite], ['On-device data', dataSuite], ['Add screen', addSuite], ['History', historySuite], ['Install & offline', pwaSuite], ['Backups', backupSuite], ['Categories & delete', categoriesSuite], ['Home & your money', homeSuite]];

// E2E_ONLY="Add screen" runs one suite while developing; CI always runs them all.
const only = process.env.E2E_ONLY;
let failed = 0;
for (const [name, suite] of suites.filter(([n]) => !only || n === only)) {
  const page = await launch();
  const results = [];
  const check = (label, ok, detail = '') => {
    results.push(`${ok ? '✅' : '❌'} ${label}${detail ? ` (${detail})` : ''}`);
    if (!ok) failed++;
  };
  try {
    await suite({ page, check, base: BASE, launch, newProfile });
    check('No console errors, exceptions, or CSP violations', page.problems.length === 0, page.problems.join(' | '));
  } catch (error) {
    check(`${name} crashed`, false, error.message);
  } finally {
    await page.close();
  }
  console.log(`\n${name}\n${results.join('\n')}`);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll browser checks passed');
process.exit(failed ? 1 : 0);
