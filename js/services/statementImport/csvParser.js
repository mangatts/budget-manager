// CSV parsing for bank statements (E7-S1). RFC 4180: quoted fields, "" escapes, commas and newlines in quotes.
// The file is read in the browser and never uploaded (SECURITY.md §2.5). Pure; no DOM.

export const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS = 10000;
export const MAX_COLUMNS = 50;
const MAX_FIELD = 1000;

// Checks a File-like { name, size } before reading it. Returns an error message or null.
export function checkFile(file) {
  if (!file) return 'Choose a file first.';
  if (!/\.csv$/i.test(file.name ?? '')) return 'Choose a .csv file. Most banks offer “Download as CSV” on the activity page.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_FILE_BYTES) return 'This file is larger than 5 MB. Try downloading a shorter date range.';
  return null;
}

// text → { ok: true, rows: string[][] } (blank lines dropped) or { ok: false, error }.
export function parseCsv(text) {
  if (typeof text !== 'string') return { ok: false, error: 'This file couldn’t be read.' };
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // byte-order mark from Excel
  if (text.includes('\u0000')) return { ok: false, error: 'This doesn’t look like a CSV file.' };
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endField = () => { row.push(field.trim()); field = ''; };
  let tooWide = false;
  const endRow = () => {
    endField();
    if (row.length > MAX_COLUMNS) tooWide = true;
    if (row.some((f) => f !== '')) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false;
      } else {
        field += ch;
        if (field.length > MAX_FIELD) return { ok: false, error: `Row ${rows.length + 1} has a value that’s too long. Is this a bank statement?` };
      }
      i++;
      continue;
    }
    if (ch === '"' && field.trim() === '') { field = ''; quoted = true; }
    else if (ch === ',') endField();
    else if (ch === '\n' || ch === '\r') {
      endRow();
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else field += ch;
    if (field.length > MAX_FIELD) return { ok: false, error: `Row ${rows.length + 1} has a value that’s too long. Is this a bank statement?` };
    if (row.length > MAX_COLUMNS) return { ok: false, error: 'This file has too many columns to be a bank statement.' };
    if (rows.length > MAX_ROWS + 1) return { ok: false, error: `This file has more than ${MAX_ROWS.toLocaleString('en-US')} rows. Try a shorter date range.` };
    i++;
  }
  if (quoted) return { ok: false, error: 'This file has a quote that never closes, so it couldn’t be read.' };
  if (field !== '' || row.length) endRow();
  if (tooWide) return { ok: false, error: 'This file has too many columns to be a bank statement.' };
  if (!rows.length) return { ok: false, error: 'This file is empty.' };
  if (rows.length > MAX_ROWS + 1) return { ok: false, error: `This file has more than ${MAX_ROWS.toLocaleString('en-US')} rows. Try a shorter date range.` };
  return { ok: true, rows };
}
