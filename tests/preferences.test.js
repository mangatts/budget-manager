import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizePrefs, loadPrefs, savePref, applyPrefs, DEFAULT_PREFS, PREF_OPTIONS, PREFS_KEY } from '../js/services/preferences.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

const throwingStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

test('valid values are kept', () => {
  assert.deepEqual(sanitizePrefs({ textSize: 'xl', theme: 'dark' }), { textSize: 'xl', theme: 'dark' });
});

test('junk, missing, and prototype tricks fall back to defaults', () => {
  for (const raw of [null, undefined, 'xl', 42, [], {}, { textSize: 'huge' }, { theme: '<script>' }, JSON.parse('{"__proto__": {"textSize": "xl"}}'), { textSize: ['xl'] }]) {
    assert.deepEqual(sanitizePrefs(raw), DEFAULT_PREFS, `raw: ${JSON.stringify(raw)}`);
  }
});

test('save then load round-trips', () => {
  const storage = memoryStorage();
  savePref('textSize', 'large', storage);
  savePref('theme', 'light', storage);
  assert.deepEqual(loadPrefs(storage), { textSize: 'large', theme: 'light' });
});

test('corrupt storage loads defaults', () => {
  assert.deepEqual(loadPrefs(memoryStorage({ [PREFS_KEY]: '{not json' })), DEFAULT_PREFS);
});

test('blocked storage (private mode) never crashes', () => {
  assert.deepEqual(loadPrefs(throwingStorage), DEFAULT_PREFS);
  assert.deepEqual(savePref('theme', 'dark', throwingStorage), { ...DEFAULT_PREFS, theme: 'dark' });
  assert.deepEqual(loadPrefs(undefined), DEFAULT_PREFS);
});

test('unknown names or values are rejected when saving', () => {
  const storage = memoryStorage();
  assert.throws(() => savePref('textSize', 'huge', storage));
  assert.throws(() => savePref('__proto__', 'x', storage));
  assert.throws(() => savePref('constructor', 'x', storage));
  assert.deepEqual(storage.data, {});
});

test('applyPrefs sets attributes, and defaults remove them', () => {
  const attrs = {};
  const root = { setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; } };
  applyPrefs({ textSize: 'xl', theme: 'dark' }, root);
  assert.deepEqual(attrs, { 'data-text-size': 'xl', 'data-theme': 'dark' });
  applyPrefs(DEFAULT_PREFS, root);
  assert.deepEqual(attrs, {});
});

test('prefs-boot.js uses the same storage key and allowed values', () => {
  const boot = readFileSync(new URL('../js/prefs-boot.js', import.meta.url), 'utf8');
  assert.match(boot, new RegExp(`'${PREFS_KEY}'`));
  const list = (name) => JSON.parse(boot.match(new RegExp(`var ${name} = (\\[[^\\]]*\\])`))[1].replaceAll("'", '"'));
  // The boot script only sets attributes for non-default values.
  assert.deepEqual(list('TEXT_SIZES'), PREF_OPTIONS.textSize.filter((v) => v !== DEFAULT_PREFS.textSize));
  assert.deepEqual(list('THEMES'), PREF_OPTIONS.theme.filter((v) => v !== DEFAULT_PREFS.theme));
});
