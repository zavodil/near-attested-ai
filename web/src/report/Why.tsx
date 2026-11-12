import { useEffect, useState } from 'react';
import { Footer, PageNav, SeeNext } from './nav';

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



/** Building the same stack in-house: hours per part, low and high. Our estimate. */
const BUILD: [string, string, number, number][] = [
  ['Confidential compute', 'TDX images, measured boot, reproducible builds, a deploy pipeline', 240, 400],
  ['Proof of each run', 'A quote per run, Intel DCAP verification, collateral caching, an approved-build list, a public record by call id', 240, 400],
  ['Signing keys', 'HSM integration, key release only to an attested enclave, a key per project and per person, rotation', 200, 360],
  ['Customer secrets', 'Encrypted rows per tenant, access conditions, replacement by the owner only', 200, 320],
  ['Approvals', 'Tasks, an inbox, signature checks, notifications, resuming a sealed request after a yes', 280, 480],
  ['Model evidence', 'Intel and NVIDIA evidence for each model call and its response signature, checked in the enclave and in the browser', 120, 240],
  ['Egress limits', 'A host list enforced by the platform, not by the code', 80, 160],
  ['Access and billing', 'Prepaid keys per person, metering, an API gateway, rate limits', 200, 360],
  ['Rules registry and verifier', 'A publish-only registry and a public verifier page', 120, 200],
  ['Redundancy', 'Two regions, failover, backups, recovery runbooks', 160, 280],
  ['Hardening', 'Security review fixes, tests, documentation', 160, 320],
];

/** Monthly running cost for two regions, from list prices. */
const RUN: [string, string, number, string][] = [
  ['TDX workers', '4 × Azure DC8es v5 (8 vCPU, 32 GiB), 2 per region', 1120, 'https://cloudprice.net/vm/Standard_DC4es_v5'],
  ['TDX key service', '2 × Azure DC4es v5, 1 per region', 280, 'https://cloudprice.net/vm/Standard_DC4es_v5'],
  ['Hardware security modules', '2 × AWS CloudHSM at $1.60 an hour, for high availability', 2300, 'https://aws.amazon.com/cloudhsm/pricing/'],
  ['Databases, queue, load balancers', 'Managed Postgres and Redis with replicas, in both regions', 900, ''],
  ['Monitoring and logs', 'Metrics, alerts, log retention', 200, ''],
];

function BuildItYourself() {
  const [rate, setRate] = useState(100);
  const [ops, setOps] = useState(80);
  const low = BUILD.reduce((a, [, , l]) => a + l, 0);
  const high = BUILD.reduce((a, [, , , h]) => a + h, 0);
  const infra = RUN.reduce((a, [, , usd]) => a + usd, 0);
  const k = (n: number) => `${Math.round(n / 1000)}k`;
  return (
    <section className="report-section">
      <p className="kicker">Build it yourself</p>
      <h2>What the same stack costs in-house</h2>
      <p>
        A team that wants this without OutLayer builds and runs every row of the table above. Our estimate for a first production version, with redundancy and updates, follows. The hours are ours; the server prices are list prices.
      </p>
      <div className="market">
        <div className="market-inputs">
          <label>
            <span>Engineering rate, fully loaded</span>
            <input type="range" min={50} max={200} step={5} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            <b>€{rate}/h</b>
          </label>
          <label>
            <span>Operations and updates, hours a month</span>
            <input type="range" min={20} max={200} step={10} value={ops} onChange={(e) => setOps(Number(e.target.value))} />
            <b>{ops} h</b>
          </label>
        </div>
        <div className="market-out">
          <div>
            <span>Build: hours</span>
            <b>
              {low.toLocaleString('en')}–{high.toLocaleString('en')}
            </b>
          </div>
          <div>
            <span>Build: cost</span>
            <b>
              €{k(low * rate)}–{k(high * rate)}
            </b>
          </div>
          <div>
            <span>Run: per month</span>
            <b>
              ≈ ${k(infra)} + €{k(ops * rate)}
            </b>
          </div>
        </div>
      </div>
      <div className="two">
        <div className="wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>To build</th>
                <th className="num">Hours</th>
              </tr>
            </thead>
            <tbody>
              {BUILD.map(([part, what, l, h]) => (
                <tr key={part}>
                  <td>
                    <strong>{part}</strong>
                    <div className="cite">{what}</div>
                  </td>
                  <td className="num">
                    {l}–{h}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>To run, two regions</th>
                <th className="num">$ a month</th>
              </tr>
            </thead>
            <tbody>
              {RUN.map(([part, what, usd, href]) => (
                <tr key={part}>
                  <td>
                    <strong>{part}</strong>
                    <div className="cite">
                      {what}
                      {href && (
                        <>
                          {' '}
                          <a href={href} target="_blank" rel="noreferrer">
                            price ↗
                          </a>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="num">{usd.toLocaleString('en')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="plain">
        <li>
          <strong>Updates do not stop.</strong> Intel’s TCB recoveries, attestation collateral that expires, kernel and image updates, and NVIDIA’s attestation keys, which rotate every few days: the hours a month above are for that, plus being on call.
        </li>
        <li>
          <strong>Not counted:</strong> an external security audit, recruiting, and the months before the first customer. A team of three needs roughly five to nine months for the hours above.
        </li>
        <li>
          <strong>What money does not buy in-house:</strong> keys that nobody holds. An HSM is a vendor’s promise not to sign; here the keys come from confidential key derivation by the NEAR MPC network, the rules and the approved builds are on a public chain, and approvals are wallet signatures anyone can check, instead of the operator’s word.
        </li>
      </ul>
      <p className="note">
        Server prices: Azure DCesv5 pay-as-you-go, from about $140 a month for 4 vCPU (DC4es v5) and $560 for 16 vCPU (DC16es v5), so about $280 for the 8 vCPU size; AWS CloudHSM $1.60 per HSM-hour in us-east-1. Databases and monitoring are typical managed-service prices. Rates vary by region and contract.
      </p>
    </section>
  );
}

export function WhyPage() {
  const [tab, setTab] = useState<'business' | 'engineering'>('business');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="page report">
      <PageNav current="why" />

      <header className="showcase-head">
        <span className="showcase-tag">The platform</span>
        <h1>Why build it on OutLayer</h1>
        <p className="lede">
          OutLayer is verifiable compute on NEAR: code runs inside an Intel TDX enclave, and every run comes with proof. The company’s day is the evidence that this works today. Here is what it means for a product, for NEAR AI, and for the customer’s control.
        </p>
      </header>

      <section className="report-section">
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

      <BuildItYourself />

      <SeeNext current="why" />
      <Footer />
    </div>
  );
}
