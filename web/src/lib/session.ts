/**
 * The page's two flows.
 *
 * `pinEnclave`: ask the project for its enclave key and verify THAT run's
 * attestation before anything is sealed to the key — a key the page cannot
 * tie to an approved OutLayer worker running this project's code is not used.
 *
 * `ask`: seal the request to the pinned key, run it, open the receipt with a
 * fresh reply key, and verify every claim the receipt makes.
 */

import { sha256Hex } from './bytes';
import { newReplyKey, openReceipt, sealTo } from './envelope';
import type { Network } from './network';
import { fetchAttestation, paymentKeyOwner, runProject } from './outlayer';
import { parseReceipt, type Policy, type Receipt, type SealedOutput } from './receipt';
import { verifyModelCall, verifyPolicy } from './verify/model';
import { verifyOutlayerRun } from './verify/outlayer';
import { check, overall, type ProofGroup } from './verify/types';

export interface Target {
  network: Network;
  projectId: string;
  paymentKey: string;
  /** The profile of the caller's own secret row holding `NEARAI_API_KEY`. */
  secretsProfile: string;
}

export interface PinnedEnclave {
  pubkey: string;
  proof: ProofGroup;
}

export interface Question {
  prompt: string;
  model: string;
  maxTokens: number;
  screening: Policy | null;
}

export type Stage = 'pin' | 'seal' | 'run' | 'open' | 'verify';

export interface Outcome {
  callId: string;
  receipt: Receipt;
  receiptBytes: Uint8Array;
  /** What OutLayer's coordinator relayed and keeps: the sealed request and the sealed receipt. */
  operatorView: { input: { op: string; sealed: string }; output: SealedOutput };
  proofs: ProofGroup[];
  timeMs?: number;
}

export async function pinEnclave(target: Target, onStatus?: (s: string) => void): Promise<PinnedEnclave> {
  const input = { op: 'enclave_key' };
  const { callId, output } = await runProject(target.network, target.projectId, target.paymentKey, input, null, onStatus);
  const pubkey = (output as { enclave_pubkey?: string; error?: string })?.enclave_pubkey;
  if (!pubkey) throw new Error((output as { error?: string })?.error ?? 'the project answered no enclave key');

  onStatus?.('verifying');
  const attestation = await fetchAttestation(target.network, callId);
  const proof = await verifyOutlayerRun(target.network, attestation, input, output, { id: 'enclave-key', title: 'Enclave key' }, [
    check(/^0[23][0-9a-f]{64}$/.test(pubkey), 'The key is a secp256k1 point', `${pubkey.slice(0, 10)}…`, 'not a compressed secp256k1 key'),
  ]);
  if (proof.verdict === 'fail') {
    throw new Error('The enclave key’s attestation did not verify, so nothing will be sealed to it.');
  }
  return { pubkey, proof };
}

export async function ask(
  target: Target,
  enclave: PinnedEnclave,
  question: Question,
  onStage: (stage: Stage, note?: string) => void,
): Promise<Outcome> {
  onStage('seal');
  const reply = newReplyKey();
  const input = {
    op: 'ask',
    sealed: sealTo(enclave.pubkey, {
      prompt: question.prompt,
      model: question.model,
      max_tokens: question.maxTokens,
      ...(question.screening ? { screening: question.screening } : {}),
      reply_pubkey: reply.publicKeyHex,
    }),
  };

  onStage('run');
  // The caller's own NEAR AI key: their row under this project, named by owner and profile.
  const secretsRef = { account_id: paymentKeyOwner(target.paymentKey) ?? '', profile: target.secretsProfile.trim() };
  const { callId, output, timeMs } = await runProject(target.network, target.projectId, target.paymentKey, input, secretsRef, (s) =>
    onStage('run', s),
  );
  const sealed = output as SealedOutput & { error?: string };
  if (sealed?.error) throw new Error(sealed.error);
  if (!sealed?.sealed || !sealed.receipt_digest) throw new Error('the project answered no sealed receipt');

  onStage('open');
  const receiptBytes = openReceipt(reply, sealed.sealed);
  const receipt = parseReceipt(receiptBytes);

  onStage('verify', 'Fetching OutLayer’s TDX attestation for this call');
  const attestation = await fetchAttestation(target.network, callId);
  onStage('verify', 'Checking OutLayer’s Intel quote, its worker build, and that it covers exactly this input and output');
  const proofs: ProofGroup[] = [
    await verifyOutlayerRun(target.network, attestation, input, output, { id: 'outlayer-run', title: 'OutLayer enclave' }, [
      check(
        sha256Hex(receiptBytes) === sealed.receipt_digest,
        'The receipt is the attested output',
        'sha256(receipt) = the digest in the attested output',
        'the receipt does not hash to the attested digest',
      ),
      check(receipt.call_id === callId, 'The receipt names this call', callId, `the receipt names call ${receipt.call_id}`),
    ]),
  ];
  if (receipt.screening) {
    const steps = verifyPolicy(receipt.screening);
    proofs.push({
      id: 'policy',
      title: 'Screening policy',
      subtitle: receipt.screening.verdict === 'blocked' ? 'Blocked before the answering model' : 'Passed every rule',
      verdict: overall(steps),
      steps,
      facts: [
        { label: 'Decision model', value: receipt.screening.policy.model },
        { label: 'Policy sha256', value: receipt.screening.policy_sha256, mono: true },
      ],
      raw: receipt.screening.policy,
    });
    onStage('verify', `Checking what ${receipt.screening.policy.model} decided and whether it was attested`);
    proofs.push(await verifyModelCall(receipt.screening.call, receipt, 'screening'));
  }
  if (receipt.answer) {
    onStage('verify', `Checking ${receipt.answer.call.model}: Intel quote, NVIDIA’s GPU verdict, the answer’s signature`);
    proofs.push(await verifyModelCall(receipt.answer.call, receipt, 'answer'));
  }

  return { callId, receipt, receiptBytes, operatorView: { input, output: sealed }, proofs, timeMs };
}
