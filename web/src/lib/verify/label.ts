/**
 * The label: the enclave's signed statement about an answer, for a gate
 * that takes AI output and needs none of the prompt.
 *
 * Checked here against the keys pinned with the enclave's encryption key —
 * the `label_pubkey` and `caller_pubkey` of the attested `enclave_key` call —
 * and against the receipt it came in: the commitment is of this prompt, the
 * answer hash of this answer, the packs and the outcome the receipt's own.
 *
 * The label key is the project's: a company runs its own project, so a label
 * that verifies under the key its gate pinned is that company's. The caller's
 * key is the employee's: the keystore derives it for the account that started
 * the run, so a gate that knows its employees' keys tells who asked from the
 * signature.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { fromBase64, fromHex, sha256Hex } from '../bytes';
import { LABEL_PREFIX, parseLabel, type LabelBody, type Receipt, type SignedLabel } from '../receipt';
import { check, fail, pass, short, type Step } from './types';

const utf8 = (s: string) => new TextEncoder().encode(s);

function holds(signatureBase64: string, body: string, pubkeyHex: string): boolean {
  try {
    const message = new Uint8Array([...utf8(LABEL_PREFIX), ...utf8(body)]);
    return ed25519.verify(fromBase64(signatureBase64), message, fromHex(pubkeyHex));
  } catch {
    return false;
  }
}

/** The project's signature alone: whether `signed` is what `labelPubkeyHex` signed. */
export function labelSignatureHolds(signed: SignedLabel, labelPubkeyHex: string): boolean {
  return holds(signed.signature, signed.body, labelPubkeyHex);
}

/** The caller's signature alone: whether `signed` is what `callerPubkeyHex` signed. */
export function callerSignatureHolds(signed: SignedLabel, callerPubkeyHex: string): boolean {
  return holds(signed.caller_signature, signed.body, callerPubkeyHex);
}

/** Every check a gate makes of a label, with the receipt it came in. */
export function verifyLabel(receipt: Receipt, labelPubkeyHex: string | null, callerPubkeyHex: string | null): { label: LabelBody | null; steps: Step[] } {
  const signed = receipt.label;
  let label: LabelBody;
  try {
    label = parseLabel(signed.body);
  } catch (e) {
    return { label: null, steps: [fail('The label reads', e instanceof Error ? e.message : String(e))] };
  }
  const steps: Step[] = [];
  if (labelPubkeyHex) {
    steps.push(
      check(
        signed.public_key === labelPubkeyHex,
        'Signed with the pinned label key',
        `ed25519 ${short(labelPubkeyHex, 8)}, from the attested enclave_key call`,
        `the label names the key ${short(signed.public_key, 8)}, not the pinned ${short(labelPubkeyHex, 8)}`,
      ),
    );
    steps.push(
      check(
        labelSignatureHolds(signed, labelPubkeyHex),
        'The signature verifies',
        'ed25519 over the prefix and the label’s exact bytes',
        'the signature does not verify over the label’s bytes',
      ),
    );
  } else {
    steps.push(fail('Signed with the pinned label key', 'no label key was pinned'));
  }
  if (callerPubkeyHex) {
    steps.push(
      check(
        label.caller_key === callerPubkeyHex && callerSignatureHolds(signed, callerPubkeyHex),
        'Signed by the caller’s own key',
        `${label.caller ?? 'the caller'} · ed25519 ${short(callerPubkeyHex, 8)}, a key no other account’s run can reach`,
        `the label names the caller key ${short(label.caller_key ?? '', 8)} or its signature does not verify under ${short(callerPubkeyHex, 8)}`,
      ),
    );
  } else {
    steps.push(fail('Signed by the caller’s own key', 'no caller key was pinned'));
  }
  const commitment = sha256Hex(new Uint8Array([...fromHex(receipt.salt), ...utf8(receipt.prompt)]));
  steps.push(
    check(
      label.prompt_commitment === commitment,
      'Commits to this prompt',
      'sha256(salt ‖ prompt) matches; the label itself holds no prompt',
      'the commitment is not of this prompt and salt',
    ),
  );
  if (receipt.answer) {
    steps.push(
      check(
        label.answer_sha256 === sha256Hex(utf8(receipt.answer.text)),
        'Names this answer',
        'sha256(answer text) matches',
        'the label’s answer hash is not of this answer',
      ),
    );
  }
  steps.push(check(label.outcome === receipt.outcome, 'States the outcome', label.outcome, `the label says ${label.outcome}, the receipt ${receipt.outcome}`));
  const packsAgree =
    (receipt.screening?.packs ?? []).length === label.packs.length &&
    (receipt.screening?.packs ?? []).every((p, i) => label.packs[i]?.id === p.id && label.packs[i]?.version === p.version && label.packs[i]?.sha256 === p.sha256);
  steps.push(
    check(
      packsAgree,
      'Names the packs applied',
      label.packs.length ? label.packs.map((p) => `${p.id}@${p.version}`).join(', ') : 'none: the prompt was not screened',
      'the label’s packs are not the receipt’s',
    ),
  );
  const modeAgrees =
    label.mode === receipt.mode.mode &&
    (receipt.mode.mode === 'personal' || (label.org === receipt.mode.org && label.config_sha256 === receipt.mode.config_sha256));
  steps.push(
    check(
      modeAgrees,
      label.mode === 'company' ? 'Names the organisation' : 'Says it is personal',
      label.mode === 'company' ? `${label.org} · configuration ${short(label.config_sha256 ?? '', 6)}` : 'rules chosen by the caller, not a company',
      'the label’s mode or organisation is not the receipt’s',
    ),
  );
  const packCalls = receipt.screening?.packs.map((p) => p.call).filter(Boolean) ?? [];
  if (packCalls.length) {
    const attested = packCalls.every((call) => call.tee.status === 'attested');
    steps.push(
      check(
        label.screening_attested === attested,
        'States where the screen ran',
        attested ? 'every decision model in a NEAR-operated TEE' : 'a decision model outside a TEE',
        `the label says screening_attested ${label.screening_attested}, the receipt’s reports say ${attested}`,
      ),
    );
  }
  if (receipt.approval) {
    steps.push(
      check(
        label.approval?.officer === receipt.approval.officer && label.approval?.public_key === receipt.approval.public_key,
        'Carries the officer’s approval',
        `${receipt.approval.officer}, task ${short(receipt.approval.task_id, 8)}`,
        'the approval in the label is not the receipt’s',
      ),
    );
  }
  return { label, steps };
}

/** What a gate requires of a label, and whether this one meets it. */
export interface GateRule {
  org: string | null;
  packs: string[];
  /** Every decision model must have run in a NEAR-operated TEE. */
  screeningInTee?: boolean;
  /** Whose approval of an escalation counts. Absent: any officer's the label names. */
  officers?: string[];
  /** The employees this gate knows, account to `caller` key: anyone else's label is refused, and who asked is held to the signature. */
  employees?: Record<string, string>;
}

/** `signed` is the label as signed: the gate reads the caller's signature from it when the rule names employees. */
export function gate(label: LabelBody | null, signatureOk: boolean, rule: GateRule, signed?: SignedLabel): { accepted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!label) return { accepted: false, reasons: ['no label'] };
  if (!signatureOk) reasons.push('the signature does not verify');
  if (label.outcome !== 'answered') reasons.push(`the outcome is ${label.outcome}, not answered`);
  if (rule.org && label.org !== rule.org) reasons.push(`the organisation is ${label.org ?? 'none (personal mode)'}, not ${rule.org}`);
  for (const required of rule.packs) {
    const applied = label.packs.find((p) => `${p.id}@${p.version}` === required);
    if (!applied) reasons.push(`${required} was not applied`);
    else if (applied.verdict !== 'passed' && !(applied.verdict === 'escalated' && label.approval)) reasons.push(`${required} did not pass (${applied.verdict})`);
  }
  if (label.fired.some((f) => f.action === 'escalate') && !label.approval) reasons.push('an escalation without an approval');
  if (label.approval && rule.officers && !rule.officers.includes(label.approval.officer)) reasons.push(`${label.approval.officer} is no officer this gate takes an approval from`);
  if (rule.screeningInTee && !label.screening_attested) reasons.push('a decision model ran outside a TEE');
  if (rule.employees) {
    const key = label.caller ? rule.employees[label.caller] : undefined;
    if (!key) reasons.push(`${label.caller ?? 'nobody'} is no employee this gate knows`);
    else if (label.caller_key !== key || !signed || !callerSignatureHolds(signed, key)) reasons.push(`the label is not signed with ${label.caller}’s key`);
  }
  return { accepted: reasons.length === 0, reasons };
}

export { pass };
