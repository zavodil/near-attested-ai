import { useEffect, useState } from 'react';
import { loadLedger, type LedgerRow } from './evidence';
import { Footer, PageNav, SeeNext } from './nav';
import { EvidenceFile, Shots } from './parts';

type Wall = 'list' | 'row' | 'code' | 'gate';

/** Where an attempt is stopped, in the order a request meets them. */
const WALLS: [Wall, string, string][] = [
  ['list', 'The company’s list', 'Who may use the company’s AI at all. Stored encrypted on NEAR, checked by OutLayer’s keystore on every call.'],
  ['row', 'The company’s settings', 'The company’s rules and its NEAR AI key, in the company’s own encrypted row. A call cannot bring replacements.'],
  ['code', 'The code', 'The published program, attested on every run. It stops any request it cannot handle by the rules.'],
  ['gate', 'The label check', 'Whatever acts on an answer checks its signed label first: whose keys signed it, for which company, for which employee.'],
];

interface Attempt {
  scene: string;
  title: string;
  risk: string;
  stops: string;
  wall: Wall;
  ran: boolean;
  shot?: [string, string];
  files?: [string, string, string][];
}

const ATTEMPTS: Attempt[] = [
  {
    scene: '07-former-employee',
    title: 'A former employee keeps using the company’s AI',
    risk: 'People leave. Their access to the company’s AI, its key and its rules has to end the day they go.',
    stops: 'The company keeps the list of people who may use it. Their name is not on it any more, so OutLayer refused the call before anything ran. Ending access is one edit to the list: nothing to redeploy.',
    wall: 'list',
    ran: false,
    shot: ['17-former', 'The former employee’s page: stopped at the first step'],
  },
  {
    scene: '08-own-rules',
    title: 'An employee brings looser rules of their own',
    risk: 'The rules are the point. If an employee could replace the company’s rules with their own, every request would pass.',
    stops: 'The company’s rules live in the company’s own row. A call that brings another set of rules is refused by OutLayer before it runs.',
    wall: 'row',
    ran: false,
    shot: ['18-own-rules', 'The recruiter’s page with their own rules attached: stopped'],
  },
  {
    scene: '09-own-key',
    title: 'An employee brings their own NEAR AI key',
    risk: 'With a key of their own, requests would run on an account the company does not see, does not pay for and cannot audit.',
    stops: 'The company’s key is in the company’s row, and a call that brings another one is refused the same way.',
    wall: 'row',
    ran: false,
  },
  {
    scene: '10-own-company',
    title: 'An employee claims to be the company',
    risk: 'If anyone could declare a company’s settings, a label that says “checked under Acme’s rules” would mean nothing.',
    stops: 'A company is the account that owns the project. The code takes the company’s settings only from the row that owner stored, and refuses settings the caller brings. Anyone may run the same code as a project of their own, but then the label names them, not Acme.',
    wall: 'code',
    ran: false,
  },
  {
    scene: '11-no-officer',
    title: 'A hiring request sent without a way to reach the HR director',
    risk: 'A hiring decision has to reach the officer the company named. A request that cannot reach them must not go anywhere else.',
    stops: 'The code refuses to start an escalation it cannot deliver, and says which officer the request needs.',
    wall: 'code',
    ran: false,
  },
  {
    scene: '12-personal-mode',
    title: 'Someone runs the same code on their own and presents the answer as the company’s',
    risk: 'The code is public. A former employee can run it under their own account, get an answer, and claim the company approved it.',
    stops: 'They do get an answer, but its label is signed with their own keys and names no company. The company’s check refuses it: wrong signature, no company, not an employee.',
    wall: 'gate',
    ran: true,
    files: [
      ['scenes/12-personal-mode/label.json', 'Label', 'What they would present: signed by their own keys, naming no company'],
      ['scenes/12-personal-mode/attestation.json', 'Attestation', 'The run did happen, on their own project: Intel’s quote for it'],
    ],
  },
  {
    scene: 'forged',
    title: 'Someone edits a label to put a colleague’s name on it',
    risk: 'If a label could be edited, anyone could move a request onto someone else’s name.',
    stops: 'The label is signed. Changing one name breaks both signatures, and the check refuses it. The terminal verifier makes this forgery itself, from the recruiter’s real label, every time it runs.',
    wall: 'gate',
    ran: true,
    files: [['scenes/01-recruiter-ordinary/label.json', 'The original label', 'The recruiter’s real label, before the name was changed']],
  },
];

const WALL_CHIP: Record<Wall, string> = {
  list: 'Stopped before anything ran',
  row: 'Stopped before anything ran',
  code: 'Stopped by the code',
  gate: 'Refused by the label check',
};

export function AttacksPage() {
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  useEffect(() => {
    window.scrollTo(0, 0);
    loadLedger().then(setLedger);
  }, []);
  const answerOf = (scene: string) => ledger.find((r) => r.scene === scene)?.why ?? '';

  return (
    <div className="page report">
      <PageNav current="attacks" />

      <header className="showcase-head">
        <span className="showcase-tag">Getting around it</span>
        <h1>Seven ways to get around the rules. None of them works.</h1>
        <p className="lede">
          Controls only matter if the people they control cannot switch them off. Each attempt below was made for real, on NEAR testnet, by the demo company’s own accounts. For each one: the risk, what stops it, and the proof.
        </p>
      </header>

      <div className="attack-stats">
        <div>
          <b>7</b>
          <span>attempts, each made for real</span>
        </div>
        <div>
          <b>5</b>
          <span>stopped before anything ran</span>
        </div>
        <div>
          <b>2</b>
          <span>got an answer the company’s check refuses</span>
        </div>
        <div>
          <b>0</b>
          <span>answers the company would accept</span>
        </div>
      </div>

      <section className="report-section">
        <p className="kicker">Four walls</p>
        <h2>What a request has to get past</h2>
        <ol className="walls">
          {WALLS.map(([key, title, text], i) => (
            <li key={key}>
              <span className="how-n">{i + 1}</span>
              <b>{title}</b>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="report-section">
        <p className="kicker">The attempts</p>
        <h2>Each one: the risk, what stops it, the proof</h2>
        {ATTEMPTS.map((a, i) => {
          const answer = answerOf(a.scene);
          const wall = WALLS.findIndex(([k]) => k === a.wall) + 1;
          return (
            <article className="attack" key={a.scene} id={`attack-${i + 1}`}>
              <header>
                <span className="step-n">{i + 1}</span>
                <h3>{a.title}</h3>
                <span className={`chip ${a.ran ? 'chip-escalate' : 'chip-block'}`}>{WALL_CHIP[a.wall]}</span>
              </header>
              <div className="attack-body">
                <div>
                  <span className="attack-label">The risk</span>
                  <p>{a.risk}</p>
                </div>
                <div>
                  <span className="attack-label">What stops it · wall {wall}</span>
                  <p>{a.stops}</p>
                </div>
              </div>
              <div className="attack-proof">
                <span className="attack-label">The proof</span>
                {answer && (
                  <p className="attack-answer">
                    <span>{a.ran ? 'The company’s check answered' : 'The platform answered'}</span>
                    <code>{answer}</code>
                  </p>
                )}
                {a.shot && <Shots shots={[a.shot]} />}
                {a.files?.map(([path, name, note]) => <EvidenceFile key={path} path={path} name={name} note={note} />)}
              </div>
            </article>
          );
        })}
      </section>

      <section className="report-section">
        <h2>All seven at a glance</h2>
        <div className="wrap">
          <table className="rules-table">
            <thead>
              <tr>
                <th>Attempt</th>
                <th>Stopped at</th>
                <th>Did anything run?</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {ATTEMPTS.map((a, i) => (
                <tr key={a.scene}>
                  <td>
                    <a
                      href="#/attacks"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(`attack-${i + 1}`)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                    >
                      {a.title}
                    </a>
                  </td>
                  <td>{WALLS.find(([k]) => k === a.wall)?.[1]}</td>
                  <td>{a.ran ? 'Yes, outside the company’s project' : 'No'}</td>
                  <td>
                    <span className="no">refused</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          The exact platform messages are the ones the demo recorded, also in <code>ledger.csv</code> on the <a href="#/verify">Verify</a> page.
        </p>
      </section>

      <SeeNext current="attacks" />
      <Footer />
    </div>
  );
}
