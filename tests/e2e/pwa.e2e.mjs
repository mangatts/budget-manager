// Installable + offline + "keep my data" (E2-S1, E2-S5).
// The offline check stops a real server, so nothing can quietly come from the network.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// A private copy of the app, so the test can publish a "new version" without touching the repo.
function copyApp() {
  const dir = mkdtempSync(join(tmpdir(), 'bm-site-'));
  for (const item of ['index.html', 'manifest.json', 'sw.js', 'css', 'js', 'fonts', 'icons']) cpSync(join(ROOT, item), join(dir, item), { recursive: true });
  return dir;
}

async function startServer(port, cwd) {
  const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/`)).ok) return proc; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('test server did not start');
}

export async function pwaSuite({ page, check, base }) {
  // Manifest and icons
  await page.goto(`${base}#/home`);
  const manifest = await page.eval(`(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const m = await (await fetch(link.href)).json();
    const icons = await Promise.all(m.icons.map(async (i) => { const r = await fetch(new URL(i.src, link.href)); return r.ok && r.headers.get('content-type') === 'image/png'; }));
    const apple = await fetch(document.querySelector('link[rel="apple-touch-icon"]').href);
    return { name: m.name, display: m.display, icons: icons.every(Boolean), apple: apple.ok };
  })()`);
  check('Manifest and all icons load', manifest.name === 'Budget Manager' && manifest.display === 'standalone' && manifest.icons && manifest.apple, JSON.stringify(manifest));

  // More → Install and Storage
  await page.goto(`${base}#/more`);
  await page.sleep(300);
  const more = await page.eval(`({ install: document.getElementById('install-body')?.textContent ?? '', storage: document.getElementById('storage-status')?.textContent ?? '' })`);
  check('More explains how to install', more.install.length > 40, more.install.slice(0, 80));
  check('More shows whether data is protected, and the entry count', /Protected|Not protected yet/.test(more.storage) && /\d+ (entry|entries)/.test(more.storage), more.storage);
  if (/127\.0\.0\.1|localhost/.test(base)) check('Local development skips the service worker unless asked', !(await page.eval('navigator.serviceWorker.controller')));

  // Real offline test on a separate server we can stop.
  const port = 5600 + Math.floor(Math.random() * 300);
  const offlineBase = `http://127.0.0.1:${port}/`;
  const site = copyApp();
  const server = await startServer(port, site);
  try {
    await page.goto(`${offlineBase}#/home`);
    await page.eval(`localStorage.setItem('bm:dev-sw', '1')`);
    await page.reload();
    const ready = await page.eval(`(async () => { const r = await navigator.serviceWorker.ready; return { active: !!r.active, scope: r.scope }; })()`);
    await page.reload();
    check('Service worker installs and controls the page', ready.active && !!(await page.eval('!!navigator.serviceWorker.controller')), JSON.stringify(ready));

    const cached = await page.eval(`(async () => {
      const urls = [];
      for (const key of await caches.keys()) for (const req of await (await caches.open(key)).keys()) urls.push(req.url);
      return { count: urls.length, foreign: urls.filter((u) => !u.startsWith(location.origin)) };
    })()`);
    check('Caches only this app’s own files', cached.count >= 30 && cached.foreign.length === 0, `${cached.count} files, foreign: ${cached.foreign}`);

    // Publish a new version: the app offers "Update", and only switches when asked.
    const swPath = join(site, 'sw.js');
    writeFileSync(swPath, readFileSync(swPath, 'utf8').replace(/const VERSION = '(\w+)'/, "const VERSION = '$1-next'"));
    // The test server reports change times to the second; move it clearly forward so the browser's
    // "has it changed?" check can't get "not modified" for an edit made in the same second.
    const later = new Date(Date.now() + 60_000);
    utimesSync(swPath, later, later);
    const oldCache = await page.eval(`caches.keys().then((k) => k.join())`);
    // Ask the browser to check for updates, retrying: a check already running from the page load
    // may still have the old file, and the browser merges our request into it.
    let offered = false;
    for (let i = 0; i < 100 && !offered; i++) {
      if (i % 10 === 0) await page.eval(`navigator.serviceWorker.getRegistration().then((r) => r.update()).catch(() => {})`);
      await page.sleep(150);
      offered = (await page.eval(`document.querySelector('.toast-message')?.textContent ?? ''`)) === 'New version ready';
    }
    const swState = await page.eval(`navigator.serviceWorker.getRegistration().then(async (r) => JSON.stringify({ installing: r.installing?.state, waiting: r.waiting?.state, active: r.active?.state, controlled: !!navigator.serviceWorker.controller, caches: await caches.keys(), toast: document.querySelector('.toast-region')?.textContent }))`);
    check('New version → "New version ready · Update" (not switched yet)', offered, swState);
    // Another message (e.g. "Added …") must not make the update prompt disappear for good.
    await page.eval(`import(new URL('js/ui/toast.js', location.href)).then((t) => t.showToast({ message: 'Added \u2212$1.00 · Gas', duration: 300 }))`);
    await page.sleep(100);
    const replaced = await page.eval(`document.querySelector('.toast-message')?.textContent`);
    await page.sleep(500);
    check('The update prompt comes back after another message', replaced.startsWith('Added') && (await page.eval(`document.querySelector('.toast-message')?.textContent`)) === 'New version ready');
    await page.eval(`document.querySelector('.toast-action').click()`);
    let switched = false;
    for (let i = 0; i < 40 && !switched; i++) { await page.sleep(200); try { switched = await page.eval(`caches.keys().then((k) => k.length === 1 && k[0].endsWith('-next'))`); } catch { /* reloading */ } }
    let h1 = null;
    for (let i = 0; i < 20 && h1 !== 'Home'; i++) { await page.sleep(200); try { h1 = await page.eval(`document.querySelector('main h1')?.textContent ?? null`); } catch { /* reloading */ } }
    check('Tap Update → reloads on the new version, old cache removed', switched && h1 === 'Home', oldCache);

    server.kill();
    await new Promise((r) => setTimeout(r, 300));
    const down = await fetch(offlineBase).then(() => false, () => true);
    await page.reload();
    const offline = await page.eval(`({ h1: document.querySelector('main h1')?.textContent, font: [...document.fonts].some((f) => f.family.includes('Next') && f.status === 'loaded') })`);
    check('Server stopped → reload → app still opens, with its fonts', down && offline.h1 === 'Home' && offline.font, JSON.stringify(offline));

    await page.goto(`${offlineBase}#/add`);
    await page.eval(`document.getElementById('amount').focus()`);
    await page.type('3.50');
    await page.eval(`document.getElementById('category-c-dining').click()`);
    await page.eval(`document.querySelector('form button[type="submit"]').click()`);
    await page.sleep(300);
    const saved = await page.eval(`(async () => { const { getStore } = await import(new URL('js/appStore.js', location.href)); return (await getStore()).getState().transactions.some((t) => t.amountCents === 350); })()`);
    check('Offline: adding an entry still saves', saved);
    await page.goto(`${offlineBase}#/history`);
    check('Offline: History shows it', (await page.eval(`[...document.querySelectorAll('.list-row-link')].some((a) => a.textContent.includes('3.50'))`)));
  } finally {
    server.kill();
    rmSync(site, { recursive: true, force: true });
  }
}
