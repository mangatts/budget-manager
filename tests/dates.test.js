import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayLocal, isIsoDate, addDays, addYears, monthKey, shiftMonth, formatDay, formatMonth } from '../js/utils/dates.js';

test('todayLocal uses the local calendar day, even late at night', () => {
  assert.equal(todayLocal(new Date(2026, 9, 28, 23, 59)), '2026-10-28');
  assert.equal(todayLocal(new Date(2026, 9, 28, 0, 0)), '2026-10-28');
  assert.equal(todayLocal(new Date(2026, 0, 5)), '2026-01-05');
});

test('isIsoDate accepts only real calendar days', () => {
  for (const ok of ['2026-10-28', '2024-02-29', '2000-01-01']) assert.equal(isIsoDate(ok), true, ok);
  for (const bad of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-32', '26-10-28', '2026-1-5', '', null, 20261028]) assert.equal(isIsoDate(bad), false, String(bad));
});

test('addDays crosses month, year, and leap days', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09'); // US daylight-saving start
});

test('addYears clamps Feb 29', () => {
  assert.equal(addYears('2026-10-28', 1), '2027-10-28');
  assert.equal(addYears('2024-02-29', 1), '2025-02-28');
});

test('months', () => {
  assert.equal(monthKey('2026-10-28'), '2026-10');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(formatMonth('2026-10'), 'October 2026');
});

test('formatDay: Today, Yesterday, then short dates', () => {
  const today = '2026-10-28';
  assert.equal(formatDay('2026-10-28', today), 'Today');
  assert.equal(formatDay('2026-10-27', today), 'Yesterday');
  assert.equal(formatDay('2026-10-26', today), 'Mon, Oct 26');
  assert.equal(formatDay('2025-12-31', today), 'Wed, Dec 31, 2025');
  assert.equal(formatDay('2026-12-31', '2027-01-01'), 'Yesterday');
});
