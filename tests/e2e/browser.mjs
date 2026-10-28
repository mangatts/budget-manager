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

export async function launch({ port = 9400 + Math.floor(Math.random() * 500) } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'bm-e2e-'));
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
  const problems = [];
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') problems.push(`exception: ${msg.params.exceptionDetails.exception?.description}`);
    if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) problems.push(`console: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) problems.push(`log: ${msg.params.entry.text}`);
  });

  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  const page = {
    problems,
    send,
    sleep,
    async eval(expression) {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.result?.exceptionDetails) throw new Error(`eval failed: ${expression}\n${res.result.exceptionDetails.exception?.description}`);
      return res.result.result.value;
    },
    async goto(url) { await send('Page.navigate', { url }); await sleep(700); },
    async reload() { await send('Page.reload'); await sleep(700); },
    async key(key, code, keyCode) {
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode });
      await sleep(100);
    },
    colorScheme: (value) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] }),
    async close() { ws.close(); proc.kill(); await sleep(200); rmSync(profile, { recursive: true, force: true }); },
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.colorScheme('light');
  return page;
}
