// What goes into a backup, and the strict checks a backup must pass before it can replace
// anything on this device (SECURITY.md §2.3: all-or-nothing, every record re-validated).
import { encryptJson, decryptJson, DecryptError } from './crypto.js';
import { MIGRATIONS } from '../db/indexeddb.js';
import { MAX_CENTS, MAX_NOTE_LENGTH, MIN_DATE, TYPES, cleanNote, MAX_APR_BPS, EMPLOYER_MATCH } from './validate.js';
import { isIsoDate } from '../utils/dates.js';
import { isUuid } from '../utils/id.js';

export const APP_ID = 'budget-manager';
// Room for decades of daily entries (~360 bytes each). Saving checks the same limit, so a backup
// that could never be restored is never made.
export const MAX_FILE_BYTES = 64 * 1024 * 1024;

export class BackupTooLargeError extends Error {}
export const MIN_PASSPHRASE = 12;
const MAX_TRANSACTIONS = 200_000;
const MAX_CATEGORIES = 500;
// Allowed settings in a backup, each with its own check.
const META_RULES = {
  seededCategories: (v) => v === 1,
  lastBackupAt: (v) => Number.isSafeInteger(v) && v > 0,
  monthlyTakeHomeCents: (v) => v === null || (Number.isSafeInteger(v) && v > 0 && v <= MAX_CENTS),
  savingsPercent: (v) => Number.isSafeInteger(v) && v >= 0 && v <= 50,
  emergencyFundCents: (v) => v === null || (Number.isSafeInteger(v) && v >= 0 && v <= MAX_CENTS),
  employerMatch: (v) => v === null || EMPLOYER_MATCH.includes(v),
  skippedSteps: (v) => Array.isArray(v) && v.length <= 20 && v.every((s) => typeof s === 'string' && /^[a-z-]{1,30}$/.test(s)),
};
const META_KEYS = new Set(Object.keys(META_RULES));
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

export function buildPayload({ transactions, categories, meta, bills = [], challenges = [], debts = [], goals = [], merchantRules = [] }, now = Date.now()) {
  return {
    app: APP_ID,
    schemaVersion: MIGRATIONS.length,
    exportedAt: now,
    data: { transactions, categories, meta: meta.filter((m) => META_KEYS.has(m.key)), bills, challenges, debts, goals, merchantRules },
  };
}

export async function createBackupFile(state, passphrase, now = Date.now(), { maxBytes = MAX_FILE_BYTES } = {}) {
  const text = JSON.stringify(await encryptJson(buildPayload(state, now), passphrase));
  if (text.length > maxBytes) throw new BackupTooLargeError('Your data is too large for one backup file.');
  return text;
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

function cleanBill(b, categoryTypes) {
  if (!b || typeof b !== 'object') return null;
  const name = typeof b.name === 'string' ? cleanNote(b.name) : '';
  const ok = isUuid(b.id) && isText(name, 40)
    && Number.isSafeInteger(b.amountCents) && b.amountCents > 0 && b.amountCents <= MAX_CENTS
    && categoryTypes.get(b.categoryId) === 'expense'
    && Number.isInteger(b.dayOfMonth) && b.dayOfMonth >= 1 && b.dayOfMonth <= 31
    && typeof b.active === 'boolean' && isTime(b.createdAt) && isTime(b.updatedAt);
  if (!ok) return null;
  return { id: b.id, name, amountCents: b.amountCents, categoryId: b.categoryId, dayOfMonth: b.dayOfMonth, active: b.active, createdAt: b.createdAt, updatedAt: b.updatedAt };
}

function cleanChallenge(c, categoryTypes) {
  if (!c || typeof c !== 'object') return null;
  const amount = (v) => Number.isSafeInteger(v) && v > 0 && v <= MAX_CENTS;
  const ok = isUuid(c.id) && categoryTypes.get(c.categoryId) === 'expense'
    && typeof c.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(c.month)
    && amount(c.fromCents) && amount(c.targetCents) && c.targetCents < c.fromCents
    && ['active', 'skipped', 'stopped'].includes(c.status) && isTime(c.createdAt);
  if (!ok) return null;
  return { id: c.id, categoryId: c.categoryId, month: c.month, fromCents: c.fromCents, targetCents: c.targetCents, status: c.status, createdAt: c.createdAt };
}

function cleanDebt(d) {
  if (!d || typeof d !== 'object') return null;
  const name = typeof d.name === 'string' ? cleanNote(d.name) : '';
  const ok = isUuid(d.id) && isText(name, 40)
    && Number.isSafeInteger(d.balanceCents) && d.balanceCents > 0 && d.balanceCents <= MAX_CENTS
    && Number.isSafeInteger(d.aprBps) && d.aprBps >= 0 && d.aprBps <= MAX_APR_BPS
    && Number.isSafeInteger(d.minPaymentCents) && d.minPaymentCents >= 0 && d.minPaymentCents <= MAX_CENTS
    && isTime(d.createdAt) && isTime(d.updatedAt);
  if (!ok) return null;
  return { id: d.id, name, balanceCents: d.balanceCents, aprBps: d.aprBps, minPaymentCents: d.minPaymentCents, createdAt: d.createdAt, updatedAt: d.updatedAt };
}

function cleanGoal(g) {
  if (!g || typeof g !== 'object') return null;
  const name = typeof g.name === 'string' ? cleanNote(g.name) : '';
  const cents = (v, min) => Number.isSafeInteger(v) && v >= min && v <= MAX_CENTS;
  const ok = isUuid(g.id) && isText(name, 40) && cents(g.targetCents, 1) && cents(g.savedCents, 0) && cents(g.monthlyCents, 0)
    && isTime(g.createdAt) && isTime(g.updatedAt);
  if (!ok) return null;
  return { id: g.id, name, targetCents: g.targetCents, savedCents: g.savedCents, monthlyCents: g.monthlyCents, createdAt: g.createdAt, updatedAt: g.updatedAt };
}

// Merchant rules you taught the importer. The review queue (imports, pending) isn't backed up: it's temporary.
function cleanRule(r, categoryTypes) {
  if (!r || typeof r !== 'object') return null;
  const ok = typeof r.pattern === 'string' && /^[A-Z0-9]{1,40}$/.test(r.pattern) && categoryTypes.has(r.categoryId)
    && Number.isSafeInteger(r.timesConfirmed) && r.timesConfirmed >= 1 && r.timesConfirmed <= 1000000 && isTime(r.updatedAt);
  return ok ? { pattern: r.pattern, categoryId: r.categoryId, timesConfirmed: r.timesConfirmed, updatedAt: r.updatedAt } : null;
}

// Returns { ok: true, data, summary } or { ok: false, error } — never a partial result.
export function validatePayload(payload) {
  const fail = (error) => ({ ok: false, error });
  if (!payload || typeof payload !== 'object' || payload.app !== APP_ID) return fail('This isn’t a Budget Manager backup.');
  if (!Number.isSafeInteger(payload.schemaVersion) || payload.schemaVersion < 1) return fail('This backup is damaged and can’t be opened.');
  if (payload.schemaVersion > MIGRATIONS.length) return fail('This backup was made by a newer version of the app. Update the app, then try again.');
  const { transactions, categories, meta } = payload.data ?? {};
  // Bills arrived in version 2; older backups simply have none.
  const bills = payload.schemaVersion >= 2 ? payload.data?.bills : [];
  // Challenges arrived in version 3.
  const challenges = payload.schemaVersion >= 3 ? payload.data?.challenges : [];
  // Debts arrived in version 4.
  const debts = payload.schemaVersion >= 4 ? payload.data?.debts : [];
  if (!Array.isArray(debts) || debts.length > 100) return fail('This backup is damaged and can\u2019t be opened.');
  const cleanDebts = debts.map(cleanDebt);
  if (cleanDebts.includes(null)) return fail('This backup has a debt that isn\u2019t valid, so nothing was restored.');
  if (new Set(cleanDebts.map((d) => d.id)).size !== cleanDebts.length) return fail('This backup has a repeated debt, so nothing was restored.');
  // Goals arrived in version 5.
  const goals = payload.schemaVersion >= 5 ? payload.data?.goals : [];
  if (!Array.isArray(goals) || goals.length > 100) return fail('This backup is damaged and can\u2019t be opened.');
  const cleanGoals = goals.map(cleanGoal);
  if (cleanGoals.includes(null)) return fail('This backup has a goal that isn\u2019t valid, so nothing was restored.');
  if (new Set(cleanGoals.map((g) => g.id)).size !== cleanGoals.length) return fail('This backup has a repeated goal, so nothing was restored.');
  if (!Array.isArray(challenges) || challenges.length > 2000) return fail('This backup is damaged and can\u2019t be opened.');
  if (!Array.isArray(transactions) || !Array.isArray(categories) || !Array.isArray(meta) || !Array.isArray(bills)) return fail('This backup is damaged and can’t be opened.');
  if (bills.length > 500) return fail('This backup is too large to restore.');
  if (transactions.length > MAX_TRANSACTIONS || categories.length > MAX_CATEGORIES) return fail('This backup is too large to restore.');

  const cleanCategories = categories.map(cleanCategory);
  if (cleanCategories.includes(null)) return fail('This backup has a category that isn’t valid, so nothing was restored.');
  if (new Set(cleanCategories.map((c) => c.id)).size !== cleanCategories.length) return fail('This backup has a repeated category, so nothing was restored.');

  const categoryTypes = new Map(cleanCategories.map((c) => [c.id, c.type]));
  const cleanTransactions = transactions.map((t) => cleanTransaction(t, categoryTypes));
  if (cleanTransactions.includes(null)) return fail('This backup has an entry that isn’t valid, so nothing was restored.');
  if (new Set(cleanTransactions.map((t) => t.id)).size !== cleanTransactions.length) return fail('This backup has a repeated entry, so nothing was restored.');

  const cleanBills = bills.map((b) => cleanBill(b, categoryTypes));
  if (cleanBills.includes(null)) return fail('This backup has a bill that isn’t valid, so nothing was restored.');
  if (new Set(cleanBills.map((b) => b.id)).size !== cleanBills.length) return fail('This backup has a repeated bill, so nothing was restored.');

  const cleanChallenges = challenges.map((c) => cleanChallenge(c, categoryTypes));
  if (cleanChallenges.includes(null)) return fail('This backup has a challenge that isn\u2019t valid, so nothing was restored.');
  if (new Set(cleanChallenges.map((c) => c.id)).size !== cleanChallenges.length
    || new Set(cleanChallenges.map((c) => `${c.categoryId}|${c.month}`)).size !== cleanChallenges.length) return fail('This backup has a repeated challenge, so nothing was restored.');

  // Merchant rules arrived in version 6.
  const rules = payload.schemaVersion >= 6 ? payload.data?.merchantRules : [];
  if (!Array.isArray(rules) || rules.length > 5000) return fail('This backup is damaged and can\u2019t be opened.');
  const cleanRules = rules.map((r) => cleanRule(r, categoryTypes));
  if (cleanRules.includes(null)) return fail('This backup has a merchant rule that isn\u2019t valid, so nothing was restored.');
  if (new Set(cleanRules.map((r) => r.pattern)).size !== cleanRules.length) return fail('This backup has a repeated merchant rule, so nothing was restored.');

  const cleanMeta = meta.filter((m) => m && Object.hasOwn(META_RULES, m.key) && META_RULES[m.key](m.value)).map((m) => ({ key: m.key, value: m.value }));
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
    data: { transactions: cleanTransactions, categories: cleanCategories, meta: finalMeta, bills: cleanBills, challenges: cleanChallenges, debts: cleanDebts, goals: cleanGoals, merchantRules: cleanRules },
    summary: { entries: cleanTransactions.length, bills: cleanBills.length, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, exportedAt },
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
