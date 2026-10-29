// Passphrase encryption for backup files (SECURITY.md §2.4), using the browser's Web Crypto:
// AES-256-GCM with a key from PBKDF2-HMAC-SHA-256 (600,000 iterations), random salt and IV.
// The file header is bound to the ciphertext as AES-GCM "additional data", so changing any
// setting in the file (e.g. lowering the iteration count) makes it fail to open.

export const FORMAT = 'bm-backup';
export const VERSION = 1;
export const ITERATIONS = 600_000;
const MAX_ITERATIONS = 10_000_000; // stops a crafted file from freezing the app
const SALT_BYTES = 16;
const IV_BYTES = 12;

export class DecryptError extends Error {}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text, expectedLength) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) throw new DecryptError('This isn’t a valid backup file.');
  const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
  if (expectedLength !== undefined && bytes.length !== expectedLength) throw new DecryptError('This isn’t a valid backup file.');
  return bytes;
}

// The header, rebuilt in a fixed key order so the "additional data" is identical when opening.
const headerOf = ({ iterations, salt, iv }) => ({
  format: FORMAT,
  v: VERSION,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt },
  cipher: { name: 'AES-GCM', iv },
});

async function deriveKey(passphrase, salt, iterations, usage) {
  // NFC so the same passphrase typed on different devices (é vs e + ´) gives the same key.
  const material = await crypto.subtle.importKey('raw', encoder.encode(String(passphrase).normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

export async function encryptJson(value, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const header = headerOf({ iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv) });
  const key = await deriveKey(passphrase, salt, ITERATIONS, 'encrypt');
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify(header)) },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { ...header, ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

// Throws DecryptError with a plain-language message for anything wrong.
export async function decryptJson(file, passphrase) {
  if (!file || typeof file !== 'object' || file.format !== FORMAT) throw new DecryptError('This isn’t a Budget Manager backup file.');
  if (file.v !== VERSION) throw new DecryptError('This backup was made by a newer version of the app. Update the app, then try again.');
  const { kdf, cipher } = file;
  const iterations = kdf?.iterations;
  if (kdf?.name !== 'PBKDF2' || kdf?.hash !== 'SHA-256' || cipher?.name !== 'AES-GCM'
    || !Number.isSafeInteger(iterations) || iterations < ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new DecryptError('This isn’t a valid backup file.');
  }
  const salt = fromBase64(kdf.salt, SALT_BYTES);
  const iv = fromBase64(cipher.iv, IV_BYTES);
  const ciphertext = fromBase64(file.ciphertext);
  const header = headerOf({ iterations, salt: kdf.salt, iv: cipher.iv });

  let plaintext;
  try {
    const key = await deriveKey(passphrase, salt, iterations, 'decrypt');
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(JSON.stringify(header)) }, key, ciphertext);
  } catch {
    throw new DecryptError('That passphrase doesn’t match this backup, or the file has been changed.');
  }
  try {
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new DecryptError('This backup is damaged and can’t be opened.');
  }
}
