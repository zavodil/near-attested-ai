// Seal a payment key for a hosted build.
//
//   node scripts/seal-key.mjs < payment-key.txt > sealed.json
//
// Reads the key from stdin, never from argv (which `ps` shows to every
// process). Writes {"sealed": …, "decrypt_key": …} as base64url:
//   - `sealed` goes into the build as VITE_PAYMENT_KEY_SEALED (a GitHub secret);
//   - `decrypt_key` goes only into the link: https://…/#decrypt_key=<decrypt_key>
import { webcrypto as crypto } from 'node:crypto';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const paymentKey = Buffer.concat(chunks).toString('utf8').trim();
if (paymentKey.split(':').length < 3) {
  console.error('stdin is not a payment key (owner:nonce:secret)');
  process.exit(1);
}

const raw = crypto.getRandomValues(new Uint8Array(32));
const nonce = crypto.getRandomValues(new Uint8Array(12));
const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, new TextEncoder().encode(paymentKey)));

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
process.stdout.write(JSON.stringify({ sealed: b64url(Buffer.concat([nonce, sealed])), decrypt_key: b64url(raw) }) + '\n');
