// App shell: tabs, routing, history, keyboard, and layout at phone width (E0-S1).
const ROUTES = [['checkin', 'Check-in'], ['setup', 'Setup'], ['more', 'More']];

const state = (page) => page.eval(`({
  hash: location.hash,
  h1: document.querySelector('main h1')?.textContent,
  title: document.title,
  current: [...document.querySelectorAll('nav a[aria-current="page"]')].map((a) => a.dataset.route),
  focused: document.activeElement?.tagName + (document.activeElement?.className ? '.' + document.activeElement.className : ''),
  scrollW: document.documentElement.scrollWidth,
  innerW: innerWidth,
  tabsFit: [...document.querySelectorAll('nav a')].every((a) => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 0.5 && r.height >= 48 && r.width >= 48; }),
})`);

export async function shellSuite({ page, check, base }) {
  await page.goto(base);
  let s = await state(page);
  check('Loads on Home', s.h1 === 'Home' && s.current[0] === 'home' && s.title === 'Budget Manager');
  check('No sideways scroll at 390px', s.scrollW <= s.innerW, `${s.scrollW}/${s.innerW}`);
  check('All 4 tabs on screen, each ≥ 48×48px', s.tabsFit);

  for (const [route, heading] of ROUTES) {
    await page.eval(`document.querySelector('nav a[data-route="${route}"]').click()`);
    await page.sleep(150);
    s = await state(page);
    check(`Tap "${route}" → screen, URL, aria-current, title, focus`, s.hash === `#/${route}` && s.h1 === heading && s.current.join() === route && s.title === `${heading} · Budget Manager` && s.focused === 'H1', s.focused);
  }

  await page.eval('history.back()'); await page.sleep(250);
  check('Back → Setup', (await state(page)).h1 === 'Setup');
  await page.eval('history.forward()'); await page.sleep(250);
  check('Forward → More', (await state(page)).h1 === 'More');
  await page.reload();
  check('Refresh stays on More', (await state(page)).h1 === 'More');

  await page.goto(`${base}#/nope`);
  check('Unknown route → Home', (await state(page)).h1 === 'Home');
  await page.goto(`${base}#/<img src=x onerror=alert(1)>`);
  check('Markup in the URL is never rendered', (await state(page)).h1 === 'Home' && !(await page.eval(`!!document.querySelector('main img')`)));

  // Keyboard, from a fresh load
  await page.goto(`${base}#/setup`); await page.reload();
  await page.key('Tab', 'Tab', 9);
  check('First Tab focuses "Skip to content"', (await state(page)).focused.includes('skip-link'));
  await page.key('Enter', 'Enter', 13);
  s = await state(page);
  check('Skip link → focus main, URL unchanged', s.focused.startsWith('MAIN') && s.hash === '#/setup');
  // Tab forward (past whatever the screen contains) to the Check-in tab, then Enter.
  for (let i = 0; i < 30 && !(await page.eval(`document.activeElement?.dataset?.route === 'checkin'`)); i++) await page.key('Tab', 'Tab', 9);
  await page.key('Enter', 'Enter', 13);
  check('Tab to "Check-in" + Enter navigates', (await state(page)).hash === '#/checkin');
}
