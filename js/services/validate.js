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

// Like parseAmount, but "0", "0.00", or "$0" are allowed (for "I have none").
export function parseAmountOrZero(input) {
  return /^\$?\s*0*(?:\.0*)?$/.test(String(input ?? '').trim()) && /\d/.test(String(input)) ? { cents: 0 } : parseAmount(input);
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

// ── Categories ──

export const MAX_CATEGORY_NAME = 30;
export const BUCKETS = Object.freeze(['need', 'want', 'savings']);
// Icons people can pick for their own categories (the defaults use these too).
export const CATEGORY_ICONS = Object.freeze(['🏠', '💡', '🛒', '🚌', '⛽', '🩺', '💳', '🍽️', '🛍️', '📺', '🎟️', '🧴', '🎁', '🏦', '📉', '📦', '💼', '🧰', '🎉', '↩️', '➕', '🐾', '👶', '🎓', '✈️', '🏋️', '📱', '🚗', '☕', '🧾']);

// input: { name, icon, type, bucket } · `editingId` lets a category keep its own name.
export function validateCategory(input, { categories, editingId = null }) {
  const raw = input && typeof input === 'object' ? input : {};
  const errors = {};
  const name = cleanNote(raw.name);
  const length = [...name].length;
  if (!length) errors.name = 'Give it a name';
  else if (length > MAX_CATEGORY_NAME) errors.name = `Names can be up to ${MAX_CATEGORY_NAME} characters. Shorten it by ${length - MAX_CATEGORY_NAME}.`;

  const type = TYPES.includes(raw.type) ? raw.type : null;
  if (!type) errors.type = 'Choose money in or money out';

  const key = name.toLocaleLowerCase('en-US');
  if (!errors.name && type && categories.some((c) => c.type === type && c.id !== editingId && c.name.toLocaleLowerCase('en-US') === key)) {
    errors.name = `You already have a “${name}” category.`;
  }

  if (!CATEGORY_ICONS.includes(raw.icon)) errors.icon = 'Pick an icon';

  // Money out needs a 50/30/20 group for the coach; money in doesn't have one.
  const bucket = type === 'expense' ? (BUCKETS.includes(raw.bucket) ? raw.bucket : null) : null;
  if (type === 'expense' && !bucket) errors.bucket = 'Choose Need, Want, or Savings';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, icon: raw.icon, type, bucket } };
}

// ── Money profile (More → Your money) ──

export const DEFAULT_SAVINGS_PERCENT = 20; // the "20" in 50/30/20
// 401(k) match: 'full' (getting all of it), 'partial', 'none' (no match offered), 'unsure'
export const EMPLOYER_MATCH = Object.freeze(['full', 'partial', 'none', 'unsure']);
export const MAX_SAVINGS_PERCENT = 50;

// input: { takeHome: "4,500" | "" , savingsPercent: "20" } → { monthlyTakeHomeCents: int | null, savingsPercent: int }
export function validateProfile(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const errors = {};
  let monthlyTakeHomeCents = null;
  if (String(raw.takeHome ?? '').trim() !== '') {
    const amount = parseAmount(raw.takeHome);
    if (amount.error) errors.takeHome = amount.error;
    else monthlyTakeHomeCents = amount.cents;
  }
  const text = String(raw.savingsPercent ?? '').trim().replace(/%$/, '');
  const percent = /^\d{1,3}$/.test(text) ? Number(text) : NaN;
  if (!(percent >= 0 && percent <= MAX_SAVINGS_PERCENT)) errors.savingsPercent = `Enter a whole number from 0 to ${MAX_SAVINGS_PERCENT}`;
  // Optional: emergency savings (blank = not answered) and 401(k) match.
  let emergencyFundCents;
  if (raw.emergencyFund !== undefined) {
    emergencyFundCents = null;
    if (String(raw.emergencyFund ?? '').trim() !== '') {
      const fund = parseAmountOrZero(raw.emergencyFund);
      if (fund.error) errors.emergencyFund = fund.error;
      else emergencyFundCents = fund.cents;
    }
  }
  let employerMatch;
  if (raw.employerMatch !== undefined) {
    employerMatch = EMPLOYER_MATCH.includes(raw.employerMatch) ? raw.employerMatch : null;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { monthlyTakeHomeCents, savingsPercent: percent, ...(emergencyFundCents !== undefined && { emergencyFundCents }), ...(employerMatch !== undefined && { employerMatch }) } };
}

// ── Debts (Next Best Step) ──

export const MAX_APR_BPS = 9999; // 99.99%

// "24.99" or "24.99%" → 2499 basis points, parsed as text (no floating point).
export function parseApr(input) {
  const text = String(input ?? '').trim().replace(/%$/, '').trim();
  const match = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return { error: /^\d{3,}(\.\d*)?$/.test(text) ? 'Rates can be up to 99.99%' : 'Enter the interest rate, like 24.99' };
  return { bps: Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) };
}

// input: { name, balance, apr, minPayment }
export function validateDebt(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const errors = {};
  const name = cleanNote(raw.name);
  if (!name) errors.name = 'Give it a name, like Visa or Car loan';
  else if ([...name].length > 40) errors.name = 'Names can be up to 40 characters.';
  const balance = parseAmount(raw.balance);
  if (balance.error) errors.balance = parseAmountOrZero(raw.balance).cents === 0 ? 'Paid off? Nice work! Delete it instead.' : balance.error;
  const apr = parseApr(raw.apr);
  if (apr.error) errors.apr = apr.error;
  const min = String(raw.minPayment ?? '').trim() === '' ? { cents: 0 } : parseAmountOrZero(raw.minPayment);
  if (min.error) errors.minPayment = min.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, balanceCents: balance.cents, aprBps: apr.bps, minPaymentCents: min.cents } };
}

// ── Cut Plan challenges ──

// input: { categoryId, month: 'YYYY-MM', fromCents, targetCents }
export function validateChallenge(input, { categories }) {
  const raw = input && typeof input === 'object' ? input : {};
  const errors = {};
  const category = categories.find((c) => c.id === raw.categoryId && c.type === 'expense' && c.bucket !== 'savings');
  if (!category) errors.categoryId = 'Pick a spending category';
  if (typeof raw.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.month)) errors.month = 'Pick a month';
  const ok = (v) => Number.isSafeInteger(v) && v > 0 && v <= MAX_CENTS;
  if (!ok(raw.fromCents)) errors.fromCents = 'Missing your usual amount';
  if (!ok(raw.targetCents) || (ok(raw.fromCents) && raw.targetCents >= raw.fromCents)) errors.targetCents = 'The target should be less than your usual';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { categoryId: category.id, month: raw.month, fromCents: raw.fromCents, targetCents: raw.targetCents } };
}

// ── Recurring bills ──

export const MAX_BILL_NAME = 40;

// input: { name, amount | amountCents, categoryId, dayOfMonth, active } · keepCategoryId keeps a hidden category valid when editing.
export function validateBill(input, { categories, keepCategoryId = null }) {
  const raw = input && typeof input === 'object' ? input : {};
  const errors = {};
  const name = cleanNote(raw.name);
  const length = [...name].length;
  if (!length) errors.name = 'Give it a name, like Rent or Phone';
  else if (length > MAX_BILL_NAME) errors.name = `Names can be up to ${MAX_BILL_NAME} characters. Shorten it by ${length - MAX_BILL_NAME}.`;

  const amount = Number.isSafeInteger(raw.amountCents)
    ? (raw.amountCents > 0 && raw.amountCents <= MAX_CENTS ? { cents: raw.amountCents } : { error: 'Enter an amount more than $0' })
    : parseAmount(raw.amount);
  if (amount.error) errors.amount = amount.error;

  const category = categories.find((c) => c.id === raw.categoryId && c.type === 'expense' && (!c.archived || c.id === keepCategoryId));
  if (!category) errors.categoryId = 'Pick a category';

  const day = typeof raw.dayOfMonth === 'number' ? raw.dayOfMonth : (/^\d{1,2}$/.test(String(raw.dayOfMonth ?? '').trim()) ? Number(String(raw.dayOfMonth).trim()) : NaN);
  if (!(Number.isInteger(day) && day >= 1 && day <= 31)) errors.dayOfMonth = 'Enter a day from 1 to 31';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, amountCents: amount.cents, categoryId: category.id, dayOfMonth: day, active: raw.active !== false } };
}
