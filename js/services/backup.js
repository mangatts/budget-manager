// What goes into a backup, and the strict checks a backup must pass before it can replace
// anything on this device (SECURITY.md §2.3: all-or-nothing, every record re-validated).
import { encryptJson, decryptJson, DecryptError } from './crypto.js';
import { MIGRATIONS } from '../db/indexeddb.js';
import { MAX_CENTS, MAX_NOTE_LENGTH, MIN_DATE, TYPES, cleanNote } from './validate.js';
import { isIsoDate } from '../utils/dates.js';
import { isUuid } from '../utils/id.js';

export const APP_ID = 'budget-manager';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MIN_PASSPHRASE = 12;
const MAX_TRANSACTIONS = 200_000;
const MAX_CATEGORIES = 500;
const META_KEYS = new Set(['seededCategories', 'lastBackupAt']);
const BUCKETS = new Set(['need', 'want', 'savings', null]);

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

export function buildPayload({ transactions, categories, meta }, now = Date.now()) {
  return {
    app: APP_ID,
    schemaVersion: MIGRATIONS.length,
    exportedAt: now,
    data: { transactions, categories, meta: meta.filter((m) => META_KEYS.has(m.key)) },
  };
}

export async function createBackupFile(state, passphrase, now = Date.now()) {
  const envelope = await encryptJson(buildPayload(state, now), passphrase);
  return JSON.stringify(envelope);
}

// ── Validation of everything inside a backup ──

const isText = (v, max) => typeof v === 'string' && v.length > 0 && [...v].length <= max;
const isTime = (v) => Number.isSafeInteger(v) && v > 0;

function cleanCategory(c) {
  if (!c || typeof c !== 'object') return null;
  const idOk = typeof c.id === 'string' && (/^c-[a-z0-9-]{1,40}$/.test(c.id) || isUuid(c.id));
  const name = typeof c.name === 'string' ? cleanNote(c.name) : '';
  if (!idOk || !isText(name, 30) || !isText(c.icon, 8) || !TYPES.includes(c.type)) return null;
  const bucket = c.bucket ?? null;
  const benchmarkKey = c.benchmarkKey ?? null;
  if (!BUCKETS.has(bucket) || (benchmarkKey !== null && !/^[a-z_]{1,40}$/.test(benchmarkKey))) return null;
  if (typeof c.archived !== 'boolean' || !Number.isSafeInteger(c.order)) return null;
  // Rebuilt from known fields only, so nothing unexpected is stored.
  return { id: c.id, name, icon: c.icon, type: c.type, bucket, benchmarkKey, archived: c.archived, order: c.order };
}

function cleanTransaction(t, categoryTypes) {
  if (!t || typeof t !== 'object') return null;
  const note = typeof t.note === 'string' ? cleanNote(t.note) : null;
  const ok = isUuid(t.id)
    && TYPES.includes(t.type)
    && Number.isSafeInteger(t.amountCents) && t.amountCents > 0 && t.amountCents <= MAX_CENTS
    && categoryTypes.get(t.categoryId) === t.type
    && isIsoDate(t.date) && t.date >= MIN_DATE && t.date <= '2100-12-31'
    && note !== null && [...note].length <= MAX_NOTE_LENGTH
    && ['manual', 'import'].includes(t.source)
    && (t.importId === null || isUuid(t.importId))
    && (t.fingerprint === null || (typeof t.fingerprint === 'string' && /^[0-9a-f]{1,128}$/.test(t.fingerprint)))
    && isTime(t.createdAt) && isTime(t.updatedAt);
  if (!ok) return null;
  return {
    id: t.id, type: t.type, amountCents: t.amountCents, categoryId: t.categoryId, date: t.date, note,
    source: t.source, importId: t.importId, fingerprint: t.fingerprint, createdAt: t.createdAt, updatedAt: t.updatedAt,
  };
}

// Returns { ok: true, data, summary } or { ok: false, error } — never a partial result.
export function validatePayload(payload) {
  const fail = (error) => ({ ok: false, error });
  if (!payload || typeof payload !== 'object' || payload.app !== APP_ID) return fail('This isn’t a Budget Manager backup.');
  if (!Number.isSafeInteger(payload.schemaVersion) || payload.schemaVersion < 1) return fail('This backup is damaged and can’t be opened.');
  if (payload.schemaVersion > MIGRATIONS.length) return fail('This backup was made by a newer version of the app. Update the app, then try again.');
  const { transactions, categories, meta } = payload.data ?? {};
  if (!Array.isArray(transactions) || !Array.isArray(categories) || !Array.isArray(meta)) return fail('This backup is damaged and can’t be opened.');
  if (transactions.length > MAX_TRANSACTIONS || categories.length > MAX_CATEGORIES) return fail('This backup is too large to restore.');

  const cleanCategories = categories.map(cleanCategory);
  if (cleanCategories.includes(null)) return fail('This backup has a category that isn’t valid, so nothing was restored.');
  if (new Set(cleanCategories.map((c) => c.id)).size !== cleanCategories.length) return fail('This backup has a repeated category, so nothing was restored.');

  const categoryTypes = new Map(cleanCategories.map((c) => [c.id, c.type]));
  const cleanTransactions = transactions.map((t) => cleanTransaction(t, categoryTypes));
  if (cleanTransactions.includes(null)) return fail('This backup has an entry that isn’t valid, so nothing was restored.');
  if (new Set(cleanTransactions.map((t) => t.id)).size !== cleanTransactions.length) return fail('This backup has a repeated entry, so nothing was restored.');

  const cleanMeta = meta.filter((m) => m && META_KEYS.has(m.key) && isTime(m.value)).map((m) => ({ key: m.key, value: m.value }));
  const exportedAt = isTime(payload.exportedAt) ? payload.exportedAt : null;
  // The categories are already in this backup, so don't add the defaults again after restoring.
  const finalMeta = [
    ...cleanMeta.filter((m) => m.key !== 'seededCategories' && m.key !== 'lastBackupAt'),
    { key: 'seededCategories', value: 1 },
    ...(exportedAt ? [{ key: 'lastBackupAt', value: exportedAt }] : []),
  ];

  const dates = cleanTransactions.map((t) => t.date).sort();
  return {
    ok: true,
    data: { transactions: cleanTransactions, categories: cleanCategories, meta: finalMeta },
    summary: { entries: cleanTransactions.length, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, exportedAt },
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
