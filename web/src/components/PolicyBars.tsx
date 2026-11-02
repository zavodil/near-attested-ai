import { percent } from '../lib/format';
import type { Screening } from '../lib/receipt';

/**
 * Each rule of the policy as a bar: the decision model's P(yes) as the fill,
 * the rule's threshold as a marker, red when the rule fired.
 */
export function PolicyBars({ screening, compact = false }: { screening: Screening; compact?: boolean }) {
  return (
    <ul className={`policy-bars ${compact ? 'compact' : ''}`}>
      {screening.policy.rules.map((rule) => {
        const outcome = screening.outcomes.find((o) => o.id === rule.id);
        const p = outcome?.p_yes ?? 0;
        const fired = outcome?.tripped ?? false;
        return (
          <li key={rule.id} className={fired ? 'fired' : 'passed'}>
            <div className="policy-rule">
              <span className="policy-id mono">{rule.id}</span>
              {!compact && <span className="policy-question">{rule.question}</span>}
            </div>
            <div className="policy-meter">
              <div className="policy-track">
                <div className="policy-fill" style={{ width: `${Math.max(p * 100, 1.5)}%` }} />
                <div className="policy-threshold" style={{ left: `${rule.block_at}%` }} title={`blocks at ${rule.block_at}%`} />
              </div>
              <div className="policy-figures">
                <strong>{percent(p)}</strong>
                <span>blocks at {rule.block_at}%</span>
                <span className={`policy-pill ${fired ? 'fired' : 'passed'}`}>{fired ? 'Blocked' : 'Passed'}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
