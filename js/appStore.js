// The app's single store, opened once on the real IndexedDB database.
import { openIndexedDb } from './db/indexeddb.js';
import { createRepository } from './db/repository.js';
import { createStore } from './store.js';

let storePromise;

// A failed open (e.g. another tab still has the old version) isn't remembered,
// so the next call tries again once the user has fixed the cause.
export function getStore() {
  storePromise ??= (async () => {
    const store = createStore({ repo: createRepository(await openIndexedDb()) });
    await store.init();
    return store;
  })().catch((error) => {
    storePromise = undefined;
    throw error;
  });
  return storePromise;
}
