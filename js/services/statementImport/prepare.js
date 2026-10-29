// Statement rows → a review queue (E7-S1–S4, S6). Reads rows with the column mapping, masks numbers,
// cleans merchant names, fingerprints each row, drops rows already imported, flags rows that look like
// an entry you typed yourself, and suggests a category from YOUR earlier choices (never auto-filed).
import { readRow } from './layouts.js';
import { maskNumbers, cleanMerchant, merchantKey } from './clean.js';
import { cleanNote, MAX_NOTE_LENGTH } from '../validate.js';
import { addDays } from '../../utils/dates.js';

export const MAX_ROW_ERRORS_SHOWN = 10;

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Category suggestion: a merchant rule you confirmed, else the category you last gave this merchant on an
// import. Only categories that still exist, aren't hidden, and match money in/out.
// `history`: merchantKey|type → categoryId from your imports, newest first (see suggestionIndex).
export function suggestCategory({ merchant, type }, { rules, history, categories }) {
  const key = merchantKey(merchant);
  if (!key) return null;
  const usable = (id) => categories.some((c) => c.id === id && c.type === type && !c.archived);
  const rule = rules.find((r) => r.pattern === key);
  if (rule && usable(rule.categoryId)) return rule.categoryId;
  const past = history.get(`${key}|${type}`) ?? [];
  return past.find(usable) ?? null;
}

// Built once per file (not per row), so big files stay quick.
export function suggestionIndex(transactions) {
  const history = new Map();
  for (const t of [...transactions].sort((a, b) => b.createdAt - a.createdAt)) {
    if (t.source !== 'import') continue;
    const k = `${merchantKey(t.note)}|${t.type}`;
    if (!history.has(k)) history.set(k, []);
    history.get(k).push(t.categoryId);
  }
  return history;
}

const keepChars = (text, max) => [...text].slice(0, max).join(''); // never split an emoji

// rows: data rows only (header removed). state: { transactions, categories, merchantRules, pending }.
// → { items, errors: [{ row, error }], alreadyImported, alreadySkipped, zeroRows }
export async function prepareImport(rows, mapping, state, { firstRowNumber = 1 } = {}) {
  const imported = new Set(state.transactions.map((t) => t.fingerprint).filter(Boolean));
  // Rows you skipped on an earlier import stay skipped (cancelled imports don't count: you didn't review them).
  const skipped = new Set((state.pending ?? []).filter((p) => p.decision === 'skipped').map((p) => p.fingerprint));
  const manual = new Map(); // type|amount|date → a hand-entered entry
  for (const t of state.transactions) if (t.source === 'manual') manual.set(`${t.type}|${t.amountCents}|${t.date}`, t.id);
  const ctx = { rules: state.merchantRules ?? [], history: suggestionIndex(state.transactions), categories: state.categories };
  // Byte-for-byte identical rows in one file are usually real (two $5 coffees), so count repeats.
  const seen = new Map();
  const read = [];
  const errors = [];
  let zeroRows = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = readRow(rows[i], mapping);
    if (!r.ok) { errors.push({ row: i + firstRowNumber, error: r.error }); continue; }
    if (r.skip) { zeroRows++; continue; }
    const description = keepChars(cleanNote(maskNumbers(r.description)), MAX_NOTE_LENGTH);
    const base = `${r.date}|${r.type}|${r.amountCents}|${merchantKey(description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    read.push({ r, description, key: `${base}|${n}` });
  }
  const fingerprints = await Promise.all(read.map((x) => sha256Hex(x.key)));
  const items = [];
  let alreadyImported = 0;
  let alreadySkipped = 0;
  read.forEach(({ r, description }, i) => {
    const fingerprint = fingerprints[i];
    if (imported.has(fingerprint)) { alreadyImported++; return; }
    if (skipped.has(fingerprint)) { alreadySkipped++; return; }
    const merchant = cleanMerchant(description);
    // Looks like something you added by hand: same amount and money in/out, within a day.
    const twin = [addDays(r.date, -1), r.date, addDays(r.date, 1)].map((d) => manual.get(`${r.type}|${r.amountCents}|${d}`)).find(Boolean);
    items.push({
      order: items.length, date: r.date, type: r.type, amountCents: r.amountCents, description, merchant, fingerprint,
      suggestedCategoryId: suggestCategory({ merchant, type: r.type }, ctx),
      possibleDuplicateOf: twin ?? null,
    });
  });
  return { items, errors, alreadyImported, alreadySkipped, zeroRows };
}
