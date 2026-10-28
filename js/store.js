// App state and the only way to change it. Every change is validated, saved to the repository,
// then announced to subscribers. Changes return an undo() so the UI can offer "Undo" instead of
// "Are you sure?" dialogs.

import { validateTransaction } from './services/validate.js';
import { seedCategoriesOnce } from './services/categories.js';
import { newId as defaultNewId } from './utils/id.js';
import { todayLocal } from './utils/dates.js';

const SAVE_FAILED = { form: 'Couldn’t save on this device. Check that the browser isn’t in private mode and has free space, then try again.' };

// Newest day first; within a day, most recently added first.
const byNewest = (a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);

export function createStore({ repo, now = Date.now, newId = defaultNewId, today = todayLocal }) {
  let state = { ready: false, categories: [], transactions: [] };
  const listeners = new Set();

  const set = (changes) => {
    state = { ...state, ...changes };
    for (const fn of listeners) fn(state);
  };
  const withTransaction = (record) => [...state.transactions.filter((t) => t.id !== record.id), record].sort(byNewest);
  const withoutTransaction = (id) => state.transactions.filter((t) => t.id !== id);

  async function restore(record) {
    await repo.put('transactions', record);
    set({ transactions: withTransaction(record) });
  }

  async function remove(id) {
    await repo.delete('transactions', id);
    set({ transactions: withoutTransaction(id) });
  }

  return {
    getState: () => state,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async init() {
      await seedCategoriesOnce(repo);
      const [categories, transactions] = await Promise.all([repo.getAll('categories'), repo.getAll('transactions')]);
      set({ ready: true, categories: categories.sort((a, b) => a.order - b.order), transactions: transactions.sort(byNewest) });
    },

    async addTransaction(input) {
      const result = validateTransaction(input, { categories: state.categories, today: today() });
      if (!result.ok) return result;
      const time = now();
      const record = { id: newId(), ...result.value, source: 'manual', importId: null, fingerprint: null, createdAt: time, updatedAt: time };
      try {
        await restore(record);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      return { ok: true, record, undo: () => remove(record.id) };
    },

    async updateTransaction(id, input) {
      const before = state.transactions.find((t) => t.id === id);
      if (!before) return { ok: false, errors: { form: 'This entry no longer exists.' } };
      const result = validateTransaction(input, { categories: state.categories, today: today(), keepCategoryId: before.categoryId });
      if (!result.ok) return result;
      const record = { ...before, ...result.value, updatedAt: now() };
      try {
        await restore(record);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      return { ok: true, record, undo: () => restore(before) };
    },

    async deleteTransaction(id) {
      const before = state.transactions.find((t) => t.id === id);
      if (!before) return { ok: false, errors: { form: 'This entry no longer exists.' } };
      try {
        await remove(id);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      return { ok: true, undo: () => restore(before) };
    },
  };
}
