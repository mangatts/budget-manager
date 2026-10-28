import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCents } from '../js/utils/money.js';

test('formats cents as US dollars', () => {
  assert.equal(formatCents(0), '$0.00');
  assert.equal(formatCents(475), '$4.75');
  assert.equal(formatCents(185000), '$1,850.00');
});

test('negative amounts use a true minus sign', () => {
  assert.equal(formatCents(-475), '−$4.75');
});

test('sign option adds + to positive amounts only', () => {
  assert.equal(formatCents(475, { sign: true }), '+$4.75');
  assert.equal(formatCents(0, { sign: true }), '$0.00');
  assert.equal(formatCents(-475, { sign: true }), '−$4.75');
});

test('rejects non-integer cents', () => {
  for (const bad of [4.75, NaN, '475', null, Infinity]) assert.throws(() => formatCents(bad));
});
