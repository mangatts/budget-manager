// The only data-access interface the app uses (ARCHITECTURE.md §3). The UI never touches IndexedDB.
// Wraps an adapter (indexeddb.js in the app, memory.js in tests) and only allows known stores.

export const STORES = Object.freeze(['transactions', 'categories', 'meta', 'bills', 'challenges', 'debts', 'goals']);

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
