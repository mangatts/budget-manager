import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, DEFAULT_ROUTE } from '../js/router.js';

const ROUTES = ['home', 'add', 'history', 'tips', 'more'];

test('parses known routes', () => {
  for (const name of ROUTES) assert.equal(parseRoute(`#/${name}`, ROUTES), name);
});

test('is case-insensitive', () => {
  assert.equal(parseRoute('#/ADD', ROUTES), 'add');
});

test('falls back to the default route for empty or missing hashes', () => {
  assert.equal(DEFAULT_ROUTE, 'home');
  for (const hash of ['', '#', '#/', undefined, null]) {
    assert.equal(parseRoute(hash, ROUTES), DEFAULT_ROUTE, `hash: ${hash}`);
  }
});

test('falls back to the default route for unknown routes', () => {
  assert.equal(parseRoute('#/unknown', ROUTES), DEFAULT_ROUTE);
  assert.equal(parseRoute('#app', ROUTES), DEFAULT_ROUTE);
});

test('ignores query strings and extra path segments', () => {
  assert.equal(parseRoute('#/add?x=1', ROUTES), 'add');
  assert.equal(parseRoute('#/history/2026-10', ROUTES), 'history');
});

test('rejects path tricks and injected markup', () => {
  for (const hash of ['#/../../etc', '#/<img src=x onerror=alert(1)>', '#/javascript:alert(1)', '#/constructor', '#/__proto__']) {
    assert.equal(parseRoute(hash, ROUTES), DEFAULT_ROUTE, `hash: ${hash}`);
  }
});
