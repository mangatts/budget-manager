// The app's single store, opened once on the real IndexedDB database.
import { openIndexedDb } from './db/indexeddb.js';
import { createRepository } from './db/repository.js';
import { createStore } from './store.js';

let storePromise;

export function getStore() {
  storePromise ??= (async () => {
    const store = createStore({ repo: createRepository(await openIndexedDb()) });
    await store.init();
    return store;
  })();
  return storePromise;
}
