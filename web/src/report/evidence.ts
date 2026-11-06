/**
 * The evidence folder served beside the report, read the way `demo/verify.ts`
 * reads it: the report states only what these files say, and re-checks them in
 * the reader's browser on request.
 */
import { NETWORKS } from '../lib/network';
import type { AttestationRecord } from '../lib/outlayer';
import { parseLabel, type LabelBody, type SealedOutput, type SignedLabel } from '../lib/receipt';
import { verifyRun } from '../lib/session';
import { callerSignatureHolds, gate, labelSignatureHolds } from '../lib/verify/label';
import { verifyPackOnChain } from '../lib/verify/model';
import { verifyOutlayerRun } from '../lib/verify/outlayer';
import { overall, type ProofGroup } from '../lib/verify/types';

export const EVIDENCE = 'report/evidence';
const network = NETWORKS.testnet;

const json = async <T,>(path: string): Promise<T> => {
  const response = await fetch(`${EVIDENCE}/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};

export interface People {
  org: string;
  org_name: string;
  project: string;
  tee_project: string;
  company: { account: string; position: string; label_key: string };
  tee_company: { label_key: string; caller_key: string };
  employees: Record<string, { position: string; caller_key: string; pinned_from: string }>;
  officers: Record<string, { position: string; takes: string }>;
  outsider: { account: string; position: string };
}

export const loadPeople = () => json<People>('people.json');

export interface SceneFacts {
  dir: string;
  attestation: AttestationRecord;
  label: LabelBody;
  companySignature: boolean;
  employeeSignature: boolean;
  gate: { accepted: boolean; reasons: string[] };
}

/** The keys a run's label is held to: the company's second project has its own. */
function keysOf(people: People, label: LabelBody) {
  const inTee = label.project === people.tee_project;
  return {
    inTee,
    labelKey: inTee ? people.tee_company.label_key : people.company.label_key,
    callerKey: inTee ? people.tee_company.caller_key : (people.employees[label.caller ?? '']?.caller_key ?? ''),
  };
}

export async function loadScene(dir: string, people: People): Promise<SceneFacts> {
  const [attestation, signed] = await Promise.all([json<AttestationRecord>(`${dir}/attestation.json`), json<SignedLabel>(`${dir}/label.json`)]);
  const label = parseLabel(signed.body);
  const { inTee, labelKey, callerKey } = keysOf(people, label);
  const companySignature = labelSignatureHolds(signed, labelKey);
  const employees = inTee ? { [label.caller ?? '']: callerKey } : Object.fromEntries(Object.entries(people.employees).map(([account, e]) => [account, e.caller_key]));
  return {
    dir,
    attestation,
    label,
    companySignature,
    employeeSignature: !!callerKey && callerSignatureHolds(signed, callerKey),
    gate: gate(label, companySignature, { org: people.org, packs: label.packs.map((p) => `${p.id}@${p.version}`), officers: Object.keys(people.officers), employees }, signed),
  };
}

const pinOf = (people: People, label: LabelBody) => (label.project === people.tee_project ? 'pins/tee' : (people.employees[label.caller ?? '']?.pinned_from ?? ''));

async function pinProof(dir: string): Promise<ProofGroup> {
  const [attestation, input, output] = await Promise.all([json<AttestationRecord>(`${dir}/attestation.json`), json<{ input: unknown }>(`${dir}/input.json`), json<unknown>(`${dir}/output.json`)]);
  return verifyOutlayerRun(network, attestation, input.input, output, { id: 'enclave-key', title: 'Where the keys come from: the attested enclave_key call' });
}

/** A step's whole proof, recomputed here from the files: the keys' own call, the run, the packs, the models, the label. */
export async function recheckScene(facts: SceneFacts, people: People): Promise<ProofGroup[]> {
  const [input, output, receipt] = await Promise.all([
    json<{ input: unknown }>(`${facts.dir}/input.json`),
    json<SealedOutput>(`${facts.dir}/output.json`),
    fetch(`${EVIDENCE}/${facts.dir}/receipt.json`).then((r) => r.arrayBuffer()),
  ]);
  const { labelKey, callerKey } = keysOf(people, facts.label);
  const { proofs } = await verifyRun(network, {
    callId: facts.attestation.call_id ?? '',
    attestation: facts.attestation,
    input: input.input,
    output,
    receiptBytes: new Uint8Array(receipt),
    approvedTask: facts.label.approval?.task_id,
    labelPubkey: labelKey,
    callerPubkey: callerKey,
  });
  return [await pinProof(pinOf(people, facts.label)), ...proofs];
}

export interface PolicyPack {
  sha256: string;
  registry: string;
  block_height: number;
  publisher: string;
  pack: { id: string; version: number; title: string | null; model: string; rules: { id: string; cite?: string; action: string; threshold: number; question: string }[] };
}
export interface PolicyFacts {
  attestation: AttestationRecord;
  output: { org: string; config_sha256: string; registry: string; config: { org_name?: string; escalate?: Record<string, string>; models?: string[] }; packs: PolicyPack[] };
  input: unknown;
}

export async function loadPolicy(dir: string): Promise<PolicyFacts> {
  const [attestation, output, input] = await Promise.all([json<AttestationRecord>(`${dir}/attestation.json`), json<PolicyFacts['output']>(`${dir}/output.json`), json<{ input: unknown }>(`${dir}/input.json`)]);
  return { attestation, output, input: input.input };
}

export async function recheckPolicy(policy: PolicyFacts): Promise<ProofGroup[]> {
  const run = await verifyOutlayerRun(network, policy.attestation, policy.input, policy.output, { id: 'org-policy', title: 'Whose rules apply: the attested org_policy call' });
  const steps = await Promise.all(policy.output.packs.map((p) => verifyPackOnChain(network.rpc, { id: p.pack.id, version: p.pack.version, sha256: p.sha256, registry: p.registry })));
  return [run, { id: 'packs', title: 'The packs on NEAR', subtitle: `${policy.output.registry}, read now`, verdict: overall(steps), steps, facts: [], raw: policy.output.packs.map((p) => ({ id: p.pack.id, version: p.pack.version, sha256: p.sha256 })) }];
}

export interface LedgerRow {
  scene: string;
  title: string;
  who: string;
  position: string;
  outcome: string;
  rules: string;
  approved_by: string;
  company_signature: string;
  employee_signature: string;
  receipt_matches: string;
  attestation: string;
  company_gate: string;
  why: string;
}

/** `ledger.csv` as `demo/verify.ts` writes it: every field quoted. */
export async function loadLedger(): Promise<LedgerRow[]> {
  const text = await fetch(`${EVIDENCE}/ledger.csv`).then((r) => r.text());
  const [head, ...rows] = text.trim().split('\n').map((line) => (line.startsWith('"') ? [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replaceAll('""', '"')) : line.split(',')));
  return rows.map((cells) => Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ''])) as unknown as LedgerRow);
}

export interface OfficerTask {
  id: string;
  asked_by: string;
  fields: { label: string; values: string[]; written_by: string }[];
}
export const loadOfficerTask = (dir: string) => json<OfficerTask>(`${dir}/officer-task.json`);
