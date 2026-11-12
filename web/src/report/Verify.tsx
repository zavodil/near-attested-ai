import { Fragment, useEffect, useState } from 'react';
import { ProofCard } from '../components/ProofCard';
import { message, overall, type ProofGroup, type Verdict } from '../lib/verify/types';
import { EVIDENCE, loadLedger, loadPeople, loadPolicy, loadScene, recheckPolicy, recheckScene, type LedgerRow, type People } from './evidence';
import { Footer, PageNav, SeeNext } from './nav';
import { mark, REPO } from './parts';

interface Row {
  key: string;
  title: string;
  who: string;
  outcome: string;
  gate: string;
  state: 'waiting' | 'checking' | 'done';
  verdict?: Verdict;
  groups?: ProofGroup[];
  error?: string;
  run: (people: People) => Promise<ProofGroup[]>;
}

const MARK: Record<Verdict, string> = { pass: '✓', warn: '!', fail: '✗', skip: '–' };

const dirOf = (labelFile: string) => labelFile.replace(/\/label\.json$/, '');

export function VerifyPage() {
  const [people, setPeople] = useState<People | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    loadPeople().then(setPeople);
    loadLedger().then((l) => {
      setLedger(l);
      const runs: Row[] = l
        .filter((r) => r.label_file && r.mode === 'company')
        .map((r) => ({
          key: r.label_file,
          title: r.title,
          who: r.who,
          outcome: r.approved_by ? `${r.outcome}, approved by ${r.approved_by}` : r.outcome,
          gate: r.company_gate,
          state: 'waiting',
          run: async (p: People) => recheckScene(await loadScene(dirOf(r.label_file), p), p),
        }));
      setRows([
        {
          key: 'policy',
          title: 'The company’s rules: the configuration and each pack, as the enclave read them',
          who: 'acme-recruiter.testnet',
          outcome: 'rules read',
          gate: '',
          state: 'waiting',
          run: async () => recheckPolicy(await loadPolicy('policy/recruiter')),
        },
        ...runs,
      ]);
    });
  }, []);

  async function verifyAll() {
    if (!people) return;
    setRunning(true);
    for (const row of rows) {
      setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, state: 'checking', error: undefined } : r)));
      try {
        const groups = await row.run(people);
        const verdict = overall(groups.map((g) => ({ label: g.title, verdict: g.verdict, detail: '' })));
        setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, state: 'done', groups, verdict } : r)));
      } catch (e) {
        setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, state: 'done', verdict: 'fail', error: message(e) } : r)));
      }
    }
    setRunning(false);
  }

  const done = rows.filter((r) => r.state === 'done');
  const counts = done.reduce((c, r) => ({ ...c, [r.verdict!]: (c[r.verdict!] ?? 0) + 1 }), {} as Record<string, number>);

  return (
    <div className="page report">
      <PageNav current="verify" />

      <header className="showcase-head">
        <span className="showcase-tag">Don’t trust this page</span>
        <h1>Verify every run, in your browser</h1>
        <p className="lede">
          One button re-checks every attested run of the company’s day from the evidence files and public sources: Intel’s signature on each TDX quote, that the quote covers this code, input, output and caller, the worker’s approval on NEAR, each rule pack’s hash in the registry on NEAR, NEAR AI’s Intel and NVIDIA evidence for the model, and the company’s and the employee’s signatures on the label. No account, no key of ours.
        </p>
      </header>

      <div className="verify-run">
        <button className="primary big" onClick={verifyAll} disabled={running || !people || rows.length === 0}>
          {running ? `Checking Intel, NVIDIA and NEAR… ${done.length} of ${rows.length}` : done.length ? 'Verify again' : `Verify all ${rows.length || ''} runs`}
        </button>
        {done.length > 0 && !running && (
          <span className="verify-summary">
            {done.length} checked: {Object.entries(counts).map(([k, v]) => `${v} ${k === 'pass' ? 'verified' : k === 'warn' ? 'verified with notes' : 'failed'}`).join(', ')}
          </span>
        )}
      </div>

      <section className="report-section">
        <h2>The runs</h2>
        <div className="wrap wide">
          <table className="verify-table">
            <thead>
              <tr>
                <th>What happened</th>
                <th>Who</th>
                <th>Outcome</th>
                <th>Company’s gate</th>
                <th>Checks</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.key}>
                  <tr className={`verify-row ${r.state}`}>
                    <td>{r.title}</td>
                    <td className="mono">{r.who}</td>
                    <td>{r.outcome}</td>
                    <td>{r.gate ? mark(r.gate) : '—'}</td>
                    <td>
                      {r.state === 'waiting' && <span className="note">not checked yet</span>}
                      {r.state === 'checking' && <span className="note">checking…</span>}
                      {r.error && <span className="no">{r.error}</span>}
                      {r.groups && (
                        <span className="verify-steps">
                          {r.groups.map((g) => (
                            <i key={g.id + g.title} className={`ok-${g.verdict}`} title={`${g.title}: ${g.subtitle}`}>
                              {MARK[g.verdict]}
                            </i>
                          ))}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.groups && (
                        <button className="link" onClick={() => setOpen(open === r.key ? null : r.key)}>
                          {open === r.key ? 'hide' : 'details'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === r.key && r.groups && (
                    <tr>
                      <td colSpan={6}>
                        <div className="proofs">
                          {r.groups.map((g) => (
                            <ProofCard key={g.id + g.title} group={g} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          A refused gate is not a failed check: a blocked request and a request still waiting for its officer are signed and attested too, and the company’s gate refuses them by design. The attempts that never ran have no run to check; they are on <a href="#/attacks">Getting around it</a>.
        </p>
      </section>

      <section className="report-section">
        <h2>What each group of checks means</h2>
        <ol className="steps-list">
          <li><b>Where the keys come from.</b> The attested call that published the company’s and the employee’s keys: a gate learns them from a proof, not from a person.</li>
          <li><b>The run in OutLayer’s enclave.</b> Intel signed the TDX quote, with Intel’s signed collateral; the quote commits to this code, input, output, caller and project; the worker’s five measurements are approved on NEAR.</li>
          <li><b>The packs on NEAR.</b> Each pack the label names has the same sha256 in the registry contract.</li>
          <li><b>The models.</b> NEAR AI’s evidence for each model the run called: Intel’s quote and NVIDIA’s verdict for its TEE, and that TEE’s signature over this request and response.</li>
          <li><b>The label.</b> The receipt hashes to the digest in the attested output; the company’s and the employee’s signatures hold against the pinned keys; the label matches the receipt.</li>
        </ol>
      </section>

      <section className="report-section report-wide">
        <h2>The whole ledger</h2>
        <p>
          Every scene of the day, including the attempts that never ran, recomputed from the evidence files by <code>demo/verify.ts --strict</code>. Open it as{' '}
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
        </div>      </section>

      <section className="report-section">
        <h2>Or from a terminal</h2>
        <pre className="command">{`git clone ${REPO}
cd near-attested-ai/web && npm ci
DEMO_EVIDENCE=$PWD/public/report/evidence npx vite-node ../demo/verify.ts --strict`}</pre>
        <p>
          The same checks for every run and every label, plus a forgery: it renames the employee in one label and shows the gate refusing it. It writes <code>ledger.csv</code> and exits non-zero if a receipt or an attestation fails. Or <a href="report/evidence.zip">download all the evidence</a> and browse <a href={`${EVIDENCE}/index.html`} target="_blank" rel="noreferrer">the evidence page</a>. A re-check reads the approved worker list as it stands that day, so a build retired later shows as no longer approved.
        </p>
      </section>

      <SeeNext current="verify" />
      <Footer />
    </div>
  );
}
