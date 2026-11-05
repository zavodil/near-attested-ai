/**
 * The page's flows.
 *
 * `pinEnclave`: ask the project for its keys — the encryption key requests
 * are sealed to, the label key and the caller's own key answers are signed
 * with — and verify THAT run's attestation before anything is sealed to them.
 *
 * `orgPolicy`: ask the project whose rules this call runs under: the
 * company's configuration from the project's own row, or personal mode.
 *
 * `ask`: seal the request to the pinned key, run it, open the receipt with a
 * fresh reply key, and verify every claim the receipt makes. A prompt that
 * escalates comes back as the receipt of the screen and the task it waits
 * on; `awaitApproval` then follows the task until the officer's yes starts
 * the run that answers, and opens that receipt with the same reply key.
 */

import { sha256Hex } from './bytes';
import { newReplyKey, openReceipt, sealTo, type ReplyKey } from './envelope';
import type { Network } from './network';
import { callOutput, fetchAttestation, runProject, type SecretsRef } from './outlayer';
import { parseReceipt, type EscalatedOutput, type LabelBody, type Mode, type Receipt, type SealedOutput } from './receipt';
import { verifyLabel } from './verify/label';
import { verifyModelCall, verifyPackOnChain, verifyPolicy } from './verify/model';
import { verifyOutlayerRun } from './verify/outlayer';
import { check, overall, type ProofGroup } from './verify/types';

export interface Target {
  network: Network;
  projectId: string;
  paymentKey: string;
  /** The secret rows the call names, in order: the officers', in a company's project; or the visitor's own. */
  rows: SecretsRef[];
}

export interface PinnedEnclave {
  pubkey: string;
  labelPubkey: string;
  callerPubkey: string;
  /** The attested call the keys were pinned from. */
  callId: string;
  proof: ProofGroup;
}

export interface LoadedPack {
  pack: { id: string; version: number; title: string | null; model: string; rules: { id: string; cite?: string; question: string; threshold: number; action: 'block' | 'escalate' }[] };
  sha256: string;
  registry: string;
  block_height: number;
  publisher: string;
}

export type OrgPolicy = Mode & { registry: string; packs: LoadedPack[]; proof: ProofGroup };

export interface Question {
  prompt: string;
  model: string;
  maxTokens: number;
  /** Personal mode: the packs to screen with. Company mode: empty, the configuration decides. */
  packs: string[];
}

export type Stage = 'pin' | 'seal' | 'run' | 'await' | 'open' | 'verify';

export interface Escalation {
  taskId: string;
  taskHash: string;
  officer: string;
}

export interface Outcome {
  callId: string;
  receipt: Receipt;
  receiptBytes: Uint8Array;
  label: LabelBody | null;
  /** What OutLayer's coordinator relayed and keeps: the sealed request and the sealed receipt. */
  operatorView: { input: unknown; output: SealedOutput };
  proofs: ProofGroup[];
  timeMs?: number;
  /** Set while the prompt waits for an officer. */
  escalation?: Escalation;
  /** The reply key the escalation's answer will be sealed to; kept for `awaitApproval`. */
  reply?: ReplyKey;
}

export async function pinEnclave(target: Target, onStatus?: (s: string) => void): Promise<PinnedEnclave> {
  const input = { op: 'enclave_key' };
  const { callId, output } = await runProject(target.network, target.projectId, target.paymentKey, input, target.rows, onStatus);
  const keys = output as { caller_pubkey?: string; enclave_pubkey?: string; label_pubkey?: string; error?: string };
  if (!keys?.enclave_pubkey || !keys.label_pubkey || !keys.caller_pubkey) throw new Error(keys?.error ?? 'the project answered no keys');

  onStatus?.('verifying');
  const attestation = await fetchAttestation(target.network, callId);
  const proof = await verifyOutlayerRun(target.network, attestation, input, output, { id: 'enclave-key', title: 'Enclave keys' }, [
    check(/^0[23][0-9a-f]{64}$/.test(keys.enclave_pubkey), 'The encryption key is a secp256k1 point', `${keys.enclave_pubkey.slice(0, 10)}…`, 'not a compressed secp256k1 key'),
    check(/^[0-9a-f]{64}$/.test(keys.label_pubkey), 'The label key is an ed25519 key', `${keys.label_pubkey.slice(0, 10)}…`, 'not a 32-byte ed25519 key'),
    check(/^[0-9a-f]{64}$/.test(keys.caller_pubkey), 'The caller’s key is an ed25519 key', `${keys.caller_pubkey.slice(0, 10)}…`, 'not a 32-byte ed25519 key'),
  ]);
  if (proof.verdict === 'fail') {
    throw new Error('The enclave keys’ attestation did not verify, so nothing will be sealed to them.');
  }
  return { pubkey: keys.enclave_pubkey, labelPubkey: keys.label_pubkey, callerPubkey: keys.caller_pubkey, callId, proof };
}

export async function orgPolicy(target: Target, onStatus?: (s: string) => void): Promise<OrgPolicy> {
  const input = { op: 'org_policy' };
  const { callId, output } = await runProject(target.network, target.projectId, target.paymentKey, input, target.rows, onStatus);
  const answer = output as (Mode & { registry: string; packs: LoadedPack[] }) & { error?: string };
  if (answer?.error) throw new Error(answer.error);
  if (answer?.mode !== 'personal' && answer?.mode !== 'company') throw new Error('the project answered no mode');
  onStatus?.('verifying');
  const attestation = await fetchAttestation(target.network, callId);
  const proof = await verifyOutlayerRun(target.network, attestation, input, output, { id: 'org-policy', title: 'Whose rules apply' }, []);
  return { ...answer, proof };
}

export async function ask(target: Target, enclave: PinnedEnclave, question: Question, onStage: (stage: Stage, note?: string) => void): Promise<Outcome> {
  onStage('seal');
  const reply = newReplyKey();
  const input = {
    op: 'ask',
    sealed: sealTo(enclave.pubkey, {
      prompt: question.prompt,
      model: question.model,
      max_tokens: question.maxTokens,
      ...(question.packs.length ? { packs: question.packs } : {}),
      reply_pubkey: reply.publicKeyHex,
    }),
  };

  onStage('run');
  const { callId, output, timeMs } = await runProject(target.network, target.projectId, target.paymentKey, input, target.rows, (s) => onStage('run', s));
  const sealed = output as (SealedOutput | EscalatedOutput) & { error?: string };
  if (sealed?.error) throw new Error(sealed.error);
  if (!sealed?.sealed || !sealed.receipt_digest) throw new Error('the project answered no sealed receipt');

  const outcome = await openAndVerify(target, enclave, reply, callId, input, sealed, onStage);
  outcome.timeMs = timeMs;
  if ('status' in sealed && sealed.status === 'escalated') {
    outcome.escalation = { taskId: sealed.task_id, taskHash: sealed.task_hash, officer: sealed.officer };
    outcome.reply = reply;
  }
  return outcome;
}

const POLL_TASK_EVERY_MS = 5000;

/**
 * Follow an escalated prompt's task until it ends. The officer's yes starts
 * the preparer's run, which seals the answer to the same reply key and
 * reports it to the task; `task_status` hands it back with the run's id.
 */
export async function awaitApproval(
  target: Target,
  enclave: PinnedEnclave,
  waiting: Outcome,
  onStage: (stage: Stage, note?: string) => void,
  deadlineMs = 30 * 60_000,
): Promise<Outcome> {
  const escalation = waiting.escalation;
  const reply = waiting.reply;
  if (!escalation || !reply) throw new Error('nothing waits for an officer');
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    onStage('await', `waiting for ${escalation.officer}`);
    const { output } = await runProject(target.network, target.projectId, target.paymentKey, { op: 'task_status', task_id: escalation.taskId }, target.rows);
    const status = output as { state?: string; run?: string; result?: { receipt_digest?: string }; failure_reason?: string; rejection?: string; error?: string };
    if (status?.error) throw new Error(status.error);
    switch (status?.state) {
      case 'open':
      case 'approved':
      case 'answering':
        if (Date.now() > deadline) throw new Error(`the task is still ${status.state} after ${deadlineMs / 60_000} minutes`);
        onStage('await', status.state === 'open' ? `waiting for ${escalation.officer}` : `${escalation.officer} approved; the run answers`);
        await new Promise((resolve) => setTimeout(resolve, POLL_TASK_EVERY_MS));
        continue;
      case 'done': {
        if (!status.result?.receipt_digest || !status.run) throw new Error('the task ended done without naming its receipt');
        // The sealed receipt is the run's output, under its attestation; the
        // task keeps its digest, which must be this one.
        const sealed = (await callOutput(target.network, target.paymentKey, status.run)) as SealedOutput & { error?: string };
        if (sealed?.error) throw new Error(sealed.error);
        if (!sealed?.sealed || sealed.receipt_digest !== status.result.receipt_digest) throw new Error('the run’s output is not the receipt the task names');
        return openAndVerify(target, enclave, reply, status.run, null, sealed, onStage, escalation);
      }
      case 'rejected':
        throw new Error(`${escalation.officer} rejected the request${status.rejection ? `: ${status.rejection}` : ''}`);
      default:
        throw new Error(`the task ended ${status?.state ?? 'unknown'}${status?.failure_reason ? ` (${status.failure_reason})` : ''}`);
    }
  }
}

async function openAndVerify(
  target: Target,
  enclave: PinnedEnclave,
  reply: ReplyKey,
  callId: string,
  input: unknown | null,
  sealed: SealedOutput,
  onStage: (stage: Stage, note?: string) => void,
  approved?: Escalation,
): Promise<Outcome> {
  onStage('open');
  const receiptBytes = openReceipt(reply, sealed.sealed);
  const receipt = parseReceipt(receiptBytes);

  onStage('verify', 'Fetching OutLayer’s TDX attestation for this call');
  const attestation = await fetchAttestation(target.network, callId);
  onStage('verify', 'Checking OutLayer’s Intel quote, its worker build, and that it covers exactly this output');
  // The output as the run left it, every member: the attested hash is over all of them.
  const output: SealedOutput = sealed;
  const proofs: ProofGroup[] = [
    await verifyOutlayerRun(target.network, attestation, input, output, { id: 'outlayer-run', title: approved ? 'OutLayer enclave · the run after the approval' : 'OutLayer enclave' }, [
      check(sha256Hex(receiptBytes) === sealed.receipt_digest, 'The receipt is the attested output', 'sha256(receipt) = the digest in the attested output', 'the receipt does not hash to the attested digest'),
      check(receipt.call_id === callId, 'The receipt names this call', callId, `the receipt names call ${receipt.call_id}`),
      ...(approved
        ? [check(receipt.approval?.task_id === approved.taskId, 'Answered on the officer’s approval', `task ${approved.taskId}, approved by ${receipt.approval?.officer ?? '?'}`, 'the receipt names another task')]
        : []),
    ]),
  ];
  if (receipt.screening) {
    const steps = verifyPolicy(receipt.screening);
    onStage('verify', 'Asking the chain whether the packs applied are the ones it holds');
    for (const pack of receipt.screening.packs) steps.push(await verifyPackOnChain(target.network.rpc, pack));
    proofs.push({
      id: 'policy',
      title: 'Policy packs',
      subtitle:
        receipt.screening.verdict === 'blocked' ? 'Blocked before the answering model' : receipt.screening.verdict === 'escalated' ? 'Escalated to an officer' : 'Passed every rule',
      verdict: overall(steps),
      steps,
      facts: receipt.screening.packs.map((p) => ({ label: `${p.id}@${p.version}`, value: `${p.registry} · block ${p.block_height} · ${p.sha256.slice(0, 12)}…`, mono: true })),
      raw: receipt.screening.packs.map((p) => ({ id: p.id, version: p.version, sha256: p.sha256, registry: p.registry, block_height: p.block_height, publisher: p.publisher, outcomes: p.outcomes })),
    });
    for (const pack of receipt.screening.packs) {
      onStage('verify', `Checking what ${pack.model} decided for ${pack.id} and whether it was attested`);
      const group = await verifyModelCall(pack.call, receipt, 'screening');
      group.id = `model-screening-${pack.id}`;
      group.title = `${pack.model} · ${pack.id}`;
      proofs.push(group);
    }
  }
  if (receipt.answer) {
    onStage('verify', `Checking ${receipt.answer.call.model}: Intel quote, NVIDIA’s GPU verdict, the answer’s signature`);
    proofs.push(await verifyModelCall(receipt.answer.call, receipt, 'answer'));
  }
  onStage('verify', 'Checking the label’s signatures against the pinned keys');
  const { label, steps: labelSteps } = verifyLabel(receipt, enclave.labelPubkey, enclave.callerPubkey);
  proofs.push({
    id: 'label',
    title: 'Signed label',
    subtitle: 'What a gate checks, without the prompt',
    verdict: overall(labelSteps),
    steps: labelSteps,
    facts: [
      { label: 'Signed with', value: receipt.label.public_key, mono: true },
      { label: 'And by the caller', value: label?.caller_key ?? '—', mono: true },
      { label: 'Outcome', value: label?.outcome ?? '—' },
      ...(label?.org ? [{ label: 'Organisation', value: label.org }] : []),
    ],
    raw: receipt.label,
  });

  return { callId, receipt, receiptBytes, label, operatorView: { input: input ?? { operation: 'answer_escalated', task_id: approved?.taskId }, output }, proofs };
}
