import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptJson, decryptJson, DecryptError, ITERATIONS } from '../js/services/crypto.js';

const PASS = 'blue river coffee lamp';
const value = { hello: 'world', cents: [475, 185000], note: 'Café 🍕' };

const rejects = (promise, pattern) => assert.rejects(promise, (e) => e instanceof DecryptError && pattern.test(e.message));

test('round trip: what goes in comes out', async () => {
  const file = await encryptJson(value, PASS);
  assert.deepEqual(await decryptJson(file, PASS), value);
});

test('file uses AES-256-GCM with PBKDF2-SHA-256 at 600,000 iterations and hides the content', async () => {
  const file = await encryptJson(value, PASS);
  assert.equal(file.format, 'bm-backup');
  assert.deepEqual({ ...file.kdf, salt: typeof file.kdf.salt }, { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: 'string' });
  assert.equal(ITERATIONS, 600000);
  assert.equal(file.cipher.name, 'AES-GCM');
  assert.equal(Buffer.from(file.kdf.salt, 'base64').length, 16);
  assert.equal(Buffer.from(file.cipher.iv, 'base64').length, 12);
  assert.ok(!JSON.stringify(file).includes('world') && !JSON.stringify(file).includes('185000'));
});

test('every backup gets a fresh salt and IV', async () => {
  const a = await encryptJson(value, PASS);
  const b = await encryptJson(value, PASS);
  assert.notEqual(a.kdf.salt, b.kdf.salt);
  assert.notEqual(a.cipher.iv, b.cipher.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('wrong passphrase is rejected in plain words', async () => {
  const file = await encryptJson(value, PASS);
  await rejects(decryptJson(file, 'blue river coffee lamb'), /passphrase doesn’t match/);
});

test('same passphrase typed differently (accent composed vs combined) still opens it', async () => {
  const file = await encryptJson(value, 'café latte morning');
  assert.deepEqual(await decryptJson(file, 'café latte morning'), value);
});

test('tampering with any part of the file is detected', async () => {
  const file = await encryptJson(value, PASS);
  const flip = (b64) => { const buf = Buffer.from(b64, 'base64'); buf[buf.length - 1] ^= 1; return buf.toString('base64'); };
  await rejects(decryptJson({ ...file, ciphertext: flip(file.ciphertext) }, PASS), /changed/);
  await rejects(decryptJson({ ...file, cipher: { ...file.cipher, iv: flip(file.cipher.iv) } }, PASS), /changed/);
  await rejects(decryptJson({ ...file, kdf: { ...file.kdf, salt: flip(file.kdf.salt) } }, PASS), /changed/);
  // Raising the iteration count still derives a key, but the header no longer matches: rejected.
  await rejects(decryptJson({ ...file, kdf: { ...file.kdf, iterations: ITERATIONS + 1 } }, PASS), /changed/);
});

test('weakened or absurd settings are refused before any work is done', async () => {
  const file = await encryptJson(value, PASS);
  await rejects(decryptJson({ ...file, kdf: { ...file.kdf, iterations: 1000 } }, PASS), /valid backup/);
  await rejects(decryptJson({ ...file, kdf: { ...file.kdf, iterations: 1e12 } }, PASS), /valid backup/);
  await rejects(decryptJson({ ...file, kdf: { ...file.kdf, hash: 'SHA-1' } }, PASS), /valid backup/);
  await rejects(decryptJson({ ...file, cipher: { ...file.cipher, name: 'AES-CBC' } }, PASS), /valid backup/);
});

test('not a backup, other versions, and malformed fields', async () => {
  const file = await encryptJson(value, PASS);
  for (const bad of [null, 'x', {}, { ...file, format: 'other' }]) await rejects(decryptJson(bad, PASS), /Budget Manager backup/);
  await rejects(decryptJson({ ...file, v: 2 }, PASS), /newer version/);
  await rejects(decryptJson({ ...file, ciphertext: 'not base64!' }, PASS), /valid backup/);
  await rejects(decryptJson({ ...file, cipher: { ...file.cipher, iv: 'AAAA' } }, PASS), /valid backup/);
  await rejects(decryptJson({ ...file, kdf: { ...file.kdf, salt: undefined } }, PASS), /valid backup/);
});
