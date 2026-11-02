/**
 * The two envelopes, browser side: the request sealed to the enclave's key,
 * the receipt opened with this page's reply key.
 *
 * ECIES over secp256k1 — `eciesjs` here, the `ecies` crate in the enclave.
 * The reply key's secret half lives in this page's memory and nowhere else.
 */

import { PrivateKey, decrypt, encrypt } from 'eciesjs';
import { base64, fromBase64, utf8 } from './bytes';

export interface ReplyKey {
  publicKeyHex: string;
  secret: Uint8Array;
}

export function newReplyKey(): ReplyKey {
  const key = new PrivateKey();
  return { publicKeyHex: key.publicKey.toHex(), secret: key.secret };
}

/** Seal a request to the enclave key, as base64 for the `ask` input. */
export function sealTo(enclavePubkeyHex: string, request: object): string {
  return base64(new Uint8Array(encrypt(enclavePubkeyHex, utf8(JSON.stringify(request)))));
}

/** Open the receipt; its exact bytes are what the digest covers. */
export function openReceipt(key: ReplyKey, sealedBase64: string): Uint8Array {
  try {
    return new Uint8Array(decrypt(key.secret, fromBase64(sealedBase64)));
  } catch {
    throw new Error('The receipt did not open with the key this page holds.');
  }
}
