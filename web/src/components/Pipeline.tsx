import type { Stage } from '../lib/session';
import { Spinner, VerdictIcon } from './Icons';

const STAGES: { stage: Stage; label: string; caption: string }[] = [
  { stage: 'pin', label: 'Pin', caption: 'verify the enclave’s key' },
  { stage: 'seal', label: 'Seal', caption: 'encrypt to that key' },
  { stage: 'run', label: 'Run', caption: 'read the packs · screen · answer · gather evidence' },
  { stage: 'await', label: 'Officer', caption: 'an escalation waits for a yes' },
  { stage: 'open', label: 'Open', caption: 'decrypt the receipt here' },
  { stage: 'verify', label: 'Verify', caption: 'check every proof in this browser' },
];

export function Pipeline({ current, failed, done, escalated }: { current: Stage | null; failed: boolean; done: boolean; escalated: boolean }) {
  const stages = escalated || current === 'await' ? STAGES : STAGES.filter((s) => s.stage !== 'await');
  const index = current ? stages.findIndex((s) => s.stage === current) : -1;
  return (
    <ol className="pipeline">
      {stages.map((s, i) => {
        const state = done || i < index ? 'done' : i === index ? (failed ? 'failed' : 'active') : 'todo';
        return (
          <li key={s.stage} className={`pipe pipe-${state}`}>
            <span className="pipe-dot">
              {state === 'done' && <VerdictIcon verdict="pass" size={12} />}
              {state === 'active' && <Spinner size={12} />}
              {state === 'failed' && <VerdictIcon verdict="fail" size={12} />}
            </span>
            <span className="pipe-label">{s.label}</span>
            <span className="pipe-caption">{s.caption}</span>
          </li>
        );
      })}
    </ol>
  );
}
