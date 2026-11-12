/**
 * NVIDIA's GPU verdict: the JWT its attestation service (NRAS) issued for the
 * GPU evidence, checked here against NVIDIA's published signing keys.
 */

import { fromBase64, fromUtf8, utf8 } from '../bytes';
import { NVIDIA_JWKS } from '../network';

export interface GpuVerdict {
  signatureOk: boolean;
  overall: boolean | null;
  issuedAt: number | null;
  kid: string | null;
  /** NVIDIA no longer publishes the key that signed the token: it rotates them within days. */
  retired?: boolean;
  error?: string;
}

let jwks: Promise<JsonWebKey[]> | null = null;

function keys(): Promise<JsonWebKey[]> {
  jwks ??= fetch(NVIDIA_JWKS)
    .then((r) => {
      if (!r.ok) throw new Error(`NVIDIA's keys are unavailable (HTTP ${r.status})`);
      return r.json();
    })
    .then((j) => j.keys as JsonWebKey[]);
  return jwks;
}

export async function verifyNvidiaToken(token: string): Promise<GpuVerdict> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return { signatureOk: false, overall: null, issuedAt: null, kid: null, error: 'not a JWT' };
  const header = JSON.parse(fromUtf8(fromBase64(h)));
  const claims = JSON.parse(fromUtf8(fromBase64(p)));
  const base = {
    overall: typeof claims['x-nvidia-overall-att-result'] === 'boolean' ? claims['x-nvidia-overall-att-result'] : null,
    issuedAt: typeof claims.iat === 'number' ? claims.iat : null,
    kid: typeof header.kid === 'string' ? header.kid : null,
  };
  try {
    if (header.alg !== 'ES384') throw new Error(`unexpected algorithm ${header.alg}`);
    const jwk = (await keys()).find((k) => (k as { kid?: string }).kid === header.kid);
    if (!jwk) return { ...base, signatureOk: false, retired: true, error: `NVIDIA no longer publishes key ${header.kid}` };
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      { name: 'ECDSA', namedCurve: 'P-384' },
      false,
      ['verify'],
    );
    const signatureOk = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-384' },
      key,
      fromBase64(s) as BufferSource,
      utf8(`${h}.${p}`) as BufferSource,
    );
    return { ...base, signatureOk };
  } catch (e) {
    return { ...base, signatureOk: false, error: e instanceof Error ? e.message : String(e) };
  }
}
