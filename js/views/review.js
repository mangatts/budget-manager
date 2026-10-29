// Review an imported statement (#/review), one row at a time (E7-S5, S6). You choose every category:
// a suggestion from your own earlier choices is highlighted, never pre-selected. Add / Skip / Undo,
// "12 of 84 done", and Finish later (the queue is saved on this device).
import { el, clear } from '../utils/dom.js';
import { formatCents } from '../utils/money.js';
import { formatDay } from '../utils/dates.js';
import { showToast } from '../ui/toast.js';
import { getStore } from '../appStore.js';
import { merchantKey } from '../services/statementImport/clean.js';

const signed = (row) => formatCents(row.type === 'income' ? row.amountCents : -row.amountCents, { sign: true });

function categoryChoices(categories, suggestedId, onPick) {
  // The suggestion goes first and is marked, but nothing is selected until you choose.
  const sorted = [...categories].sort((a, b) => (b.id === suggestedId) - (a.id === suggestedId));
  const group = el('fieldset', { class: 'choices category-grid', id: 'review-categories' },
    el('legend', {}, 'Category'),
    sorted.map((c) => el('label', { class: `choice${c.id === suggestedId ? ' choice-suggested' : ''}` },
      el('input', { type: 'radio', name: 'review-category', value: c.id, id: `review-cat-${c.id}` }),
      el('span', {}, el('span', { 'aria-hidden': 'true' }, c.icon), c.name, c.id === suggestedId ? el('span', { class: 'pill pill-good suggest-pill' }, 'Suggested') : null),
    )),
  );
  group.addEventListener('change', (event) => onPick(event.target.value));
  return group;
}

function rowCard(store, row, undos, refresh) {
  const state = store.getState();
  const categories = state.categories.filter((c) => c.type === row.type && !c.archived);
  const suggested = categories.some((c) => c.id === row.suggestedCategoryId) ? row.suggestedCategoryId : null;
  const twin = row.possibleDuplicateOf ? state.transactions.find((t) => t.id === row.possibleDuplicateOf) : null;
  let chosen = null;
  const add = el('button', { class: 'btn btn-primary', type: 'button', id: 'review-add', disabled: true }, 'Add');
  const skip = el('button', { class: 'btn btn-secondary', type: 'button', id: 'review-skip' }, 'Skip');
  let busy = false;
  const act = (fn) => async () => {
    if (busy) return;
    busy = true;
    add.disabled = skip.disabled = true;
    try { await fn(); } finally { busy = false; }
  };

  add.addEventListener('click', act(async () => {
    const result = await store.addPending(row.id, chosen);
    if (!result.ok) { add.disabled = skip.disabled = false; return showToast({ message: result.errors.form }); }
    undos.push(result.undo);
    const category = categories.find((c) => c.id === chosen);
    const rule = state.merchantRules.find((r) => r.pattern === merchantKey(row.merchant));
    // Offer to remember it, unless that's already what we'd suggest.
    const offer = row.merchant && rule?.categoryId !== chosen;
    showToast({
      message: `Added to ${category.name}`,
      action: offer ? { label: `Always suggest for ${row.merchant}`, run: async () => { const r = await store.learnRule(row.merchant, chosen); if (!r.ok) throw Object.assign(new Error(r.errors.form), { userMessage: r.errors.form }); return 'Got it'; } } : undefined,
    });
    refresh();
  }));
  skip.addEventListener('click', act(async () => {
    const result = await store.skipPending(row.id);
    if (!result.ok) { add.disabled = skip.disabled = false; return showToast({ message: result.errors.form }); }
    undos.push(result.undo);
    refresh();
  }));

  return el('article', { class: 'card review-row', id: 'review-row' },
    el('p', { class: 'stat-label' }, formatDay(row.date)),
    el('h2', { class: 'review-merchant', id: 'review-merchant' }, row.merchant ?? row.description),
    el('p', { class: `money money-hero ${row.type === 'income' ? 'money-in' : 'money-out'}`, id: 'review-amount' }, signed(row)),
    el('p', { class: 'field-hint', id: 'review-description' }, `On your statement: ${row.description}`),
    twin ? el('p', { class: 'warning-card', id: 'review-duplicate' }, `This might already be in your entries: ${formatCents(twin.amountCents)} on ${formatDay(twin.date)}${twin.note ? ` (${twin.note})` : ''}. If so, skip it.`) : null,
    categoryChoices(categories, suggested, (id) => { chosen = id; add.disabled = false; }),
    el('div', { class: 'button-row' }, add, skip),
  );
}

export function reviewView() {
  const body = el('div', { class: 'section' }, el('p', { class: 'lead' }, 'Loading…'));
  const undos = []; // this visit's actions, newest last
  getStore().then((store) => {
    let shown = null; // the row on screen; redraw only when it changes, so a choice isn't lost
    const render = (force = false) => {
      const state = store.getState();
      const record = state.imports.find((i) => i.status === 'reviewing') ?? [...state.imports].reverse().find((i) => i.status === 'done');
      const rows = record ? state.pending.filter((p) => p.importId === record.id) : [];
      const next = rows.find((p) => p.decision === 'pending') ?? null;
      const key = `${record?.id}|${next?.id}|${undos.length}`;
      if (!force && key === shown) return;
      shown = key;
      clear(body);
      const undo = el('button', { class: 'btn btn-quiet', type: 'button', id: 'review-undo', disabled: !undos.length }, 'Undo last');
      undo.addEventListener('click', async () => {
        const last = undos.pop();
        if (!last) return;
        try { await last(); } catch (error) { showToast({ message: error.userMessage ?? 'That didn’t work. Please try again.' }); }
        render(true);
      });
      if (!record) {
        body.append(el('p', { class: 'lead' }, 'Nothing to review.'), el('a', { class: 'btn btn-primary', href: '#/import' }, 'Import a statement'));
        return;
      }
      const done = rows.filter((p) => p.decision !== 'pending').length;
      const fill = el('span', { class: 'meter-fill meter-ok' });
      fill.style.width = `${Math.round((done / rows.length) * 100)}%`;
      body.append(el('div', { class: 'meter', id: 'review-progress' },
        el('div', { class: 'meter-head' }, el('span', { id: 'review-count' }, `${done} of ${rows.length} done`), el('span', { class: 'meter-guide' }, record.fileName)),
        el('span', { class: 'meter-track', 'aria-hidden': 'true' }, fill)));
      if (!next) {
        const added = rows.filter((p) => p.decision === 'added').length;
        body.append(
          el('div', { class: 'card', id: 'review-done' },
            el('h2', { class: 'section-title' }, '🎉 All done'),
            el('p', {}, `Added ${added} ${added === 1 ? 'entry' : 'entries'}, skipped ${rows.length - added}.`),
            el('div', { class: 'button-row' }, el('a', { class: 'btn btn-primary', href: '#/history' }, 'See them in History'), el('a', { class: 'btn btn-secondary', href: '#/home' }, 'Home'))),
          undo,
        );
        return;
      }
      body.append(
        rowCard(store, next, undos, () => render(true)),
        el('div', { class: 'button-row' }, undo, el('a', { class: 'btn btn-quiet', href: '#/home', id: 'review-later' }, 'Finish later')),
        el('p', { class: 'field-hint' }, 'Your progress is saved on this device. Come back any time from More → Import a statement.'),
      );
    };
    render();
    const stop = store.subscribe(() => { if (!body.isConnected) return stop(); render(); });
  }, () => { clear(body); body.append(el('p', { class: 'field-error', role: 'alert' }, 'This browser can’t save data on this device.')); });
  return el('div', { class: 'screen' }, el('a', { class: 'btn btn-quiet back-link', href: '#/import' }, '‹ Import'), el('h1', { tabindex: '-1' }, 'Review your statement'), body);
}
