import { describe, expect, it } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { hex, utf8 } from '../src/lib/bytes';
import type { AttestationRecord } from '../src/lib/outlayer';
import { recoverSigner } from '../src/lib/verify/eip191';
import { taskHash } from '../src/lib/verify/outlayer';
import attestation from './fixtures/testnet-attestation.json';

describe('OutLayer attestation binding', () => {
  /** A live testnet HTTPS call; its quote's report_data[0..32], read with dcap-qvl. */
  it('recomputes the hash the worker put into the quote', () => {
    expect(taskHash(attestation as AttestationRecord)).toBe('5265cbb87ffae91db57e0f8379c3ebb8e9ec36233f1ae7eaad682dbb0af24b5d');
  });

  it('changes when any attested field does', () => {
    const changed = { ...(attestation as AttestationRecord), output_hash: '00'.repeat(32) };
    expect(taskHash(changed)).not.toBe(taskHash(attestation as AttestationRecord));
  });
});

describe('EIP-191 recovery', () => {
  const sign = (secret: Uint8Array, text: string) => {
    const message = utf8(text);
    const digest = keccak_256(new Uint8Array([...utf8(`\x19Ethereum Signed Message:\n${message.length}`), ...message]));
    const sig = secp256k1.sign(digest, secret);
    return hex(new Uint8Array([...sig.toCompactRawBytes(), sig.recovery + 27]));
  };

  /** The well-known vector: private key 0x…01 is address 0x7e5f…5bdf. */
  it('recovers the signer of the known key', () => {
    const one = new Uint8Array(32);
    one[31] = 1;
    expect(recoverSigner('Qwen/Qwen3.8-27B:aa:bb', sign(one, 'Qwen/Qwen3.8-27B:aa:bb'))).toBe(
      '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf',
    );
  });

  it('names someone else for a changed text', () => {
    const one = new Uint8Array(32);
    one[31] = 1;
    expect(recoverSigner('Qwen/Qwen3.8-27B:aa:bc', sign(one, 'Qwen/Qwen3.8-27B:aa:bb'))).not.toBe(
      '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf',
    );
  });
});
