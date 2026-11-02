/**
 * OutLayer's HTTPS API, as this page uses it: run the project, wait for the
 * result, fetch the TDX attestation of that exact run.
 *
 * Calls go out async and are polled: a run that talks to NEAR AI, Intel and
 * NVIDIA can outlast what a proxy holds a request open for.
 */

import type { Network } from './network';

export interface CallResult {
  callId: string;
  /** The project's output exactly as the API returned it. */
  output: unknown;
  timeMs?: number;
}

export interface AttestationRecord {
  task_id: number;
  task_type: string;
  tdx_quote: string;
  worker_measurement: string;
  call_id?: string;
  caller_account_id?: string;
  payment_key_owner?: string;
  repo_url?: string;
  commit_hash?: string;
  build_target?: string;
  wasm_hash?: string;
  input_hash?: string;
  output_hash: string;
  block_height?: number;
  project_id?: string;
  secrets_ref?: string;
  attached_usd?: string;
  timestamp: number;
}

const POLL_EVERY_MS = 1500;
const CALL_DEADLINE_MS = 200_000;
const ATTESTATION_DEADLINE_MS = 30_000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A payment key reads `owner:nonce:secret`; the owner is who the run is for. */
export function paymentKeyOwner(key: string): string | null {
  const parts = key.trim().split(':');
  return parts.length >= 3 && parts[0] && /^\d+$/.test(parts[1]) ? parts[0] : null;
}

/** A stored secret row the run decrypts into its environment: `{owner, profile}` under this project. */
export interface SecretsRef {
  account_id: string;
  profile: string;
}

export async function runProject(
  network: Network,
  projectId: string,
  paymentKey: string,
  input: unknown,
  secretsRef: SecretsRef | null,
  onStatus?: (status: string) => void,
): Promise<CallResult> {
  const [owner, name] = projectId.split('/');
  const headers = { 'Content-Type': 'application/json', 'X-Payment-Key': paymentKey.trim() };
  const started = await fetch(`${network.api}/call/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input,
      async: true,
      resource_limits: { max_execution_seconds: 150 },
      ...(secretsRef ? { secrets_ref: secretsRef } : {}),
    }),
  });
  const first = await readJson(started);
  if (!started.ok || first.error) throw new Error(describe(first, started.status));

  const callId: string = first.call_id;
  const deadline = Date.now() + CALL_DEADLINE_MS;
  let answer = first;
  while (answer.status !== 'completed' && answer.status !== 'failed') {
    if (Date.now() > deadline) throw new Error(`call ${callId} is still ${answer.status} after ${CALL_DEADLINE_MS / 1000} s`);
    onStatus?.(answer.status);
    await wait(POLL_EVERY_MS);
    const polled = await fetch(`${network.api}/calls/${callId}`, { headers: { 'X-Payment-Key': paymentKey.trim() } });
    answer = await readJson(polled);
    if (!polled.ok) throw new Error(describe(answer, polled.status));
  }
  if (answer.status === 'failed') throw new Error(answer.error || `call ${callId} failed`);
  return { callId, output: answer.output, timeMs: answer.time_ms };
}

/** The attestation the worker uploads once the run has finished. */
export async function fetchAttestation(network: Network, callId: string): Promise<AttestationRecord> {
  const deadline = Date.now() + ATTESTATION_DEADLINE_MS;
  for (;;) {
    const response = await fetch(`${network.api}/attestations/by-call/${callId}`);
    if (response.ok) return response.json();
    if (response.status !== 404 || Date.now() > deadline) {
      throw new Error(`no attestation for call ${callId} (HTTP ${response.status})`);
    }
    await wait(POLL_EVERY_MS);
  }
}

/** Intel collateral OutLayer archives for its own worker platforms, as of `at`. */
export async function fetchCollateral(network: Network, fmspc: string, at: number): Promise<string> {
  const response = await fetch(`${network.api}/public/collateral?fmspc=${encodeURIComponent(fmspc)}&at=${at}`);
  if (!response.ok) throw new Error(`no collateral for platform ${fmspc} (HTTP ${response.status})`);
  return (await response.json()).collateral;
}

/** Whether the register contract lists these worker measurements as an approved build. */
export async function measurementsApproved(network: Network, measurements: object): Promise<boolean> {
  const response = await fetch(network.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'attested-ai',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: network.registry,
        method_name: 'is_measurements_approved',
        args_base64: btoa(JSON.stringify({ measurements })),
      },
    }),
  });
  const json = await response.json();
  if (json.error || json.result?.error) throw new Error(`RPC: ${JSON.stringify(json.error ?? json.result.error).slice(0, 200)}`);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(json.result.result))) === true;
}

async function readJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return { error: `HTTP ${response.status} with a body that is not JSON` };
  }
}

function describe(body: any, status: number): string {
  return body?.error ?? body?.message ?? `HTTP ${status}`;
}
