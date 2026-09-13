// Criptografa content/vantagens.inner.html com a senha informada.
// Uso: node build/encrypt.mjs "<senha>" content/vantagens.inner.html vantagens.enc.json
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const [password, inFile, outFile] = process.argv.slice(2);
if (!password || !inFile || !outFile) {
  console.error('Uso: node build/encrypt.mjs "<senha>" <entrada.html> <saida.json>');
  process.exit(1);
}

const ITERATIONS = 310000;
const plaintext = readFileSync(inFile);
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const keyMaterial = await crypto.subtle.importKey(
  'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
);
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  keyMaterial,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt']
);
const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

const b64 = (b) => Buffer.from(b).toString('base64');
writeFileSync(outFile, JSON.stringify({
  v: 1,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
  cipher: { name: 'AES-GCM', iv: b64(iv) },
  data: b64(ciphertext)
}, null, 2) + '\n');

console.log(`${outFile}: ${plaintext.length} bytes cifrados.`);
