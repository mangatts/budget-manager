// More → Import a statement (#/import): pick a CSV, check the columns, preview, then review every row.
// The file is read here in the browser and never uploaded; only the cleaned rows are kept (SECURITY.md §2.5).
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { formatDay } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { checkFile, parseCsv } from '../services/statementImport/csvParser.js';
import { detectLayout, hasHeader, checkMapping } from '../services/statementImport/layouts.js';
import { prepareImport, MAX_ROW_ERRORS_SHOWN } from '../services/statementImport/prepare.js';
import { maskNumbers } from '../services/statementImport/clean.js';

const storageError = () => el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.');
const signed = (item) => formatCents(item.type === 'income' ? item.amountCents : -item.amountCents, { sign: true });

// An import already in progress: continue or cancel (Undo).
function inProgress(store, record) {
  const rows = store.getState().pending.filter((p) => p.importId === record.id);
  const done = rows.filter((p) => p.decision !== 'pending').length;
  const cancel = el('button', { class: 'btn btn-quiet', type: 'button', id: 'cancel-import' }, 'Cancel this import');
  cancel.addEventListener('click', async () => {
    const result = await store.cancelImport(record.id);
    if (result.ok) showToast({ message: 'Import cancelled. Entries you added stay.', action: { label: 'Undo', run: async () => { await result.undo(); return 'Back'; } } });
    else showToast({ message: result.errors.form });
  });
  return el('div', { class: 'card', id: 'import-in-progress' },
    el('h2', { class: 'section-title' }, `You’re reviewing ${record.fileName}`),
    el('p', {}, `${done} of ${rows.length} done.`),
    el('div', { class: 'button-row' }, el('a', { class: 'btn btn-primary', href: '#/review', id: 'continue-review' }, 'Continue reviewing'), cancel),
  );
}

// Column matching for files we don't recognize (E7-S2). onChange(mapping) runs on every change.
function mappingForm(rows, header, initial, onChange) {
  // Header names and sample values are masked too: a column could hold card numbers.
  const names = header ? rows[0].map((n) => maskNumbers(n).slice(0, 30)) : rows[0].map((_, i) => `Column ${i + 1}`);
  const sample = (header ? rows[1] ?? [] : rows[0]).map((v) => maskNumbers(v));
  const mapping = { ...initial };
  const pick = (key, label, optional = false) => {
    const select = el('select', { class: 'input', id: `map-${key}` },
      el('option', { value: '' }, optional ? 'Not used' : 'Choose a column'),
      names.map((n, i) => el('option', { value: String(i), selected: mapping[key] === i }, sample[i] ? `${n} (e.g. ${String(sample[i]).slice(0, 24)})` : n)));
    select.addEventListener('change', () => { mapping[key] = select.value === '' ? undefined : Number(select.value); onChange({ ...mapping }); });
    return el('div', { class: 'field' }, el('label', { class: 'field-label', for: `map-${key}` }, label), select);
  };
  const signs = el('select', { class: 'input', id: 'map-signs' },
    el('option', { value: 'out-negative', selected: mapping.signs !== 'out-positive' }, 'Money out is negative (−12.50)'),
    el('option', { value: 'out-positive', selected: mapping.signs === 'out-positive' }, 'Money out is positive (credit card style)'));
  signs.addEventListener('change', () => { mapping.signs = signs.value; onChange({ ...mapping }); });
  mapping.signs ??= 'out-negative';
  return el('fieldset', { class: 'section', id: 'column-matching' },
    el('legend', { class: 'section-title' }, 'Match the columns'),
    el('p', { class: 'field-hint' }, 'Tell us which column is which. Use either one Amount column, or both Money out and Money in.'),
    pick('date', 'Date'), pick('description', 'Description'), pick('amount', 'Amount', true),
    el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'map-signs' }, 'In the Amount column'), signs),
    pick('debit', 'Money out', true), pick('credit', 'Money in', true),
  );
}

function previewTable(items) {
  return el('div', { class: 'table-scroll' }, el('table', { class: 'data-table', id: 'import-preview' },
    el('caption', {}, `First ${Math.min(5, items.length)} of ${items.length} rows`),
    el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Date'), el('th', { scope: 'col' }, 'What'), el('th', { scope: 'col' }, 'Amount'))),
    el('tbody', {}, items.slice(0, 5).map((i) => el('tr', {}, el('td', {}, formatDay(i.date)), el('td', {}, i.merchant ?? i.description), el('td', { class: 'money' }, signed(i))))),
  ));
}

function uploadForm(store) {
  const file = el('input', { class: 'input', id: 'import-file', type: 'file', accept: '.csv,text/csv', 'aria-describedby': 'import-file-hint import-file-error' });
  const fileError = el('span', { class: 'field-error', id: 'import-file-error', hidden: true });
  const details = el('div', { class: 'section', id: 'import-details', 'aria-live': 'polite' });
  const showError = (message) => { fileError.textContent = message ?? ''; fileError.hidden = !message; if (message) file.setAttribute('aria-invalid', 'true'); else file.removeAttribute('aria-invalid'); };

  let parsed = null; // { name, rows, header }
  let prepared = null;
  let run = 0; // ignore results from an earlier file or mapping

  const results = el('div', { class: 'section', id: 'import-results' });
  // firstTime: build the column form once; later changes only refresh the results (keeps focus).
  async function show(mapping, layoutName, firstTime = true) {
    const mine = ++run;
    prepared = null;
    const problems = checkMapping(mapping, parsed.rows[0].length);
    // A recognized layout that's missing a column falls back to matching by hand, pre-filled.
    if (layoutName && Object.keys(problems).length) { layoutName = null; firstTime = true; }
    if (firstTime) {
      clear(details);
      if (!layoutName) details.append(mappingForm(parsed.rows, parsed.header, mapping, (m) => show(m, null, false)));
      details.append(results);
    }
    clear(results);
    const data = parsed.header ? parsed.rows.slice(1) : parsed.rows;
    if (Object.keys(problems).length) {
      results.append(el('p', { class: 'field-hint', id: 'mapping-status' }, Object.values(problems)[0]));
      return;
    }
    const result = await prepareImport(data, mapping, store.getState(), { firstRowNumber: parsed.header ? 2 : 1 });
    if (mine !== run) return;
    prepared = result;
    // Recognized layouts can still be wrong (e.g. a card statement where charges are positive): let people fix it.
    const rematch = el('button', { class: 'btn btn-quiet', type: 'button', id: 'rematch-columns' }, 'Money in and out look wrong? Match the columns yourself');
    rematch.addEventListener('click', () => show(mapping, null));
    const start = el('button', { class: 'btn btn-primary btn-block', type: 'button', id: 'start-review', disabled: !result.items.length }, result.items.length ? `Review ${result.items.length} ${result.items.length === 1 ? 'row' : 'rows'}` : 'Nothing new to review');
    start.addEventListener('click', async () => {
      start.disabled = true;
      const saved = await store.startImport({ fileName: parsed.name, items: prepared.items });
      if (!saved.ok) { start.disabled = false; return showToast({ message: saved.errors.form }); }
      parsed = prepared = null; // the queue is saved; don't keep the file's rows around
      location.hash = '#/review';
    });
    const notes = [
      result.alreadyImported && `${result.alreadyImported} already imported (left out)`,
      result.alreadySkipped && `${result.alreadySkipped} you skipped before (left out)`,
      result.zeroRows && `${result.zeroRows} with a $0 amount (left out)`,
      result.errors.length && `${result.errors.length} couldn’t be read`,
    ].filter(Boolean);
    results.append(
      el('p', { class: 'lead', id: 'import-summary' }, `${!layoutName ? '' : layoutName === 'Common layout' ? 'Found the date, description, and amount columns. ' : `Looks like a ${layoutName} statement. `}${result.items.length} new ${result.items.length === 1 ? 'row' : 'rows'} to review.${notes.length ? ` ${notes.join(', ')}.` : ''}`),
      result.items.length ? previewTable(result.items) : null,
      result.errors.length ? el('details', { class: 'why', id: 'row-errors' },
        el('summary', {}, 'Rows that couldn’t be read'),
        el('ul', {}, result.errors.slice(0, MAX_ROW_ERRORS_SHOWN).map((e) => el('li', {}, `Row ${e.row}: ${e.error}`))),
        result.errors.length > MAX_ROW_ERRORS_SHOWN ? el('p', { class: 'field-hint' }, `…and ${result.errors.length - MAX_ROW_ERRORS_SHOWN} more.`) : null) : null,
      el('p', { class: 'field-hint' }, 'Next you’ll choose a category for each row. Nothing is added until you say so.'),
      start,
      layoutName ? rematch : null,
    );
  }

  file.addEventListener('change', async () => {
    run++;
    clear(details);
    parsed = null;
    const chosen = file.files?.[0];
    const problem = checkFile(chosen);
    showError(problem);
    if (problem) return;
    let text;
    try { text = await chosen.text(); } catch { return showError('This file couldn’t be read.'); }
    const csv = parseCsv(text);
    text = null; // don't keep the raw file around
    if (!csv.ok) return showError(csv.error);
    const layout = detectLayout(csv.rows);
    parsed = { name: chosen.name, rows: csv.rows, header: hasHeader(csv.rows) };
    if (parsed.header && parsed.rows.length < 2) return showError('This file has headers but no rows.');
    show(layout?.mapping ?? {}, layout?.name ?? null);
  });

  return el('div', { class: 'section' },
    el('p', { class: 'lead' }, 'Add a month of spending in one go. Download your account activity as a CSV file from your bank’s website, then choose it here.'),
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'import-file' }, 'Statement file (.csv)'),
      file,
      el('span', { class: 'field-hint', id: 'import-file-hint' }, 'Read on this device only, never uploaded. Card and account numbers are hidden, and the file itself isn’t kept.'),
      fileError,
    ),
    details,
  );
}

export function importView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  getStore().then((store) => {
    // The upload form keeps its own state, so only swap it when an import starts or ends.
    let showing = null;
    const render = () => {
      const current = store.getState().imports.find((i) => i.status === 'reviewing');
      const key = current?.id ?? 'upload';
      if (key === showing && !current) return;
      showing = key;
      clear(body);
      body.append(current ? inProgress(store, current) : uploadForm(store));
    };
    render();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(); });
  }, () => { clear(body); body.append(storageError()); });
  return el('div', { class: 'screen' }, el('a', { class: 'btn btn-quiet back-link', href: '#/more' }, '‹ More'), el('h1', { tabindex: '-1' }, 'Import a statement'), body);
}
