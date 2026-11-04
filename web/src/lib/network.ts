export type NetworkId = 'testnet' | 'mainnet';

export interface Network {
  id: NetworkId;
  /** OutLayer's HTTPS API. */
  api: string;
  /** Public NEAR RPC, for the register contract's approved worker builds. */
  rpc: string;
  /** The contract holding approved OutLayer worker measurements. */
  registry: string;
}

export const NETWORKS: Record<NetworkId, Network> = {
  testnet: {
    id: 'testnet',
    api: 'https://testnet-api.outlayer.ai',
    rpc: 'https://rpc.testnet.fastnear.com',
    registry: 'worker.outlayer.testnet',
  },
  mainnet: {
    id: 'mainnet',
    api: 'https://api.outlayer.ai',
    rpc: 'https://rpc.mainnet.fastnear.com',
    registry: 'worker.outlayer.near',
  },
};

export const NEAR_AI = 'https://cloud-api.near.ai';
export const NVIDIA_JWKS = 'https://nras.attestation.nvidia.com/.well-known/jwks.json';

/** OutLayer attestations commit to the extended field set from this instant on. */
export const ATTESTATION_V1_FROM = 1769784939;

/**
 * Build-time defaults that fill the settings form; the visitor can change any
 * of them. The payment key is only ever built in sealed (`lib/sealedKey.ts`):
 * the link that opens the page carries the key that unseals it.
 */
export const DEFAULT_NETWORK: NetworkId = import.meta.env.VITE_OUTLAYER_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
export const DEFAULT_PROJECT: string = import.meta.env.VITE_PROJECT_ID ?? '';
export const DEFAULT_SECRETS_PROFILE: string = import.meta.env.VITE_SECRETS_PROFILE ?? 'default';
export const SEALED_PAYMENT_KEY: string = import.meta.env.VITE_PAYMENT_KEY_SEALED ?? '';

/**
 * The secret rows a call names, `owner/profile` joined with `,`: the
 * company's row (the NEAR AI key and `COMPLIANCE_CONFIG`) and the officers'
 * rows. Empty: the visitor's own row, named by the payment key's owner and
 * the profile above — personal mode.
 */
export const DEFAULT_ROWS: string = import.meta.env.VITE_SECRETS_ROWS ?? '';
/** Personal mode on the page: `VITE_DEMO_MODE=0` hides it, and the page runs on the company's rows only. */
export const DEMO_MODE: boolean = import.meta.env.VITE_DEMO_MODE !== '0';
