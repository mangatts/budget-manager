// The only data-access interface the app uses (ARCHITECTURE.md §3). The UI never touches IndexedDB.
// Wraps an adapter (indexeddb.js in the app, memory.js in tests) and only allows known stores.

// What the app uses today.
export const APP_STORES = Object.freeze(['cards', 'checkins', 'incomes', 'expenses', 'meta']);
// From the earlier, bigger version of the app. Only read once (to carry debts, bills and pay over)
// and cleared by "Delete everything", so nothing is left behind on the device.
export const LEGACY_STORES = Object.freeze(['transactions', 'categories', 'bills', 'challenges', 'debts', 'goals', 'imports', 'pending', 'merchantRules', 'feedback']);
export const STORES = Object.freeze([...APP_STORES, ...LEGACY_STORES]);

export function createRepository(adapter) {
  const check = (store) => {
    if (!STORES.includes(store)) throw new Error(`Unknown store: ${store}`);
  };
  return {
    getAll: (store) => { check(store); return adapter.getAll(store); },
    get: (store, key) => { check(store); return adapter.get(store, key); },
    put: (store, value) => { check(store); return adapter.put(store, value); },
    putMany: (store, values) => { check(store); return adapter.putMany(store, values); },
    delete: (store, key) => { check(store); return adapter.delete(store, key); },
    replaceAll: (data) => { Object.keys(data).forEach(check); return adapter.replaceAll(data); },
  };
}
