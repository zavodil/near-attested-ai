/**
 * NEAR AI's catalogue, split the way this page uses it. Which models really
 * run in a NEAR-operated TEE is decided by the enclave, from the attestation
 * endpoint, at the moment of the call; the lists here are only suggestions.
 */

import { NEAR_AI } from './network';

export interface CatalogueModel {
  id: string;
  name: string;
  owner: string;
  inputPrice: number;
  outputPrice: number;
  context: number;
}

export interface Catalogue {
  /** Chat models NEAR AI serves itself (owned_by "nearai"): the TEE candidates. */
  answering: CatalogueModel[];
  /** Decision models (`/v1/systemone`). */
  screening: CatalogueModel[];
}

const NOT_CHAT = /embedding|reranker|whisper|privacy-filter|flux|abliterated/i;

export async function loadCatalogue(): Promise<Catalogue> {
  const response = await fetch(`${NEAR_AI}/v1/models`);
  if (!response.ok) throw new Error(`NEAR AI's model list is unavailable (HTTP ${response.status})`);
  const { data } = (await response.json()) as { data: any[] };
  const model = (m: any): CatalogueModel => ({
    id: m.id,
    name: m.name ?? m.id,
    owner: m.owned_by,
    inputPrice: Number(m.pricing?.input ?? 0),
    outputPrice: Number(m.pricing?.output ?? 0),
    context: Number(m.context_length ?? 0),
  });
  const outputs = (m: any): string[] => m.output_modalities ?? m.architecture?.outputModalities ?? [];
  return {
    answering: data
      .filter((m) => m.owned_by === 'nearai' && outputs(m).includes('text') && !NOT_CHAT.test(m.id))
      .map(model)
      .sort((a, b) => a.outputPrice - b.outputPrice),
    screening: data.filter((m) => outputs(m).includes('decisions')).map(model),
  };
}
