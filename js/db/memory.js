// In-memory adapter with the same interface as indexeddb.js. Used by unit tests (Node has no IndexedDB).
// Values are copied in and out, like IndexedDB, so callers can't mutate stored records by accident.

const KEY_PATHS = { transactions: 'id', categories: 'id', meta: 'key' };

export function createMemoryAdapter() {
  const stores = Object.fromEntries(Object.keys(KEY_PATHS).map((name) => [name, new Map()]));
  const storeFor = (name) => {
    if (!stores[name]) throw new Error(`Unknown store: ${name}`);
    return stores[name];
  };
  return {
    async getAll(store) { return [...storeFor(store).values()].map((v) => structuredClone(v)); },
    async get(store, key) { const v = storeFor(store).get(key); return v === undefined ? undefined : structuredClone(v); },
    async putMany(store, values) {
      const target = storeFor(store);
      for (const value of values) target.set(value[KEY_PATHS[store]], structuredClone(value));
      return values;
    },
    async put(store, value) { await this.putMany(store, [value]); return value; },
    async delete(store, key) { storeFor(store).delete(key); },
    close() {},
  };
}
