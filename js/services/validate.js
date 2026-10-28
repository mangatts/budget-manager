// Every piece of outside data goes through here before it's stored (SECURITY.md §2.3).
// Errors are plain-language messages written for the person using the app.

import { isIsoDate, addYears } from '../utils/dates.js';

export const MAX_CENTS = 100_000_000; // $1,000,000
export const MAX_NOTE_LENGTH = 200;
export const MIN_DATE = '2000-01-01';
export const TYPES = Object.freeze(['expense', 'income']);

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

// Removes control and text-direction characters (which can disguise text), collapses whitespace.
export function cleanNote(input) {
  return String(input ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// keepCategoryId: when editing, the entry's current category stays valid even if it has since been hidden.
export function validateTransaction(input, { categories, today, keepCategoryId = null }) {
  const errors = {};
  const raw = input && typeof input === 'object' ? input : {};

  const type = TYPES.includes(raw.type) ? raw.type : null;
  if (!type) errors.type = 'Choose money in or money out';

  const amount = Number.isSafeInteger(raw.amountCents) ? validCents(raw.amountCents) : parseAmount(raw.amount);
  if (amount.error) errors.amount = amount.error;

  const category = categories.find((c) => c.id === raw.categoryId && (!c.archived || c.id === keepCategoryId));
  if (!category || (type && category.type !== type)) errors.categoryId = 'Pick a category';

  const latest = addYears(today, 1);
  if (!isIsoDate(raw.date) || raw.date < MIN_DATE || raw.date > latest) errors.date = 'Pick a date';

  const note = cleanNote(raw.note);
  const length = [...note].length; // count characters, not UTF-16 units (emoji)
  if (length > MAX_NOTE_LENGTH) errors.note = `Notes can be up to ${MAX_NOTE_LENGTH} characters. Shorten it by ${length - MAX_NOTE_LENGTH}.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { type, amountCents: amount.cents, categoryId: category.id, date: raw.date, note } };
}

function validCents(cents) {
  if (cents <= 0) return { error: 'Enter an amount more than $0' };
  if (cents > MAX_CENTS) return { error: 'Amounts can’t be more than $1,000,000' };
  return { cents };
}
