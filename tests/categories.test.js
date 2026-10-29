import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCategory, CATEGORY_ICONS } from '../js/services/validate.js';
import { DEFAULT_CATEGORIES } from '../js/services/categories.js';
import { createStore } from '../js/store.js';
import { createRepository } from '../js/db/repository.js';
import { createMemoryAdapter } from '../js/db/memory.js';

const ctx = { categories: DEFAULT_CATEGORIES };
const pets = { name: ' Pets ', icon: '🐾', type: 'expense', bucket: 'want' };

test('every default category icon can be picked when editing', () => {
  for (const c of DEFAULT_CATEGORIES) assert.ok(CATEGORY_ICONS.includes(c.icon), c.name);
});

test('valid categories are cleaned', () => {
  assert.deepEqual(validateCategory(pets, ctx), { ok: true, value: { name: 'Pets', icon: '🐾', type: 'expense', bucket: 'want' } });
  assert.deepEqual(validateCategory({ name: 'Tips', icon: '🧰', type: 'income', bucket: 'want' }, ctx).value.bucket, null);
});

test('plain-language errors', () => {
  const e = (over) => validateCategory({ ...pets, ...over }, ctx).errors;
  assert.equal(e({ name: '  ' }).name, 'Give it a name');
  assert.equal(e({ name: 'x'.repeat(33) }).name, 'Names can be up to 30 characters. Shorten it by 3.');
  assert.equal(e({ name: 'dining out' }).name, 'You already have a “dining out” category.');
  assert.equal(e({ icon: '<img>' }).icon, 'Pick an icon');
  assert.equal(e({ bucket: 'luxury' }).bucket, 'Choose Need, Want, or Savings');
  assert.equal(e({ type: 'gift' }).type, 'Choose money in or money out');
});

test('same name is fine across money in/out, and a category can keep its own name', () => {
  assert.equal(validateCategory({ name: 'Gifts', icon: '🎁', type: 'income' }, ctx).ok, true);
  assert.equal(validateCategory({ name: 'DINING OUT', icon: '🍽️', type: 'expense', bucket: 'want' }, { ...ctx, editingId: 'c-dining' }).ok, true);
});

async function setup() {
  let ids = 0;
  const repo = createRepository(createMemoryAdapter());
  const store = createStore({ repo, newId: () => `3f6c1a2e-9b7d-4c1e-8a2b-00000000000${++ids}`, today: () => '2026-10-28' });
  await store.init();
  return { store, repo };
}

test('add, rename, hide, show, and undo each one', async () => {
  const { store, repo } = await setup();
  const added = await store.addCategory(pets);
  assert.equal(added.ok, true);
  assert.equal(added.record.order, 21);
  assert.ok(await repo.get('categories', added.record.id));
  const renamed = await store.updateCategory(added.record.id, { ...pets, name: 'Pet care' });
  assert.equal(store.getState().categories.find((c) => c.id === added.record.id).name, 'Pet care');
  await renamed.undo();
  assert.equal(store.getState().categories.find((c) => c.id === added.record.id).name, 'Pets');
  const hidden = await store.setCategoryHidden('c-gifts', true);
  assert.equal((await repo.get('categories', 'c-gifts')).archived, true);
  await hidden.undo();
  assert.equal((await repo.get('categories', 'c-gifts')).archived, false);
  await added.undo();
  assert.equal(await repo.get('categories', added.record.id), undefined);
});

test('a category with entries keeps its money in/out type and can’t be deleted', async () => {
  const { store } = await setup();
  await store.addTransaction({ type: 'expense', amount: '5', categoryId: 'c-gifts', date: '2026-10-28' });
  const changed = await store.updateCategory('c-gifts', { name: 'Gifts', icon: '🎁', type: 'income', bucket: 'want' });
  assert.equal(changed.record.type, 'expense');
  const del = await store.deleteCategory('c-gifts');
  assert.equal(del.ok, false);
  assert.match(del.errors.form, /hide it instead/);
});

test('an unused category can be deleted and the delete undone', async () => {
  const { store, repo } = await setup();
  const del = await store.deleteCategory('c-gifts');
  assert.equal(del.ok, true);
  assert.equal(await repo.get('categories', 'c-gifts'), undefined);
  await del.undo();
  assert.equal((await repo.get('categories', 'c-gifts')).name, 'Gifts');
});
