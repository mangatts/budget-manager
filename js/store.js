// App state and the only way to change it. Every change is validated, saved to the repository,
// then announced to subscribers. Changes return an undo() so the UI can offer "Undo" instead of
// "Are you sure?" dialogs.

import { validateCard, validateIncome, validateExpense, validateCheckin } from './services/validate.js';
import { fromLegacy } from './services/legacy.js';
import { APP_STORES, LEGACY_STORES } from './db/repository.js';
import { newId as defaultNewId } from './utils/id.js';
import { todayLocal } from './utils/dates.js';

const SAVE_FAILED = { form: 'Couldn’t save on this device. Check that the browser isn’t in private mode and has free space, then try again.' };

// Backups accept up to these many (services/backup.js), so the app never makes more.
export const LIMITS = Object.freeze({ cards: 100, incomes: 50, expenses: 500, checkins: 5000 });

const byName = (a, b) => a.name.localeCompare(b.name);
const SORTS = {
  cards: (a, b) => b.aprBps - a.aprBps || byName(a, b), // highest interest first
  incomes: (a, b) => a.createdAt - b.createdAt,
  expenses: (a, b) => (a.dayOfMonth ?? 99) - (b.dayOfMonth ?? 99) || byName(a, b),
  checkins: (a, b) => (a.date < b.date ? 1 : -1), // newest first
};
const KEY = { cards: 'id', incomes: 'id', expenses: 'id', checkins: 'date' };
const LISTS = ['cards', 'checkins', 'incomes', 'expenses'];

// Stored rows → app state (sorted lists, meta as a key → value object).
const shape = ({ cards = [], checkins = [], incomes = [], expenses = [], meta = [] }) => ({
  cards: [...cards].sort(SORTS.cards),
  checkins: [...checkins].sort(SORTS.checkins),
  incomes: [...incomes].sort(SORTS.incomes),
  expenses: [...expenses].sort(SORTS.expenses),
  meta: Object.fromEntries(meta.map((m) => [m.key, m.value])),
});

const VALIDATORS = { cards: validateCard, incomes: validateIncome, expenses: validateExpense };
const GONE = { cards: 'This card no longer exists.', incomes: 'This income no longer exists.', expenses: 'This expense no longer exists.', checkins: 'This check-in no longer exists.' };

export function createStore({ repo, now = Date.now, newId = defaultNewId, today = todayLocal }) {
  let state = { ready: false, ...shape({}) };
  const listeners = new Set();
  const set = (changes) => {
    state = { ...state, ...changes };
    for (const fn of listeners) fn(state);
  };

  // Undo that can't safely happen (or fails) throws with a message for the person; the toast shows it.
  const refuse = (message) => Object.assign(new Error(message), { userMessage: message });

  // Writes `next` (or deletes `previous` when next is null) and keeps state in step.
  async function write(list, next, previous) {
    const key = KEY[list];
    if (next) await repo.put(list, next);
    // A check-in moved to another day: the old day goes away.
    if (previous && (!next || previous[key] !== next[key])) await repo.delete(list, previous[key]);
    const drop = new Set([previous?.[key], next?.[key]]);
    set({ [list]: [...state[list].filter((r) => !drop.has(r[key])), ...(next ? [next] : [])].sort(SORTS[list]) });
  }

  // Saves a change and returns an undo that puts back exactly what was there.
  async function save(list, next, previous) {
    try {
      await write(list, next, previous);
    } catch {
      return { ok: false, errors: SAVE_FAILED };
    }
    const undo = async () => {
      try {
        await write(list, previous, next);
      } catch {
        throw refuse(SAVE_FAILED.form);
      }
    };
    return { ok: true, record: next, undo };
  }

  // One-time move of debts, bills and take-home pay from the earlier version of the app.
  // Written in ONE transaction together with the "done" flag, so it can't half-happen.
  async function carryOver() {
    const [carried, ...lists] = await Promise.all([repo.get('meta', 'carriedOver'), ...LISTS.map((l) => repo.getAll(l))]);
    if (carried) return;
    if (lists.some((l) => l.length)) return repo.put('meta', { key: 'carriedOver', value: 1 });
    const [debts, bills, meta] = await Promise.all([repo.getAll('debts'), repo.getAll('bills'), repo.getAll('meta')]);
    const pay = meta.find((m) => m.key === 'monthlyTakeHomeCents');
    const data = fromLegacy({ debts, bills, monthlyTakeHomeCents: pay?.value ?? null }, { today: today(), now: now(), newId });
    await repo.replaceAll({ ...data, meta: [...meta.filter((m) => m.key !== 'carriedOver'), { key: 'carriedOver', value: 1 }] });
  }

  const add = (list, input) => {
    if (state[list].length >= LIMITS[list]) return { ok: false, errors: { form: `You can have up to ${LIMITS[list]}.` } };
    const result = VALIDATORS[list](input);
    if (!result.ok) return result;
    const time = now();
    return save(list, { id: newId(), ...result.value, createdAt: time, updatedAt: time }, null);
  };
  const update = (list, id, input) => {
    const before = state[list].find((r) => r.id === id);
    if (!before) return { ok: false, errors: { form: GONE[list] } };
    const result = VALIDATORS[list](input);
    if (!result.ok) return result;
    return save(list, { ...before, ...result.value, updatedAt: now() }, before);
  };
  const remove = (list, key) => {
    const before = state[list].find((r) => r[KEY[list]] === key);
    if (!before) return { ok: false, errors: { form: GONE[list] } };
    return save(list, null, before);
  };

  return {
    getState: () => state,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async init() {
      await carryOver();
      const rows = await Promise.all(APP_STORES.map((name) => repo.getAll(name)));
      set({ ready: true, ...shape(Object.fromEntries(APP_STORES.map((name, i) => [name, rows[i]]))) });
    },

    addCard: (input) => add('cards', input),
    updateCard: (id, input) => update('cards', id, input),
    // Past check-ins keep its old balances (history); the plan only uses cards that still exist.
    deleteCard: (id) => remove('cards', id),

    addIncome: (input) => add('incomes', input),
    updateIncome: (id, input) => update('incomes', id, input),
    deleteIncome: (id) => remove('incomes', id),

    addExpense: (input) => add('expenses', input),
    updateExpense: (id, input) => update('expenses', id, input),
    deleteExpense: (id) => remove('expenses', id),

    // Saves the balances for a day. A day that already has a check-in is updated in place
    // (one write, same key), and Undo puts the old balances back.
    async saveCheckin(input) {
      const result = validateCheckin(input, { cards: state.cards, today: today() });
      if (!result.ok) return result;
      const before = state.checkins.find((c) => c.date === result.value.date) ?? null;
      if (!before && state.checkins.length >= LIMITS.checkins) return { ok: false, errors: { form: `You can have up to ${LIMITS.checkins} check-ins.` } };
      return save('checkins', { ...result.value, createdAt: before?.createdAt ?? now() }, before);
    },
    deleteCheckin: (date) => remove('checkins', date),

    async setMeta(key, value) {
      await repo.put('meta', { key, value });
      set({ meta: { ...state.meta, [key]: value } });
    },

    // Everything on this device, in the shape stored (for backups and undoing a restore).
    snapshot() {
      return {
        cards: state.cards.map((c) => ({ ...c })),
        checkins: state.checkins.map((c) => ({ ...c, balances: c.balances.map((b) => ({ ...b })) })),
        incomes: state.incomes.map((i) => ({ ...i })),
        expenses: state.expenses.map((e) => ({ ...e })),
        meta: Object.entries(state.meta).map(([key, value]) => ({ key, value })),
      };
    },

    // Replaces everything (restore). Data must already be validated (services/backup.js).
    async replaceAll(data) {
      const before = this.snapshot();
      const full = { cards: [], checkins: [], incomes: [], expenses: [], meta: [], ...data };
      try {
        await repo.replaceAll(full);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      set(shape(full));
      return {
        ok: true,
        undo: async () => {
          await repo.replaceAll(before);
          set(shape(before));
        },
      };
    },

    // "Delete everything": every store, including what's left from the earlier version.
    async wipe() {
      try {
        await repo.replaceAll(Object.fromEntries([...APP_STORES, ...LEGACY_STORES].map((name) => [name, []])));
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      set(shape({}));
      return { ok: true };
    },
  };
}
