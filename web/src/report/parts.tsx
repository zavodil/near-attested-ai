import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ProofCard } from '../components/ProofCard';
import { message, overall, short, type ProofGroup, type Verdict } from '../lib/verify/types';
import { EVIDENCE, loadOfficerTask, loadScene, readable, recheckPolicy, recheckScene, type OfficerTask, type People, type PolicyFacts, type SceneFacts } from './evidence';

export const REPO = 'https://github.com/zavodil/near-attested-ai';
export const API = 'https://testnet-api.outlayer.ai';
export const REGISTRY = 'policies.zavodil.testnet';

export const when = (seconds: number) => `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
export function Shots({ shots }: { shots: [string, string][] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<[string, string] | null>(null);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
  return (
    <div className="shots">
      {shots.map((shot) => (
        <figure key={shot[0]}>
          <a
            href={`report/shots/${shot[0]}.jpg`}
            onClick={(e) => {
              // A modified click keeps its meaning: a new tab, a new window.
              if (e.metaKey || e.ctrlKey || e.shiftKey) return;
              e.preventDefault();
              setOpen(shot);
            }}
          >
            <img src={`report/shots/${shot[0]}.jpg`} alt={shot[1]} width={985} height={813} loading="lazy" />
          </a>
          <figcaption>{shot[1]}</figcaption>
        </figure>
      ))}
      {open && (
        <dialog ref={dialog} className="shot-view" onClose={() => setOpen(null)} onClick={() => dialog.current?.close()}>
          <img src={`report/shots/${open[0]}.jpg`} alt={open[1]} />
          <p>{open[1]}</p>
          <button className="secondary" aria-label="Close" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </dialog>
      )}
    </div>
  );
}

export const WORD: Record<Verdict, string> = { pass: 'Every check passed', warn: 'Passed, with the notes shown', fail: 'A check failed', skip: 'Not checked' };

/** One evidence file: what it is, its contents on demand, and the file itself. */
export function EvidenceFile({ path, name, note }: { path: string; name: string; note: string }) {
  const [content, setContent] = useState<{ text: string; bytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = () => {
    if (!content && !error) readable(path).then(setContent, (e) => setError(message(e)));
  };
  return (
    <div className="evidence-file">
      <details onToggle={(e) => e.currentTarget.open && open()}>
        <summary>
          <strong>{name}</strong> <span>{note}</span>
        </summary>
        {error && <p className="recheck-error">{error}</p>}
        {content && <textarea readOnly rows={16} spellCheck={false} value={content.text} aria-label={name} />}
        {content && <p className="evidence-size">{Math.round(content.bytes / 1024) || 1} KB</p>}
      </details>
      <a className="evidence-download" href={`${EVIDENCE}/${path}`} download={path.replaceAll('/', '-')}>
        Download
      </a>
    </div>
  );
}

export function Recheck({ subject, run }: { subject: string; run: () => Promise<ProofGroup[]> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [groups, setGroups] = useState<ProofGroup[]>([]);
  const [checkedAt, setCheckedAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setState('busy');
    setError(null);
    try {
      setGroups(await run());
      setCheckedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(message(e));
    }
    setState('done');
  };
  const verdict = groups.length ? overall(groups.map((g) => ({ label: g.title, verdict: g.verdict, detail: '' }))) : null;
  return (
    <div className="recheck">
      <button className="secondary" onClick={start} disabled={state === 'busy'}>
        {state === 'busy' ? 'Checking Intel, NVIDIA and NEAR…' : state === 'done' ? 'Re-check again' : 'Re-check in this browser'}
      </button>
      {verdict && <span className={`pill pill-${verdict}`}>{WORD[verdict]}</span>}
      {error && <p className="recheck-error">{error}</p>}
      {groups.length > 0 && (
        <details className="recheck-detail" open>
          <summary>
            Checked at {checkedAt}: {subject}. {groups.length} groups of checks
          </summary>
          <div className="proofs">
            {groups.map((group) => (
              <ProofCard key={group.id + group.title} group={group} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function Yes({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <span className={ok ? 'yes' : 'no'}>{ok ? yes : no}</span>;
}

export function SceneEvidence({ dir, people, extra }: { dir: string; people: People | null; extra?: [string, string, string][] }) {
  const [facts, setFacts] = useState<SceneFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (people) loadScene(dir, people).then(setFacts, (e) => setError(message(e)));
  }, [dir, people]);
  if (error) return <p className="recheck-error">{error}</p>;
  if (!facts || !people) return <div className="evidence">Reading the evidence…</div>;
  const { attestation: a, label } = facts;
  return (
    <div className="evidence">
      <h4>Evidence for this step</h4>
      <dl>
        <dt>Call</dt>
        <dd>
          <a className="mono" href={`${API}/attestations/by-call/${a.call_id}`} target="_blank" rel="noreferrer">
            {a.call_id}
          </a>
        </dd>
        <dt>Attested</dt>
        <dd>{when(a.timestamp)}</dd>
        <dt>Asked by</dt>
        <dd>{label.caller}</dd>
        <dt>Outcome</dt>
        <dd>
          {label.outcome}
          {label.approval ? `, approved by ${label.approval.officer}` : ''}
        </dd>
        {label.fired.length > 0 && (
          <>
            <dt>Rules fired</dt>
            <dd>{label.fired.map((f) => `${f.pack}/${f.rule} → ${f.action}`).join(', ')}</dd>
          </>
        )}
        <dt>Code</dt>
        <dd className="mono">{short(a.wasm_hash ?? '', 12)}</dd>
        <dt>Signatures</dt>
        <dd>
          Company key <Yes ok={facts.companySignature} yes="valid" no="invalid" />, employee key <Yes ok={facts.employeeSignature} yes="valid" no="invalid" />
        </dd>
        <dt>Company’s gate</dt>
        <dd>
          <Yes ok={facts.gate.accepted} yes="accepted" no="refused" />
          {facts.gate.reasons.length > 0 && `: ${facts.gate.reasons.join('; ')}`}
        </dd>
      </dl>
      <h5>What this rests on: read or download each file</h5>
      <EvidenceFile path={`${dir}/label.json`} name="Label" note="What a gate receives: the signed result, with no prompt in it" />
      <EvidenceFile path={`${dir}/attestation.json`} name="Attestation" note="Intel’s quote for this run, with the hashes of its code, input and output" />
      <EvidenceFile path={`${dir}/receipt.json`} name="Receipt" note="The full record an auditor receives: prompt, every rule’s score, answer, the models’ evidence" />
      <EvidenceFile path={`${dir}/input.json`} name="Input" note={label.approval ? 'Empty here: the platform started this run on the officer’s signature' : 'What OutLayer’s servers saw going in: ciphertext'} />
      <EvidenceFile path={`${dir}/output.json`} name="Output" note="What OutLayer’s servers saw coming back: ciphertext" />
      <EvidenceFile path={`${facts.pin}/attestation.json`} name="Key source" note="The earlier attested call this employee’s and the company’s keys were pinned from" />
      {extra?.map(([path, name, note]) => <EvidenceFile key={path} path={path} name={name} note={note} />)}
      <Recheck subject={`call ${short(a.call_id ?? '', 8)} by ${label.caller}, its label, receipt and keys`} run={() => recheckScene(facts, people)} />
    </div>
  );
}

export function PolicyEvidence({ policy }: { policy: PolicyFacts | null }) {
  if (!policy) return <div className="evidence">Reading the evidence…</div>;
  const { attestation: a, output } = policy;
  return (
    <div className="evidence">
      <h4>Evidence for this step</h4>
      <dl>
        <dt>Call</dt>
        <dd>
          <a className="mono" href={`${API}/attestations/by-call/${a.call_id}`} target="_blank" rel="noreferrer">
            {a.call_id}
          </a>
        </dd>
        <dt>Attested</dt>
        <dd>{when(a.timestamp)}</dd>
        <dt>Organisation</dt>
        <dd>{output.org}, the owner of the project that ran</dd>
        <dt>Configuration</dt>
        <dd className="mono">{short(output.config_sha256, 12)}</dd>
      </dl>
      <div className="wrap">
        <table>
          <thead>
            <tr>
              <th>Pack</th>
              <th>Rule</th>
              <th>Cites</th>
              <th>Action</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody>
            {output.packs.flatMap((p) =>
              p.pack.rules.map((r) => (
                <tr key={p.pack.id + r.id}>
                  <td className="mono">
                    {p.pack.id}@{p.pack.version}
                  </td>
                  <td className="mono">{r.id}</td>
                  <td>{r.cite ?? ''}</td>
                  <td>{r.action}</td>
                  <td>{r.threshold}%</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <h5>What this rests on: read or download each file</h5>
      <EvidenceFile path="policy/recruiter/output.json" name="Rules" note="The configuration and the packs, as the enclave read them" />
      <EvidenceFile path="policy/recruiter/attestation.json" name="Attestation" note="Intel’s quote for this call" />
      <Recheck subject={`call ${short(a.call_id ?? '', 8)} and each pack’s hash on ${output.registry}`} run={() => recheckPolicy(policy)} />
    </div>
  );
}

export function TaskCard({ dir, officer }: { dir: string; officer: string }) {
  const [task, setTask] = useState<OfficerTask | null>(null);
  useEffect(() => {
    loadOfficerTask(dir).then(setTask, () => setTask(null));
  }, [dir]);
  if (!task) return null;
  return (
    <div className="task">
      <h4>The task in {officer}’s inbox, as they read it</h4>
      <dl>
        {task.fields.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>{f.values.join(', ')}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Built({ children }: { children: ReactNode }) {
  return (
    <aside className="built">
      <h4>How it is built</h4>
      {children}
    </aside>
  );
}

export function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="report-step" id={`step-${n}`}>
      <h3>
        <span className="step-n">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export const mark = (v: string) => (v === 'valid' || v === 'verified' || v === 'accepted' ? <span className="yes">{v}</span> : v === 'INVALID' || v === 'refused' ? <span className="no">{v.toLowerCase()}</span> : v);

