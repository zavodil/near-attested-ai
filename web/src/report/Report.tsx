import { useEffect, useState, type ReactNode } from 'react';
import { ProofCard } from '../components/ProofCard';
import { message, overall, short, type ProofGroup, type Verdict } from '../lib/verify/types';
import { EVIDENCE, loadLedger, loadOfficerTask, loadPeople, loadPolicy, loadScene, recheckPolicy, recheckScene, type LedgerRow, type OfficerTask, type People, type PolicyFacts, type SceneFacts } from './evidence';

const REPO = 'https://github.com/zavodil/near-attested-ai';
const API = 'https://testnet-api.outlayer.ai';
const REGISTRY = 'policies.zavodil.testnet';

const when = (seconds: number) => `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const file = (path: string, name: string) => (
  <a key={name} href={`${EVIDENCE}/${path}`} target="_blank" rel="noreferrer">
    {name}
  </a>
);

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

function Recheck({ run }: { run: () => Promise<ProofGroup[]> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [groups, setGroups] = useState<ProofGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const start = async () => {
    setState('busy');
    setError(null);
    try {
      setGroups(await run());
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
          <summary>{groups.length} groups of checks</summary>
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

function SceneEvidence({ dir, people, extra }: { dir: string; people: People | null; extra?: [string, string][] }) {
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
        <dt>Files</dt>
        <dd className="files">
          {file(`${dir}/label.json`, 'label')}
          {file(`${dir}/attestation.json`, 'attestation (Intel quote)')}
          {file(`${dir}/receipt.json`, 'receipt')}
          {file(`${dir}/input.json`, 'sealed input')}
          {file(`${dir}/output.json`, 'sealed output')}
          {extra?.map(([path, name]) => file(path, name))}
        </dd>
      </dl>
      <Recheck run={() => recheckScene(facts, people)} />
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
        <dt>Files</dt>
        <dd className="files">
          {file('policy/recruiter/output.json', 'the rules as the enclave read them')}
          {file('policy/recruiter/attestation.json', 'attestation (Intel quote)')}
        </dd>
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
                  <td>{Math.round(r.threshold * 100)}%</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <Recheck run={() => recheckPolicy(policy)} />
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
          <span className="brand-sub">report · 6 November 2026</span>
        </div>
        <h1>
          EU AI Act controls,
          <br />
          <span>with proof of enforcement.</span>
        </h1>
        <p className="lede">
          A company selects a framework. Every AI request is evaluated against its rules, then allowed, blocked or escalated to a person. Each outcome carries cryptographic proof that the controls ran. This report follows one fictional
          company, Acme Demo, through that on NEAR testnet, on OutLayer and NEAR AI Cloud.
        </p>
      </header>

      <section className="report-section">
        <h2>The result</h2>
        <p>
          The idea runs end to end. <strong>{attested} attested runs</strong> in this report’s evidence verify and <strong>{failed}</strong> fail, and all of it can be checked without an account or a key of ours. It runs on testnet, the prompts are
          invented, and screening has limits that matter for a real customer: read <a href="#limits">what this does not prove</a> before relying on it.
        </p>
        <div className="wrap">
          <table>
            <thead>
              <tr>
                <th>The brief</th>
                <th>What runs</th>
                <th>Steps</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Select a compliance framework, like the EU AI Act</td>
                <td>The company’s configuration names versioned rule packs held in a registry on NEAR: EU AI Act Art. 5 and Annex III, GDPR Art. 9, a company baseline.</td>
                <td>
                  <a href="#step-1">1</a>
                </td>
              </tr>
              <tr>
                <td>Evaluate every AI request automatically</td>
                <td>Every run screens the prompt inside an attested enclave, under the company’s rules, whatever the page or the employee asks.</td>
                <td>
                  <a href="#step-2">2</a>, <a href="#step-10">10</a>
                </td>
              </tr>
              <tr>
                <td>Programmable controls that allow, block or escalate</td>
                <td>All three outcomes, with each escalation routed to the officer named for that rule, and a no ending the request.</td>
                <td>
                  <a href="#step-2">2</a>, <a href="#step-5">5</a>–<a href="#step-9">9</a>
                </td>
              </tr>
              <tr>
                <td>Cryptographic proof the controls were enforced</td>
                <td>A label signed by the company’s key and the employee’s key, with no prompt in it, and an Intel TDX attestation of the run. A receiving system can decide on the label alone.</td>
                <td>
                  <a href="#step-3">3</a>, <a href="#step-4">4</a>
                </td>
              </tr>
              <tr>
                <td>A handful of EU AI Act rules</td>
                <td>Seven EU AI Act rules, plus one from GDPR and two company rules.</td>
                <td>
                  <a href="#step-1">1</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h2>The company</h2>
        <p>Every person is a separate testnet account. Employees call with their own payment key, and each gets their own signing key from the enclave.</p>
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
                    Owns the project and its rules. Signs every label with <code>{short(people.company.label_key, 8)}</code>
                  </td>
                </tr>
                {Object.entries(people.employees).map(([account, e]) => (
                  <tr key={account}>
                    <td className="mono">{account}</td>
                    <td>{e.position}</td>
                    <td>
                      Asks. Signs their own labels with <code>{short(e.caller_key, 8)}</code>
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
          How to read the steps: the screens are the live page (click one to enlarge it), and each step’s evidence is the same call as its screen. <em>Re-check</em> recomputes the proof in your browser from the published files, using Intel’s signed collateral (archived by OutLayer), NVIDIA’s keys and NEAR. The receipts
          hold the prompts in the clear because these are invented; a real company would hand a receipt to its auditor and only the label to everyone else.
        </p>
      </section>

      <section className="report-section">
        <h2>The day, step by step</h2>

        <Step n={1} title="The company sets the rules">
          <p>
            Compliance stores one configuration under the company’s own project: which packs apply, which models are allowed, which officer takes which rule. The enclave opens it on every run. The packs live in a registry on NEAR (
            <a href={`https://testnet.nearblocks.io/address/${REGISTRY}`} target="_blank" rel="noreferrer">
              {REGISTRY}
            </a>
            ), and each is checked against its hash there.
          </p>
          <Shots shots={[['01-rules', 'The recruiter’s page: the rules are the company’s, and the employee cannot edit them']]} />
          <PolicyEvidence policy={policy} />
        </Step>

        <Step n={2} title="An ordinary request is allowed">
          <p>
            The recruiter asks for a meeting email. The prompt is sealed in the browser to a key held in the enclave, screened against all ten rules, and answered by a model in NEAR AI’s Intel TDX and NVIDIA TEE. OutLayer’s servers only relay ciphertext.
          </p>
          <Shots shots={[['02-answer', 'Passed all ten rules, answered in a TEE, label signed']]} />
          <SceneEvidence dir="scenes/01-recruiter-ordinary" people={people} />
        </Step>

        <Step n={3} title="A receiving system decides from the label">
          <p>
            A gate is whatever acts on the AI’s answer: a workflow, a filing system, another agent. It takes the label and the pinned keys, never the prompt, and accepts or refuses. A company picks its own bar. Requiring every decision model to run in a TEE refuses this
            label, because this project screens outside a TEE (<a href="#step-11">step 11</a> does not).
          </p>
          <Shots
            shots={[
              ['03-gate-accepted', 'The company’s rule: accepted'],
              ['04-gate-refused-tee', 'A stricter rule, every decision model in a TEE: refused'],
            ]}
          />
          <p className="note">This step and the next use the call from step 2.</p>
        </Step>

        <Step n={4} title="What stands behind the label">
          <p>
            OutLayer’s proof: Intel signed a quote from TDX hardware, the quote commits to this code, input, output, caller and project, and the worker’s build is on the approved list on NEAR. NEAR AI’s proof: Intel and NVIDIA vouch for the model’s TEE, and that TEE signed this
            exact answer.
          </p>
          <Shots
            shots={[
              ['05-proof-outlayer', 'The run in OutLayer’s enclave'],
              ['06-proof-model', 'The answering model in NEAR AI’s TEE'],
            ]}
          />
        </Step>

        <Step n={5} title="A prohibited practice is blocked">
          <p>
            The analyst asks for a social scoring system. Art. 5(1)(c) fires inside the enclave, and the answering model is never called. The refusal is signed too, so the company can prove it stopped this request, and the gate refuses the label.
          </p>
          <Shots
            shots={[
              ['07-blocked', 'Stopped inside the enclave, with each rule’s score'],
              ['08-blocked-label', 'The signed label of a refusal: the gate refuses it'],
            ]}
          />
          <SceneEvidence dir="scenes/03-analyst-blocked" people={people} />
        </Step>

        <Step n={6} title="A hiring decision waits for the HR director">
          <p>
            The recruiter asks to rank candidates. Annex III(4) escalates: nothing is answered, and a task lands in the inbox of the officer the configuration names for that rule. The label so far says “escalated”, and a gate refuses it.
          </p>
          <Shots
            shots={[
              ['09-waiting-hr', 'The prompt held; the page waits for the officer'],
              ['10-waiting-label', 'The label while it waits: refused'],
            ]}
          />
          <TaskCard dir="scenes/04-recruiter-hiring-approved" officer="acme-hr-director.testnet" />
          <SceneEvidence dir="scenes/04-recruiter-hiring-approved/1-waiting" people={people} />
        </Step>

        <Step n={7} title="The HR director approves, and the answer comes back">
          <p>
            The officer’s signature starts a second attested run, as the same employee. That run takes back the sealed request and the screen as it was made, answers, and seals the receipt to the tab that asked. The label now names the officer and the task, and the same gate accepts it.
          </p>
          <Shots
            shots={[
              ['11-approved', 'The answer, with who approved and the screen that escalated'],
              ['12-approved-label', 'The label with the approval: accepted'],
            ]}
          />
          <Shots shots={[['13-approved-proof', 'The second run has its own attestation, tied to the officer’s task']]} />
          <SceneEvidence dir="scenes/04-recruiter-hiring-approved/2-answer" people={people} extra={[['scenes/04-recruiter-hiring-approved/officer-approval.json', 'officer’s signature']]} />
        </Step>

        <Step n={8} title="The same rules send credit to the risk officer">
          <p>The analyst asks for a loan decision. Annex III(5)(b) fires, and this one goes to the risk officer rather than HR. The configuration names an officer per rule, and the task opens for that officer alone.</p>
          <Shots
            shots={[
              ['14-waiting-risk', 'Routed to the risk officer'],
              ['15-risk-label', 'Approved by the risk officer: accepted'],
            ]}
          />
          <TaskCard dir="scenes/05-analyst-credit-approved" officer="acme-risk-officer.testnet" />
          <SceneEvidence dir="scenes/05-analyst-credit-approved/2-answer" people={people} extra={[['scenes/05-analyst-credit-approved/1-waiting/label.json', 'label while it waited'], ['scenes/05-analyst-credit-approved/officer-approval.json', 'officer’s signature']]} />
        </Step>

        <Step n={9} title="An officer says no">
          <p>The recruiter asks whether to dismiss an employee, and the HR director rejects it. No second run starts, so no model answers. What stays is the signed “escalated” label, which no gate accepts. The no itself is recorded by the platform’s task, not by an enclave signature.</p>
          <Shots shots={[['16-rejected', 'Stopped by the officer, with no answer']]} />
          <SceneEvidence dir="scenes/06-recruiter-dismissal-rejected/1-waiting" people={people} />
        </Step>

        <Step n={10} title="Getting around the rules does not work">
          <p>Each attempt below was run for real. A call refused before it runs has no attestation and no label; the evidence is the platform’s own answer, and the same attempt can be repeated with these accounts. The two lines with signatures show what a forged or personal label looks like to the company’s gate.</p>
          <Shots
            shots={[
              ['17-former', 'A former employee, off the company’s list'],
              ['18-own-rules', 'An employee naming rules of their own'],
            ]}
          />
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
          <p>The company’s second project uses the same code with a TEE-only configuration: the rules are put to a model in NEAR AI’s TEE, so the stricter gate from step 3 accepts. This is the variant to show when “who saw the prompt during screening” is the question. Its scores are not calibrated yet.</p>
          <Shots shots={[['19-tee', 'Screening attested: the strict gate accepts']]} />
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
        <h2>What this does not prove</h2>
        <ul className="limits">
          <li>
            <strong>That a company complies with the Act.</strong> These are controls with evidence. Ten rules cover a small part of the Act and were written for this demo, not reviewed by counsel.
          </li>
          <li>
            <strong>That a rule judged correctly.</strong> A rule is a yes/no question to a model with a threshold. It can miss or over-fire. The proof says which rule ran on which prompt and what it scored, not that the score was right.
          </li>
          <li>
            <strong>That nobody saw the prompt during screening, on the main project.</strong> Its decision model, <code>levanto/sage-2</code>, runs outside a TEE, and every label there says so. The TEE variant in step 11 closes this, with scores that are not calibrated yet.
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
            <strong>That this is ready for a large company.</strong> It is testnet, with employees as NEAR accounts. Single sign-on would need a gateway, and the employee’s identity then becomes that gateway’s statement.
          </li>
        </ul>
        <p className="note">The trust that remains: Intel’s and NVIDIA’s roots, the approved worker list on NEAR, and NEAR AI’s model TEE. A re-check reads that list today, so a worker build retired later will show here as no longer approved.</p>
      </section>

      <section className="report-section">
        <h2>Check it yourself</h2>
        <p>The same check as the buttons above, on all of the evidence, with no account or key:</p>
        <pre className="command">{`git clone ${REPO}
cd near-attested-ai/web && npm ci
DEMO_EVIDENCE=$PWD/public/report/evidence npx vite-node ../demo/verify.ts --strict`}</pre>
        <p>
          Or browse <a href={`${EVIDENCE}/index.html`} target="_blank" rel="noreferrer">the evidence page</a>, and try <a href="./">the live page</a> with a testnet payment key.
        </p>
      </section>

      <section className="report-section">
        <h2>For engineers</h2>
        <ul className="limits">
          <li>
            <strong>Company:</strong> one project per company, same wasm. The manifest’s <code>author_secrets</code> opens the owner’s row on every run, holding the NEAR AI key and the configuration, so the project owner is the organisation. The row’s access condition is who may run. A call that names a clashing row is refused by the worker.
          </li>
          <li>
            <strong>Signing:</strong> two keystore-derived ed25519 keys in the <a href={`${REPO}/blob/main/module/manifest.json`}>manifest</a>. <code>label</code> has no caller and is one key per project; <code>caller</code> is per account and out of reach of any other account’s run. Keys are pinned from an attested <code>enclave_key</code> call.
          </li>
          <li>
            <strong>Screening:</strong> <a href={`${REPO}/tree/main/policies`}>packs</a> are JSON, immutable per version, hashed over their bytes in a <a href={`${REPO}/tree/main/registry`}>registry contract</a>. <a href={`${REPO}/blob/main/module/src/screening.rs`}>The module</a> reads them from the chain inside the enclave, then scores each rule.
          </li>
          <li>
            <strong>Escalation:</strong> <a href={`${REPO}/blob/main/module/src/escalate.rs`}>a task opened for the officer</a> under the configuration’s hash. A changed configuration voids it. The approval starts <code>answer_escalated</code> with every row named again.
          </li>
          <li>
            <strong>Verification:</strong> <a href={`${REPO}/tree/main/web/src/lib/verify`}>the page’s library</a>, which the buttons here and <code>demo/verify.ts</code> both call: Intel DCAP in WebAssembly, NVIDIA tokens against NVIDIA’s keys, signatures, and pack hashes read from NEAR.
          </li>
        </ul>
      </section>

      <footer className="footer">
        A fictional company on NEAR testnet. Built on <a href="https://outlayer.ai">OutLayer</a> and <a href="https://cloud.near.ai">NEAR AI Cloud</a>. Not legal advice.
      </footer>
    </div>
  );
}
