/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { openSealedKey, takeDecryptKey } from '../src/lib/sealedKey';

const KEY = 'alice.testnet:2:not-a-real-secret';

/** Seal with the script a deployer runs; open with the page's own code. */
function seal(input: string): { sealed: string; decrypt_key: string } {
  return JSON.parse(execFileSync('node', ['scripts/seal-key.mjs'], { input }).toString());
}

describe('sealed payment key', () => {
  it('opens with the link’s decrypt key', async () => {
    const { sealed, decrypt_key } = seal(KEY);
    expect(await openSealedKey(sealed, decrypt_key)).toBe(KEY);
  });

  it('refuses another decrypt key', async () => {
    const { sealed } = seal(KEY);
    const other = seal(KEY).decrypt_key;
    await expect(openSealedKey(sealed, other)).rejects.toThrow(/does not open/);
  });

  it('takes the decrypt key out of the fragment and keeps the rest', () => {
    const loc = { pathname: '/near-attested-ai/', search: '?x=1', hash: '#decrypt_key=abc&tab=2' } as Location;
    expect(takeDecryptKey(loc)).toEqual({ decryptKey: 'abc', cleanUrl: '/near-attested-ai/?x=1#tab=2' });
    expect(takeDecryptKey({ ...loc, hash: '' } as Location).decryptKey).toBeNull();
  });
});
