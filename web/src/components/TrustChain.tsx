import type { ProofGroup, Verdict } from '../lib/verify/types';
import { Chip, Lock, Shield, VerdictIcon } from './Icons';

interface Node {
  key: string;
  title: string;
  caption: string;
  icon: JSX.Element;
  verdict: Verdict;
}

/**
 * The path a prompt took, left to right, each hop with the verdict of the
 * proof that covers it.
 */
export function TrustChain({ proofs, outcome }: { proofs: ProofGroup[]; outcome: 'answered' | 'blocked' | 'escalated' }) {
  const blocked = outcome !== 'answered';
  const verdict = (id: string): Verdict => {
    const matching = proofs.filter((p) => p.id.startsWith(id));
    return matching.length ? (matching.some((p) => p.verdict === 'fail') ? 'fail' : matching.some((p) => p.verdict === 'warn') ? 'warn' : 'pass') : 'skip';
  };
  const screened = proofs.some((p) => p.id.startsWith('model-screening'));

  const nodes: Node[] = [
    { key: 'browser', title: 'Your browser', caption: 'sealed to a pinned key', icon: <Lock />, verdict: verdict('enclave-key') },
    { key: 'outlayer', title: 'OutLayer enclave', caption: 'Intel TDX worker', icon: <Shield />, verdict: verdict('outlayer-run') },
  ];
  if (screened) {
    nodes.push({
      key: 'screen',
      title: 'Policy packs',
      caption: outcome === 'blocked' ? 'blocked here' : outcome === 'escalated' ? 'held for an officer' : 'passed',
      icon: <Chip />,
      verdict: verdict('model-screening'),
    });
  }
  nodes.push({
    key: 'model',
    title: 'Model TEE',
    caption: blocked ? (outcome === 'escalated' ? 'after the officer’s yes' : 'never reached') : 'Intel TDX + NVIDIA GPU',
    icon: <Chip />,
    verdict: blocked ? 'skip' : verdict('model-answer'),
  });
  nodes.push({ key: 'back', title: 'Back to you', caption: 'receipt sealed to your key · label signed', icon: <Lock />, verdict: verdict('label') });

  return (
    <div className="chain">
      {nodes.map((node, i) => (
        <div key={node.key} className="chain-item">
          <div className={`chain-node chain-${node.verdict}`}>
            <span className="chain-icon">{node.icon}</span>
            <span className="chain-mark">
              <VerdictIcon verdict={node.verdict} size={11} />
            </span>
          </div>
          <div className="chain-title">{node.title}</div>
          <div className="chain-caption">{node.caption}</div>
          {i < nodes.length - 1 && <div className="chain-link" />}
        </div>
      ))}
    </div>
  );
}
