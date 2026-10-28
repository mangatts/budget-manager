// Display settings: fonts, text size, theme, no-flash boot, Extra large layout, private mode (E0-S2).
const LIGHT = 'rgb(245, 248, 247)';
const DARK = 'rgb(15, 23, 22)';

export async function displaySuite({ page, check, base }) {
  // Record <html> attributes the moment <body> is created: proves settings apply before any paint.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `new MutationObserver((_, o) => { if (document.body) { window.__atBody = { size: document.documentElement.getAttribute('data-text-size'), theme: document.documentElement.getAttribute('data-theme') }; o.disconnect(); } }).observe(document, { childList: true, subtree: true });` });
  const rootPx = () => page.eval('parseFloat(getComputedStyle(document.documentElement).fontSize)');
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const bg = () => page.eval('getComputedStyle(document.body).backgroundColor');
  const click = async (id) => { await page.eval(`document.getElementById('${id}').click()`); await page.sleep(120); };

  await page.goto(`${base}#/more`);
  await page.eval('document.fonts.ready');
  check('UI and money fonts load from our own site', await page.eval(`['Next', 'Mono'].every((n) => [...document.fonts].some((f) => f.family.includes(n) && f.status === 'loaded'))`));
  check('Normal text = 18px', (await rootPx()) === 18);

  await click('textSize-large');
  check('Large → 21.6px instantly', near(await rootPx(), 21.6));
  await click('textSize-xl');
  check('Extra large → 25.2px instantly', near(await rootPx(), 25.2));
  await page.reload();
  check('Refresh keeps Extra large, applied before <body> (no flash)', near(await rootPx(), 25.2) && (await page.eval('window.__atBody'))?.size === 'xl');

  for (const route of ['home', 'add', 'history', 'tips', 'more', 'design']) {
    await page.goto(`${base}#/${route}`);
    const s = await page.eval(`({
      sw: document.documentElement.scrollWidth, w: innerWidth,
      tabsOk: [...document.querySelectorAll('.tab-bar a')].every((a) => { const b = a.getBoundingClientRect(); return b.right <= innerWidth + 0.5 && a.scrollWidth <= a.clientWidth + 1 && a.scrollHeight <= a.clientHeight + 1 && b.height >= 48; }),
      clipped: [...document.querySelectorAll('main *')].filter((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').length,
    })`);
    check(`Extra large "${route}": no sideways scroll, tabs fit, nothing clipped`, s.sw <= s.w && s.tabsOk && s.clipped === 0, `${s.sw}/${s.w}, clipped ${s.clipped}`);
  }

  await page.goto(`${base}#/more`);
  await page.eval(`document.getElementById('textSize-xl').focus()`);
  await page.key('ArrowLeft', 'ArrowLeft', 37);
  check('Arrow keys move between choices and apply', near(await rootPx(), 21.6) && await page.eval(`document.getElementById('textSize-large').checked`));
  check('Focus ring visible on choice', (await page.eval(`getComputedStyle(document.querySelector('#textSize-large + span')).outlineStyle`)) === 'solid');
  await click('textSize-normal');

  check('Match device (light) → light', (await bg()) === LIGHT);
  await page.colorScheme('dark'); await page.sleep(120);
  check('Match device (dark) → dark', (await bg()) === DARK);
  await click('theme-light');
  check('Light overrides a dark device', (await bg()) === LIGHT);
  await page.colorScheme('light'); await click('theme-dark');
  check('Dark overrides a light device', (await bg()) === DARK);
  await page.reload();
  check('Refresh keeps Dark, applied before <body>', (await bg()) === DARK && (await page.eval('window.__atBody'))?.theme === 'dark');
  await click('theme-system');
  check('Match device removes the override', !(await page.eval(`document.documentElement.hasAttribute('data-theme')`)) && (await bg()) === LIGHT);

  await page.eval(`localStorage.setItem('bm:prefs', '{"textSize":"<img src=x onerror=alert(1)>","theme":"__proto__"}')`);
  await page.goto(`${base}#/home`); await page.reload();
  check('Tampered saved prefs → safe defaults', (await rootPx()) === 18 && !(await page.eval(`document.documentElement.hasAttribute('data-theme')`)));

  // Private mode: storage throws on every read/write.
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `Storage.prototype.getItem = () => { throw new Error('blocked'); }; Storage.prototype.setItem = () => { throw new Error('blocked'); };` });
  await page.goto(`${base}#/more`); await page.reload();
  await click('textSize-large'); await click('theme-dark');
  await page.eval(`location.hash = '#/home'`); await page.sleep(150);
  await page.eval(`location.hash = '#/more'`); await page.sleep(150);
  check('Private mode: both choices kept and shown after leaving More', near(await rootPx(), 21.6) && (await bg()) === DARK && await page.eval(`document.getElementById('textSize-large').checked && document.getElementById('theme-dark').checked`));
}
