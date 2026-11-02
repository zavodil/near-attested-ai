/** The receipt the enclave seals back — the Rust structs in `module/src`, as JSON. */

export const RECEIPT_FORMAT = 'outlayer-attested-ai-receipt/1';

export interface Rule {
  id: string;
  question: string;
  /** Blocks when P(yes) × 100 ≥ this. */
  block_at: number;
}

export interface Policy {
  model: string;
  rules: Rule[];
}

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

export interface Screening {
  policy: Policy;
  policy_sha256: string;
  outcomes: { id: string; p_yes: number; tripped: boolean }[];
  verdict: 'passed' | 'blocked';
  call: ModelCall;
}

export interface Receipt {
  format: string;
  issued_at: number;
  salt: string;
  call_id: string | null;
  caller: string | null;
  prompt: string;
  outcome: 'answered' | 'blocked';
  screening: Screening | null;
  answer: { text: string; call: ModelCall } | null;
}

/** What the enclave leaves outside: the only thing the coordinator stores. */
export interface SealedOutput {
  receipt_digest: string;
  sealed: string;
}

export function parseReceipt(bytes: Uint8Array): Receipt {
  const receipt = JSON.parse(new TextDecoder().decode(bytes)) as Receipt;
  if (receipt.format !== RECEIPT_FORMAT) throw new Error(`not a receipt this page reads (${receipt.format})`);
  return receipt;
}
