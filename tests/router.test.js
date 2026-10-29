import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeParam, DEFAULT_ROUTE } from '../js/router.js';

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

test('routeParam reads a simple id from the second segment', () => {
  assert.equal(routeParam('#/edit/3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c'), '3f6c1a2e-9b7d-4c1e-8a2b-1d2e3f4a5b6c');
  assert.equal(routeParam('#/edit/abc?x=1'), 'abc');
  assert.equal(routeParam('#/edit/abc/extra'), 'abc');
});

test('routeParam rejects missing, malformed, or oversized ids', () => {
  for (const hash of ['#/edit', '#/edit/', '#/edit/<img src=x onerror=alert(1)>', '#/edit/../../x', '#/edit/a%20b', '#/edit/' + 'a'.repeat(65), '', undefined]) {
    assert.equal(routeParam(hash), null, `hash: ${hash}`);
  }
});
