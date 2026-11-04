import type { OrgPolicy as Policy } from '../lib/session';
import { Badge } from './Icons';

/**
 * Whose rules this call runs under, as the enclave says — read from the
 * rows the call names, attested like every answer.
 */
export function OrgPolicyCard({ policy }: { policy: Policy }) {
  if (policy.mode === 'personal') {
    return (
      <section className="orgpolicy card personal">
        <Badge verdict={policy.proof.verdict} size={16} />
        <div>
          <h3>Personal mode</h3>
          <p>
            Your rows hold a NEAR AI key and no company configuration: you choose the packs, and every label says <span className="mono">mode: personal</span>.
            A company’s gate refuses such an answer.
          </p>
        </div>
      </section>
    );
  }
  const officers = Object.entries(policy.config.escalate);
  return (
    <section className="orgpolicy card company">
      <Badge verdict={policy.proof.verdict} size={16} />
      <div>
        <h3>{policy.config.org_name ?? policy.org} applies its rules</h3>
        <p>
          Set by <span className="mono">{policy.org}</span> in its row · configuration <span className="mono">{policy.config_sha256.slice(0, 12)}…</span> · packs
          read from <span className="mono">{policy.registry}</span>
        </p>
        <ul className="orgpolicy-list">
          {policy.packs.map((p) => (
            <li key={`${p.pack.id}@${p.pack.version}`}>
              <strong>{p.pack.title ?? p.pack.id}</strong> <span className="mono">{p.pack.id}@{p.pack.version}</span> · {p.pack.rules.length} rule
              {p.pack.rules.length === 1 ? '' : 's'} · published by {p.publisher}
            </li>
          ))}
        </ul>
        {officers.length > 0 && (
          <p className="orgpolicy-officers">
            Escalations go to: {officers.map(([rule, officer]) => `${rule} → ${officer}`).join(' · ')}
          </p>
        )}
        {policy.config.models && <p className="orgpolicy-officers">Allowed models: {policy.config.models.join(', ')}</p>}
      </div>
    </section>
  );
}
