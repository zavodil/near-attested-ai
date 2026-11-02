/**
 * The NEAR AI side: did this answer come from this model, running in an
 * Intel TDX + NVIDIA confidential-computing TEE, for exactly this request?
 *
 * Everything is re-checked here from the receipt's own material: the exact
 * request and response bytes, the model's attestation report, the Intel
 * collateral the enclave fetched (Intel-signed, so its source does not
 * matter), NVIDIA's signed GPU verdict, and the response signature.
 */

import { fromBase64, fromHex, sha256Hex } from '../bytes';
import { percent } from '../format';
import type { Check, ModelCall, Receipt, Screening } from '../receipt';
import { verifyQuote } from './dcap';
import { recoverSigner } from './eip191';
import { verifyNvidiaToken } from './nvidia';
import { check, fail, message, overall, pass, short, skip, warn, type Fact, type ProofGroup, type Step } from './types';

const enclave = (c: Check | { ok: boolean; error: string | null }) => ({ ok: c.ok, error: c.error });

export async function verifyModelCall(call: ModelCall, receipt: Receipt, role: 'answer' | 'screening'): Promise<ProofGroup> {
  const request = fromBase64(call.request_body);
  const response = fromBase64(call.response_body);
  const requestHash = sha256Hex(request);
  const responseHash = sha256Hex(response);
  const steps: Step[] = [
    check(
      requestHash === call.request_sha256 && responseHash === call.response_sha256,
      'The exchange is recorded byte for byte',
      `request ${short(requestHash, 6)} · response ${short(responseHash, 6)}`,
      'the recorded hashes are not of the recorded bytes',
    ),
  ];
  const facts: Fact[] = [{ label: 'Model', value: call.model }];

  if (call.tee.status === 'not_attested') {
    steps.push(warn('Runs in a NEAR AI TEE', call.tee.reason));
    steps.push(signatureStep(call, null, requestHash, responseHash));
    return group(call, role, steps, facts);
  }

  const evidence = call.tee;
  const att = evidence.attestation;
  facts.push(
    { label: 'Signing key', value: att.signing_address, mono: true },
    { label: 'TEE software', value: String((att.info as { app_name?: string } | null)?.app_name ?? '—') },
    { label: 'Compose hash', value: short(String((att.info as { compose_hash?: string } | null)?.compose_hash ?? '—')), mono: true },
  );

  steps.push(
    check(
      att.request_nonce === requestHash,
      'The report is fresh for this request',
      'nonce = sha256(request bytes)',
      'the report was produced for another nonce',
    ),
  );

  // Intel TDX: the model's CPU enclave.
  if (!evidence.collateral) {
    steps.push({ ...fail('Intel signed the model’s quote', evidence.collateral_error ?? 'no collateral'), enclave: enclave(evidence.checks.quote) });
  } else {
    try {
      const verified = await verifyQuote(fromHex(att.intel_quote), JSON.stringify(evidence.collateral), receipt.issued_at);
      if (!verified.ok) {
        steps.push({ ...fail('Intel signed the model’s quote', verified.error ?? 'did not verify'), enclave: enclave(evidence.checks.quote) });
      } else {
        steps.push({
          ...(verified.status === 'UpToDate'
            ? pass('Intel signed the model’s quote', 'Genuine Intel TDX, TCB up to date')
            : warn('Intel signed the model’s quote', `Genuine Intel TDX, TCB status ${verified.status}`)),
          enclave: enclave(evidence.checks.quote),
        });
        const address = att.signing_address.replace(/^0x/, '').toLowerCase();
        const expected = (address + '0'.repeat(64)).slice(0, 64);
        steps.push({
          ...check(
            verified.report_data_prefix === expected && verified.report_data_suffix === requestHash,
            'The quote names the signing key and this request',
            'report_data = signing address ‖ nonce',
            'report_data names another key or another request',
          ),
          enclave: enclave(evidence.checks.binding),
        });
      }
    } catch (e) {
      steps.push({ ...fail('Intel signed the model’s quote', message(e)), enclave: enclave(evidence.checks.quote) });
    }
  }

  // NVIDIA: the GPUs the model runs on. The evidence states the nonce it was
  // taken for; NVIDIA's token judges that evidence.
  const gpu = evidence.checks.gpu;
  const evidenceNonce = gpuEvidenceNonce(att.nvidia_payload);
  if (evidenceNonce !== requestHash) {
    steps.push({ ...fail('NVIDIA confirms the GPUs', 'the GPU evidence was taken for another nonce'), enclave: enclave(gpu) });
  } else if (!gpu.token) {
    steps.push({ ...fail('NVIDIA confirms the GPUs', gpu.error ?? 'no NVIDIA token'), enclave: enclave(gpu) });
  } else {
    const verdict = await verifyNvidiaToken(gpu.token);
    steps.push({
      ...(verdict.signatureOk && verdict.overall === true
        ? pass('NVIDIA confirms the GPUs', 'Evidence for this nonce; NRAS token signed by NVIDIA, overall result: true')
        : fail(
            'NVIDIA confirms the GPUs',
            verdict.error ?? (!verdict.signatureOk ? 'the token’s signature does not verify' : 'NVIDIA’s verdict is not true'),
          )),
      enclave: enclave(gpu),
    });
    if (verdict.kid) facts.push({ label: 'NVIDIA key', value: verdict.kid, mono: true });
  }

  steps.push({ ...signatureStep(call, att.signing_address, requestHash, responseHash), enclave: enclave(evidence.checks.signature) });
  return group(call, role, steps, facts);
}

function gpuEvidenceNonce(payload: string): string | null {
  try {
    const nonce = JSON.parse(payload)?.nonce;
    return typeof nonce === 'string' ? nonce : null;
  } catch {
    return null;
  }
}

function signatureStep(call: ModelCall, attested: string | null, requestHash: string, responseHash: string): Step {
  const label = 'The model’s TEE signed this answer';
  const sig = call.signature;
  if (!sig) return attested ? fail(label, call.signature_error ?? 'no signature') : skip(label, call.signature_error ?? 'no signature');
  if (sig.signature_kind !== 'provider_tee') {
    return warn(label, `Signed by the NEAR AI gateway (${sig.signature_kind ?? 'kind not stated'}), not by the model’s TEE`);
  }
  if (sig.text !== `${call.model}:${requestHash}:${responseHash}`) {
    return fail(label, 'the signed text is not this model and these exact bytes');
  }
  try {
    const signer = recoverSigner(sig.text, sig.signature);
    if (!attested) return warn(label, `Signed by ${short(signer, 6)}, a key no attestation vouches for`);
    return check(
      signer === attested.toLowerCase(),
      label,
      `EIP-191 signer ${short(signer, 6)} = the attested key`,
      `signed by ${signer}, not the attested key`,
    );
  } catch (e) {
    return fail(label, message(e));
  }
}

function group(call: ModelCall, role: 'answer' | 'screening', steps: Step[], facts: Fact[]): ProofGroup {
  return {
    id: `model-${role}`,
    title: role === 'answer' ? 'Answering model' : 'Screening model',
    subtitle: call.tee.status === 'attested' ? `${call.model} · NEAR AI TEE · Intel TDX + NVIDIA` : `${call.model} · external provider`,
    verdict: overall(steps),
    steps,
    facts,
    raw: call,
  };
}

/** The policy as applied: its fingerprint, and what each rule decided. */
export function verifyPolicy(screening: Screening): Step[] {
  const fingerprint = sha256Hex(JSON.stringify(screening.policy));
  return [
    check(
      fingerprint === screening.policy_sha256,
      'The policy is the one fingerprinted',
      `policy sha256 ${short(fingerprint, 6)}`,
      'the policy does not hash to its fingerprint',
    ),
    ...screening.outcomes.map((o) => {
      const rule = screening.policy.rules.find((r) => r.id === o.id);
      const recomputed = rule ? o.p_yes * 100 >= rule.block_at : o.tripped;
      return recomputed !== o.tripped
        ? fail(`Rule “${o.id}”`, 'the recorded decision does not follow from the probability and threshold')
        : (o.tripped ? warn : pass)(
            `Rule “${o.id}”`,
            `P(yes) ${percent(o.p_yes)} ${o.tripped ? '≥' : '<'} ${rule?.block_at ?? '?'}% → ${o.tripped ? 'blocks' : 'passes'}`,
          );
    }),
  ];
}
