/**
 * The label: the enclave's signed statement about an answer, for a gate
 * that takes AI output and needs none of the prompt.
 *
 * Checked here against the key pinned with the enclave's encryption key —
 * the `label_pubkey` of the attested `enclave_key` call — and against the
 * receipt it came in: the commitment is of this prompt, the answer hash of
 * this answer, the packs and the outcome the receipt's own.
 */

import { ed25519 } from '@noble/curves/ed25519';
import { fromBase64, fromHex, sha256Hex } from '../bytes';
import { LABEL_PREFIX, parseLabel, type LabelBody, type Receipt, type SignedLabel } from '../receipt';
import { check, fail, pass, short, type Step } from './types';

const utf8 = (s: string) => new TextEncoder().encode(s);

/** The signature alone: whether `signed` is what `labelPubkeyHex` signed. */
export function labelSignatureHolds(signed: SignedLabel, labelPubkeyHex: string): boolean {
  try {
    const message = new Uint8Array([...utf8(LABEL_PREFIX), ...utf8(signed.body)]);
    return ed25519.verify(fromBase64(signed.signature), message, fromHex(labelPubkeyHex));
  } catch {
    return false;
  }
}

/** Every check a gate makes of a label, with the receipt it came in. */
export function verifyLabel(receipt: Receipt, labelPubkeyHex: string | null): { label: LabelBody | null; steps: Step[] } {
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
}

export function gate(label: LabelBody | null, signatureOk: boolean, rule: GateRule): { accepted: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!label) return { accepted: false, reasons: ['no label'] };
  if (!signatureOk) reasons.push('the signature does not verify');
  if (label.outcome !== 'answered') reasons.push(`the outcome is ${label.outcome}, not answered`);
  if (rule.org && label.org !== rule.org) reasons.push(`the organisation is ${label.org ?? 'none (personal mode)'}, not ${rule.org}`);
  for (const required of rule.packs) {
    const applied = label.packs.find((p) => `${p.id}@${p.version}` === required);
    if (!applied) reasons.push(`${required} was not applied`);
    else if (applied.verdict !== 'passed') reasons.push(`${required} did not pass (${applied.verdict})`);
  }
  if (label.fired.some((f) => f.action === 'escalate') && !label.approval) reasons.push('an escalation without an approval');
  return { accepted: reasons.length === 0, reasons };
}

export { pass };
