import { useEffect, useState, type ReactNode } from 'react';
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

const WHY: [string, string, string][] = [
  ['Code that handles prompts where nobody can read them', 'Your wasm runs in an Intel TDX enclave. Publish it, and the workers are already running.', 'A TDX fleet, its images and upgrades'],
  ['Proof of each run', 'An Intel quote per run, covering code, input, output, caller and project, public by call id.', 'Quote generation, collateral, an approved-build list, a public record'],
  ['Keys no one holds', 'Keys declared in the manifest, derived in a TEE keystore whose root secret comes from the NEAR MPC network. The code asks for signatures and never sees a key.', 'A KMS or HSM, and a way to prove the vendor could not have signed'],
  ['Each customer’s secrets and rules', 'Encrypted rows on NEAR, opened only in the enclave, with on-chain access conditions naming who may run.', 'Multi-tenant secret storage and access control'],
  ['A person in the loop', 'Tasks: an inbox, encrypted delivery, a wallet signature, and a new attested run on approval. One call from the module.', 'A workflow service, notifications, sign-off verification and resume logic'],
  ['Limits on where data can go', 'A host list inside the wasm, covered by its hash and enforced by the worker.', 'Egress control a customer can verify'],
  ['Per-person access and billing', 'Payment keys: prepaid stablecoin balances, called over HTTPS. Project owners can also earn per call.', 'Metering, billing and an API gateway'],
];

const when = (seconds: number) => `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
function Shots({ shots }: { shots: [string, string][] }) {
  return (
    <div className={`shots shots-${Math.min(shots.length, 2)}`}>
      {shots.map(([name, caption]) => (
        <figure key={name}>
          <a href={`report/shots/${name}.jpg`} target="_blank" rel="noreferrer">
            <img src={`report/shots/${name}.jpg`} alt={caption} width={985} height={813} loading="lazy" />
          </a>
          <figcaption>{caption}</figcaption>
        </figure>
      ))}
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
  useEffect(() => {
    loadPeople().then(setPeople);
    loadPolicy('policy/recruiter').then(setPolicy);
    loadLedger().then(setLedger);
  }, []);
  const attested = ledger.filter((r) => r.attestation === 'verified').length;
  const failed = ledger.filter((r) => r.attestation.startsWith('FAILED')).length;
  const attempts = ledger.filter((r) => /^(07|08|09|10|11|12)-/.test(r.scene) || r.scene === 'forged');

  return (
    <div className="page report">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" />
          <span>Attested AI</span>
          <span className="brand-sub">report · November 2026</span>
        </div>
        <h1>
          EU AI Act controls,
          <br />
          <span>with proof of enforcement.</span>
        </h1>
        <p className="lede">A gateway that lets a company’s people use AI on sensitive work, applies the company’s rules to every request, and produces evidence an outsider can check. Built on OutLayer, answered by NEAR AI Cloud, running on NEAR testnet.</p>
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
          The buyer is a regulated company that wants AI in daily work and needs evidence for its own liability. The product does not make anyone compliant. It gives them controls and the proof that the controls were enforced.
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
          <strong>Status:</strong> it runs end to end on NEAR testnet. Of the runs in this report’s evidence, <strong>{attested}</strong> verify and <strong>{failed}</strong> fail, and anyone can repeat that check without an account or a key of ours. The rules are a demo set, and screening has limits a
          real customer must weigh: see <a href="#limits">what this does not prove yet</a>.
        </p>
      </section>

      <section className="report-section" id="why-outlayer">
        <h2>Why build it on OutLayer</h2>
        <p>
          OutLayer is a compute platform on NEAR. You publish a WebAssembly module, and it runs inside an Intel TDX enclave with a proof of each run. Keys and customers’ secrets stay inside the enclave boundary, and a run can hand a decision to a person and continue after their signature. It answers over HTTPS or
          to a NEAR contract.
        </p>
        <p>
          That is most of what this product needs. The gateway itself is about 2,900 lines of Rust, tests included, plus a 330-line contract and a static web page, written between 2 and 5 November. It has no server of its own. Almost all of it is the product: rules, screening, labels and the page. OutLayer gained three general features for it that week: a per-project signing key, several secret rows on one call, and tasks for another account.
        </p>
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
        <p>
          <strong>It leaves NEAR AI Cloud as the model layer.</strong> OutLayer serves no models. Every screen and every answer here is NEAR AI inference, up to five calls per request, on the customer’s own NEAR AI key, which the company stores in its encrypted row. Each customer and each rule pack adds NEAR AI usage.
        </p>
        <p>
          <strong>The same enclave reaches past AI.</strong> OutLayer also runs custody wallets under an owner’s policy and connectors to outside services. An approval like the one in <a href="#step-6">step 6</a> works the same way when the action is a payment rather than an answer.
        </p>
        <p>
          <strong>The product stays the builder’s.</strong> The module and the rule packs are the builder’s own code and data, and the rules, customers and interface are theirs to change.
        </p>

        <h3 className="report-question">Couldn’t the model platform do this itself?</h3>
        <p>
          It could be built there, and the rule is the easy part. NEAR AI Cloud’s <a href="https://docs.near.ai/cloud/verification" target="_blank" rel="noreferrer">verification</a> proves each call: this model, in this TEE, signed this request and response. Screening and then answering are two separate proofs. What connects them is the code in between, which reads the score, applies the threshold, and decides whether to call the answering model.
          If that code runs outside an attested environment, the proofs show that a screen happened and that an answer happened. They do not show that the answer followed from the screen, or that nothing was answered without one.
        </p>
        <p>
          Here that code is the module. Its hash is in the Intel quote of the run that made both calls, so the chain is one attested decision. Escalation needs more: the run ends, a named person signs, and a new attested run continues with the same sealed data. NEAR AI’s public documentation describes no policy or approval layer today. Building one means running that code in an attested environment of its own, plus everything in the table above.
        </p>

        <h3 className="report-question">Does this make a customer depend on one more platform?</h3>
        <p>Yes, for running it. Most of what could lock a customer in can be taken over, and the part that cannot yet is stated here.</p>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>Layer</th>
                <th>Who controls it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>The rules</td>
                <td>The customer can. The registry has no update or delete. A customer deploys its own and removes the contract account’s full-access keys, and then nobody can change it. The registry in this demo still has its key.</td>
              </tr>
              <tr>
                <td>The gateway’s code</td>
                <td>The customer can. It builds its own module from this template and publishes it under its own account. The hash is in every attestation, so a gate can require that exact build.</td>
              </tr>
              <tr>
                <td>Keys and secrets</td>
                <td>
                  OutLayer’s shared master by default. A customer can use a <a href="https://github.com/out-layer/outlayer/blob/main/VAULTS.md">sovereign vault</a>: a master derived by the NEAR MPC network from the customer’s own account. Every derivation is a public transaction, a project’s keys can name that vault, and the customer can <a href="https://github.com/out-layer/outlayer/blob/main/docs/LEAVING_OUTLAYER.md">leave</a> without OutLayer’s cooperation. This demo does not use one.
                </td>
              </tr>
              <tr>
                <td>Which worker and keystore builds are approved</td>
                <td>
                  OutLayer, today. One account approves builds, the DAO has one member, contracts upgrade by key, and the DAO account’s key can obtain the shared master outside an enclave. An approved build could also derive a locked vault’s master, though only by a public transaction. OutLayer’s <a href="https://github.com/out-layer/outlayer/blob/main/docs/NON_CUSTODIAL.md#governance-at-this-stage">documentation</a> commits to moving this to a vote with independent members. Until then, a customer’s gate can accept only worker measurements it has reviewed itself.
                </td>
              </tr>
              <tr>
                <td>Keeping it running</td>
                <td>OutLayer. If it stops, new runs stop. Labels already issued still verify against the pinned keys, and the code, the rules and a vault’s secrets stay with the customer.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h2>Who is who</h2>
        <p>Each person is a separate testnet account. Employees call with their own payment key, and the enclave gives each their own signing key.</p>
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
                    Owns the project and its rules. Every label is signed with the company’s key, <code>{short(people.company.label_key, 8)}</code>
                  </td>
                </tr>
                {Object.entries(people.employees).map(([account, e]) => (
                  <tr key={account}>
                    <td className="mono">{account}</td>
                    <td>{e.position}</td>
                    <td>
                      Asks. Their labels are also signed with their own key, <code>{short(e.caller_key, 8)}</code>
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
            A gate is whatever acts on the AI’s answer: a workflow, a filing system, another agent. It takes the label and the keys it trusts, never the prompt, and accepts or refuses. Each company picks its own bar. Requiring every decision model to run in a TEE refuses this label, because this project screens outside a TEE (<a href="#step-11">step 11</a> does not).
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
            ]}
          />
          <TaskCard dir="scenes/04-recruiter-hiring-approved" officer="acme-hr-director.testnet" />
          <Built>
            <p>
              <strong>Escalation is a delegated OutLayer task.</strong> Tasks are a platform feature: a run leaves a person a request, and that person reads it in their OutLayer inbox and answers with one wallet signature. Nothing waits inside the enclave, and the task is a sealed record. The module writes one call, <code>open-for(officer, request)</code>, and gets the inbox, the encrypted
              delivery, the signature check and the restart.
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
            ]}
          />
          <Shots shots={[['13-approved-proof', 'The second run has its own attestation, tied to the officer’s task']]} />
          <Built>
            <p>
              <strong>The officer’s signature starts a second attested run,</strong> by the platform, on the employee’s key. The officer sends no transaction and pays nothing. That run takes back the sealed request and the screen as made, answers, and seals the receipt to the tab that asked. The task is bound to the hash of the company’s configuration, so if the rules change while it waits, the task is void.
            </p>
          </Built>
          <SceneEvidence dir="scenes/04-recruiter-hiring-approved/2-answer" people={people} extra={[['scenes/04-recruiter-hiring-approved/officer-approval.json', 'Officer’s signature', 'The signed approval of this task']]} />
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
          <p>The recruiter asks whether to dismiss an employee, and the HR director rejects it. No second run starts, so no model answers. What stays is the signed “escalated” label, which no gate accepts. The no itself is recorded by the platform’s task, not by an enclave signature.</p>
          <Shots shots={[['16-rejected', 'Stopped by the officer, with no answer']]} />
          <SceneEvidence dir="scenes/06-recruiter-dismissal-rejected/1-waiting" people={people} />
        </Step>

        <Step n={10} title="Getting around the rules does not work">
          <p>Each attempt below was run for real. A call refused before it runs has no attestation and no label; the evidence is the platform’s own answer, and the attempt can be repeated with these accounts. The two lines with signatures show what a forged or personal label looks like to the company’s gate.</p>
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
          <p>The company’s second project uses the same code with a TEE-only configuration, so the stricter gate from step 3 accepts. This is the variant for when “who saw the prompt during screening” is the question. Its scores are not calibrated yet.</p>
          <Shots shots={[['19-tee', 'Screening attested: the strict gate accepts']]} />
          <Built>
            <p>
              <strong>Same wasm, same hash, another project.</strong> One published build serves many companies, each as a project of its own account with its own keys and row. A new customer is a configuration rather than a deployment. A pack can name a TEE model and ask through chat completions, and <code>screening_tee</code> requires a TEE for every pack.
            </p>
          </Built>
          <SceneEvidence dir="scenes/13-tee-screen" people={people} />
        </Step>
      </section>

      <section className="report-section">
        <h2>The whole ledger</h2>
        <p>
          Recomputed from the evidence files by <code>demo/verify.ts --strict</code>. The rows for steps 1–9 and 11 are from the page on 6 November. The rest ran the same library from a script on 5 November; the two screens in step 10 repeat its first two attempts on the page. Open it as{' '}
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

      <section className="report-section" id="limits">
        <h2>What this does not prove yet</h2>
        <ul className="limits">
          <li>
            <strong>That a company complies with the Act.</strong> These are controls with evidence. Ten rules cover a small part of the Act and were written for this demo, not reviewed by counsel.
          </li>
          <li>
            <strong>That a rule judged correctly.</strong> A rule is a yes/no question to a model with a threshold. It can miss or over-fire. The proof says which rule ran on which prompt and what it scored, not that the score was right.
          </li>
          <li>
            <strong>That nobody saw the prompt during screening, on the main project.</strong> Its decision model, <code>levanto/sage-2</code>, runs outside a TEE, and every label there says so. The TEE variant in <a href="#step-11">step 11</a> closes this, with scores that are not calibrated yet.
          </li>
          <li>
            <strong>What happened outside the gateway.</strong> An employee using another AI tool leaves no trace here. The proof covers what went through.
          </li>
          <li>
            <strong>That the inbox screen was used here.</strong> In these runs the officers signed with their account keys through the same API the inbox uses. An approving officer does read the prompt, by design.
          </li>
          <li>
            <strong>That an owner cannot change the code.</strong> A project’s owner can publish a new version that keeps its keys. A strict gate would also compare the code hash in the call’s attestation; the gate in this demo does not.
          </li>
          <li>
            <strong>That this is ready for a large company.</strong> It runs on testnet with employees as NEAR accounts, and the newest platform features it uses (the per-project key, several rows on a call, tasks for another owner) were released on testnet first. Single sign-on would need a gateway, and the employee’s identity then becomes that gateway’s statement.
          </li>
        </ul>
        <p className="note">
          The trust that remains: Intel’s and NVIDIA’s roots, NEAR AI’s model TEE, and OutLayer’s governance, as <a href="#why-outlayer">set out above</a>. A re-check reads the approved list today, so a worker build retired later will show here as no longer approved.
        </p>
      </section>

      <section className="report-section">
        <h2>Check it yourself</h2>
        <p>The same check as the buttons above, on all of the evidence, with no account or key:</p>
        <pre className="command">{`git clone ${REPO}
cd near-attested-ai/web && npm ci
DEMO_EVIDENCE=$PWD/public/report/evidence npx vite-node ../demo/verify.ts --strict`}</pre>
        <p>
          Or <a href="report/evidence.zip">download all the evidence</a>, browse <a href={`${EVIDENCE}/index.html`} target="_blank" rel="noreferrer">the evidence page</a>, and try <a href="./">the live page</a> with a testnet payment key. The code is at <a href={REPO}>{REPO.replace('https://', '')}</a>:{' '}
          <a href={`${REPO}/tree/main/module/src`}>the module</a>, <a href={`${REPO}/tree/main/policies`}>the packs</a>, <a href={`${REPO}/tree/main/registry`}>the registry</a> and <a href={`${REPO}/tree/main/web/src/lib/verify`}>the verifier</a>.
        </p>
      </section>

      <footer className="footer">
        A fictional company on NEAR testnet. Built on <a href="https://outlayer.ai">OutLayer</a> and <a href="https://cloud.near.ai">NEAR AI Cloud</a>. Not legal advice.
      </footer>
    </div>
  );
}
