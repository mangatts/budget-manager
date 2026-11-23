// The app's people list and the store for whoever is using it now, each opened once.
import { openIndexedDb, deleteIndexedDb, listIndexedDbs } from './db/indexeddb.js';
import { createRepository } from './db/repository.js';
import { createStore } from './store.js';
import { createPeople, PEOPLE_DB, PEOPLE_MIGRATIONS } from './people.js';

let peoplePromise;
let storePromise;

// Reading localStorage itself can throw when site data is blocked.
function localStorageOrNull() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

// A failed open (e.g. another tab still has the old version) isn't remembered,
// so the next call tries again once the user has fixed the cause.
const retryable = (promise, reset) => promise.catch((error) => { reset(); throw error; });

export function getPeople() {
  peoplePromise ??= retryable((async () => {
    const people = createPeople({
      db: await openIndexedDb({ name: PEOPLE_DB, migrations: PEOPLE_MIGRATIONS }),
      storage: localStorageOrNull(),
      deleteDatabase: (name) => deleteIndexedDb(name),
      listDatabases: () => listIndexedDbs(),
    });
    await people.init();
    return people;
  })(), () => { peoplePromise = undefined; });
  return peoplePromise;
}

export function getStore() {
  storePromise ??= retryable((async () => {
    const person = (await getPeople()).active();
    const store = createStore({ repo: createRepository(await openIndexedDb({ name: person.dbName })) });
    await store.init();
    return store;
  })(), () => { storePromise = undefined; });
  return storePromise;
}
