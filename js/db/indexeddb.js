// IndexedDB adapter: the app's on-device database (ARCHITECTURE.md §2).
// The schema only ever moves forward through MIGRATIONS, so existing data is upgraded, never wiped.

export const DB_NAME = 'budget-manager';

// MIGRATIONS[n] upgrades the database from version n to n + 1.
// Never edit a released migration; append a new one instead.
export const MIGRATIONS = [
  // v1: core stores
  (db) => {
    const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
    transactions.createIndex('date', 'date');
    transactions.createIndex('categoryId', 'categoryId');
    db.createObjectStore('categories', { keyPath: 'id' });
    db.createObjectStore('meta', { keyPath: 'key' });
  },
];

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const committed = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('Database write was cancelled'));
});

function adapter(db) {
  return {
    getAll: (store) => request(db.transaction(store).objectStore(store).getAll()),
    get: (store, key) => request(db.transaction(store).objectStore(store).get(key)),
    async putMany(store, values) {
      const tx = db.transaction(store, 'readwrite');
      const done = committed(tx);
      try {
        for (const value of values) tx.objectStore(store).put(value);
      } catch (error) {
        tx.abort(); // all or nothing: a bad value cancels the earlier writes too
        await done.catch(() => {});
        throw error;
      }
      await done;
      return values;
    },
    async put(store, value) {
      await this.putMany(store, [value]);
      return value;
    },
    // Restore: clears and refills every store in ONE transaction, so it's all or nothing.
    async replaceAll(data) {
      const names = Object.keys(data);
      const tx = db.transaction(names, 'readwrite');
      const done = committed(tx);
      try {
        for (const name of names) {
          const store = tx.objectStore(name);
          store.clear();
          for (const value of data[name]) store.put(value);
        }
      } catch (error) {
        tx.abort();
        await done.catch(() => {});
        throw error;
      }
      await done;
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      await committed(tx);
    },
    close: () => db.close(),
  };
}

export function openIndexedDb({ name = DB_NAME, indexedDB = globalThis.indexedDB } = {}) {
  return new Promise((resolve, reject) => {
    if (!indexedDB) return reject(new Error('This browser can’t save data on this device.'));
    const req = indexedDB.open(name, MIGRATIONS.length);
    req.onupgradeneeded = (event) => {
      for (let version = event.oldVersion; version < MIGRATIONS.length; version++) MIGRATIONS[version](req.result, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of the app opened in another tab: step aside so it can upgrade.
      db.onversionchange = () => db.close();
      resolve(adapter(db));
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Close other Budget Manager tabs to finish updating.'));
  });
}
