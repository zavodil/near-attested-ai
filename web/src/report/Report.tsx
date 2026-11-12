import { useEffect, useState, type ReactNode } from 'react';
import { AttacksPage } from './Attacks';
import { DayPage } from './Day';
import { loadLedger, loadPolicy, type LedgerRow, type PolicyFacts } from './evidence';
import { Hero } from './Hero';
import { Footer, PageNav, SeeNext } from './nav';
import { REGISTRY } from './parts';
import { VerifyPage } from './Verify';
import { WhyPage } from './Why';

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
  [10, 'Screening can run in a TEE too,', 'on the same code under a stricter configuration.'],
];

const HOW: [string, string, string][] = [
  ['Sealed in the browser', 'The prompt is encrypted to a key only this project’s enclave holds, after the page checks the attestation of the call that gave it the key. OutLayer’s servers relay ciphertext.', 'ECIES · attested key'],
  ['Screened by the company’s rules', 'Inside Intel TDX, the module reads the company’s packs from NEAR by hash, and Sage scores every rule. The strictest rule that fires decides.', 'Intel TDX · Sage · NEAR'],
  ['Answered, stopped, or sent to a person', 'Allowed: a NEAR AI Cloud model answers in its own TEE. Blocked: no model is called. Escalated: a task waits in the named officer’s inbox for a wallet signature.', 'NEAR AI · OutLayer tasks'],
  ['Signed and proven', 'A label with no prompt in it, signed by the company’s and the employee’s keys from NEAR MPC CKD. An Intel quote for the run, Intel and NVIDIA evidence for the model.', 'ed25519 · DCAP · NVIDIA'],
];

const CONTRACT: [string, string][] = [
  ['Code fixed by its hash', 'One published wasm. Its hash is in every Intel quote, and a gate can require that exact build.'],
  ['Rules and state on chain', 'The packs in a publish-only registry contract; the company’s configuration in an encrypted row on NEAR that only the company’s account can replace.'],
  ['Accounts as callers', 'Each employee and officer is a NEAR account, and the attestation commits to the caller.'],
  ['Execution anyone can check', 'Every run is attested by Intel TDX hardware: this code, this input, this output, this caller. Public by call id.'],
  ['Results nobody can forge', 'Each label is signed by keys from NEAR MPC confidential key derivation, bound to this project and used only inside the TEE.'],
  ['Authority it grants', 'An escalation opens a task for a named account, and the approval is that account’s wallet signature.'],
];

const NEAR: [string, string][] = [
  ['Rules in a contract', 'A registry with publish and deprecate, no update, no delete. The enclave reads each pack by id@version and hashes the bytes; the label carries the hash and block height.'],
  ['NEAR accounts are the people', 'The company, each employee and each officer is a NEAR account. A call carries the caller’s account, and the attestation commits to it.'],
  ['Secrets on NEAR', 'The company’s rules and NEAR AI key are an encrypted row in OutLayer’s NEAR contract, under an access condition: removing a name ends that person’s access.'],
  ['Approvals with a wallet', 'An escalation is a task for the officer’s account. The officer approves with a wallet signature: no transaction, no fee.'],
  ['Keys from the NEAR MPC network', 'Company and employee label keys come from confidential key derivation by the NEAR MPC network, bound to this project. Nobody holds or guards them.'],
  ['Builds approved on chain', 'The worker’s TDX measurements are approved on a NEAR contract, and the verifier checks them there.'],
];

function Section({ id, title, kicker, children }: { id?: string; title: string; kicker?: string; children: ReactNode }) {
  return (
    <section className="report-section" id={id}>
      {kicker && <p className="kicker">{kicker}</p>}
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Overview() {
  const [policy, setPolicy] = useState<PolicyFacts | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  useEffect(() => {
    loadPolicy('policy/recruiter').then(setPolicy);
    loadLedger().then(setLedger);
  }, []);
  const attested = ledger.filter((r) => r.attestation === 'verified').length;

  return (
    <div className="page report">
      <header className="hero">
        <PageNav current="overview" />
        <Hero />
      </header>

      <Section kicker="The problem" title="The law asks for proof. Today a company can only show a log.">
        <div className="three">
          <div className="report-card">
            <h4>The rules are specific</h4>
            <p>The EU AI Act bans some uses of AI outright and requires human oversight of others, such as hiring and credit decisions. GDPR adds special-category data. A company answers for each request its staff send.</p>
          </div>
          <div className="report-card">
            <h4>A log is a claim</h4>
            <p>The usual answer is a proxy with a filter and a log. The vendor runs the filter, writes the log, and could skip both without anyone knowing.</p>
          </div>
          <div className="report-card">
            <h4>The prompt must stay private</h4>
            <p>An auditor needs to know which rules applied and who approved, not what the employee typed. A proof has to work without showing the data.</p>
          </div>
        </div>
        <p className="punch">
          This product replaces the claim with proof, end to end, from the employee’s browser to the GPU that answers. The buyer is a regulated company that wants AI in daily work and needs evidence for its own liability: it gets the controls, and the proof that they were enforced.
        </p>
      </Section>

      <Section kicker="The idea" title="The AI policy is an off-chain smart contract">
        <p>
          Smart contracts are still in the pre-AI era: a contract cannot call a model, keep a prompt private or run for more than one block, so AI policies run on a server that everyone has to take at its word. Here the company’s AI policy runs as an <strong>off-chain smart contract</strong>: the computation leaves the chain, the guarantees of a contract stay.
        </p>
        <div className="wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>A smart contract has</th>
                <th>The company’s AI policy here</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACT.map(([has, here]) => (
                <tr key={has}>
                  <td>
                    <strong>{has}</strong>
                  </td>
                  <td className="why">{here}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="punch">
          What it adds that an on-chain contract cannot do: it calls an AI model, keeps the prompt sealed so that the text opens only inside the enclave, and runs for seconds. Here it is called over HTTPS from the employee’s browser, and a receiving system checks the signed label before it acts. The same pattern called from a NEAR contract, in one transaction, is <a href="#same-core">below</a>.
        </p>
      </Section>

      <Section kicker="How it works" title="Four moves, one attested run">
        <ol className="how">
          {HOW.map(([title, text, code], i) => (
            <li key={title}>
              <span className="how-n">{i + 1}</span>
              <h4>{title}</h4>
              <p>{text}</p>
              <code>{code}</code>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="any-framework" kicker="The rules" title="Any framework is a pack of rules">
        <p>
          A pack is JSON: each rule is a plain yes/no question with a citation, a threshold and an action. Packs are published once to <code>{REGISTRY}</code> on NEAR and never change. The demo company runs four. Another regulation, a sector’s rules or one company’s own policy is another pack, and the enclave, the labels, the approvals and every verification work on it unchanged.
        </p>
        {policy && (
          <div className="pack-grid">
            {policy.output.packs.map((p) => (
              <div className="report-card" key={p.pack.id}>
                <h4>
                  {p.pack.title ?? p.pack.id} <span className="mono note">@{p.pack.version}</span>
                </h4>
                <ul className="pack-rules">
                  {p.pack.rules.map((r) => (
                    <li key={r.id}>
                      <span className="mono">{r.id}</span>
                      {r.cite && <span className="note"> {r.cite}</span>}
                      <span className={`chip chip-${r.action === 'block' ? 'block' : 'escalate'}`}>
                        {r.action} ≥ {r.threshold}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section kicker="Built on NEAR" title="Every trust anchor is on NEAR">
        <div className="cards">
          {NEAR.map(([title, text]) => (
            <div className="report-card" key={title}>
              <h4>{title}</h4>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section kicker="The demo" title="What was built, and run, on NEAR testnet">
        <p>One fictional company, Acme Demo, with named positions on separate accounts. Each line opens its step, with screens, evidence and a re-check.</p>
        <ol className="brief">
          {BRIEF.map(([n, title, text]) => (
            <li key={n}>
              <a href={`#/day/${n}`}>{title}</a> {text}
            </li>
          ))}
          <li>
            <a href="#/attacks">Going around it fails:</a> a former employee, an employee’s own rules or key, and a forged label are all refused.
          </li>
        </ol>
        <p>
          <strong>It works end to end.</strong> All <strong>{attested || '…'}</strong> attested runs in the evidence verify, and anyone can repeat that check, <a href="#/verify">in the browser</a> or from a terminal, without an account or a key of ours.
        </p>
      </Section>

      <Section kicker="Don’t trust this page" title="Verify every run, in your browser">
        <p>
          One button re-checks every attested run of the day: Intel’s quote, the packs on NEAR, NEAR AI’s Intel and NVIDIA evidence for the model, and both signatures on each label. No account, no key.
        </p>
        <a className="cta-big" href="#/verify">
          Open the verifier →
        </a>
      </Section>

      <Section id="same-core" kicker="The same core" title="The same off-chain smart contract, called by a NEAR contract">
        <p>
          The off-chain smart contract here is not tied to a company proxy. <a href="https://zavodil.github.io/offchain-smart-contract/">Off-chain smart contracts</a> applies the same concept with the same tools: rulebooks in this registry, a pinned build on OutLayer in Intel TDX that asks Sage every rule, a signing key from NEAR MPC CKD bound to that build, and this project’s in-browser attestation verifier. There the caller is a NEAR contract, and the signed verdict comes back in the same transaction, checked on chain before any money moves.
        </p>
      </Section>

      <SeeNext current="overview" />
      <Footer />
    </div>
  );
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

/** The report's pages, by hash: an old #step-N link still opens its step. */
export function Report() {
  const hash = useHash();
  const old = hash.match(/^#step-(\d+)$/);
  if (old) {
    const n = Number(old[1]);
    return n === 10 ? <AttacksPage /> : <DayPage focus={String(n === 11 ? 10 : n)} />;
  }
  if (hash.startsWith('#/day')) return <DayPage focus={hash.split('/')[2]} />;
  if (hash.startsWith('#/attacks')) return <AttacksPage />;
  if (hash.startsWith('#/why') || hash === '#why-outlayer') return <WhyPage />;
  if (hash.startsWith('#/verify')) return <VerifyPage />;
  return <Overview />;
}
