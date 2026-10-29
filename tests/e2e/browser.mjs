// Minimal headless-Chrome driver over the DevTools protocol (no dependencies).
// Collects console errors, exceptions, and CSP violations so every suite can assert there are none.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return existsSync(mac) ? mac : 'google-chrome';
}

// Pass `profile` to reuse a browser profile across launches (to test data surviving a restart);
// the caller then owns deleting it. Otherwise a temporary profile is created and removed on close.
export const newProfile = () => mkdtempSync(join(tmpdir(), 'bm-e2e-'));

// Best effort: Chrome may still be flushing files for a moment after it exits.
export function removeProfile(dir) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* temp dir; the OS cleans it up */ }
}

export async function launch({ port = 9400 + Math.floor(Math.random() * 500), profile: reuse } = {}) {
  const profile = reuse ?? newProfile();
  const args = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check'];
  // GitHub's Ubuntu runners block Chrome's sandbox (AppArmor); only relax it there.
  if (process.env.CI) args.push('--no-sandbox');
  const proc = spawn(chromePath(), [...args, 'about:blank'], { stdio: 'ignore' });

  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(100);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error('Chrome did not start'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });

  let nextId = 0;
  const pending = new Map();
  const waiters = [];
  const problems = [];
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer, method } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    }
    for (const w of waiters.filter((x) => x.method === msg.method)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.timer); w.resolve(msg.params); }
    if (msg.method === 'Runtime.exceptionThrown') problems.push(`exception: ${msg.params.exceptionDetails.exception?.description}`);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) problems.push(`console: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) problems.push(`log: ${msg.params.entry.text}`);
  });

  // Every command times out with a clear message, so a stuck call can't hang CI.
  const send = (method, params = {}, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer, method });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const failAll = (why) => {
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error(why)); }
    pending.clear();
  };
  ws.addEventListener('close', () => failAll('Chrome connection closed'));
  ws.addEventListener('error', () => failAll('Chrome connection error'));

  // Resolves on the next event of this type (e.g. the page's load event).
  const waitFor = (method, timeoutMs = 15000) => new Promise((resolve, reject) => {
    const waiter = { method, resolve };
    waiter.timer = setTimeout(() => { waiters.splice(waiters.indexOf(waiter), 1); reject(new Error(`waiting for ${method} timed out`)); }, timeoutMs);
    waiters.push(waiter);
  });
  // Navigate, wait for the real load event, then a short settle for the module script to render.
  const load = async (start) => { const loaded = waitFor('Page.loadEventFired'); await start(); await loaded; await sleep(150); };

  const page = {
    problems,
    send,
    sleep,
    async eval(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(`eval failed: ${expression}\n${res.exceptionDetails.exception?.description}`);
      return res.result.value;
    },
    // Same-document hash changes don't fire a load event, so those wait briefly instead.
    async goto(url) {
      const sameDocument = await page.eval(`location.href.split('#')[0] === ${JSON.stringify(url.split('#')[0])} && location.href !== 'about:blank'`);
      if (sameDocument) { await send('Page.navigate', { url }); await sleep(250); } else await load(() => send('Page.navigate', { url }));
    },
    async reload() { await load(() => send('Page.reload')); },
    async key(key, code, keyCode) {
      // A real Enter key also types "\r"; browsers need it to submit a form from a text field.
      const text = key === 'Enter' ? '\r' : undefined;
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
      await sleep(100);
    },
    // Types text into the focused field, like a keyboard would.
    async type(text) { await send('Input.insertText', { text }); await sleep(50); },
    colorScheme: (value) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] }),
    async close() {
      ws.close();
      const exited = new Promise((resolve) => proc.once('exit', resolve));
      proc.kill();
      await Promise.race([exited, sleep(3000)]); // let Chrome flush storage to disk before reuse
      if (!reuse) removeProfile(profile);
    },
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.colorScheme('light');
  return page;
}
