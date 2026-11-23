// People sharing one device: add Charles and Albin, switch, keep their money apart, rename, remove, delete everything.

export async function peopleSuite({ page, check, base }) {
  const text = (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`);
  const click = async (selector, wait = 250) => { await page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`); await page.sleep(wait); };
  const setValue = (id, v) => page.eval(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(v)}`);
  const submit = async (id) => { await page.eval(`document.getElementById(${JSON.stringify(id)}).requestSubmit()`); await page.sleep(300); };
  const open = async (hash) => { await page.goto(`${base}${hash}`); await page.sleep(300); };
  const names = () => page.eval(`[...document.querySelectorAll('#people-list li')].map((li) => li.querySelector('.list-row-main span').textContent)`);
  const rows = () => page.eval(`[...document.querySelectorAll('#people-list li')].map((li) => [li.textContent, li.dataset.person])`);
  const idOf = async (name) => (await rows()).find(([label]) => label.includes(name))?.[1];
  const databases = () => page.eval(`indexedDB.databases().then((list) => list.map((d) => d.name).sort())`);
  const addPerson = async (name) => { await setValue('person-name', name); await submit('person-form'); };

  // ── One person to start ──
  await open('#/home');
  check('With one person, no "whose money" line', await page.eval(`document.getElementById('person-tag').hidden`));
  await open('#/more');
  check('More shows who is using it', (await text('#people-status'))?.includes('Using now: Me · 1 person'), await text('#people-status'));

  // My income, so we can tell people apart later.
  await open('#/income/new');
  await setValue('income-name', 'My paycheck');
  await setValue('income-amount', '2000');
  await submit('income-form');

  // ── Add Charles and Albin ──
  await open('#/more');
  await click('#people-link');
  await addPerson('Charles');
  check('Add Charles: listed with an Undo', (await names()).includes('Charles') && (await text('.toast-message')) === 'Added Charles');
  await addPerson('charles');
  check('A repeated name is explained', (await text('#person-name-error'))?.includes('already has that name'));
  await addPerson('Albin');
  check('Three people, Me still using it', JSON.stringify(await names()) === JSON.stringify(['Me', 'Charles', 'Albin']) && (await text('#person-active'))?.includes('Using now'), JSON.stringify(await names()));
  check('People screen explains privacy', (await text('#people-privacy'))?.includes('own phone'));

  // ── Switch to Albin: his own empty money ──
  const albinId = await idOf('Albin');
  await click(`#switch-${albinId}`, 1500);
  check('Switch goes to Home as Albin', (await page.eval('location.hash')) === '#/home' && (await text('#person-tag'))?.includes('Albin'), await text('#person-tag'));
  check('Albin starts with nothing set up', !!(await text('#welcome')) && !(await text('#welcome'))?.includes('✓ Add your income'));
  await open('#/card/new');
  await setValue('card-name', 'Albin Visa');
  await setValue('card-apr', '22');
  await setValue('card-min', '30');
  await submit('card-form');
  await open('#/checkin');
  check('Check-in also says whose it is', (await text('#person-tag'))?.includes('Albin'));

  // ── Back to Me: my data, none of Albin's ──
  await open('#/people');
  await click(`#switch-${await idOf('Me')}`, 1500);
  await open('#/setup');
  const setup = await text('main');
  check('Back as Me: my income is here, Albin’s card is not', setup.includes('My paycheck') && !setup.includes('Albin Visa') && (await text('#person-tag'))?.includes('Me'));

  // ── Rename ──
  await open('#/people');
  await click(`#edit-${await idOf('Charles')}`);
  await setValue('person-name', 'Charles B');
  await submit('person-form');
  check('Rename Charles', (await page.eval('location.hash')) === '#/people' && (await names()).includes('Charles B'));

  // ── Remove ──
  await click(`#edit-${await idOf('Me')}`);
  check('The person using it now can’t be removed', (await text('#remove-blocked'))?.includes('switch to someone else first') && !(await text('#remove-form')));
  await open('#/people');
  await click(`#edit-${albinId}`);
  check('Remove needs DELETE typed', await page.eval(`document.getElementById('remove-button').disabled`));
  await page.eval(`const i = document.getElementById('remove-confirm'); i.value = 'DELETE'; i.dispatchEvent(new Event('input'))`);
  await submit('remove-form');
  await page.sleep(500);
  check('Albin removed, with his database', JSON.stringify(await names()) === JSON.stringify(['Me', 'Charles B']) && !(await databases()).includes(`budget-manager-${albinId}`), JSON.stringify(await databases()));

  // ── Backups are per person ──
  await open('#/backup');
  check('Backups say whose data they hold', (await text('#backup-person'))?.includes('Me’s data only'));

  // ── Delete everything removes everyone ──
  await open('#/people');
  await click(`#switch-${await idOf('Charles B')}`, 1500);
  await open('#/wipe');
  check('Delete everything says it removes everyone', (await text('#wipe-what'))?.includes('all 2 people'));
  await page.eval(`const i = document.getElementById('wipe-confirm'); i.value = 'DELETE'; i.dispatchEvent(new Event('input'))`);
  await page.eval(`document.getElementById('wipe-form').requestSubmit()`);
  await page.sleep(1500);
  await open('#/people');
  check('After deleting: just a fresh "Me", no leftover databases', JSON.stringify(await names()) === JSON.stringify(['Me']) && !(await databases()).some((n) => /^budget-manager-[0-9a-f]{8}-/.test(n)), JSON.stringify(await databases()));
  await open('#/setup');
  check('…and Me has nothing set up', !(await text('main'))?.includes('My paycheck'));
}
