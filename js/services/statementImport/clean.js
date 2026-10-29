// Data minimization for imports (E7-S3, SECURITY.md §2.5): mask card/account numbers, and turn bank
// descriptions like "POS DEBIT 10/12 CHIPOTLE 1234 AUSTIN TX" into a merchant name like "Chipotle".
import { cleanNote } from '../validate.js';

// Any run of 5+ digits (spaces/dashes allowed inside) keeps only its last 4: "Card 4111 1111 1111 1234" → "Card ****1234".
export function maskNumbers(text) {
  return String(text ?? '').replace(/\d(?:[\d -]{3,}\d)/g, (run) => {
    const digits = run.replace(/\D/g, '');
    return digits.length >= 5 ? `****${digits.slice(-4)}` : run;
  });
}

const NOISE = [
  /^(?:pos|ach|dbt|debit|credit|card|purchase|recurring|payment|online|web|checkcard|visa|mc|pre-?auth(?:orized)?|withdrawal|electronic|bill pay)\b[\s:]*/i,
  /^(?:des|id|indn|co id|ppd)\s*:\s*/i, // ACH labels: "DES: NETFLIX"
  /^(?:sq|tst|pp|paypal|sp|py|in|dd|apl|ppl|bt|cke|fs)\s*\*\s*/i, // payment processors: "SQ *", "TST* ", "PAYPAL *"
  /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s+/, // a date at the start
];

// Bank description (already masked) → a short, readable merchant name, or null if nothing's left.
export function cleanMerchant(description) {
  let t = cleanNote(maskNumbers(description));
  for (let pass = 0; pass < 6; pass++) {
    const before = t;
    for (const pattern of NOISE) t = t.replace(pattern, '');
    if (t === before) break;
  }
  t = t
    .replace(/\*{4}\d{4}.*$/, '') // masked number and anything after it
    .replace(/\s#?\d{3,}.*$/, '') // store numbers and what follows ("CHIPOTLE 1234 AUSTIN TX")
    .replace(/\s+[A-Z]{2}$/, '') // trailing state code
    .replace(/[*#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!/[a-z]/i.test(t)) return null;
  const name = t.length > 40 ? t.slice(0, 40).trim() : t;
  // ALL CAPS → Title Case; leave mixed case alone ("iTunes", "McDonald's").
  return name === name.toUpperCase() ? name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/'S\b/g, '\'s') : name;
}

// The key merchant rules match on: letters and digits only, upper case. "Chipotle" → "CHIPOTLE".
export const merchantKey = (merchant) => String(merchant ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 40);
