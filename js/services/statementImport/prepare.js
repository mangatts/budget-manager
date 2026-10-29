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
export function suggestCategory({ merchant, type }, { rules, transactions, categories }) {
  const key = merchantKey(merchant);
  if (!key) return null;
  const usable = (id) => categories.some((c) => c.id === id && c.type === type && !c.archived);
  const rule = rules.find((r) => r.pattern === key);
  if (rule && usable(rule.categoryId)) return rule.categoryId;
  const past = transactions.find((t) => t.source === 'import' && t.type === type && merchantKey(t.note) === key && usable(t.categoryId));
  return past?.categoryId ?? null;
}

// rows: data rows only (header removed). state: { transactions, categories, merchantRules }.
// → { items, errors: [{ row, error }], alreadyImported, zeroRows }
export async function prepareImport(rows, mapping, state, { firstRowNumber = 1 } = {}) {
  const fingerprints = new Set(state.transactions.map((t) => t.fingerprint).filter(Boolean));
  // Byte-for-byte identical rows in one file are usually real (two $5 coffees), so count repeats.
  const seen = new Map();
  const items = [];
  const errors = [];
  let alreadyImported = 0;
  let zeroRows = 0;
  const transactions = [...state.transactions].sort((a, b) => b.createdAt - a.createdAt); // newest first for suggestions
  for (let i = 0; i < rows.length; i++) {
    const r = readRow(rows[i], mapping);
    if (!r.ok) { errors.push({ row: i + firstRowNumber, error: r.error }); continue; }
    if (r.skip) { zeroRows++; continue; }
    const description = cleanNote(maskNumbers(r.description)).slice(0, MAX_NOTE_LENGTH);
    const merchant = cleanMerchant(description);
    const base = `${r.date}|${r.type}|${r.amountCents}|${merchantKey(description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const fingerprint = await sha256Hex(`${base}|${n}`);
    if (fingerprints.has(fingerprint)) { alreadyImported++; continue; }
    // Looks like something you added by hand: same amount and money in/out, within a day.
    const near = new Set([addDays(r.date, -1), r.date, addDays(r.date, 1)]);
    const twin = state.transactions.find((t) => t.source === 'manual' && t.type === r.type && t.amountCents === r.amountCents && near.has(t.date));
    items.push({
      order: items.length, date: r.date, type: r.type, amountCents: r.amountCents, description, merchant, fingerprint,
      suggestedCategoryId: suggestCategory({ merchant, type: r.type }, { rules: state.merchantRules ?? [], transactions, categories: state.categories }),
      possibleDuplicateOf: twin?.id ?? null,
    });
  }
  return { items, errors, alreadyImported, zeroRows };
}
