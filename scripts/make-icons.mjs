// Renders the app icons to icons/*.png with headless Chrome (dev-only; the PNGs are committed).
//   npm start   (in another terminal)
//   node scripts/make-icons.mjs
// Design: the accent teal with a white "$" in Atkinson Hyperlegible, our UI font.
import { writeFileSync } from 'node:fs';
import { launch } from '../tests/e2e/browser.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5500/';
const TEAL = '#0d6a64'; // --accent (light)

// [file, size, rounded corners?, glyph size as a share of the icon]
// Maskable and Apple icons are full-bleed squares: the OS applies its own shape,
// and the glyph stays inside the 80% "safe zone".
const ICONS = [
  ['icon-192.png', 192, true, 0.62],
  ['icon-512.png', 512, true, 0.62],
  ['icon-maskable-512.png', 512, false, 0.46],
  ['apple-touch-icon.png', 180, false, 0.58],
];

const page = await launch();
try {
  await page.goto(`${BASE}#/design`);
  await page.eval('document.fonts.ready');
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const [file, size, rounded, glyph] of ICONS) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await page.eval(`(() => {
      document.body.replaceChildren();
      document.body.style.cssText = 'margin:0;padding:0;background:transparent;min-height:0';
      const tile = document.createElement('div');
      tile.style.cssText = 'width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${TEAL};border-radius:${rounded ? Math.round(size * 0.22) : 0}px';
      const mark = document.createElement('span');
      mark.textContent = '$';
      mark.style.cssText = 'color:#fff;font:800 ${Math.round(size * glyph)}px "Atkinson Hyperlegible Next",system-ui,sans-serif;line-height:1;transform:translateY(${Math.round(size * 0.02)}px)';
      tile.append(mark);
      document.body.append(tile);
    })()`);
    await page.sleep(100);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    writeFileSync(new URL(`../icons/${file}`, import.meta.url), Buffer.from(data, 'base64'));
    console.log(`icons/${file} (${size}×${size})`);
  }
} finally {
  await page.close();
}
