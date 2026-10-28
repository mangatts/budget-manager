// Money is stored as integer cents (ARCHITECTURE.md §4) and shown in USD.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const MINUS = '−'; // a true minus sign: easier to read than a hyphen

// formatCents(475) → "$4.75"; with { sign: true }: 475 → "+$4.75", -475 → "−$4.75"
export function formatCents(cents, { sign = false } = {}) {
  if (!Number.isSafeInteger(cents)) throw new TypeError(`formatCents expects integer cents, got ${cents}`);
  const text = usd.format(Math.abs(cents) / 100);
  if (cents < 0) return MINUS + text;
  if (sign && cents > 0) return '+' + text;
  return text;
}
