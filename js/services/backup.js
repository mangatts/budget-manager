// What goes into a backup, and the strict checks a backup must pass before it can replace
// anything on this device (SECURITY.md §2.3: all-or-nothing, every record re-validated).
import { encryptJson, decryptJson, DecryptError } from './crypto.js';
import { MIGRATIONS } from '../db/indexeddb.js';
import { MAX_CENTS, MAX_NAME, MIN_DATE, MAX_APR_BPS, FREQUENCIES, cleanNote } from './validate.js';
import { fromLegacy } from './legacy.js';
import { LIMITS } from '../store.js';
import { isIsoDate, todayLocal } from '../utils/dates.js';
import { isUuid, newId } from '../utils/id.js';

export const APP_ID = 'budget-manager';
// Room for decades of daily entries (~360 bytes each). Saving checks the same limit, so a backup
// that could never be restored is never made.
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

export class BackupTooLargeError extends Error {}
export const MIN_PASSPHRASE = 12;
// Allowed settings in a backup, each with its own check.
const META_RULES = {
  lastBackupAt: (v) => Number.isSafeInteger(v) && v > 0,
};
const META_KEYS = new Set(Object.keys(META_RULES));

// A short list of the most common passwords and patterns people reach for.
const COMMON = new Set(['password1234', 'password12345', '123456789012', 'qwertyuiopas', 'iloveyou1234', 'passwordpassword', 'letmein12345', 'welcome12345', 'abcdefghijkl', '111111111111', 'qwerty123456', 'budgetmanager', 'mypassword123', 'changeme1234', 'football1234', 'baseball1234', 'sunshine1234', 'princess1234', 'trustno11234', 'administrator']);

export function checkPassphrase(passphrase, confirm) {
  const p = String(passphrase ?? '');
  const errors = {};
  if ([...p].length < MIN_PASSPHRASE) errors.passphrase = `Use at least ${MIN_PASSPHRASE} characters. A few words in a row works well, like “blue river coffee lamp”.`;
  else if (COMMON.has(p.toLowerCase().replace(/\s+/g, '')) || /^(.)\1+$/.test(p)) errors.passphrase = 'That one is too easy to guess. Try a few unrelated words.';
  if (!errors.passphrase && p !== String(confirm ?? '')) errors.confirm = 'The two passphrases don’t match.';
  return errors;
}

export const backupFileName = (date) => `budget-manager-backup-${date}.bmbackup`;

export function buildPayload({ cards, checkins, incomes, expenses, meta }, now = Date.now()) {
  return {
    app: APP_ID,
    schemaVersion: MIGRATIONS.length,
    exportedAt: now,
    data: { cards, checkins, incomes, expenses, meta: meta.filter((m) => META_KEYS.has(m.key)) },
  };
}

export async function createBackupFile(state, passphrase, now = Date.now(), { maxBytes = MAX_FILE_BYTES } = {}) {
  const text = JSON.stringify(await encryptJson(buildPayload(state, now), passphrase));
  if (text.length > maxBytes) throw new BackupTooLargeError('Your data is too large for one backup file.');
  return text;
}

// ── Validation of everything inside a backup ──
// Each record is rebuilt from known fields only, so nothing unexpected is ever stored.

const isTime = (v) => Number.isSafeInteger(v) && v > 0;
const cents = (v, min = 0) => Number.isSafeInteger(v) && v >= min && v <= MAX_CENTS;
const nameOf = (v) => {
  const name = typeof v === 'string' ? cleanNote(v) : '';
  return name && [...name].length <= MAX_NAME ? name : null;
};
const isObject = (v) => v && typeof v === 'object';
const isApr = (v) => Number.isSafeInteger(v) && v >= 0 && v <= MAX_APR_BPS;
const isDay = (v) => Number.isInteger(v) && v >= 1 && v <= 31;

function cleanCard(c) {
  const name = isObject(c) && nameOf(c.name);
  const ok = name && isUuid(c.id) && (c.limitCents === null || cents(c.limitCents, 1)) && isApr(c.aprBps)
    && cents(c.minPaymentCents) && isTime(c.createdAt) && isTime(c.updatedAt);
  return ok ? { id: c.id, name, limitCents: c.limitCents, aprBps: c.aprBps, minPaymentCents: c.minPaymentCents, createdAt: c.createdAt, updatedAt: c.updatedAt } : null;
}

// Balances for cards that were deleted are dropped (not an error), like the app does.
function cleanCheckin(c, cardIds) {
  const ok = isObject(c) && isIsoDate(c.date) && c.date >= MIN_DATE && c.date <= '2100-12-31' && isTime(c.createdAt)
    && Array.isArray(c.balances) && c.balances.length <= LIMITS.cards
    && c.balances.every((b) => isObject(b) && isUuid(b.cardId) && cents(b.balanceCents))
    && new Set(c.balances.map((b) => b.cardId)).size === c.balances.length;
  if (!ok) return null;
  const balances = c.balances.filter((b) => cardIds.has(b.cardId)).map((b) => ({ cardId: b.cardId, balanceCents: b.balanceCents }));
  return { date: c.date, balances, createdAt: c.createdAt };
}

function cleanIncome(i) {
  const name = isObject(i) && nameOf(i.name);
  const ok = name && isUuid(i.id) && cents(i.amountCents, 1) && FREQUENCIES.includes(i.frequency) && isTime(i.createdAt) && isTime(i.updatedAt);
  return ok ? { id: i.id, name, amountCents: i.amountCents, frequency: i.frequency, createdAt: i.createdAt, updatedAt: i.updatedAt } : null;
}

function cleanExpense(e) {
  const name = isObject(e) && nameOf(e.name);
  const ok = name && isUuid(e.id) && cents(e.amountCents, 1) && (e.dayOfMonth === null || isDay(e.dayOfMonth)) && isTime(e.createdAt) && isTime(e.updatedAt);
  return ok ? { id: e.id, name, amountCents: e.amountCents, dayOfMonth: e.dayOfMonth, createdAt: e.createdAt, updatedAt: e.updatedAt } : null;
}

// From backups made by the earlier version of the app (schema 1–7).
function cleanLegacyDebt(d) {
  const name = isObject(d) && nameOf(d.name);
  const ok = name && isUuid(d.id) && cents(d.balanceCents, 1) && isApr(d.aprBps) && cents(d.minPaymentCents) && isTime(d.createdAt) && isTime(d.updatedAt);
  return ok ? { id: d.id, name, balanceCents: d.balanceCents, aprBps: d.aprBps, minPaymentCents: d.minPaymentCents, createdAt: d.createdAt, updatedAt: d.updatedAt } : null;
}
function cleanLegacyBill(b) {
  const name = isObject(b) && nameOf(b.name);
  const ok = name && isUuid(b.id) && cents(b.amountCents, 1) && isDay(b.dayOfMonth) && typeof b.active === 'boolean' && isTime(b.createdAt) && isTime(b.updatedAt);
  return ok ? { id: b.id, name, amountCents: b.amountCents, dayOfMonth: b.dayOfMonth, active: b.active, createdAt: b.createdAt, updatedAt: b.updatedAt } : null;
}

// Cleans a list: every item must pass and keys must be unique, or the whole backup is refused.
function cleanList(list, max, clean, key, what) {
  if (list === undefined) return { items: [] };
  if (!Array.isArray(list)) return { error: 'This backup is damaged and can’t be opened.' };
  if (list.length > max) return { error: 'This backup is too large to restore.' };
  const items = list.map(clean);
  if (items.includes(null)) return { error: `This backup has ${what} that isn’t valid, so nothing was restored.` };
  if (new Set(items.map((i) => i[key])).size !== items.length) return { error: `This backup has a repeated ${what.replace(/^an? /, '')}, so nothing was restored.` };
  return { items };
}

function readLegacy(data, { today, now }) {
  const debts = cleanList(data.debts, 100, cleanLegacyDebt, 'id', 'a debt');
  const bills = cleanList(data.bills, LIMITS.expenses, cleanLegacyBill, 'id', 'a bill');
  const error = debts.error ?? bills.error;
  if (error) return { error };
  const pay = Array.isArray(data.meta) ? data.meta.find((m) => isObject(m) && m.key === 'monthlyTakeHomeCents') : null;
  const monthlyTakeHomeCents = pay && cents(pay.value, 1) ? pay.value : null;
  return { data: fromLegacy({ debts: debts.items, bills: bills.items, monthlyTakeHomeCents }, { today, now, newId }) };
}

function readCurrent(data) {
  const cards = cleanList(data.cards, LIMITS.cards, cleanCard, 'id', 'a card');
  if (cards.error) return { error: cards.error };
  const cardIds = new Set(cards.items.map((c) => c.id));
  const checkins = cleanList(data.checkins, LIMITS.checkins, (c) => cleanCheckin(c, cardIds), 'date', 'a check-in');
  const incomes = cleanList(data.incomes, LIMITS.incomes, cleanIncome, 'id', 'an income');
  const expenses = cleanList(data.expenses, LIMITS.expenses, cleanExpense, 'id', 'an expense');
  const error = checkins.error ?? incomes.error ?? expenses.error;
  if (error) return { error };
  return { data: { cards: cards.items, checkins: checkins.items, incomes: incomes.items, expenses: expenses.items } };
}

// Returns { ok: true, data, summary } or { ok: false, error } — never a partial result.
export function validatePayload(payload, { today = todayLocal(), now = Date.now() } = {}) {
  const fail = (error) => ({ ok: false, error });
  if (!isObject(payload) || payload.app !== APP_ID) return fail('This isn’t a Budget Manager backup.');
  if (!Number.isSafeInteger(payload.schemaVersion) || payload.schemaVersion < 1) return fail('This backup is damaged and can’t be opened.');
  if (payload.schemaVersion > MIGRATIONS.length) return fail('This backup was made by a newer version of the app. Update the app, then try again.');
  if (!isObject(payload.data)) return fail('This backup is damaged and can’t be opened.');

  // Version 8 is the simple cards app; older backups bring over debts, bills and take-home pay.
  const legacy = payload.schemaVersion < 8;
  const read = legacy ? readLegacy(payload.data, { today, now }) : readCurrent(payload.data);
  if (read.error) return fail(read.error);

  const meta = Array.isArray(payload.data.meta) ? payload.data.meta : [];
  const exportedAt = isTime(payload.exportedAt) ? payload.exportedAt : null;
  const finalMeta = [
    // Older backups' settings don't apply to this app.
    ...(legacy ? [] : meta.filter((m) => isObject(m) && Object.hasOwn(META_RULES, m.key) && m.key !== 'lastBackupAt' && META_RULES[m.key](m.value)).map((m) => ({ key: m.key, value: m.value }))),
    // Already carried over, so the device's leftover old data is never added on top.
    { key: 'carriedOver', value: 1 },
    ...(exportedAt ? [{ key: 'lastBackupAt', value: exportedAt }] : []),
  ];
  const { data } = read;
  const dates = data.checkins.map((c) => c.date).sort();
  return {
    ok: true,
    data: { ...data, meta: finalMeta },
    summary: { cards: data.cards.length, checkins: data.checkins.length, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, exportedAt, legacy },
  };
}

// The whole restore check: size → JSON → decrypt → validate. Never touches the database.
export async function openBackupFile(text, passphrase) {
  if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) return { ok: false, error: 'This file is too large to be a backup.' };
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This isn’t a Budget Manager backup file.' };
  }
  try {
    return validatePayload(await decryptJson(envelope, passphrase));
  } catch (error) {
    if (error instanceof DecryptError) return { ok: false, error: error.message };
    throw error;
  }
}
