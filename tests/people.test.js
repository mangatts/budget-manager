import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPeople, isPerson, dbNameFor, ACTIVE_KEY, MAX_PEOPLE, FIRST_NAME, FIRST_ID } from '../js/people.js';
import { createMemoryAdapter } from '../js/db/memory.js';
import { validatePersonName } from '../js/services/validate.js';
import { DB_NAME } from '../js/db/indexeddb.js';

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map };
}

async function setup({ db = createMemoryAdapter(), storage = memoryStorage(), failDelete = false, listed = [] } = {}) {
  let clock = 1000;
  let ids = 10;
  const deleted = [];
  const people = createPeople({
    db, storage, now: () => clock++, newId: () => uuid(++ids),
    deleteDatabase: async (name) => { if (failDelete) throw new Error('blocked'); deleted.push(name); },
    listDatabases: async () => listed,
  });
  await people.init();
  return { people, db, storage, deleted };
}

test('first run: one person, "Me", using the original database (so existing data stays theirs)', async () => {
  const { people, db } = await setup();
  assert.deepEqual(people.list(), [{ id: FIRST_ID, name: FIRST_NAME, dbName: DB_NAME, createdAt: 1000 }]);
  assert.equal(people.active().id, FIRST_ID);
  assert.equal((await db.getAll('people')).length, 1);
});

test('init again keeps the saved list and skips bad rows', async () => {
  const db = createMemoryAdapter();
  await setup({ db });
  await db.put('people', { id: uuid(50), name: 'Evil', dbName: 'other-app-db', createdAt: 5 });
  await db.put('people', { id: 'not-a-uuid', name: 'X', dbName: DB_NAME, createdAt: 5 });
  const { people } = await setup({ db });
  assert.deepEqual(people.list().map((p) => p.name), ['Me']);
});

test('add Charles and Albin: each gets their own database, newest last', async () => {
  const { people } = await setup();
  const charles = await people.add('  Charles ');
  const albin = await people.add('Albin');
  assert.equal(charles.ok && albin.ok, true);
  assert.deepEqual(people.list().map((p) => [p.name, p.dbName]), [['Me', DB_NAME], ['Charles', dbNameFor(uuid(11))], ['Albin', dbNameFor(uuid(12))]]);
  assert.equal(people.active().name, 'Me', 'adding someone does not switch to them');
});

test('names: required, length-limited, unique ignoring case', async () => {
  const { people } = await setup();
  await people.add('Charles');
  assert.match((await people.add('')).errors.name, /name/);
  assert.match((await people.add('charles')).errors.name, /already has that name/);
  assert.match((await people.add('x'.repeat(41))).errors.name, /up to 40/);
  assert.equal(validatePersonName('Al‮bin').value.name, 'Al bin', 'direction tricks are removed');
});

test('up to 10 people', async () => {
  const { people } = await setup();
  for (let i = 2; i <= MAX_PEOPLE; i++) assert.equal((await people.add(`Person ${i}`)).ok, true);
  assert.match((await people.add('One more')).errors.form, /up to 10/);
});

test('switch: remembered on this device for the next start; unknown ids are refused', async () => {
  const db = createMemoryAdapter();
  const storage = memoryStorage();
  const { people } = await setup({ db, storage });
  const { record } = await people.add('Charles');
  assert.equal(people.switchTo(record.id).ok, true);
  assert.equal(storage.map.get(ACTIVE_KEY), record.id);
  assert.equal(people.active().name, 'Me', 'this tab keeps the data it opened until it reloads');
  assert.equal((await setup({ db, storage })).people.active().name, 'Charles');
  assert.equal(people.switchTo(uuid(99)).ok, false);
});

test('another tab switching person doesn’t change whose data this tab has open', async () => {
  const db = createMemoryAdapter();
  const storage = memoryStorage();
  const { people } = await setup({ db, storage });
  const { record } = await people.add('Charles');
  storage.setItem(ACTIVE_KEY, record.id); // the other tab
  assert.equal(people.active().name, 'Me');
  assert.match((await people.remove(FIRST_ID)).errors.form, /Switch to someone else/);
});

test('two tabs starting at once still end up with one first person', async () => {
  const db = createMemoryAdapter();
  await Promise.all([setup({ db }), setup({ db })]);
  assert.deepEqual((await db.getAll('people')).map((p) => p.id), [FIRST_ID]);
});

test('a remembered person that no longer exists falls back to the first person', async () => {
  const storage = memoryStorage();
  storage.setItem(ACTIVE_KEY, uuid(77));
  const { people } = await setup({ storage });
  assert.equal(people.active().name, 'Me');
});

test('blocked storage: still works as the first person, switching explains why it can’t', async () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const { people } = await setup({ storage });
  const { record } = await people.add('Charles');
  assert.equal(people.active().name, 'Me');
  assert.match(people.switchTo(record.id).errors.form, /private browsing/);
});

test('rename, with undo', async () => {
  const { people, db } = await setup();
  const { record } = await people.add('Charles');
  const result = await people.rename(record.id, 'Charlie');
  assert.equal(people.list()[1].name, 'Charlie');
  assert.equal((await db.get('people', record.id)).name, 'Charlie');
  await result.undo();
  assert.equal(people.list()[1].name, 'Charles');
  assert.equal((await people.rename(record.id, 'me')).ok, false, 'can’t take someone else’s name');
  assert.equal((await people.rename(record.id, 'CHARLES')).ok, true, 'changing your own name’s case is fine');
});

test('remove deletes their database; never the person using it now or the last person', async () => {
  const { people, deleted, db } = await setup();
  const { record } = await people.add('Albin');
  assert.match((await people.remove(FIRST_ID)).errors.form, /Switch to someone else/);
  assert.equal((await people.remove(record.id)).ok, true);
  assert.deepEqual(deleted, [dbNameFor(record.id)]);
  assert.equal(await db.get('people', record.id), undefined);
  assert.match((await people.remove(FIRST_ID)).errors.form, /at least one/);
});

test('undo of add removes the new person again', async () => {
  const { people } = await setup();
  const result = await people.add('Charles');
  await result.undo();
  assert.deepEqual(people.list().map((p) => p.name), ['Me']);
});

test('undo that can’t happen says so instead of “Undone”', async () => {
  const storage = memoryStorage();
  const { people } = await setup({ storage });
  const added = await people.add('Charles');
  const renamed = await people.rename(added.record.id, 'Charlie');
  await people.remove(added.record.id);
  await assert.rejects(renamed.undo(), { userMessage: /no longer on this device/ });
  await assert.rejects(added.undo(), { userMessage: /no longer on this device/ });
});

test('a failed database delete keeps the person listed', async () => {
  const { people } = await setup({ failDelete: true });
  const { record } = await people.add('Albin');
  assert.match((await people.remove(record.id)).errors.form, /Close other Budget Manager tabs/);
  assert.equal(people.list().length, 2);
});

test('removeEveryone deletes every database (even left-behind ones) and the list; next start is a fresh "Me"', async () => {
  const db = createMemoryAdapter();
  const orphan = dbNameFor(uuid(70));
  const { people, deleted } = await setup({ db, listed: [orphan, 'budget-manager-people', 'some-other-app', DB_NAME] });
  await people.add('Charles');
  await db.put('people', { id: uuid(71), name: 'Bad\u0000row', dbName: dbNameFor(uuid(71)), createdAt: 1 });
  await people.removeEveryone();
  assert.deepEqual(deleted.sort(), [DB_NAME, dbNameFor(uuid(11)), orphan].sort(), 'never the people list itself or another app');
  assert.deepEqual(await db.getAll('people'), []);
  const again = await setup({ db });
  assert.deepEqual(again.people.list().map((p) => [p.name, p.dbName]), [['Me', DB_NAME]]);
});

test('isPerson only accepts this app’s own database names', () => {
  const ok = { id: uuid(1), name: 'Me', dbName: DB_NAME, createdAt: 1 };
  assert.equal(isPerson(ok), true);
  assert.equal(isPerson({ ...ok, dbName: dbNameFor(uuid(1)) }), true);
  assert.equal(isPerson({ ...ok, dbName: dbNameFor(uuid(2)) }), false);
  assert.equal(isPerson({ ...ok, dbName: 'budget-manager-people' }), false);
  assert.equal(isPerson({ ...ok, name: '<b>x</b>\u0000' }), false);
});
