// App state and the only way to change it. Every change is validated, saved to the repository,
// then announced to subscribers. Changes return an undo() so the UI can offer "Undo" instead of
// "Are you sure?" dialogs.

import { validateTransaction, validateCategory, validateProfile, validateBill, validateChallenge, validateDebt, validateGoal, STEP_IDS } from './services/validate.js';
import { seedCategoriesOnce } from './services/categories.js';
import { newId as defaultNewId } from './utils/id.js';
import { todayLocal } from './utils/dates.js';

const SAVE_FAILED = { form: 'Couldn’t save on this device. Check that the browser isn’t in private mode and has free space, then try again.' };

// Newest day first; within a day, most recently added first.
const byNewest = (a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1);

// Stored rows → app state (sorted lists, meta as a key → value object).
const shape = ({ categories, transactions, meta, bills = [], challenges = [], debts = [], goals = [] }) => ({
  categories: [...categories].sort((a, b) => a.order - b.order),
  transactions: [...transactions].sort(byNewest),
  meta: Object.fromEntries(meta.map((m) => [m.key, m.value])),
  bills: [...bills].sort(byDueDay),
  challenges: [...challenges].sort((a, b) => b.createdAt - a.createdAt),
  debts: [...debts].sort(byRate),
  goals: [...goals].sort(byCreated),
});

const byDueDay = (a, b) => a.dayOfMonth - b.dayOfMonth || a.name.localeCompare(b.name);
const byRate = (a, b) => b.aprBps - a.aprBps || a.name.localeCompare(b.name); // highest interest first
// Backups accept up to this many (services/backup.js), so the app never makes more.
const MAX_GOALS = 100;
const MAX_DEBTS = 100;
const byCreated = (a, b) => a.createdAt - b.createdAt;
const SORTS = { debts: byRate, goals: byCreated };

export function createStore({ repo, now = Date.now, newId = defaultNewId, today = todayLocal }) {
  let state = { ready: false, categories: [], transactions: [], meta: {}, bills: [], challenges: [], debts: [], goals: [] };
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
  // Only ACTIVE challenges lock a category; skipped/stopped ones are cleared when it's deleted or retyped.
  const activeChallenges = (categoryId) => state.challenges.filter((c) => c.categoryId === categoryId && c.status === 'active').length;
  const inUse = (categoryId) => usedBy(categoryId) + billsUsing(categoryId) + activeChallenges(categoryId) > 0;
  async function clearOldChallenges(categoryId) {
    const old = state.challenges.filter((c) => c.categoryId === categoryId && c.status !== 'active');
    for (const c of old) await repo.delete('challenges', c.id);
    if (old.length) set({ challenges: state.challenges.filter((c) => !old.includes(c)) });
  }

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

  // Generic save-with-undo for simple stores (debts, goals).
  async function saveRecord(storeName, record, before) {
    try { await repo.put(storeName, record); } catch { return { ok: false, errors: SAVE_FAILED }; }
    set({ [storeName]: [...state[storeName].filter((r) => r.id !== record.id), record].sort(SORTS[storeName]) });
    const undo = async () => {
      if (before) return orThrow(await saveRecord(storeName, before, null));
      try { await repo.delete(storeName, record.id); } catch { throw refuse(SAVE_FAILED.form); }
      set({ [storeName]: state[storeName].filter((r) => r.id !== record.id) });
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
      const [categories, transactions, meta, bills, challenges, debts, goals] = await Promise.all(['categories', 'transactions', 'meta', 'bills', 'challenges', 'debts', 'goals'].map((name) => repo.getAll(name)));
      set({ ready: true, ...shape({ categories, transactions, meta, bills, challenges, debts, goals }) });
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
        debts: state.debts.map((d) => ({ ...d })),
        goals: state.goals.map((g) => ({ ...g })),
      };
    },

    async setMeta(key, value) {
      await repo.put('meta', { key, value });
      set({ meta: { ...state.meta, [key]: value } });
    },

    // Next Best Step: skip a step (or bring it back). Returns undo.
    async setStepSkipped(stepId, skipped) {
      if (!STEP_IDS.includes(stepId)) return { ok: false, errors: { form: 'That step doesn’t exist.' } };
      const write = (skip) => {
        const list = Array.isArray(state.meta.skippedSteps) ? state.meta.skippedSteps : [];
        return this.setMeta('skippedSteps', skip ? [...new Set([...list, stepId])] : list.filter((id) => id !== stepId));
      };
      try { await write(skipped); } catch { return { ok: false, errors: SAVE_FAILED }; }
      // Undo reverses only this step, so later skips stay as they are.
      return { ok: true, undo: async () => { try { await write(!skipped); } catch { throw refuse(SAVE_FAILED.form); } } };
    },

    // Take-home pay and savings %, saved together. Returns undo.
    async setProfile(input) {
      const result = validateProfile(input);
      if (!result.ok) return result;
      const before = Object.fromEntries(Object.keys(result.value).map((k) => [k, state.meta[k]]));
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
      data = { bills: [], challenges: [], debts: [], goals: [], ...data }; // older backups lack newer stores
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
      if (result.value.type !== before.type) {
        try { await clearOldChallenges(id); } catch { return { ok: false, errors: SAVE_FAILED }; }
      }
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
      if (inUse(id)) return { ok: false, errors: { form: 'Entries, bills, or an active challenge use this category, so it can\u2019t be deleted. You can hide it instead.' } };
      try {
        await clearOldChallenges(id);
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

    // ── Savings goals ── (each returns undo)

    async addGoal(input) {
      if (state.goals.length >= MAX_GOALS) return { ok: false, errors: { form: `You can have up to ${MAX_GOALS} goals.` } };
      const result = validateGoal(input);
      if (!result.ok) return result;
      const time = now();
      return saveRecord('goals', { id: newId(), ...result.value, createdAt: time, updatedAt: time }, null);
    },

    async updateGoal(id, input) {
      const before = state.goals.find((g) => g.id === id);
      if (!before) return { ok: false, errors: { form: 'This goal no longer exists.' } };
      const result = validateGoal(input);
      if (!result.ok) return result;
      return saveRecord('goals', { ...before, ...result.value, updatedAt: now() }, before);
    },

    async deleteGoal(id) {
      const before = state.goals.find((g) => g.id === id);
      if (!before) return { ok: false, errors: { form: 'This goal no longer exists.' } };
      try { await repo.delete('goals', id); } catch { return { ok: false, errors: SAVE_FAILED }; }
      set({ goals: state.goals.filter((g) => g.id !== id) });
      return { ok: true, undo: async () => orThrow(await saveRecord('goals', before, null)) };
    },

    // ── Debts ── (each returns undo)

    async addDebt(input) {
      if (state.debts.length >= MAX_DEBTS) return { ok: false, errors: { form: `You can have up to ${MAX_DEBTS} debts.` } };
      const result = validateDebt(input);
      if (!result.ok) return result;
      const time = now();
      return saveRecord('debts', { id: newId(), ...result.value, createdAt: time, updatedAt: time }, null);
    },

    async updateDebt(id, input) {
      const before = state.debts.find((d) => d.id === id);
      if (!before) return { ok: false, errors: { form: 'This debt no longer exists.' } };
      const result = validateDebt(input);
      if (!result.ok) return result;
      return saveRecord('debts', { ...before, ...result.value, updatedAt: now() }, before);
    },

    async deleteDebt(id) {
      const before = state.debts.find((d) => d.id === id);
      if (!before) return { ok: false, errors: { form: 'This debt no longer exists.' } };
      try { await repo.delete('debts', id); } catch { return { ok: false, errors: SAVE_FAILED }; }
      set({ debts: state.debts.filter((d) => d.id !== id) });
      return { ok: true, undo: async () => orThrow(await saveRecord('debts', before, null)) };
    },

    // ── Cut Plan challenges ── (each returns undo)

    async addChallenge(input) {
      const result = validateChallenge(input, { categories: state.categories });
      if (!result.ok) return result;
      if (state.challenges.some((c) => c.month === result.value.month && c.categoryId === result.value.categoryId)) {
        return { ok: false, errors: { form: 'There\u2019s already a challenge for this category this month.' } };
      }
      // "Not this month" saves straight to skipped (one write, so it can't half-happen).
      const status = input?.status === 'skipped' ? 'skipped' : 'active';
      const record = { id: newId(), ...result.value, status, createdAt: now() };
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
