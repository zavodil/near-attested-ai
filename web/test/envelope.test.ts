import { describe, expect, it } from 'vitest';
import { PrivateKey } from 'eciesjs';
import { fromHex, fromUtf8 } from '../src/lib/bytes';
import { openReceipt } from '../src/lib/envelope';

/** The secret both golden vectors are made with: bytes 1..=32. */
const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

/**
 * Sealed by the enclave's own code (`module/src/envelope.rs`,
 * `print_a_golden_receipt`). The reverse vector, sealed here and opened there,
 * is `BROWSER_BLOB` in the same file.
 */
const GOLDEN_RECEIPT =
  '04932527fce44a0afa37e6ec3ca035439945c828b38a7e33198ddb13e7d87f74ceb50f7b3d05a005db371e6e05cc4d69cbde214595dd41b4cec686850523f27f41130d29be5e295dbd8ca6bedc0969b7d7e054614028cf2ac324d1a392ccb5b6bef09caa4cec1c8a71337a30e4a16824847ccff4d7ea0ef451e281d2fe8cf9';

describe('envelopes', () => {
  it('opens a receipt the enclave sealed', () => {
    const key = { publicKeyHex: new PrivateKey(secret).publicKey.toHex(), secret };
    const sealed = btoa(String.fromCharCode(...fromHex(GOLDEN_RECEIPT)));
    expect(fromUtf8(openReceipt(key, sealed))).toBe('{"receipt":"from the enclave"}');
  });

  it('refuses a receipt sealed to another key', () => {
    const other = new PrivateKey();
    const sealed = btoa(String.fromCharCode(...fromHex(GOLDEN_RECEIPT)));
    expect(() => openReceipt({ publicKeyHex: other.publicKey.toHex(), secret: other.secret }, sealed)).toThrow(/did not open/);
  });
});
