import { useEffect, useState } from 'react';
import { loadPeople, loadPolicy, type People, type PolicyFacts } from './evidence';
import { Footer, PageNav, SeeNext } from './nav';
import { Built, PolicyEvidence, REGISTRY, REPO, SceneEvidence, Shots, Step, TaskCard } from './parts';

const INDEX: [number, string][] = [
  [1, 'The company sets the rules'],
  [2, 'An ordinary request is allowed'],
  [3, 'A receiving system decides from the label'],
  [4, 'What stands behind the label'],
  [5, 'A prohibited practice is blocked'],
  [6, 'A hiring decision waits for the HR director'],
  [7, 'The HR director approves'],
  [8, 'Credit goes to the risk officer'],
  [9, 'An officer says no'],
  [10, 'The screen can run in a TEE too'],
];

export function DayPage({ focus }: { focus?: string }) {
  const [people, setPeople] = useState<People | null>(null);
  const [policy, setPolicy] = useState<PolicyFacts | null>(null);
  useEffect(() => {
    loadPeople().then(setPeople);
    loadPolicy('policy/recruiter').then(setPolicy);
  }, []);
  useEffect(() => {
    if (focus) setTimeout(() => document.getElementById(`step-${focus}`)?.scrollIntoView({ behavior: 'smooth' }), 150);
    else window.scrollTo(0, 0);
  }, [focus]);

  return (
    <div className="page report">
      <PageNav current="day" />

      <header className="showcase-head">
        <span className="showcase-tag">The demo · NEAR testnet</span>
        <h1>A company’s day, with its evidence</h1>
        <p className="lede">
          One fictional company, Acme Demo, with named positions on separate NEAR accounts. Compliance selects the rules; a recruiter and an analyst ask; an HR director and a risk officer approve. Every step below is a real run: its screens, the evidence files behind it, and a button that re-checks that evidence in your browser.
        </p>
      </header>

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
        <h2>The steps</h2>
        <div className="step-index">
          {INDEX.map(([n, title]) => (
            <a key={n} href={`#/day/${n}`}>
              <b>{n}</b> {title}
            </a>
          ))}
        </div>
      </section>

      <section className="report-section">
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
            A gate is whatever acts on the AI’s answer: a workflow, a filing system, another agent. It takes the label and the keys it trusts, never the prompt, and accepts or refuses. Each company picks its own bar. One setting requires that every decision model ran in a TEE, and the label shows whether it did: this project’s label is refused at that bar, and the one in <a href="#/day/10">step 10</a> is accepted.
          </p>
          <Shots
            shots={[
              ['03-gate-accepted', 'The company’s rule: accepted'],
              ['04-gate-refused-tee', 'A stricter rule, every decision model in a TEE: refused'],
            ]}
          />
          <Built>
            <p>
              <strong>Every label is signed twice,</strong> by two keys the manifest declares, from confidential key derivation (CKD) by the NEAR MPC network. The <code>label</code> key is one per project, so a gate pins one company key. The <code>caller</code> key is per account and out of reach of any other account’s run, so a gate can tell who asked at the signature level. The module never handles a key: it asks
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

        <Step n={10} title="The screen can run in a TEE too">
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

      <SeeNext current="day" />
      <Footer />
    </div>
  );
}
