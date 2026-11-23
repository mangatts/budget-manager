// People sharing this device (you, a partner, a roommate…). Each person has their OWN database,
// so their cards, income, expenses and check-ins never mix. The list of people lives in its own
// small database; which person is "using it now" is a per-device convenience in localStorage.

import { DB_NAME } from './db/indexeddb.js';
import { validatePersonName, cleanNote, MAX_NAME } from './services/validate.js';
import { isUuid, newId as defaultNewId } from './utils/id.js';

export const PEOPLE_DB = 'budget-manager-people';
export const PEOPLE_MIGRATIONS = Object.freeze([(db) => db.createObjectStore('people', { keyPath: 'id' })]);
export const MAX_PEOPLE = 10;
export const ACTIVE_KEY = 'bm:person';
export const FIRST_NAME = 'Me';
export const dbNameFor = (id) => `${DB_NAME}-${id}`;
// The first person always has this id, so two tabs starting at once write the SAME row
// instead of two people sharing the original database.
export const FIRST_ID = '00000000-0000-4000-8000-000000000001';
const OWN_DB = new RegExp(`^${DB_NAME}(-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$`);

const SAVE_FAILED = { form: 'Couldn’t save on this device. Check that the browser isn’t in private mode and has free space, then try again.' };

// Only well-formed rows that point at one of this app's own databases are ever used.
export const isPerson = (p) => !!p && typeof p === 'object' && isUuid(p.id)
  && typeof p.name === 'string' && p.name !== '' && cleanNote(p.name) === p.name && [...p.name].length <= MAX_NAME
  && (p.dbName === DB_NAME || p.dbName === dbNameFor(p.id)) && Number.isSafeInteger(p.createdAt) && p.createdAt > 0;

// db: an adapter (indexeddb.js or memory.js) with a 'people' store.
// deleteDatabase(name): removes one person's database. listDatabases(): names of this site's databases, if the browser can tell.
export function createPeople({ db, storage, deleteDatabase, listDatabases = async () => [], now = Date.now, newId = defaultNewId }) {
  let people = [];
  // Who this tab opened. Read once: another tab switching person must not change whose data this tab shows.
  let activeId = null;
  const listeners = new Set();
  const changed = (next) => {
    people = next.sort((a, b) => a.createdAt - b.createdAt);
    for (const fn of listeners) fn();
  };
  const readActive = () => { try { return storage?.getItem(ACTIVE_KEY) ?? null; } catch { return null; } };
  const refuse = (message) => Object.assign(new Error(message), { userMessage: message });
  const find = (id) => people.find((p) => p.id === id);
  const taken = (exceptId) => people.filter((p) => p.id !== exceptId).map((p) => p.name);

  const api = {
    async init() {
      const rows = (await db.getAll('people')).filter(isPerson);
      if (!rows.length) {
        // Whoever used the app before there were people keeps their data: the first person uses the original database.
        const first = { id: FIRST_ID, name: FIRST_NAME, dbName: DB_NAME, createdAt: now() };
        await db.put('people', first);
        rows.push(first);
      }
      changed(rows);
      activeId = (find(readActive()) ?? people[0]).id;
    },

    list: () => people.map((p) => ({ ...p })),
    // The person whose data this tab has open (null only after removeEveryone).
    active() {
      const person = find(activeId) ?? people[0];
      return person ? { ...person } : null;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async add(input) {
      if (people.length >= MAX_PEOPLE) return { ok: false, errors: { form: `You can have up to ${MAX_PEOPLE} people.` } };
      const result = validatePersonName(input, { taken: taken(null) });
      if (!result.ok) return result;
      const id = newId();
      const person = { id, name: result.value.name, dbName: dbNameFor(id), createdAt: now() };
      try { await db.put('people', person); } catch { return { ok: false, errors: SAVE_FAILED }; }
      changed([...people, person]);
      // Nothing is saved for them yet, so undo just takes them off the list again.
      return {
        ok: true,
        record: { ...person },
        undo: async () => {
          const removed = await api.remove(id);
          if (!removed.ok) throw refuse(removed.errors.form);
        },
      };
    },

    async rename(id, input) {
      const before = find(id);
      if (!before) return { ok: false, errors: { form: 'This person is no longer on this device.' } };
      const result = validatePersonName(input, { taken: taken(id) });
      if (!result.ok) return result;
      const write = async (person) => {
        await db.put('people', person);
        changed([...people.filter((p) => p.id !== id), person]);
      };
      try { await write({ ...before, name: result.value.name }); } catch { return { ok: false, errors: SAVE_FAILED }; }
      const undo = async () => {
        if (!find(id)) throw refuse('This person is no longer on this device.');
        try { await write(before); } catch { throw refuse(SAVE_FAILED.form); }
      };
      return { ok: true, record: { ...before, name: result.value.name }, undo };
    },

    // Permanently deletes that person's database. Not the person using it now, and never the last one.
    async remove(id) {
      const person = find(id);
      if (!person) return { ok: false, errors: { form: 'This person is no longer on this device.' } };
      if (people.length === 1) return { ok: false, errors: { form: 'There has to be at least one person.' } };
      if (person.id === api.active()?.id) return { ok: false, errors: { form: 'Switch to someone else first.' } };
      try {
        await deleteDatabase(person.dbName);
        await db.delete('people', id);
      } catch {
        return { ok: false, errors: { form: `Couldn’t remove ${person.name}. Close other Budget Manager tabs, then try again.` } };
      }
      changed(people.filter((p) => p.id !== id));
      return { ok: true };
    },

    switchTo(id) {
      if (!find(id)) return { ok: false, errors: { form: 'This person is no longer on this device.' } };
      try {
        storage.setItem(ACTIVE_KEY, id);
      } catch {
        return { ok: false, errors: { form: 'This browser can’t remember who’s using the app. Try turning off private browsing.' } };
      }
      return { ok: true };
    },

    // "Delete everything": every person's database (including any left behind by a skipped or
    // half-finished removal), then the whole list. Safe to run again if it stopped partway.
    async removeEveryone() {
      const names = new Set([DB_NAME, ...people.map((p) => p.dbName)]);
      for (const name of await listDatabases().catch(() => [])) if (OWN_DB.test(name)) names.add(name);
      await Promise.all([...names].map((name) => deleteDatabase(name)));
      await db.replaceAll({ people: [] });
      changed([]);
    },
  };
  return api;
}
