import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ProofCard } from '../components/ProofCard';
import { message, overall, short, type ProofGroup, type Verdict } from '../lib/verify/types';
import { EVIDENCE, loadLedger, loadOfficerTask, loadPeople, loadPolicy, loadScene, readable, recheckPolicy, recheckScene, type LedgerRow, type OfficerTask, type People, type PolicyFacts, type SceneFacts } from './evidence';

const REPO = 'https://github.com/zavodil/near-attested-ai';
const API = 'https://testnet-api.outlayer.ai';
const REGISTRY = 'policies.zavodil.testnet';

const BRIEF: [number, string, string][] = [
  [1, 'The company selects its rules.', 'Versioned EU AI Act, GDPR and company packs in a contract on NEAR, named in the company’s encrypted configuration.'],
  [2, 'Ordinary requests pass.', 'Sealed in the browser, screened in the enclave, answered in a TEE.'],
  [3, 'A receiving system decides from a signed label', 'that holds no prompt, signed by the company’s key and the employee’s key.'],
  [4, 'Hardware proves it ran.', 'An Intel quote for the run, Intel and NVIDIA evidence for the model.'],
  [5, 'Prohibited practices are blocked', 'before any model answers, and the refusal is signed.'],
  [6, 'High-risk requests escalate to a named officer', 'through OutLayer’s delegated tasks, in their own inbox.'],
  [7, 'An approval produces the answer,', 'in a second attested run that names the officer.'],
  [8, 'Each rule has its own officer:', 'hiring goes to HR, credit goes to risk.'],
  [9, 'A no ends the request', 'with no answer from any model.'],
  [10, 'Going around it fails:', 'a former employee, an employee’s own rules or key, and a forged label are all refused.'],
  [11, 'Screening can run in a TEE too,', 'on the same code under a stricter configuration.'],
];

const BUSINESS: [string, string][] = [
  ['Proof with every request', 'Each run comes with a hardware-signed proof of what code ran on what data. Anyone can check it, with no account and no key of ours.'],
  ['The product signs its own results', 'Every result is signed with the company’s key and the employee’s key. Keys come from the NEAR MPC network, and nobody has to hold or guard them.'],
  ['An AI answer you can verify', 'The model’s secure hardware signs each answer, and that signature travels with the result, so a receiving system can tell it is genuine.'],
  ['Approvals built in', 'Delegated tasks send a request to a named officer, who approves it with one signature, no transaction and no fee. A webhook can alert them through any channel the company uses.'],
  ['Rules and secrets that cannot be swapped', 'A company’s configuration is stored on NEAR, encrypted, under a transaction its own account signed. Only that account can change it, and it opens only for the people it names.'],
  ['Data stays sealed in transit', 'Requests are encrypted in the employee’s browser. OutLayer’s servers only ever see ciphertext.'],
  ['Access and billing per person', 'Each employee has their own prepaid key. Removing someone from the company’s list ends their access.'],
  ['A new customer is a configuration', 'One published build serves many companies, each with its own keys and rules. There are no servers to run for each customer.'],
];

const WHY: [string, string, string][] = [
  ['Confidential execution', 'Your wasm runs in an Intel TDX enclave. Publish it, and the workers are already running.', 'A TDX fleet, its images and upgrades'],
  ['Proof of each run', 'An Intel quote per run, covering code, input, output, caller and project, public by call id.', 'Quote generation, collateral, an approved-build list, a public record'],
  ['The project signs cryptographically', 'Signing keys declared in the manifest, per project or per caller, from confidential key derivation by the NEAR MPC network. The code asks for signatures and never sees a key.', 'A KMS or HSM, and a way to prove the vendor could not have signed'],
  ['A verifiable AI answer', 'The receipt carries the model’s Intel quote, NVIDIA’s verdict and the TEE’s signature over request and response, checked in the enclave and again by any reader. One verifier serves every framework.', 'Evidence capture and a verifier for each model call'],
  ['Secrets on chain', 'Encrypted rows stored by a transaction their owner signs. Only that account can replace a row. They are decrypted in the TEE keystore, for the callers its access condition admits.', 'Multi-tenant secret storage and access control'],
  ['Delegation of secrets', 'A call can name up to five rows. An officer’s own row admits employees by name, which links officers to the people they approve for without making them admins.', 'A role and consent model across tenants'],
  ['Delegated tasks', 'open-for(owner, request) gives an inbox, encrypted delivery, a wallet signature and a new attested run on approval. A signed webhook feeds any notification channel.', 'A workflow service, notifications, sign-off verification and resume logic'],
  ['Limits on where data can go', 'A host list inside the wasm, covered by its hash and enforced by the worker.', 'Egress control a customer can verify'],
  ['Access and billing', 'Payment keys: prepaid stablecoin balances over HTTPS. A project can also be called from a NEAR contract, and its owner can earn per call.', 'Metering, billing and an API gateway'],
];

const when = (seconds: number) => `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
function Shots({ shots }: { shots: [string, string][] }) {
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

const WORD: Record<Verdict, string> = { pass: 'Every check passed', warn: 'Passed, with the notes shown', fail: 'A check failed', skip: 'Not checked' };

/** One evidence file: what it is, its contents on demand, and the file itself. */
function EvidenceFile({ path, name, note }: { path: string; name: string; note: string }) {
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

function Recheck({ subject, run }: { subject: string; run: () => Promise<ProofGroup[]> }) {
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

function Yes({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <span className={ok ? 'yes' : 'no'}>{ok ? yes : no}</span>;
}

function SceneEvidence({ dir, people, extra }: { dir: string; people: People | null; extra?: [string, string, string][] }) {
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

function PolicyEvidence({ policy }: { policy: PolicyFacts | null }) {
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

function TaskCard({ dir, officer }: { dir: string; officer: string }) {
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

function Built({ children }: { children: ReactNode }) {
  return (
    <aside className="built">
      <h4>How it is built</h4>
      {children}
    </aside>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
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

const mark = (v: string) => (v === 'valid' || v === 'verified' || v === 'accepted' ? <span className="yes">{v}</span> : v === 'INVALID' || v === 'refused' ? <span className="no">{v.toLowerCase()}</span> : v);

export function Report() {
  const [people, setPeople] = useState<People | null>(null);
  const [policy, setPolicy] = useState<PolicyFacts | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [tab, setTab] = useState<'business' | 'engineering'>('business');
  useEffect(() => {
    loadPeople().then(setPeople);
    loadPolicy('policy/recruiter').then(setPolicy);
    loadLedger().then(setLedger);
  }, []);
  const attested = ledger.filter((r) => r.attestation === 'verified').length;
  const attempts = ledger.filter((r) => /^(07|08|09|10|11|12)-/.test(r.scene) || r.scene === 'forged');

  return (
    <div className="page report">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" />
          <span>Provable AI Compliance</span>
          <span className="brand-sub">report · November 2026</span>
        </div>
        <h1>
          Compliance controls for AI,
          <br />
          <span>with proof they were enforced.</span>
        </h1>
        <p className="lede">
          Pick a compliance framework, and every AI request your company makes is checked against it automatically: allowed, blocked or escalated to a human, with cryptographic proof that the controls were enforced. Built on OutLayer and NEAR AI Cloud, running on NEAR.
        </p>
      </header>

      <section className="report-section">
        <h2>The idea</h2>
        <p>
          The EU AI Act bans some uses of AI and requires human oversight of others, such as hiring and credit decisions. A company that lets its staff use AI has to answer for each of these: which rules applied to this request, who approved it, and can you show that the rule really ran, without
          showing what the employee typed?
        </p>
        <p>Today the answer is usually a log, written by the company or its vendor. A log is a claim, and whoever wrote it could have written anything.</p>
        <p>
          This product replaces the claim with proof. A company selects a framework, and its rules become programmable controls: each request is allowed, blocked, or escalated to a named person. Hardware attests that those controls ran. A signed label states the result with no prompt in it, so an
          auditor or a receiving system can verify it without seeing the data.
        </p>
        <p>
          The buyer is a regulated company that wants AI in daily work and needs evidence for its own liability. It gets controls, and the proof that the controls were enforced.
        </p>
        <p>
          Two platforms carry it. <strong>OutLayer</strong> runs the gateway: the rules, the signatures and the approvals, inside an Intel TDX enclave. <strong>NEAR AI Cloud</strong> serves the models, on Intel TDX and NVIDIA confidential GPUs.
        </p>
      </section>

      <section className="report-section">
        <h2>What was built</h2>
        <p>One fictional company, Acme Demo, with named positions on separate accounts. Each line links to its screens, proof and design below.</p>
        <ol className="brief">
          {BRIEF.map(([n, title, text]) => (
            <li key={n}>
              <a href={`#step-${n}`}>{title}</a> {text}
            </li>
          ))}
        </ol>
        <p>
          <strong>It works end to end.</strong> All <strong>{attested}</strong> attested runs in this report’s evidence verify, and anyone can repeat that check without an account or a key of ours.
        </p>
      </section>

      <section className="report-section" id="any-framework">
        <h2>Any framework, any company</h2>
        <p>
          The EU AI Act here is a demonstration, not a limit. A framework is a pack of rules: plain questions with a citation, a threshold and an action. Another regulation, a sector’s rules or one company’s own policy is another pack, and the enclave, the labels, the approvals and every verification below work on it unchanged. We can build a pack set for a specific customer’s request.
        </p>
      </section>

      <section className="report-section" id="why-outlayer">
        <h2>Why build it on OutLayer</h2>
        <p>OutLayer is verifiable compute on NEAR: code runs inside an Intel TDX enclave, and every run comes with proof. The steps below are the evidence that this works today. Here is what it means for a product.</p>
        <div className="tabs" role="tablist" aria-label="Audience">
          <button role="tab" aria-selected={tab === 'business'} className={tab === 'business' ? 'on' : ''} onClick={() => setTab('business')}>
            For business
          </button>
          <button role="tab" aria-selected={tab === 'engineering'} className={tab === 'engineering' ? 'on' : ''} onClick={() => setTab('engineering')}>
            For engineers
          </button>
        </div>

        {tab === 'business' && (
          <div role="tabpanel">
            <p>
              <strong>All of this comes out of the box.</strong> A team brings its rules and its own screens. The hard parts are already running.
            </p>
            <div className="cards">
              {BUSINESS.map(([title, text]) => (
                <div className="report-card" key={title}>
                  <h4>{title}</h4>
                  <p>{text}</p>
                </div>
              ))}
            </div>
            <h3 className="report-question">What it brings NEAR AI</h3>
            <p>Regulated customers ask two questions: what happened to my data, and which rules applied? NEAR AI Cloud answers the first. This answers the second, with proof, and makes confidential AI something a compliance team can sign up for.</p>
            <p>OutLayer serves no models. Every screen and answer is NEAR AI inference, up to five calls per request, on the customer’s own NEAR AI key. Each new customer and each new rule pack adds NEAR AI usage. It also suits a sovereign AI offer: the customer sets the rules, can hold its own keys, and keeps its own evidence.</p>
            <h3 className="report-question">Why not build it directly on the model platform?</h3>
            <p>Proving each model call is what NEAR AI Cloud already does. A control is the decision between the calls: did this request pass, may the model answer, who must approve? Proving that decision takes attested code, keys, customer secrets and an approval flow. OutLayer is that layer, and it is already running.</p>
            <h3 className="report-question">The customer stays in control</h3>
            <p>The company publishes and manages its own gateway, sets its own rules, and can hold its own keys, with a way out that needs nobody’s permission. We are ready to provide the templates and help set up each customer.</p>
          </div>
        )}

        {tab === 'engineering' && (
          <div role="tabpanel">
            <div className="wrap">
              <table>
                <thead>
                  <tr>
                    <th>The product needs</th>
                    <th>OutLayer gives it</th>
                    <th>In-house, a team would build and run</th>
                  </tr>
                </thead>
                <tbody>
                  {WHY.map(([need, gives, otherwise]) => (
                    <tr key={need}>
                      <td>{need}</td>
                      <td>{gives}</td>
                      <td>{otherwise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="report-question">Why the chain needs attested code</h3>
            <p>
              NEAR AI Cloud’s <a href="https://docs.near.ai/cloud/verification" target="_blank" rel="noreferrer">verification</a> proves each call: this model, in this TEE, signed this request and response. Screening and answering are two proofs. What connects them is the code that reads the score, applies the threshold and decides whether to call the answering model. Here that code is the module, and its hash is in the Intel quote of the run that made both calls, so the chain is one attested decision. Escalation adds a run that ends, a named person’s signature, and a new attested run that continues with the same sealed data.
            </p>
            <h3 className="report-question">Who controls what</h3>
            <div className="wrap">
              <table>
                <thead>
                  <tr>
                    <th>Layer</th>
                    <th>How it is controlled</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>The rules</td>
                    <td>By the customer. The registry has no update or delete, and a contract account can be locked by removing its keys, so nobody can change a published rule.</td>
                  </tr>
                  <tr>
                    <td>The gateway’s code</td>
                    <td>By the customer. It publishes and manages its own module from our template. The hash is in every attestation, so a gate can require that exact build.</td>
                  </tr>
                  <tr>
                    <td>Keys and secrets</td>
                    <td>
                      OutLayer’s shared master by default. A customer can use a <a href="https://github.com/out-layer/outlayer/blob/main/VAULTS.md">sovereign vault</a>: a master derived by the NEAR MPC network from the customer’s own account. Every derivation is a public transaction, a project’s keys can name that vault, and the customer can <a href="https://github.com/out-layer/outlayer/blob/main/docs/LEAVING_OUTLAYER.md">leave</a> without OutLayer’s cooperation.
                    </td>
                  </tr>
                  <tr>
                    <td>Worker and keystore builds</td>
                    <td>
                      On chain. A worker registers only if all five of its TDX measurements match an approved set, and keystore builds are approved through the keystore DAO. OutLayer runs that DAO today, and NEAR AI or a customer can take a seat on it. A gate can also accept only the measurements it has reviewed. See the <a href="https://github.com/out-layer/outlayer/blob/main/docs/NON_CUSTODIAL.md">trust model</a>.
                    </td>
                  </tr>
                  <tr>
                    <td>After leaving</td>
                    <td>Labels already issued keep verifying against the pinned keys, and the code, the rules and a vault’s secrets stay with the customer.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="report-section">
        <h2>Who is who</h2>
        <p>Each person is a separate NEAR account.</p>
        {people && (
          <div className="wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Position</th>
                  <th>Role in the proof</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono">{people.company.account}</td>
                  <td>Compliance</td>
                  <td>
                    Owns the project and its rules. Signs every label
                  </td>
                </tr>
                {Object.entries(people.employees).map(([account, e]) => (
                  <tr key={account}>
                    <td className="mono">{account}</td>
                    <td>{e.position}</td>
                    <td>
                      Asks. Also signs their own labels
                    </td>
                  </tr>
                ))}
                {Object.entries(people.officers).map(([account, o]) => (
                  <tr key={account}>
                    <td className="mono">{account}</td>
                    <td>{o.position}</td>
                    <td>Approves or rejects: {o.takes}</td>
                  </tr>
                ))}
                <tr>
                  <td className="mono">{people.outsider.account}</td>
                  <td>Former employee</td>
                  <td>Not on the company’s list</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="note">
          How to read the steps: the screens are the live page (click one to enlarge it), and each step’s evidence is the same call as its screen. Open any file to read it, or download it. <em>Re-check</em> recomputes that step’s proof in your browser from those files: Intel’s signature on the quote (with Intel’s signed
          collateral, archived by OutLayer), that the quote covers this code, input and output, the worker’s approval on NEAR, each pack’s hash on NEAR, NEAR AI’s Intel and NVIDIA evidence, and both signatures on the label. The receipts hold the prompts in the clear because these are invented; a real company
          would hand a receipt to its auditor and only the label to everyone else. <a href="report/evidence.zip">Download all the evidence</a>.
        </p>
      </section>

      <section className="report-section">
        <h2>Step by step</h2>

        <Step n={1} title="The company sets the rules">
          <p>Compliance selects which rule packs apply, which models are allowed, and which officer takes which rule. Employees see the rules and cannot change them.</p>
          <Shots shots={[['01-rules', 'The recruiter’s page: the rules are the company’s']]} />
          <Built>
            <p>
              <strong>Rules live in a contract on NEAR.</strong> <a href={`https://testnet.nearblocks.io/address/${REGISTRY}`} target="_blank" rel="noreferrer">{REGISTRY}</a> is a small <a href={`${REPO}/blob/main/registry/src/lib.rs`}>registry</a> with publish and deprecate, and no update or delete. A version is the same bytes forever, and the chain records who published it and when. So an auditor reads
              the same rules as the enclave, and a label names the hash of each pack it ran under. A pack is JSON: each rule is a yes/no question with a citation, a threshold and an action.
            </p>
            <p>
              <strong>The company’s choice lives in an encrypted row.</strong> OutLayer stores customers’ secrets encrypted on NEAR, and only the enclave opens them. The company’s row holds its NEAR AI key and this configuration. The module’s manifest names it (<code>author_secrets</code>), so the worker opens it on every run, whatever the call asks. The organisation in a label is
              the project’s owner, the one account that could have stored that row. Nobody can type a company’s name.
            </p>
          </Built>
          <PolicyEvidence policy={policy} />
        </Step>

        <Step n={2} title="An ordinary request is allowed">
          <p>The recruiter asks for a meeting email. It passes all ten rules and is answered by a model in NEAR AI’s TEE.</p>
          <Shots shots={[['02-answer', 'Passed all ten rules, answered in a TEE, label signed']]} />
          <Built>
            <p>
              <strong>The prompt is sealed in the browser</strong> to an encryption key OutLayer’s keystore holds for this project, after the page has verified the attestation of the call that gave it the key. OutLayer’s servers only relay ciphertext. The module’s manifest lists the hosts it can reach: NEAR AI, Intel and NVIDIA. The list is inside the wasm, covered by its hash, and the
              worker enforces it.
            </p>
            <p>
              <strong>Each employee pays with their own payment key,</strong> a prepaid stablecoin balance that calls OutLayer over HTTPS. A company gets per-person metering without building any, and the page needs no backend.
            </p>
          </Built>
          <SceneEvidence dir="scenes/01-recruiter-ordinary" people={people} />
        </Step>

        <Step n={3} title="A receiving system decides from the label">
          <p>
            A gate is whatever acts on the AI’s answer: a workflow, a filing system, another agent. It takes the label and the keys it trusts, never the prompt, and accepts or refuses. Each company picks its own bar. One setting requires that every decision model ran in a TEE, and the label shows whether it did: this project’s label is refused at that bar, and the one in <a href="#step-11">step 11</a> is accepted.
          </p>
          <Shots
            shots={[
              ['03-gate-accepted', 'The company’s rule: accepted'],
              ['04-gate-refused-tee', 'A stricter rule, every decision model in a TEE: refused'],
            ]}
          />
          <Built>
            <p>
              <strong>Every label is signed twice,</strong> by two keys the manifest declares and OutLayer’s keystore derives. The <code>label</code> key is one per project, so a gate pins one company key. The <code>caller</code> key is per account and out of reach of any other account’s run, so a gate can tell who asked at the signature level. The module never handles a key: it asks
              the platform to sign. Both keys are published by an attested call, so a gate learns them from a proof rather than from a person.
            </p>
          </Built>
          <p className="note">This step and the next use the call from step 2.</p>
        </Step>

        <Step n={4} title="What stands behind the label">
          <p>
            Two separate proofs. OutLayer’s: Intel signed a quote from TDX hardware, and the quote commits to this code, input, output, caller and project. NEAR AI’s: Intel and NVIDIA vouch for the model’s TEE, and that TEE signed this exact answer.
          </p>
          <Shots
            shots={[
              ['05-proof-outlayer', 'The run in OutLayer’s enclave'],
              ['06-proof-model', 'The answering model in NEAR AI’s TEE'],
            ]}
          />
          <Built>
            <p>
              <strong>OutLayer attests every run,</strong> with no setup. The record is public by call id, and a worker is admitted only if all five of its TDX measurements match a set approved on NEAR. The module also checks NEAR AI’s evidence inside the enclave before sealing the receipt, and this page checks it again, so a reader relies on neither.
            </p>
          </Built>
        </Step>

        <Step n={5} title="A prohibited practice is blocked">
          <p>The analyst asks for a social scoring system. Art. 5(1)(c) fires, the answering model is never called, and the refusal is signed too. The company can prove it stopped this request.</p>
          <Shots
            shots={[
              ['07-blocked', 'Stopped inside the enclave, with each rule’s score'],
              ['08-blocked-label', 'The signed label of a refusal: the gate refuses it'],
            ]}
          />
          <Built>
            <p>
              <strong>Enforcement is in the code the quote covers.</strong> The module decides inside the enclave, before any answering call. The hash in the attestation identifies that code, so the receipt’s “no answer” comes with proof of which program produced it.
            </p>
          </Built>
          <SceneEvidence dir="scenes/03-analyst-blocked" people={people} />
        </Step>

        <Step n={6} title="A hiring decision waits for the HR director">
          <p>The recruiter asks to rank candidates. Annex III(4) escalates. Nothing is answered, and the request appears in the inbox of the officer the company named for that rule.</p>
          <Shots
            shots={[
              ['09-waiting-hr', 'The prompt held; the page waits for the officer'],
              ['10-waiting-label', 'The label while it waits: refused'],
              ['20-inbox-task', 'The same request in the HR director’s OutLayer inbox: the rule that fired, the prompt, and who wrote each field'],
            ]}
          />
          <Built>
            <p>
              <strong>Escalation is a delegated OutLayer task.</strong> Tasks are a platform feature: a run leaves a person a request, and that person reads it in their OutLayer inbox and answers with one wallet signature. Nothing waits inside the enclave, and the task is a sealed record. The module writes one call, <code>open-for(officer, request)</code>, and gets the inbox, the encrypted
              delivery, the signature check and the restart. A signed webhook can alert the officer through any channel the company already uses.
            </p>
            <p>
              <strong>Officers are not admins.</strong> Each officer holds their own row under the project, which holds nothing and admits named employees. That row is their consent to be asked, and it lets a task reach them without making them the company’s administrator. The platform also marks each field shown to the officer as written by the project or by the agent.
            </p>
          </Built>
          <SceneEvidence dir="scenes/04-recruiter-hiring-approved/1-waiting" people={people} />
        </Step>

        <Step n={7} title="The HR director approves, and the answer comes back">
          <p>The label now names the officer and the task, and the same gate that refused it accepts it.</p>
          <Shots
            shots={[
              ['11-approved', 'The answer, with who approved and the screen that escalated'],
              ['12-approved-label', 'The label with the approval: accepted'],
              ['13-approved-proof', 'The second run has its own attestation, tied to the officer’s task'],
              ['21-inbox-carrying-out', 'The inbox right after the signature: the task is carried out'],
              ['22-inbox-done', 'The inbox afterwards: the task names both runs, with their attestations, the same call ids as the evidence below'],
            ]}
          />
          <Built>
            <p>
              <strong>The officer’s wallet signature starts a second attested run,</strong> by the platform, on the employee’s key. The officer signs one message, with no transaction and no fee. That run takes back the sealed request and the screen as made, answers, and seals the receipt to the tab that asked. The task is bound to the hash of the company’s configuration, so if the rules change while it waits, the task is void.
            </p>
          </Built>
          <SceneEvidence dir="scenes/04-recruiter-hiring-approved/2-answer" people={people} />
        </Step>

        <Step n={8} title="The same rules send credit to the risk officer">
          <p>The analyst asks for a loan decision. Annex III(5)(b) fires, and this one goes to the risk officer rather than HR.</p>
          <Shots
            shots={[
              ['14-waiting-risk', 'Routed to the risk officer'],
              ['15-risk-label', 'Approved by the risk officer: accepted'],
            ]}
          />
          <TaskCard dir="scenes/05-analyst-credit-approved" officer="acme-risk-officer.testnet" />
          <Built>
            <p>
              <strong>Routing is one line of configuration per rule or pack.</strong> The task opens for that officer alone. Changing who approves what needs no new code and no redeploy, and the configuration’s hash in the label shows which version applied.
            </p>
          </Built>
          <SceneEvidence
            dir="scenes/05-analyst-credit-approved/2-answer"
            people={people}
            extra={[
              ['scenes/05-analyst-credit-approved/1-waiting/label.json', 'Label while it waited', 'Signed before the approval'],
              ['scenes/05-analyst-credit-approved/officer-approval.json', 'Officer’s signature', 'The signed approval of this task'],
            ]}
          />
        </Step>

        <Step n={9} title="An officer says no">
          <p>The recruiter asks whether to dismiss an employee, and the HR director rejects it. No second run starts, so no model answers. What stays is the signed “escalated” label, which no gate accepts, and the task closed as rejected in the officer’s inbox.</p>
          <Shots shots={[['16-rejected', 'Stopped by the officer, with no answer']]} />
          <SceneEvidence dir="scenes/06-recruiter-dismissal-rejected/1-waiting" people={people} />
        </Step>

        <Step n={10} title="Getting around the rules does not work">
          <p>Each attempt below was run for real. Most stop before anything runs, with the platform’s own answer shown. The two lines with signatures show what a forged or personal label looks like to the company’s gate.</p>
          <Shots
            shots={[
              ['17-former', 'A former employee, off the company’s list'],
              ['18-own-rules', 'An employee naming rules of their own'],
            ]}
          />
          <Built>
            <p>
              <strong>Enforcement sits below the page.</strong> The row’s access condition, checked by the keystore, decides who may run: removing a name from it ends that person’s access. The worker refuses a call whose row redefines a name from the company’s row, so an employee cannot swap the rules or the key. Both come with the platform. The module adds two refusals of its own: a configuration from a row the call names, and an escalation whose officer’s row the call left out.
            </p>
          </Built>
          <div className="wrap">
            <table>
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Who</th>
                  <th>Company key</th>
                  <th>Employee key</th>
                  <th>Gate</th>
                  <th>Platform’s or gate’s answer</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((r) => (
                  <tr key={r.scene + r.title}>
                    <td>{r.title}</td>
                    <td className="mono">{r.who}</td>
                    <td>{r.company_signature ? mark(r.company_signature) : '—'}</td>
                    <td>{r.employee_signature ? mark(r.employee_signature) : '—'}</td>
                    <td>{r.company_gate ? mark(r.company_gate) : 'never ran'}</td>
                    <td className="why">{r.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step n={11} title="The screen can run in a TEE too">
          <p>The company’s second project uses the same code with a TEE-only configuration, so the stricter gate from step 3 accepts. A company can choose this when the screen, too, must stay inside confidential hardware.</p>
          <Shots shots={[['19-tee', 'Screening attested: the strict gate accepts']]} />
          <Built>
            <p>
              <strong>Same wasm, same hash, another project.</strong> One published build serves many companies, each as a project of its own account with its own keys and row. A new customer is a configuration rather than a deployment. A pack can name a TEE model and ask through chat completions, and <code>screening_tee</code> requires a TEE for every pack.
            </p>
          </Built>
          <SceneEvidence dir="scenes/13-tee-screen" people={people} />
        </Step>
      </section>

      <section className="report-section report-wide">
        <h2>The whole ledger</h2>
        <p>
          Recomputed from the evidence files by <code>demo/verify.ts --strict</code>. Open it as{' '}
          <a href={`${EVIDENCE}/ledger.csv`} target="_blank" rel="noreferrer">
            CSV
          </a>
          .
        </p>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>What happened</th>
                <th>Who</th>
                <th>Outcome</th>
                <th>Approved by</th>
                <th>Company key</th>
                <th>Employee key</th>
                <th>Receipt</th>
                <th>Attestation</th>
                <th>Gate</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((r) => (
                <tr key={r.scene + r.title}>
                  <td>{r.title}</td>
                  <td className="mono">{r.who}</td>
                  <td>{r.outcome}</td>
                  <td className="mono">{r.approved_by}</td>
                  <td>{mark(r.company_signature)}</td>
                  <td>{mark(r.employee_signature)}</td>
                  <td>{mark(r.receipt_matches)}</td>
                  <td>{mark(r.attestation)}</td>
                  <td>{mark(r.company_gate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h2>Check it yourself</h2>
        <p>One command re-checks all of the evidence from the demo company’s accounts on NEAR testnet, with no account or key:</p>
        <pre className="command">{`git clone ${REPO}
cd near-attested-ai/web && npm ci

# For every run, and every call the keys were pinned from:
#   - Intel signed the TDX quote
#   - the quote commits to this code, input, output, caller and project
#   - the worker's measurements are approved on NEAR
# For every label:
#   - the company's and the employee's signatures hold, against those pinned keys
#   - the receipt hashes to the digest in the attested output
#   - the label matches the receipt's prompt and answer
#   - the company's gate accepts or refuses it: organisation, employee, packs, officer
# It also renames the employee in one label, to show that a forgery is refused.
# It writes ledger.csv and index.html, and exits non-zero if a receipt or attestation fails.
DEMO_EVIDENCE=$PWD/public/report/evidence npx vite-node ../demo/verify.ts --strict`}</pre>
        <p>The buttons in each step also check each pack’s hash on NEAR and NEAR AI’s Intel and NVIDIA evidence for the models.</p>
        <p>
          Or <a href="report/evidence.zip">download all the evidence</a>, browse <a href={`${EVIDENCE}/index.html`} target="_blank" rel="noreferrer">the evidence page</a>, and try <a href="./">the live page</a> with a testnet payment key. The code is at <a href={REPO}>{REPO.replace('https://', '')}</a>:{' '}
          <a href={`${REPO}/tree/main/module/src`}>the module</a>, <a href={`${REPO}/tree/main/policies`}>the packs</a>, <a href={`${REPO}/tree/main/registry`}>the registry</a> and <a href={`${REPO}/tree/main/web/src/lib/verify`}>the verifier</a>. A re-check reads the approved worker list as it stands that day, so a build retired later shows as no longer approved.
        </p>
      </section>

      <footer className="footer">
        A fictional company. Built on <a href="https://outlayer.ai">OutLayer</a> and <a href="https://cloud.near.ai">NEAR AI Cloud</a>. Not legal advice.
      </footer>
    </div>
  );
}
