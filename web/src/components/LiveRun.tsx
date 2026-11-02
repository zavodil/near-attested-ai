import { useEffect, useState } from 'react';
import type { Stage } from '../lib/session';
import { Chip, Lock, Shield } from './Icons';

interface Props {
  stage: Stage;
  /** The latest status the stage reported: the coordinator's call status, or what is being verified. */
  note?: string;
  startedAt: number;
  model: string;
  screening: { model: string; rules: number } | null;
}

interface Node {
  key: string;
  label: string;
  icon: JSX.Element;
}

/**
 * What is happening right now, while the page waits: where the request is,
 * what each side is doing, and how long it has taken.
 *
 * Inside the enclave nothing is streamed back — the run answers once, sealed.
 * So the enclave's part is shown as what it does, in order, not as progress
 * this page cannot see.
 */
export function LiveRun({ stage, note, startedAt, model, screening }: Props) {
  const elapsed = useElapsed(startedAt);
  const nodes: Node[] = [
    { key: 'browser', label: 'Your browser', icon: <Lock size={15} /> },
    { key: 'outlayer', label: 'OutLayer enclave', icon: <Shield size={15} /> },
    ...(screening ? [{ key: 'screen', label: 'Policy model', icon: <Chip size={15} /> }] : []),
    { key: 'model', label: 'Model TEE', icon: <Chip size={15} /> },
  ];
  const at = (key: string) => (nodes.findIndex((n) => n.key === key) / (nodes.length - 1)) * 100;
  const [from, to] = travel(stage, at);
  const story = describe(stage, note, model, screening);

  return (
    <section className="live card">
      <div className="live-track">
        <div className="live-rail" />
        {nodes.map((node) => (
          <div key={node.key} className="live-node" style={{ left: `${at(node.key)}%` }}>
            <span className="live-node-icon">{node.icon}</span>
            <span className="live-node-label">{node.label}</span>
          </div>
        ))}
        <span
          key={stage}
          className={`live-packet ${from === to ? 'resting' : 'moving'}`}
          style={{ ['--from' as string]: `${from}%`, ['--to' as string]: `${to}%` }}
        />
      </div>

      <div className="live-now">
        <div>
          <h3>{story.title}</h3>
          <p>{story.detail}</p>
        </div>
        <span className="live-clock">{elapsed.toFixed(0)} s</span>
      </div>

      {story.steps && (
        <ol className="live-steps">
          {story.steps.map((step, i) => (
            <li key={step} style={{ animationDelay: `${i * 0.35}s` }}>
              {step}
            </li>
          ))}
        </ol>
      )}
      {story.footnote && <p className="live-footnote">{story.footnote}</p>}
    </section>
  );
}

/** Where the packet travels during a stage, as percentages along the rail. */
function travel(stage: Stage, at: (key: string) => number): [number, number] {
  switch (stage) {
    case 'pin':
      return [at('browser'), at('outlayer')];
    case 'seal':
      return [at('browser'), at('browser')];
    case 'run':
      return [at('outlayer'), at('model')];
    case 'open':
    case 'verify':
      return [at('browser'), at('browser')];
  }
}

function describe(
  stage: Stage,
  note: string | undefined,
  model: string,
  screening: Props['screening'],
): { title: string; detail: string; steps?: string[]; footnote?: string } {
  switch (stage) {
    case 'pin':
      return {
        title: 'Pinning the enclave’s key',
        detail:
          note === 'verifying'
            ? 'The project answered with its key. Checking that run’s Intel TDX quote here, before anything is encrypted to it.'
            : `Asking the project for the key only its enclave holds — ${callStatus(note)}.`,
      };
    case 'seal':
      return {
        title: 'Sealing your prompt',
        detail: 'Encrypting it in this tab to the pinned key. From here on, only that enclave can read it.',
      };
    case 'run':
      return {
        title: 'Inside the OutLayer enclave',
        detail: `The coordinator relays ciphertext it cannot open — ${callStatus(note)}.`,
        steps: [
          'Open the request with the enclave’s own key',
          ...(screening
            ? [`Ask ${screening.model} the ${screening.rules} policy question${screening.rules === 1 ? '' : 's'} about the prompt`]
            : []),
          `${screening ? 'If no rule fires: ask' : 'Ask'} NEAR AI for ${model}’s attestation, bound to this exact request`,
          `${model} writes the answer inside an Intel TDX + NVIDIA TEE`,
          'Fetch Intel’s collateral and verify the model’s quote',
          'Send the GPU evidence to NVIDIA for a signed verdict',
          'Check the answer’s signature, seal the receipt to your key',
        ],
        footnote: 'The enclave answers once, sealed — this is what it does, in order. The answer usually takes the longest.',
      };
    case 'open':
      return {
        title: 'Opening the receipt',
        detail: 'Decrypting it with the key that exists only in this tab.',
      };
    case 'verify':
      return {
        title: 'Verifying every proof here',
        detail: note ?? 'Re-checking every claim the receipt makes, in this browser.',
      };
  }
}

/** OutLayer keeps an HTTPS call `pending` until it has an answer, queued or running alike. */
function callStatus(note: string | undefined): string {
  return note === 'pending' ? 'waiting for the enclave’s sealed answer' : 'sending';
}

function useElapsed(since: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, (now - since) / 1000);
}
