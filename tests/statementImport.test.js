// E7-S1–S4, S6: CSV parsing, bank layouts, masking + merchant names, duplicates, suggestions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, checkFile, MAX_ROWS } from '../js/services/statementImport/csvParser.js';
import { detectLayout, parseDate, parseSignedAmount, readRow, checkMapping, hasHeader } from '../js/services/statementImport/layouts.js';
import { maskNumbers, cleanMerchant, merchantKey } from '../js/services/statementImport/clean.js';
import { prepareImport, suggestCategory } from '../js/services/statementImport/prepare.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';

test('checkFile: .csv only, not empty, at most 5 MB', () => {
  assert.equal(checkFile({ name: 'activity.CSV', size: 100 }), null);
  assert.match(checkFile({ name: 'statement.pdf', size: 100 }), /\.csv file/);
  assert.match(checkFile({ name: 'a.csv', size: 0 }), /empty/);
  assert.match(checkFile({ name: 'a.csv', size: 6 * 1024 * 1024 }), /5 MB/);
  assert.match(checkFile(null), /Choose a file/);
});

test('parseCsv: quotes, escaped quotes, commas and newlines inside quotes, CRLF, BOM, blank lines', () => {
  const text = '﻿Date,Description,Amount\r\n01/02/2026,"COFFEE, ""BEST"" SHOP",-4.75\r\n\r\n01/03/2026,"TWO\nLINES",10\n';
  assert.deepEqual(parseCsv(text), { ok: true, rows: [['Date', 'Description', 'Amount'], ['01/02/2026', 'COFFEE, "BEST" SHOP', '-4.75'], ['01/03/2026', 'TWO\nLINES', '10']] });
  assert.match(parseCsv('a,"b\n').error, /never closes/);
  assert.match(parseCsv('').error, /empty/);
  assert.match(parseCsv('a\u0000b').error, /doesn’t look like a CSV/);
  assert.match(parseCsv('x,'.repeat(60)).error, /too many columns/);
  assert.match(parseCsv('a\n'.repeat(MAX_ROWS + 5)).error, /more than 10,000 rows/);
});

test('parseDate and parseSignedAmount read what banks export', () => {
  assert.equal(parseDate('01/31/2026'), '2026-01-31');
  assert.equal(parseDate('1/5/26'), '2026-01-05');
  assert.equal(parseDate('2026-01-31'), '2026-01-31');
  assert.equal(parseDate('02/30/2026'), null);
  assert.equal(parseDate('Pending'), null);
  assert.equal(parseSignedAmount('-$1,234.56'), -123456);
  assert.equal(parseSignedAmount('$-12.5'), -1250);
  assert.equal(parseSignedAmount('(12.00)'), -1200);
  assert.equal(parseSignedAmount('+40'), 4000);
  assert.equal(parseSignedAmount('12.345'), null);
  assert.equal(parseSignedAmount('abc'), null);
});

test('detectLayout: Chase, Capital One, Amex (charges positive), Bank of America, and a common layout', () => {
  const chase = detectLayout([['Transaction Date', 'Post Date', 'Description', 'Category', 'Type', 'Amount', 'Memo']]);
  assert.deepEqual(chase, { name: 'Chase', mapping: { date: 0, description: 2, amount: 5, signs: 'out-negative' } });
  assert.equal(detectLayout([['Transaction Date', 'Posted Date', 'Card No.', 'Description', 'Category', 'Debit', 'Credit']]).name, 'Capital One');
  assert.equal(detectLayout([['Date', 'Description', 'Card Member', 'Account #', 'Amount']]).mapping.signs, 'out-positive');
  assert.equal(detectLayout([['Date', 'Description', 'Amount', 'Running Bal.']]).name, 'Bank of America');
  assert.equal(detectLayout([['Posting Date', 'Payee', 'Withdrawals', 'Deposits']]).name, 'Common layout');
  // No header (Wells Fargo): match columns by hand.
  assert.equal(hasHeader([['01/02/2026', '-4.75', '*', '', 'COFFEE']]), false);
  assert.equal(detectLayout([['01/02/2026', '-4.75', '*', '', 'COFFEE']]), null);
  assert.equal(detectLayout([['Foo', 'Bar']]), null);
});

test('readRow: signs, debit/credit columns, zero rows skipped, clear row errors', () => {
  const m = { date: 0, description: 1, amount: 2, signs: 'out-negative' };
  assert.deepEqual(readRow(['01/02/2026', 'COFFEE', '-4.75'], m), { ok: true, date: '2026-01-02', amountCents: 475, type: 'expense', description: 'COFFEE' });
  assert.equal(readRow(['01/02/2026', 'PAYROLL', '2000'], m).type, 'income');
  assert.equal(readRow(['01/02/2026', 'COFFEE', '4.75'], { ...m, signs: 'out-positive' }).type, 'expense');
  const dc = { date: 0, description: 1, debit: 2, credit: 3 };
  assert.equal(readRow(['01/02/2026', 'RENT', '1,400.00', ''], dc).amountCents, 140000);
  assert.equal(readRow(['01/02/2026', 'REFUND', '', '20'], dc).type, 'income');
  assert.deepEqual(readRow(['01/02/2026', 'HOLD', '0.00'], m), { ok: true, skip: true });
  assert.match(readRow(['Pending', 'X', '1'], m).error, /isn’t a date/);
  assert.match(readRow(['01/02/2026', 'X', 'abc'], m).error, /isn’t an amount/);
});

test('checkMapping: each needed column chosen once', () => {
  assert.deepEqual(checkMapping({ date: 0, description: 1, amount: 2, signs: 'out-negative' }, 3), {});
  assert.deepEqual(checkMapping({ date: 0, description: 1, debit: 2, credit: 3 }, 4), {});
  assert.deepEqual(Object.keys(checkMapping({}, 3)).sort(), ['amount', 'date', 'description']);
  assert.match(checkMapping({ date: 0, description: 0, amount: 1, signs: 'out-negative' }, 3).form, /only be used once/);
  assert.ok(checkMapping({ date: 0, description: 1, amount: 2 }, 3).signs);
  assert.ok(checkMapping({ date: 0, description: 1, amount: 9, signs: 'out-negative' }, 3).amount);
});

test('maskNumbers keeps only the last 4 digits of long numbers', () => {
  assert.equal(maskNumbers('PAYMENT TO CARD 4111 1111 1111 1234'), 'PAYMENT TO CARD ****1234');
  assert.equal(maskNumbers('ACCT 000123456789 XFER'), 'ACCT ****6789 XFER');
  assert.equal(maskNumbers('STORE 1234 AUSTIN'), 'STORE 1234 AUSTIN'); // short numbers stay
  assert.equal(maskNumbers('ON 01/02'), 'ON 01/02');
});

test('cleanMerchant turns bank descriptions into readable names', () => {
  assert.equal(cleanMerchant('POS DEBIT 10/12 CHIPOTLE 1234 AUSTIN TX'), 'Chipotle');
  assert.equal(cleanMerchant('SQ *BLUE BOTTLE COFFEE'), 'Blue Bottle Coffee');
  assert.equal(cleanMerchant('TST* JOES PIZZA #445'), 'Joes Pizza');
  assert.equal(cleanMerchant('Netflix.com'), 'Netflix.com');
  assert.equal(cleanMerchant("MCDONALD'S F1234"), "Mcdonald's F1234");
  assert.equal(cleanMerchant('ONLINE TRANSFER TO SAV ****6789'), 'Transfer To Sav');
  assert.equal(cleanMerchant('1234567890'), null);
  assert.equal(merchantKey('Blue Bottle Coffee'), 'BLUEBOTTLECOFFEE');
});

const state = (over = {}) => ({ transactions: [], categories: DEFAULT_CATEGORIES, merchantRules: [], ...over });
const M = { date: 0, description: 1, amount: 2, signs: 'out-negative' };

test('prepareImport: items with masked descriptions, merchants, fingerprints; per-row errors; zero rows', async () => {
  const rows = [['01/02/2026', 'SQ *BLUE BOTTLE 4111111111111234', '-4.75'], ['bad', 'X', '1'], ['01/03/2026', 'HOLD', '0'], ['01/03/2026', 'PAYROLL ACME', '2000']];
  const r = await prepareImport(rows, M, state(), { firstRowNumber: 2 });
  assert.equal(r.items.length, 2);
  assert.deepEqual(r.errors, [{ row: 3, error: '“bad” isn’t a date we can read' }]);
  assert.equal(r.zeroRows, 1);
  const [coffee] = r.items;
  assert.equal(coffee.description, 'SQ *BLUE BOTTLE ****1234');
  assert.equal(coffee.merchant, 'Blue Bottle');
  assert.match(coffee.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(r).includes('4111111111111234')); // the full card number is gone
});

test('prepareImport: already-imported rows are dropped; repeats in one file are kept; hand-entered twins are flagged', async () => {
  const rows = [['01/02/2026', 'COFFEE', '-5'], ['01/02/2026', 'COFFEE', '-5'], ['01/05/2026', 'GROCER', '-62.18']];
  const first = await prepareImport(rows, M, state());
  assert.equal(first.items.length, 3);
  assert.notEqual(first.items[0].fingerprint, first.items[1].fingerprint);
  const imported = first.items.slice(0, 1).map((i) => ({ id: 't1', source: 'import', fingerprint: i.fingerprint, type: 'expense', amountCents: 500, date: '2026-01-02', note: 'Coffee', categoryId: 'c-dining', createdAt: 1 }));
  const manual = { id: 'm1', source: 'manual', fingerprint: null, type: 'expense', amountCents: 6218, date: '2026-01-04', note: '', categoryId: 'c-groceries', createdAt: 2 };
  const again = await prepareImport(rows, M, state({ transactions: [...imported, manual] }));
  assert.equal(again.alreadyImported, 1);
  assert.equal(again.items.length, 2);
  assert.equal(again.items[1].possibleDuplicateOf, 'm1');
});

test('suggestions come from your rules, then your past imports; never for the wrong type or a hidden category', () => {
  const rules = [{ pattern: 'CHIPOTLE', categoryId: 'c-dining', timesConfirmed: 2 }];
  const ctx = { rules, transactions: [], categories: DEFAULT_CATEGORIES };
  assert.equal(suggestCategory({ merchant: 'Chipotle', type: 'expense' }, ctx), 'c-dining');
  assert.equal(suggestCategory({ merchant: 'Chipotle', type: 'income' }, ctx), null);
  const past = [{ source: 'import', type: 'expense', note: 'Blue Bottle', categoryId: 'c-dining' }];
  assert.equal(suggestCategory({ merchant: 'Blue Bottle', type: 'expense' }, { ...ctx, transactions: past }), 'c-dining');
  const hidden = DEFAULT_CATEGORIES.map((c) => (c.id === 'c-dining' ? { ...c, archived: true } : c));
  assert.equal(suggestCategory({ merchant: 'Chipotle', type: 'expense' }, { ...ctx, categories: hidden }), null);
  assert.equal(suggestCategory({ merchant: null, type: 'expense' }, ctx), null);
});
