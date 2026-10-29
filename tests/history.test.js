import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTransactions, groupByDay, totals } from '../js/services/history.js';

const categories = [{ id: 'c-dining', name: 'Dining Out' }, { id: 'c-paycheck', name: 'Paycheck' }, { id: 'c-groceries', name: 'Groceries' }];
const tx = (id, date, type, amountCents, categoryId, note = '') => ({ id, date, type, amountCents, categoryId, note });
const list = [
  tx('a', '2026-10-28', 'expense', 475, 'c-dining', 'Coffee with Sam'),
  tx('b', '2026-10-28', 'income', 185000, 'c-paycheck', ''),
  tx('c', '2026-10-27', 'expense', 8642, 'c-groceries', 'Café run'),
  tx('d', '2026-09-30', 'expense', 1200, 'c-dining', 'Lunch'),
];

test('filters by month', () => {
  assert.deepEqual(filterTransactions(list, { month: '2026-10', categories }).map((t) => t.id), ['a', 'b', 'c']);
  assert.deepEqual(filterTransactions(list, { month: '2026-09', categories }).map((t) => t.id), ['d']);
  assert.deepEqual(filterTransactions(list, { month: '2026-11', categories }), []);
});

test('search matches note or category name, any case, ignoring accents, all words', () => {
  const find = (query) => filterTransactions(list, { month: '2026-10', query, categories }).map((t) => t.id);
  assert.deepEqual(find('coffee'), ['a']);
  assert.deepEqual(find('DINING'), ['a']);
  assert.deepEqual(find('cafe'), ['c']);
  assert.deepEqual(find('coffee sam'), ['a']);
  assert.deepEqual(find('coffee bob'), []);
  assert.deepEqual(find('   '), ['a', 'b', 'c']);
  assert.deepEqual(find('.*'), []); // treated as text, not a pattern
});

test('groups by day in the given order', () => {
  const groups = groupByDay(list);
  assert.deepEqual(groups.map((g) => [g.date, g.items.map((t) => t.id)]), [['2026-10-28', ['a', 'b']], ['2026-10-27', ['c']], ['2026-09-30', ['d']]]);
  assert.deepEqual(groupByDay([]), []);
});

test('totals money in and out separately, in cents', () => {
  assert.deepEqual(totals(list.slice(0, 3)), { inCents: 185000, outCents: 9117 });
  assert.deepEqual(totals([]), { inCents: 0, outCents: 0 });
});
