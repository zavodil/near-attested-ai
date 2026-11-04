import { percent } from '../lib/format';
import type { Screening } from '../lib/receipt';

/**
 * Every pack, and each rule of it as a bar: the decision model's P(yes) as
 * the fill, the rule's threshold as a marker, coloured by what firing does.
 */
export function PolicyBars({ screening, compact = false }: { screening: Screening; compact?: boolean }) {
  return (
    <div className={`policy-packs ${compact ? 'compact' : ''}`}>
      {screening.packs.map((pack) => (
        <section key={`${pack.id}@${pack.version}`} className={`policy-pack pack-${pack.verdict}`}>
          <header>
            <span className="pack-title">{pack.title ?? pack.id}</span>
            <span className="pack-sub mono">
              {pack.id}@{pack.version} · {pack.registry} · block {pack.block_height}
            </span>
            <span className={`policy-pill ${pack.verdict === 'passed' ? 'passed' : pack.verdict === 'blocked' ? 'fired' : 'escalate'}`}>{pack.verdict}</span>
          </header>
          <ul className="policy-bars">
            {pack.outcomes.map((o) => (
              <li key={o.id} className={o.tripped ? (o.action === 'block' ? 'fired' : 'escalated') : 'passed'}>
                <div className="policy-rule">
                  <span className="policy-id mono">
                    {o.id}
                    {o.cite && <em> {o.cite}</em>}
                  </span>
                  {!compact && <span className="policy-question">{o.question}</span>}
                </div>
                <div className="policy-meter">
                  <div className="policy-track">
                    <div className="policy-fill" style={{ width: `${Math.max(o.p_yes * 100, 1.5)}%` }} />
                    <div className="policy-threshold" style={{ left: `${o.threshold}%` }} title={`${o.action}s at ${o.threshold}%`} />
                  </div>
                  <div className="policy-figures">
                    <strong>{percent(o.p_yes)}</strong>
                    <span>
                      {o.action}s at {o.threshold}%
                    </span>
                    <span className={`policy-pill ${o.tripped ? (o.action === 'block' ? 'fired' : 'escalate') : 'passed'}`}>
                      {o.tripped ? (o.action === 'block' ? 'Blocked' : 'Escalated') : 'Passed'}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
