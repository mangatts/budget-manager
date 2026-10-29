// App state and the only way to change it. Every change is validated, saved to the repository,
// then announced to subscribers. Changes return an undo() so the UI can offer "Undo" instead of
// "Are you sure?" dialogs.

import { validateTransaction, validateCategory } from './services/validate.js';
import { seedCategoriesOnce } from './services/categories.js';
import { newId as defaultNewId } from './utils/id.js';
import { todayLocal } from './utils/dates.js';

const SAVE_FAILED = { form: 'Couldn’t save on this device. Check that the browser isn’t in private mode and has free space, then try again.' };

// Newest day first; within a day, most recently added first.
const byNewest = (a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);

// Stored rows → app state (sorted lists, meta as a key → value object).
const shape = ({ categories, transactions, meta }) => ({
  categories: [...categories].sort((a, b) => a.order - b.order),
  transactions: [...transactions].sort(byNewest),
  meta: Object.fromEntries(meta.map((m) => [m.key, m.value])),
});

export function createStore({ repo, now = Date.now, newId = defaultNewId, today = todayLocal }) {
  let state = { ready: false, categories: [], transactions: [], meta: {} };
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

  const usedBy = (categoryId) => state.transactions.filter((t) => t.categoryId === categoryId).length;

  async function saveCategory(record, before) {
    try {
      await repo.put('categories', record);
    } catch {
      return { ok: false, errors: SAVE_FAILED };
    }
    const categories = [...state.categories.filter((c) => c.id !== record.id), record].sort((a, b) => a.order - b.order);
    set({ categories });
    const undo = before
      ? () => saveCategory(before, null)
      : async () => { await repo.delete('categories', record.id); set({ categories: state.categories.filter((c) => c.id !== record.id) }); };
    return { ok: true, record, undo };
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
      const [categories, transactions, meta] = await Promise.all([repo.getAll('categories'), repo.getAll('transactions'), repo.getAll('meta')]);
      set({ ready: true, ...shape({ categories, transactions, meta }) });
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

    // Everything on this device, in the shape stored (for backups and undoing a restore).
    snapshot() {
      return {
        transactions: state.transactions.map((t) => ({ ...t })),
        categories: state.categories.map((c) => ({ ...c })),
        meta: Object.entries(state.meta).map(([key, value]) => ({ key, value })),
      };
    },

    async setMeta(key, value) {
      await repo.put('meta', { key, value });
      set({ meta: { ...state.meta, [key]: value } });
    },

    // Replaces everything (restore). Data must already be validated (services/backup.js).
    async replaceAll(data) {
      const before = this.snapshot();
      try {
        await repo.replaceAll(data);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      set(shape(data));
      return {
        ok: true,
        undo: async () => {
          await repo.replaceAll(before);
          set(shape(before));
        },
      };
    },

    // ── Categories ── (each returns undo)

    async addCategory(input) {
      const result = validateCategory(input, { categories: state.categories });
      if (!result.ok) return result;
      const order = Math.max(0, ...state.categories.map((c) => c.order)) + 1;
      const record = { id: newId(), ...result.value, benchmarkKey: null, archived: false, order };
      return saveCategory(record, null);
    },

    async updateCategory(id, input) {
      const before = state.categories.find((c) => c.id === id);
      if (!before) return { ok: false, errors: { form: 'This category no longer exists.' } };
      // Money in/out can't change once entries use it: their history would stop making sense.
      const type = usedBy(id) ? before.type : input?.type ?? before.type;
      const result = validateCategory({ ...input, type }, { categories: state.categories, editingId: id });
      if (!result.ok) return result;
      return saveCategory({ ...before, ...result.value }, before);
    },

    async setCategoryHidden(id, hidden) {
      const before = state.categories.find((c) => c.id === id);
      if (!before) return { ok: false, errors: { form: 'This category no longer exists.' } };
      return saveCategory({ ...before, archived: Boolean(hidden) }, before);
    },

    // Only for categories no entry uses; used ones can be hidden instead, so history stays intact.
    async deleteCategory(id) {
      const before = state.categories.find((c) => c.id === id);
      if (!before) return { ok: false, errors: { form: 'This category no longer exists.' } };
      if (usedBy(id)) return { ok: false, errors: { form: 'Entries use this category, so it can\u2019t be deleted. You can hide it instead.' } };
      try {
        await repo.delete('categories', id);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      set({ categories: state.categories.filter((c) => c.id !== id) });
      return { ok: true, undo: () => saveCategory(before, null) };
    },

    usedBy: (id) => usedBy(id),

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
