// Every piece of outside data goes through here before it's stored (SECURITY.md §2.3).
// Errors are plain-language messages written for the person using the app.

import { isIsoDate } from '../utils/dates.js';

export const MAX_CENTS = 100_000_000; // $1,000,000
export const MIN_DATE = '2000-01-01';
export const MAX_NAME = 40;
export const MAX_APR_BPS = 9999; // 99.99%

// How often money comes in. Values are the app's stored codes.
export const FREQUENCIES = Object.freeze(['weekly', 'biweekly', 'semimonthly', 'monthly']);

// "$1,250.50" → 125050. Parsed as text, never through floating point (0.1 + 0.2 bugs).
export function parseAmount(input) {
  const text = String(input ?? '').trim().replace(/^\$\s*/, '');
  if (text === '') return { error: 'Enter an amount' };
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d*))?$/.exec(text);
  if (!match || !/\d/.test(text)) return { error: 'Enter an amount like 12.50' };
  const [, whole = '0', fraction = ''] = match;
  if (fraction.length > 2) return { error: 'Use at most 2 decimal places, like 12.50' };
  const digits = whole.replaceAll(',', '').replace(/^0+(?=\d)/, '');
  if (digits.length > 7) return { error: 'Amounts can’t be more than $1,000,000' };
  const cents = Number(digits) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents === 0) return { error: 'Enter an amount more than $0' };
  if (cents > MAX_CENTS) return { error: 'Amounts can’t be more than $1,000,000' };
  return { cents };
}

// Like parseAmount, but "0", "0.00", or "$0" are allowed (a paid-off card, no minimum due).
export function parseAmountOrZero(input) {
  return /^\$?\s*0*(?:\.0*)?$/.test(String(input ?? '').trim()) && /\d/.test(String(input)) ? { cents: 0 } : parseAmount(input);
}

const isBlank = (value) => String(value ?? '').trim() === '';

// Removes control and text-direction characters (which can disguise text), collapses whitespace.
export function cleanNote(input) {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanName(input, example, errors) {
  const name = cleanNote(input);
  const length = [...name].length; // characters, not UTF-16 units (emoji)
  if (!length) errors.name = `Give it a name, like ${example}`;
  else if (length > MAX_NAME) errors.name = `Names can be up to ${MAX_NAME} characters. Shorten it by ${length - MAX_NAME}.`;
  return name;
}

// "24.99" or "24.99%" → 2499 basis points, parsed as text (no floating point).
export function parseApr(input) {
  const text = String(input ?? '').trim().replace(/%$/, '').trim();
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return { error: /^\d{3,}(\.\d*)?$/.test(text) ? 'Rates can be up to 99.99%' : 'Enter the interest rate, like 24.99' };
  return { bps: Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) };
}

const objectOrEmpty = (input) => (input && typeof input === 'object' ? input : {});
const result = (errors, value) => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, value });

// ── Credit cards ── input: { name, limit, apr, minPayment }
export function validateCard(input) {
  const raw = objectOrEmpty(input);
  const errors = {};
  const name = cleanName(raw.name, 'Chase Freedom', errors);
  let limitCents = null;
  if (!isBlank(raw.limit)) {
    const limit = parseAmount(raw.limit);
    if (limit.error) errors.limit = limit.error;
    else limitCents = limit.cents;
  }
  const apr = parseApr(raw.apr);
  if (apr.error) errors.apr = apr.error;
  const min = isBlank(raw.minPayment) ? { error: 'Enter the minimum payment from your statement (0 if none is due)' } : parseAmountOrZero(raw.minPayment);
  if (min.error) errors.minPayment = min.error;
  return result(errors, { name, limitCents, aprBps: apr.bps, minPaymentCents: min.cents });
}

// ── Income ── input: { name, amount, frequency }
export function validateIncome(input) {
  const raw = objectOrEmpty(input);
  const errors = {};
  const name = cleanName(raw.name, 'Paycheck', errors);
  const amount = parseAmount(raw.amount);
  if (amount.error) errors.amount = amount.error;
  const frequency = FREQUENCIES.includes(raw.frequency) ? raw.frequency : null;
  if (!frequency) errors.frequency = 'Choose how often you get it';
  return result(errors, { name, amountCents: amount.cents, frequency });
}

// ── Fixed expenses ── input: { name, amount, dayOfMonth } (day is optional)
export function validateExpense(input) {
  const raw = objectOrEmpty(input);
  const errors = {};
  const name = cleanName(raw.name, 'Rent', errors);
  const amount = parseAmount(raw.amount);
  if (amount.error) errors.amount = amount.error;
  let dayOfMonth = null;
  if (!isBlank(raw.dayOfMonth)) {
    const text = String(raw.dayOfMonth).trim();
    dayOfMonth = /^\d{1,2}$/.test(text) ? Number(text) : NaN;
    if (!(dayOfMonth >= 1 && dayOfMonth <= 31)) errors.dayOfMonth = 'Enter a day from 1 to 31, or leave it blank';
  }
  return result(errors, { name, amountCents: amount.cents, dayOfMonth });
}

// The day a card was added, so an older check-in doesn't need its balance.
export const addedOn = (card) => (Number.isSafeInteger(card.createdAt) && card.createdAt > 0 ? localDay(card.createdAt) : MIN_DATE);
const localDay = (time) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── Check-in ── input: { date, balances: { [cardId]: "1,200" } }. Every card needs a balance (0 is fine),
// except cards added after that day, which may be left blank. Errors: { date, 'balance-<cardId>' }.
export function validateCheckin(input, { cards, today }) {
  const raw = objectOrEmpty(input);
  const errors = {};
  if (!isIsoDate(raw.date) || raw.date < MIN_DATE || raw.date > today) errors.date = 'Pick a date that isn’t in the future';
  if (!cards.length) errors.form = 'Add a card in Setup first.';
  const given = objectOrEmpty(raw.balances);
  const balances = [];
  for (const card of cards) {
    const text = Object.hasOwn(given, card.id) ? given[card.id] : '';
    if (isBlank(text) && typeof raw.date === 'string' && raw.date < addedOn(card)) continue;
    const amount = isBlank(text) ? { error: 'Enter the balance, or 0 if it’s paid off' } : parseAmountOrZero(text);
    if (amount.error) errors[`balance-${card.id}`] = amount.error;
    else balances.push({ cardId: card.id, balanceCents: amount.cents });
  }
  return result(errors, { date: raw.date, balances });
}
