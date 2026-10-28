import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadTokens } from './helpers/tokens.js';

const { light, darkMedia, darkAttr } = loadTokens();

test('every dark token is first defined on :root (no theme-only colors)', () => {
  const missing = Object.keys(darkMedia).filter((name) => !(name in light));
  assert.deepEqual(missing, []);
});

test('both dark blocks match, so the Settings choice and the device setting agree', () => {
  assert.deepEqual(darkAttr, darkMedia);
});

test('every light color has a dark value', () => {
  const colors = Object.keys(light).filter((name) => /^#[0-9a-f]{6}$/i.test(light[name]));
  const missing = colors.filter((name) => !(name in darkMedia));
  assert.deepEqual(missing, []);
});

test('no hard-coded colors outside tokens.css', () => {
  const cssDir = new URL('../css/', import.meta.url);
  const offenders = [];
  for (const file of readdirSync(cssDir).filter((f) => f.endsWith('.css') && f !== 'tokens.css')) {
    const css = readFileSync(new URL(file, cssDir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/gi)) offenders.push(`${file}: ${match[0]}`);
  }
  assert.deepEqual(offenders, []);
});
