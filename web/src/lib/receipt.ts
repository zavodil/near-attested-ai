/** The receipt the enclave seals back — the Rust structs in `module/src`, as JSON. */

export const RECEIPT_FORMAT = 'outlayer-attested-ai-receipt/1';
export const LABEL_FORMAT = 'outlayer-attested-ai-label/1';
/** What the label's signature is over: this prefix, then the label's JSON bytes. */
export const LABEL_PREFIX = 'outlayer-attested-ai-label/1\n';

export type Action = 'block' | 'escalate';
export type Verdict = 'passed' | 'escalated' | 'blocked';

export interface ResponseSignature {
  text: string;
  signature: string;
  signing_address: string;
  signing_algo: string;
  signature_kind?: string | null;
}

export interface ModelAttestation {
  model_name: string;
  signing_address: string;
  signing_algo: string;
  request_nonce: string;
  intel_quote: string;
  nvidia_payload: string;
  info: Record<string, unknown> | null;
}

export interface QuoteCheck {
  ok: boolean;
  tcb_status: string | null;
  advisory_ids: string[];
  report_data: string | null;
  error: string | null;
}

export interface Check {
  ok: boolean;
  error: string | null;
}

export interface GpuCheck {
  ok: boolean;
  nonce: string | null;
  token: string | null;
  error: string | null;
}

export interface Evidence {
  attestation: ModelAttestation;
  collateral: Record<string, string> | null;
  collateral_error: string | null;
  checks: { quote: QuoteCheck; binding: Check; gpu: GpuCheck; signature: Check };
}

export type TeeRecord = ({ status: 'attested' } & Evidence) | { status: 'not_attested'; reason: string };

export interface ModelCall {
  model: string;
  request_body: string;
  response_body: string;
  request_sha256: string;
  response_sha256: string;
  signature: ResponseSignature | null;
  signature_error: string | null;
  tee: TeeRecord;
}

/** One rule's decision, with the rule as the pack states it. */
export interface RuleOutcome {
  id: string;
  cite?: string;
  question: string;
  threshold: number;
  action: Action;
  p_yes: number;
  tripped: boolean;
}

/** One pack screened: the pack as the registry held it, and every rule's decision. */
export interface PackScreening {
  id: string;
  version: number;
  title: string | null;
  model: string;
  /** sha256 of the pack's bytes as the registry answered them. */
  sha256: string;
  registry: string;
  block_height: number;
  publisher: string;
  outcomes: RuleOutcome[];
  verdict: Verdict;
  call: ModelCall;
}

export interface Fired {
  pack: string;
  rule: string;
  cite?: string;
  action: Action;
  p_yes: number;
}

export interface Screening {
  packs: PackScreening[];
  verdict: Verdict;
  fired: Fired[];
}

export type Mode = { mode: 'personal' } | { mode: 'company'; org: string; config: CompanyConfig; config_sha256: string };

export interface CompanyConfig {
  org_name?: string;
  frameworks: string[];
  models?: string[];
  escalate: Record<string, string>;
  registry?: string;
}

export interface Approval {
  officer: string;
  public_key: string;
  at: number;
  task_id: string;
}

/** The label as signed: the exact bytes, and the signature with the key that made it. */
export interface SignedLabel {
  body: string;
  signature: string;
  public_key: string;
}

export interface PackApplied {
  id: string;
  version: number;
  sha256: string;
  registry: string;
  block_height: number;
  verdict: Verdict;
}

/** The label's body, parsed. */
export interface LabelBody {
  format: string;
  mode: 'personal' | 'company';
  org?: string;
  config_sha256?: string;
  project: string | null;
  caller: string | null;
  call_id: string | null;
  issued_at: number;
  outcome: 'answered' | 'blocked' | 'escalated';
  packs: PackApplied[];
  fired: Fired[];
  prompt_commitment: string;
  answer_sha256?: string;
  model?: string;
  model_attested: boolean;
  screening_attested: boolean;
  approval?: Approval;
}

export interface Receipt {
  format: string;
  issued_at: number;
  salt: string;
  call_id: string | null;
  caller: string | null;
  mode: Mode;
  prompt: string;
  outcome: 'answered' | 'blocked' | 'escalated';
  screening: Screening | null;
  answer: { text: string; call: ModelCall } | null;
  approval?: Approval;
  escalated_to?: string;
  label: SignedLabel;
}

/** What the enclave leaves outside: the only thing the coordinator stores. */
export interface SealedOutput {
  receipt_digest: string;
  sealed: string;
}

/** An `ask` whose prompt waits for an officer: the receipt of the screen, and where it waits. */
export interface EscalatedOutput extends SealedOutput {
  status: 'escalated';
  officer: string;
  task_id: string;
  task_hash: string;
}

export function parseReceipt(bytes: Uint8Array): Receipt {
  const receipt = JSON.parse(new TextDecoder().decode(bytes)) as Receipt;
  if (receipt.format !== RECEIPT_FORMAT) throw new Error(`not a receipt this page reads (${receipt.format})`);
  return receipt;
}

export function parseLabel(body: string): LabelBody {
  const label = JSON.parse(body) as LabelBody;
  if (label.format !== LABEL_FORMAT) throw new Error(`not a label this page reads (${label.format})`);
  return label;
}

/** The rules that fired, as one line each. */
export function describeFired(fired: Fired[]): string[] {
  return fired.map((f) => `${f.pack} · ${f.rule}${f.cite ? ` (${f.cite})` : ''} → ${f.action}`);
}
