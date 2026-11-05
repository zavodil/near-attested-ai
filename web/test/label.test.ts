import { ed25519 } from '@noble/curves/ed25519';
import { describe, expect, it } from 'vitest';
import { base64, hex, sha256Hex } from '../src/lib/bytes';
import { LABEL_PREFIX, type Receipt, type SignedLabel } from '../src/lib/receipt';
import { callerSignatureHolds, gate, labelSignatureHolds, verifyLabel } from '../src/lib/verify/label';

const utf8 = (s: string) => new TextEncoder().encode(s);

/** A label signed the way the enclave signs: ed25519 over the prefix and the exact body bytes. */
function signed(body: object, secret: Uint8Array, callerSecret: Uint8Array): SignedLabel {
  const text = JSON.stringify(body);
  const message = new Uint8Array([...utf8(LABEL_PREFIX), ...utf8(text)]);
  return {
    body: text,
    signature: base64(ed25519.sign(message, secret)),
    public_key: hex(ed25519.getPublicKey(secret)),
    caller_signature: base64(ed25519.sign(message, callerSecret)),
  };
}

const secret = new Uint8Array(32).map((_, i) => i + 1);
const callerSecret = new Uint8Array(32).map((_, i) => i + 101);
const callerKey = hex(ed25519.getPublicKey(callerSecret));
const salt = '00'.repeat(32);
const prompt = 'Rank these candidates';
const answer = 'I would not rank people this way.';

const label = {
  format: 'outlayer-attested-ai-label/1',
  mode: 'company',
  org: 'compliance.acme.testnet',
  config_sha256: 'c0'.repeat(32),
  project: 'zavodil2.testnet/compliance-gateway',
  caller: 'employee.testnet',
  caller_key: callerKey,
  call_id: 'call-1',
  issued_at: 1,
  outcome: 'answered',
  packs: [{ id: 'eu-ai-act/annex3', version: 1, sha256: 'ab'.repeat(32), registry: 'policies.testnet', block_height: 10, verdict: 'escalated' }],
  fired: [{ pack: 'eu-ai-act/annex3', rule: 'employment_decision', cite: 'Annex III(4)', action: 'escalate', p_yes: 0.97 }],
  prompt_commitment: sha256Hex(new Uint8Array([...new Uint8Array(32), ...utf8(prompt)])),
  answer_sha256: sha256Hex(utf8(answer)),
  model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
  model_attested: true,
  screening_attested: false,
  approval: { officer: 'hr.acme.testnet', public_key: 'ed25519:abc', at: 2, task_id: 'run-1-0' },
};

const receipt = {
  format: 'outlayer-attested-ai-receipt/1',
  issued_at: 1,
  salt,
  call_id: 'call-1',
  caller: 'employee.testnet',
  mode: { mode: 'company', org: 'compliance.acme.testnet', config: { frameworks: ['eu-ai-act/annex3@1'], escalate: {} }, config_sha256: 'c0'.repeat(32) },
  prompt,
  outcome: 'answered',
  screening: { packs: [{ id: 'eu-ai-act/annex3', version: 1, sha256: 'ab'.repeat(32) }], verdict: 'escalated', fired: label.fired },
  answer: { text: answer },
  approval: label.approval,
  label: signed(label, secret, callerSecret),
} as unknown as Receipt;

describe('the signed label', () => {
  const pubkey = hex(ed25519.getPublicKey(secret));

  it('verifies with the pinned key over the prefix and the exact bytes', () => {
    expect(labelSignatureHolds(receipt.label, pubkey)).toBe(true);
    expect(labelSignatureHolds({ ...receipt.label, body: receipt.label.body.replace('answered', 'blocked') }, pubkey)).toBe(false);
    expect(labelSignatureHolds(receipt.label, hex(ed25519.getPublicKey(new Uint8Array(32).fill(9))))).toBe(false);
  });

  it('is held to the receipt it came in', () => {
    const { label: parsed, steps } = verifyLabel(receipt, pubkey, callerKey);
    expect(parsed?.org).toBe('compliance.acme.testnet');
    expect(steps.every((s) => s.verdict === 'pass')).toBe(true);

    const other = { ...receipt, prompt: 'another prompt' } as Receipt;
    expect(verifyLabel(other, pubkey, callerKey).steps.find((s) => s.label === 'Commits to this prompt')?.verdict).toBe('fail');
    expect(verifyLabel(receipt, null, callerKey).steps[0].verdict).toBe('fail');
    const another = hex(ed25519.getPublicKey(new Uint8Array(32).fill(7)));
    expect(verifyLabel(receipt, pubkey, another).steps.find((s) => s.label === 'Signed by the caller’s own key')?.verdict).toBe('fail');
    expect(verifyLabel(receipt, pubkey, null).steps.find((s) => s.label === 'Signed by the caller’s own key')?.verdict).toBe('fail');
  });

  it('passes a gate that requires the organisation and the pack, and fails one that wants more', () => {
    const { label: parsed } = verifyLabel(receipt, pubkey, callerKey);
    expect(gate(parsed, true, { org: 'compliance.acme.testnet', packs: [] }).accepted).toBe(true);
    const approved = gate(parsed, true, { org: 'compliance.acme.testnet', packs: ['eu-ai-act/annex3@1'] });
    expect(approved.accepted).toBe(true);
    const waiting = gate({ ...parsed!, approval: undefined }, true, { org: 'compliance.acme.testnet', packs: ['eu-ai-act/annex3@1'] });
    expect(waiting.accepted).toBe(false);
    expect(waiting.reasons[0]).toContain('did not pass (escalated)');
    const blocked = { ...parsed!, packs: parsed!.packs.map((p) => ({ ...p, verdict: 'blocked' as const })) };
    expect(gate(blocked, true, { org: null, packs: ['eu-ai-act/annex3@1'] }).reasons[0]).toContain('did not pass (blocked)');
    expect(gate(parsed, true, { org: null, packs: [], officers: ['hr.acme.testnet'] }).accepted).toBe(true);
    expect(gate(parsed, true, { org: null, packs: [], officers: ['other.testnet'] }).reasons[0]).toContain('no officer this gate takes');
    expect(gate(parsed, true, { org: 'other.testnet', packs: [] }).reasons[0]).toContain('not other.testnet');
    expect(gate(parsed, false, { org: null, packs: [] }).reasons).toContain('the signature does not verify');
    const unapproved = { ...parsed!, approval: undefined };
    expect(gate(unapproved, true, { org: null, packs: [] }).reasons).toContain('an escalation without an approval');
  });

  it('tells employees apart by the signature, not by the field', () => {
    const { label: parsed } = verifyLabel(receipt, pubkey, callerKey);
    const rule = { org: null, packs: [] };
    const known = { 'employee.testnet': callerKey };
    expect(callerSignatureHolds(receipt.label, callerKey)).toBe(true);
    expect(gate(parsed, true, { ...rule, employees: known }, receipt.label).accepted).toBe(true);

    // Another employee's key, under this employee's name: the project's key
    // alone would have signed it, and the gate still refuses.
    const otherSecret = new Uint8Array(32).fill(5);
    const forged = signed(label, secret, otherSecret);
    expect(gate(parsed, true, { ...rule, employees: known }, forged).reasons[0]).toContain('not signed with employee.testnet');

    const claimed = { ...parsed!, caller: 'boss.testnet' };
    expect(gate(claimed, true, { ...rule, employees: known }, receipt.label).reasons[0]).toContain('no employee this gate knows');
    expect(gate(parsed, true, { ...rule, employees: known }).reasons[0]).toContain('not signed with');
  });

  it('refuses a screen outside a TEE when the gate asks for one', () => {
    const { label: parsed } = verifyLabel(receipt, pubkey, callerKey);
    expect(gate(parsed, true, { org: null, packs: [], screeningInTee: true }).reasons).toContain('a decision model ran outside a TEE');
    expect(gate({ ...parsed!, screening_attested: true }, true, { org: null, packs: [], screeningInTee: true }).accepted).toBe(true);
  });

  it('holds the label to where the receipt says the screen ran', () => {
    const packs = [{ id: 'eu-ai-act/annex3', version: 1, sha256: 'ab'.repeat(32), call: { tee: { status: 'attested' } } }];
    const inTee = { ...receipt, screening: { ...receipt.screening, packs } } as unknown as Receipt;
    const step = verifyLabel(inTee, pubkey, callerKey).steps.find((s) => s.label === 'States where the screen ran');
    expect(step?.verdict).toBe('fail');
  });
});
