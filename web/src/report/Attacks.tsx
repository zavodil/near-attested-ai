import { useEffect, useState } from 'react';
import { loadLedger, type LedgerRow } from './evidence';
import { Footer, PageNav, SeeNext } from './nav';
import { Built, mark, Shots } from './parts';

export function AttacksPage() {
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  useEffect(() => {
    window.scrollTo(0, 0);
    loadLedger().then(setLedger);
  }, []);
  const attempts = ledger.filter((r) => /^(07|08|09|10|11|12)-/.test(r.scene) || r.scene === 'forged');

  return (
    <div className="page report">
      <PageNav current="attacks" />

      <header className="showcase-head">
        <span className="showcase-tag">Adversarial</span>
        <h1>Getting around the rules does not work</h1>
        <p className="lede">
          A former employee, an employee who brings rules or a NEAR AI key of their own, a company declared on a personal project, an escalation that leaves the officers out, and a label with the employee renamed. Each was tried for real, and each is refused: by the platform before anything runs, or by the company’s gate.
        </p>
      </header>

      <section className="report-section">
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
      </section>

      <SeeNext current="attacks" />
      <Footer />
    </div>
  );
}
