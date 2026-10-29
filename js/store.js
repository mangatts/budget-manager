// App state and the only way to change it. Every change is validated, saved to the repository,
// then announced to subscribers. Changes return an undo() so the UI can offer "Undo" instead of
// "Are you sure?" dialogs.

import { validateTransaction, validateCategory, validateProfile, validateBill, validateChallenge } from './services/validate.js';
import { seedCategoriesOnce } from './services/categories.js';
import { newId as defaultNewId } from './utils/id.js';
import { todayLocal } from './utils/dates.js';

const SAVE_FAILED = { form: 'Couldn’t save on this device. Check that the browser isn’t in private mode and has free space, then try again.' };

// Newest day first; within a day, most recently added first.
const byNewest = (a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);

// Stored rows → app state (sorted lists, meta as a key → value object).
const shape = ({ categories, transactions, meta, bills = [], challenges = [] }) => ({
  categories: [...categories].sort((a, b) => a.order - b.order),
  transactions: [...transactions].sort(byNewest),
  meta: Object.fromEntries(meta.map((m) => [m.key, m.value])),
  bills: [...bills].sort(byDueDay),
  challenges: [...challenges].sort((a, b) => b.createdAt - a.createdAt),
});

const byDueDay = (a, b) => a.dayOfMonth - b.dayOfMonth || a.name.localeCompare(b.name);

export function createStore({ repo, now = Date.now, newId = defaultNewId, today = todayLocal }) {
  let state = { ready: false, categories: [], transactions: [], meta: {}, bills: [], challenges: [] };
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
  const billsUsing = (categoryId) => state.bills.filter((b) => b.categoryId === categoryId).length;
  // A category is "in use" if entries OR bills point at it; it then can't be deleted or switch money in/out.
  const inUse = (categoryId) => usedBy(categoryId) + billsUsing(categoryId) + state.challenges.filter((c) => c.categoryId === categoryId).length > 0;

  // Undo that can't safely happen (or fails) throws with a message for the person; the toast shows it
  // and keeps its button so they can try again. It never claims "Undone" when nothing changed.
  const refuse = (message) => Object.assign(new Error(message), { userMessage: message });
  const orThrow = (result) => { if (!result.ok) throw refuse(result.errors.form ?? 'That didn\u2019t work. Please try again.'); };

  async function saveCategory(record, before) {
    try {
      await repo.put('categories', record);
    } catch {
      return { ok: false, errors: SAVE_FAILED };
    }
    const categories = [...state.categories.filter((c) => c.id !== record.id), record].sort((a, b) => a.order - b.order);
    set({ categories });
    const undo = async () => {
      // Entries added since then must keep a valid category of the right type.
      if (inUse(record.id) && (!before || before.type !== record.type)) {
        throw refuse(`Entries or bills now use ${record.name}, so this can\u2019t be undone. You can hide or edit it instead.`);
      }
      if (before) return orThrow(await saveCategory(before, null));
      try {
        await repo.delete('categories', record.id);
      } catch {
        throw refuse(SAVE_FAILED.form);
      }
      set({ categories: state.categories.filter((c) => c.id !== record.id) });
    };
    return { ok: true, record, undo };
  }

  async function saveBill(record, before) {
    try {
      await repo.put('bills', record);
    } catch {
      return { ok: false, errors: SAVE_FAILED };
    }
    set({ bills: [...state.bills.filter((b) => b.id !== record.id), record].sort(byDueDay) });
    const undo = async () => {
      if (before) return orThrow(await saveBill(before, null));
      try {
        await repo.delete('bills', record.id);
      } catch {
        throw refuse(SAVE_FAILED.form);
      }
      set({ bills: state.bills.filter((b) => b.id !== record.id) });
    };
    return { ok: true, record, undo };
  }

  async function saveChallenge(record, before) {
    try {
      await repo.put('challenges', record);
    } catch {
      return { ok: false, errors: SAVE_FAILED };
    }
    set({ challenges: [record, ...state.challenges.filter((c) => c.id !== record.id)].sort((a, b) => b.createdAt - a.createdAt) });
    const undo = async () => {
      if (before) return orThrow(await saveChallenge(before, null));
      try { await repo.delete('challenges', record.id); } catch { throw refuse(SAVE_FAILED.form); }
      set({ challenges: state.challenges.filter((c) => c.id !== record.id) });
    };
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
      const [categories, transactions, meta, bills, challenges] = await Promise.all(['categories', 'transactions', 'meta', 'bills', 'challenges'].map((name) => repo.getAll(name)));
      set({ ready: true, ...shape({ categories, transactions, meta, bills, challenges }) });
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
        bills: state.bills.map((b) => ({ ...b })),
        challenges: state.challenges.map((c) => ({ ...c })),
      };
    },

    async setMeta(key, value) {
      await repo.put('meta', { key, value });
      set({ meta: { ...state.meta, [key]: value } });
    },

    // Take-home pay and savings %, saved together. Returns undo.
    async setProfile(input) {
      const result = validateProfile(input);
      if (!result.ok) return result;
      const before = { monthlyTakeHomeCents: state.meta.monthlyTakeHomeCents ?? null, savingsPercent: state.meta.savingsPercent };
      // undefined = "wasn't set before", so undo removes it rather than leaving the new value.
      const write = async (values) => {
        const entries = Object.entries(values);
        const rows = entries.filter(([, v]) => v !== undefined).map(([key, value]) => ({ key, value }));
        const removed = entries.filter(([, v]) => v === undefined).map(([key]) => key);
        if (rows.length) await repo.putMany('meta', rows);
        for (const key of removed) await repo.delete('meta', key);
        const meta = { ...state.meta, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
        for (const key of removed) delete meta[key];
        set({ meta });
      };
      try {
        await write(result.value);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      return { ok: true, value: result.value, undo: () => write(before) };
    },

    // Replaces everything (restore). Data must already be validated (services/backup.js).
    async replaceAll(data) {
      const before = this.snapshot();
      data = { bills: [], challenges: [], ...data }; // older backups have neither
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
      const type = inUse(id) ? before.type : input?.type ?? before.type;
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
      if (inUse(id)) return { ok: false, errors: { form: 'Entries or bills use this category, so it can\u2019t be deleted. You can hide it instead.' } };
      try {
        await repo.delete('categories', id);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      set({ categories: state.categories.filter((c) => c.id !== id) });
      return { ok: true, undo: async () => orThrow(await saveCategory(before, null)) };
    },

    usedBy: (id) => usedBy(id),
    billsUsing: (id) => billsUsing(id),

    // ── Recurring bills ── (each returns undo)

    async addBill(input) {
      const result = validateBill(input, { categories: state.categories });
      if (!result.ok) return result;
      const time = now();
      return saveBill({ id: newId(), ...result.value, createdAt: time, updatedAt: time }, null);
    },

    async updateBill(id, input) {
      const before = state.bills.find((b) => b.id === id);
      if (!before) return { ok: false, errors: { form: 'This bill no longer exists.' } };
      const result = validateBill(input, { categories: state.categories, keepCategoryId: before.categoryId });
      if (!result.ok) return result;
      return saveBill({ ...before, ...result.value, updatedAt: now() }, before);
    },

    // ── Cut Plan challenges ── (each returns undo)

    async addChallenge(input) {
      const result = validateChallenge(input, { categories: state.categories });
      if (!result.ok) return result;
      if (state.challenges.some((c) => c.month === result.value.month && c.categoryId === result.value.categoryId)) {
        return { ok: false, errors: { form: 'There\u2019s already a challenge for this category this month.' } };
      }
      const record = { id: newId(), ...result.value, status: 'active', createdAt: now() };
      return saveChallenge(record, null);
    },

    // status: 'active' | 'skipped' | 'stopped'
    async setChallengeStatus(id, status) {
      const before = state.challenges.find((c) => c.id === id);
      if (!before || !['active', 'skipped', 'stopped'].includes(status)) return { ok: false, errors: { form: 'This challenge no longer exists.' } };
      return saveChallenge({ ...before, status }, before);
    },

    async deleteBill(id) {
      const before = state.bills.find((b) => b.id === id);
      if (!before) return { ok: false, errors: { form: 'This bill no longer exists.' } };
      try {
        await repo.delete('bills', id);
      } catch {
        return { ok: false, errors: SAVE_FAILED };
      }
      set({ bills: state.bills.filter((b) => b.id !== id) });
      return { ok: true, undo: async () => orThrow(await saveBill(before, null)) };
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
