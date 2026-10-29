import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { precacheBlock, currentBlock, appFiles, ROOT } from '../scripts/precache.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

// PNG width/height live in the IHDR chunk at bytes 16–23.
function pngSize(path) {
  const buf = read(path);
  assert.equal(buf.toString('hex', 0, 8), '89504e470d0a1a0a', `${path} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test('sw.js offline list is up to date (run `npm run precache` if this fails)', () => {
  assert.equal(currentBlock(), precacheBlock());
});

test('offline list includes every app file and nothing missing on disk', () => {
  const files = appFiles();
  for (const f of ['./index.html', './manifest.json', './js/app.js', './js/prefs-boot.js', './css/tokens.css', './fonts/atkinson-hyperlegible-next-latin.woff2', './icons/icon-192.png']) {
    assert.ok(files.includes(f), `missing ${f}`);
  }
  for (const f of files) assert.ok(existsSync(new URL(f, `file://${ROOT}`)), `${f} does not exist`);
  assert.ok(!files.some((f) => f.includes('tests/') || f.includes('scripts/') || f.endsWith('sw.js')));
});

test('index.html only references files that are cached offline', () => {
  const html = read('index.html').toString();
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => `./${m[1]}`);
  const files = appFiles();
  for (const ref of refs) assert.ok(files.includes(ref), `${ref} is not in the offline list`);
});

test('manifest makes the app installable', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.name, 'Budget Manager');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/);
  const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  assert.ok(sizes.includes('192x192:any') && sizes.includes('512x512:any') && sizes.includes('512x512:maskable'));
  for (const icon of m.icons) {
    const [w, h] = pngSize(icon.src);
    assert.equal(`${w}x${h}`, icon.sizes, icon.src);
  }
});

test('Apple touch icon is 180×180', () => {
  assert.deepEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});

test('service worker only handles its own origin and plain reads', () => {
  const sw = read('sw.js').toString();
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /request\.method !== 'GET'/);
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(install.length > 0 && !install.includes('skipWaiting'), 'a new version must wait for the person to tap Update');
  assert.doesNotMatch(sw, /https?:\/\//, 'no external URLs');
});
