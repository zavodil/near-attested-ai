/** EIP-191 (Ethereum personal-sign) signer recovery, as NEAR AI's model TEEs sign. */

import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { fromHex, hex, utf8 } from '../bytes';

export function recoverSigner(text: string, signatureHex: string): string {
  const raw = fromHex(signatureHex);
  if (raw.length !== 65) throw new Error(`an EIP-191 signature is 65 bytes; this one is ${raw.length}`);
  const v = raw[64] >= 27 ? raw[64] - 27 : raw[64];
  const message = utf8(text);
  const digest = keccak_256(new Uint8Array([...utf8(`\x19Ethereum Signed Message:\n${message.length}`), ...message]));
  const publicKey = secp256k1.Signature.fromCompact(raw.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(digest);
  return `0x${hex(keccak_256(publicKey.toRawBytes(false).slice(1)).slice(12))}`;
}
