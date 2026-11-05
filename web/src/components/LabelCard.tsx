import { useMemo, useState } from 'react';
import type { LabelBody, SignedLabel } from '../lib/receipt';
import { callerSignatureHolds, gate, labelSignatureHolds } from '../lib/verify/label';
import { short } from '../lib/verify/types';

/**
 * The signed label, and a gate to try it on: what a system that takes AI
 * output would check — nothing of the prompt, just the label's bytes, the
 * keys pinned from the attested enclave_key call, and what it requires. The
 * organisation it requires is the owner of the project this page pinned, never
 * what the label says.
 */
export function LabelCard({
  signed,
  label,
  labelPubkey,
  callerPubkey,
  projectId,
}: {
  signed: SignedLabel;
  label: LabelBody | null;
  labelPubkey: string | null;
  callerPubkey: string | null;
  projectId: string;
}) {
  const signatureOk = useMemo(() => (labelPubkey ? labelSignatureHolds(signed, labelPubkey) : false), [signed, labelPubkey]);
  const callerSignatureOk = useMemo(() => (callerPubkey ? callerSignatureHolds(signed, callerPubkey) : false), [signed, callerPubkey]);
  const company = projectId.split('/')[0] ?? '';
  const [requireOrg, setRequireOrg] = useState<boolean>(true);
  const [requireEmployee, setRequireEmployee] = useState<boolean>(true);
  const [requireTee, setRequireTee] = useState<boolean>(false);
  const [required, setRequired] = useState<string[]>(label?.packs.map((p) => `${p.id}@${p.version}`) ?? []);
  const employees = requireEmployee && label?.caller && callerPubkey ? { [label.caller]: callerPubkey } : requireEmployee ? {} : undefined;
  const verdict = gate(label, signatureOk, { org: requireOrg ? company : null, packs: required, screeningInTee: requireTee, employees }, signed);
  const copy = () => navigator.clipboard?.writeText(JSON.stringify({ label: signed, label_pubkey: labelPubkey, caller_pubkey: callerPubkey }, null, 2));

  const allPacks = label?.packs ?? [];
  return (
    <section className={`label card label-${verdict.accepted ? 'accepted' : 'refused'}`}>
      <header>
        <div>
          <h2>Signed label</h2>
          <p>
            Signed by the enclave with the pinned label key · ed25519 <span className="mono">{short(signed.public_key, 8)}</span>
            {signatureOk ? ' · signature verifies' : ' · signature does not verify'}
            {' · '}
            {label?.caller ?? 'the caller'}’s own key <span className="mono">{short(label?.caller_key ?? '', 8)}</span>
            {callerSignatureOk ? ' verifies' : ' does not verify'}
          </p>
        </div>
        <button className="secondary" onClick={copy}>
          Copy label
        </button>
      </header>

      {label && (
        <dl className="label-facts">
          <dt>Mode</dt>
          <dd>{label.mode === 'company' ? `company · ${label.org}` : 'personal · rules chosen by the caller'}</dd>
          <dt>Outcome</dt>
          <dd>{label.outcome}</dd>
          <dt>Packs</dt>
          <dd>{allPacks.length ? allPacks.map((p) => `${p.id}@${p.version} → ${p.verdict}`).join(' · ') : 'none'}</dd>
          {label.fired.length > 0 && (
            <>
              <dt>Fired</dt>
              <dd>{label.fired.map((f) => `${f.pack}/${f.rule}${f.cite ? ` (${f.cite})` : ''} → ${f.action}`).join(' · ')}</dd>
            </>
          )}
          {label.approval && (
            <>
              <dt>Approved by</dt>
              <dd>
                {label.approval.officer} · {new Date(label.approval.at * 1000).toLocaleString()} · task <span className="mono">{short(label.approval.task_id, 8)}</span>
              </dd>
            </>
          )}
          <dt>Prompt</dt>
          <dd>
            not in the label · commitment <span className="mono">{short(label.prompt_commitment, 8)}</span>
          </dd>
          <dt>Model</dt>
          <dd>
            {label.model ?? '—'} · {label.model_attested ? 'attested' : 'not attested'} · screening {label.screening_attested ? 'attested' : 'not attested'}
          </dd>
        </dl>
      )}

      <div className="gate">
        <h3>Try a gate</h3>
        <p className="gate-lede">A downstream system accepts this answer only if the label shows:</p>
        <div className="gate-rules">
          <label className="gate-rule">
            <input type="checkbox" checked={requireOrg} onChange={(e) => setRequireOrg(e.target.checked)} />
            <span>
              the organisation is <strong>{company}</strong>
            </span>
          </label>
          <label className="gate-rule">
            <input type="checkbox" checked={requireEmployee} onChange={(e) => setRequireEmployee(e.target.checked)} />
            <span>
              signed with the key of <strong>{label?.caller ?? 'the caller'}</strong>, the employee this gate knows
            </span>
          </label>
          <label className="gate-rule">
            <input type="checkbox" checked={requireTee} onChange={(e) => setRequireTee(e.target.checked)} />
            <span>every decision model ran in a TEE</span>
          </label>
          {allPacks.map((p) => {
            const ref = `${p.id}@${p.version}`;
            return (
              <label key={ref} className="gate-rule">
                <input
                  type="checkbox"
                  checked={required.includes(ref)}
                  onChange={(e) => setRequired(e.target.checked ? [...required, ref] : required.filter((r) => r !== ref))}
                />
                <span>
                  <span className="mono">{ref}</span> passed{p.verdict === 'escalated' && label?.approval ? ', or an officer approved it' : ''}
                </span>
              </label>
            );
          })}
          <label className="gate-rule">
            <input type="checkbox" checked readOnly />
            <span>the outcome is “answered”, with an officer’s approval if a rule escalated</span>
          </label>
        </div>
        <div className={`gate-verdict ${verdict.accepted ? 'accepted' : 'refused'}`}>
          {verdict.accepted ? 'Accepted' : 'Refused'}
          {!verdict.accepted && <span> — {verdict.reasons.join('; ')}</span>}
        </div>
        <p className="gate-note">
          The gate needs the label’s bytes and the keys pinned from an attested <span className="mono">enclave_key</span> call. It never sees the
          prompt. An auditor asks the registry on NEAR for each pack’s hash, and OutLayer for the call’s attestation.
        </p>
      </div>
    </section>
  );
}
