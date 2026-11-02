/**
 * A payment key shipped inside a hosted build, sealed.
 *
 * The build carries only `AES-256-GCM(decrypt_key, payment key)`; the
 * decrypt key travels in the link's fragment (`#decrypt_key=…`), which a
 * browser never sends to the host serving the page. Without the link the
 * build holds nothing usable.
 *
 * Format of the sealed value, base64url: `nonce (12 bytes) ‖ ciphertext ‖ tag (16 bytes)`.
 * `scripts/seal-key.mjs` produces it.
 */

import { fromBase64, fromUtf8 } from './bytes';

export const DECRYPT_KEY_PARAM = 'decrypt_key';

/** The decrypt key from the page's fragment, and the address without it. */
export function takeDecryptKey(location: Location): { decryptKey: string | null; cleanUrl: string } {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  const decryptKey = params.get(DECRYPT_KEY_PARAM);
  params.delete(DECRYPT_KEY_PARAM);
  const rest = params.toString();
  return { decryptKey, cleanUrl: `${location.pathname}${location.search}${rest ? `#${rest}` : ''}` };
}

export async function openSealedKey(sealed: string, decryptKey: string): Promise<string> {
  const blob = fromBase64(sealed);
  const key = await crypto.subtle.importKey('raw', fromBase64(decryptKey) as BufferSource, 'AES-GCM', false, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.slice(0, 12) as BufferSource },
      key,
      blob.slice(12) as BufferSource,
    );
    return fromUtf8(new Uint8Array(plain));
  } catch {
    throw new Error('The link’s decrypt key does not open this page’s payment key.');
  }
}
