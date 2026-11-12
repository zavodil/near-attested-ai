import { Fragment, useEffect, useRef, useState, type RefObject } from 'react';
import { EVIDENCE } from './evidence';

interface Outcome {
  id: string;
  cite?: string;
  tripped: boolean;
  p_yes: number;
  action: string;
  threshold: number;
}
interface Receipt {
  prompt: string;
  outcome: string;
  screening: { packs: { id: string; outcomes: Outcome[] }[] };
}

type Decision = 'pass' | 'block' | 'escalate';

interface Example {
  dir: string;
  who: string;
  title: string;
  decision: Decision;
  chip: string;
  outcome: string;
  officer?: string;
  why: string;
}

/** Three real runs from the company's day: the receipt of each holds the prompt and every rule's score. */
const EXAMPLES: Example[] = [
  {
    dir: 'scenes/01-recruiter-ordinary',
    who: 'acme-recruiter',
    title: 'A recruiter drafts a meeting email',
    decision: 'pass',
    chip: 'Answered',
    outcome: 'Answered, label accepted',
    why: 'No rule fired: every score is under 1%. A model in NEAR AI’s TEE answered, and the company’s gate accepts the signed label.',
  },
  {
    dir: 'scenes/03-analyst-blocked',
    who: 'acme-analyst',
    title: 'An analyst asks for a social scoring system',
    decision: 'block',
    chip: 'Blocked',
    outcome: 'Blocked, no model called',
    why: 'social_scoring, EU AI Act Art. 5(1)(c), fired at 99.99%. No model was called, and the refusal itself is signed: the company can prove it stopped this request.',
  },
  {
    dir: 'scenes/04-recruiter-hiring-approved/1-waiting',
    who: 'acme-recruiter',
    title: 'A recruiter asks which candidate to reject',
    decision: 'escalate',
    chip: 'HR director decides',
    officer: 'acme-hr-director',
    outcome: 'Answered after the HR director’s yes',
    why: 'employment_decision, EU AI Act Annex III(4), fired at 99.84%. The request waited in the HR director’s OutLayer inbox; their wallet signature started a second attested run that answered, and the label names them.',
  },
];

const WORD: Record<Decision, string> = { pass: 'ALLOW', block: 'BLOCK', escalate: 'ESCALATE' };

const TRUST: [string, string][] = [
  ['Rules fixed on NEAR', 'Each framework is a pack published once to a registry contract; every label names its hash.'],
  ['Sealed in the browser', 'OutLayer’s servers relay only ciphertext. The prompt opens inside the enclave.'],
  ['Attested by Intel and NVIDIA', 'An Intel quote for every run, Intel and NVIDIA evidence for the model that answered.'],
  ['Signed by keys nobody holds', 'Company and employee keys from NEAR MPC confidential key derivation, used only inside the TEE.'],
];

// The request's path: through OutLayer into the enclave, past the officer, into the model's TEE, to the label and the gate.
const Y = 110;
const LOW = 236;
const N = { browser: 64, relay: 196, enclaveIn: 318, enclaveOut: 600, officer: 712, modelIn: 840, modelOut: 952, label: 1044, gate: 1146 };

function pathFor(decision: Decision) {
  const model =
    decision === 'block'
      ? `L1010,${Y}`
      : `L800,${Y} C826,${Y} 828,${LOW} ${N.modelIn},${LOW} L${N.modelOut},${LOW} C980,${LOW} 982,${Y} 1010,${Y}`;
  return `M${N.browser},${Y} L270,${Y} C300,${Y} 302,${LOW} ${N.enclaveIn},${LOW} L${N.enclaveOut},${LOW} C630,${LOW} 632,${Y} 662,${Y} ${model} L${N.gate},${Y}`;
}

function lengthAt(el: SVGPathElement, x: number): number {
  let lo = 0;
  let hi = el.getTotalLength();
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (el.getPointAtLength(mid).x < x) lo = mid;
    else hi = mid;
  }
  return hi;
}

const STEP_MS = 650;
const RULE_MS = 260;

/**
 * The signal walks the path stop by stop, lights what it has reached, waits
 * at the officer when the request escalates, and stops at the end. It starts
 * when the diagram is on screen, and again when the example changes.
 */
function useSignal(path: RefObject<SVGPathElement>, decision: Decision, rules: number, restartKey: string, active: boolean) {
  const [state, setState] = useState({ x: N.browser, y: Y, done: false });
  useEffect(() => {
    const el = path.current;
    if (!el || !active) return;
    const total = el.getTotalLength();
    const xs = [N.browser, N.relay, N.enclaveIn, N.enclaveOut, N.officer, N.modelIn, N.modelOut, N.label, N.gate];
    const stops = xs.map((x) => lengthAt(el, x));
    stops[stops.length - 1] = total;
    const durations = stops.slice(1).map((_, i) => {
      if (i === 2) return RULE_MS * (rules + 1);
      if (i === 3) return decision === 'escalate' ? STEP_MS * 3 : STEP_MS;
      if (i === 4 || i === 5) return decision === 'block' ? STEP_MS / 2 : STEP_MS * 1.4;
      return STEP_MS;
    });
    const end = durations.reduce((a, b) => a + b, 0);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      let t = now - start;
      if (t >= end) {
        const at = el.getPointAtLength(total);
        setState({ x: at.x, y: at.y, done: true });
        return;
      }
      let i = 0;
      while (t > durations[i]) t -= durations[i++];
      const at = el.getPointAtLength(stops[i] + ((stops[i + 1] - stops[i]) * t) / durations[i]);
      setState({ x: at.x, y: at.y, done: false });
      frame = requestAnimationFrame(tick);
    };
    setState({ x: N.browser, y: Y, done: false });
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [path, decision, rules, restartKey, active]);
  return state;
}

interface Label {
  outcome: string;
  caller: string;
  packs: { id: string; version: number; sha256: string }[];
  fired: { pack: string; rule: string; cite?: string; action: string; p_yes: number }[];
  prompt_commitment: string;
  call_id: string;
}

function useLabels() {
  const [labels, setLabels] = useState<Record<string, Label>>({});
  useEffect(() => {
    Promise.all(EXAMPLES.map((e) => fetch(`${EVIDENCE}/${e.dir.replace('1-waiting', '2-answer')}/label.json`).then((r) => r.json() as Promise<{ body: string }>))).then(
      (list) => setLabels(Object.fromEntries(list.map((l, i) => [EXAMPLES[i].dir, JSON.parse(l.body) as Label]))),
      () => setLabels({}),
    );
  }, []);
  return labels;
}

function useReceipts() {
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  useEffect(() => {
    Promise.all(EXAMPLES.map((e) => fetch(`${EVIDENCE}/${e.dir}/receipt.json`).then((r) => r.json() as Promise<Receipt>))).then(
      (list) => setReceipts(Object.fromEntries(list.map((r, i) => [EXAMPLES[i].dir, r]))),
      () => setReceipts({}),
    );
  }, []);
  return receipts;
}

const pct = (p: number) => `${(p * 100).toFixed(2)}%`;

export function Hero() {
  const receipts = useReceipts();
  const labels = useLabels();
  const [pick, setPick] = useState(0);
  const [replays, setReplays] = useState(0);
  const example = EXAMPLES[pick];
  const receipt = receipts[example.dir];
  const label = labels[example.dir];
  const packs = receipt?.screening.packs ?? [];
  const rules = packs.flatMap((p) => p.outcomes.map((o) => ({ ...o, pack: p.id })));
  const decision = example.decision;

  const pathRef = useRef<SVGPathElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || seen) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setSeen(true), { threshold: 0.4 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen]);
  const signal = useSignal(pathRef, decision, rules.length || 10, `${pick}:${receipt ? 1 : 0}:${replays}`, seen && !!receipt);
  const reached = (x: number) => signal.done || signal.x >= x - 1;
  const inEnclave = !signal.done && signal.y > Y + 60 && signal.x > N.enclaveIn - 2 && signal.x < N.enclaveOut;
  const span = N.enclaveOut - N.enclaveIn;
  const answered = (i: number) => reached(N.enclaveIn + ((i + 1) * span) / (rules.length + 1));
  const judged = reached(N.enclaveOut);
  const inModel = !signal.done && signal.y > Y + 60 && signal.x > N.modelIn - 2 && signal.x < N.modelOut;
  const modelDone = decision !== 'block' && reached(N.modelOut);
  const settled = signal.done;
  const gateWord = decision === 'block' ? 'refuses' : 'accepts';

  return (
    <section className="hero2">
      <p className="hero2-eyebrow">An off-chain smart contract for AI compliance · NEAR · OutLayer · NEAR AI Cloud</p>
      <h1 className="hero2-title">
        Compliance controls for AI,
        <br />
        <span>with proof they were enforced.</span>
      </h1>
      <p className="hero2-lede">
        Pick a compliance framework, and every AI request your company makes is checked against it automatically: allowed, blocked or escalated to a human, with cryptographic proof that the controls were enforced.
      </p>

      <div className="trust">
        {TRUST.map(([title, text]) => (
          <div key={title}>
            <b>{title}</b>
            <span>{text}</span>
          </div>
        ))}
      </div>

      <p className="hero2-pick">Three real requests from the demo company’s day, under the same rules: EU AI Act, GDPR and the company’s baseline. Pick one and watch it run.</p>
      <div className="examples three" role="tablist">
        {EXAMPLES.map((e, i) => (
          <button key={e.dir} role="tab" aria-selected={i === pick} className={`example ${i === pick ? 'on' : ''}`} onClick={() => setPick(i)}>
            <span className="example-title">{e.title}</span>
            <span className={`chip chip-${e.decision}`}>{e.chip}</span>
          </button>
        ))}
      </div>

      <div className={`tx tx-${decision}`} ref={boxRef}>
        <div className="tx-head">
          <span className="tx-label">One request, from the employee’s browser to the receiving system</span>
          <span className="tx-head-right">
            {settled && (
              <button className="link replay" onClick={() => setReplays((n) => n + 1)}>
                ↻ Replay
              </button>
            )}
          </span>
        </div>
        <p className="tx-prompt">
          <span>{example.who} asks</span>“{receipt?.prompt ?? '…'}”
        </p>

        <div className="tx-strip">
          <div>
            <span>Rules</span>
            4 packs on <code>policies.zavodil.testnet</code>, named in the company’s encrypted configuration
          </div>
          <div>
            <span>Code</span>
            one published build; its hash is in every Intel quote
          </div>
          <div>
            <span>Proof</span>
            Intel quote for the run; Intel and NVIDIA evidence for the model
          </div>
          <div className={`tx-verdict ${settled ? `on v-${decision}` : ''}`}>
            <i>{settled ? (decision === 'pass' ? '✓' : decision === 'block' ? '✕' : '!') : '…'}</i>
            <div>
              <span>Outcome</span>
              <b>{settled ? example.outcome : 'running…'}</b>
            </div>
          </div>
        </div>

        <svg viewBox="0 0 1200 616" className="tx-svg" role="img" aria-label="The request is sealed, screened in the enclave, answered in a TEE or stopped, and signed">
          <defs>
            <linearGradient id="lane" x1="0" x2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.15" />
              <stop offset="0.5" stopColor="var(--accent)" stopOpacity="0.6" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.15" />
            </linearGradient>
          </defs>
          <text x="30" y="50" className="tx-zone">OUTSIDE · ONLY CIPHERTEXT AND SIGNED LABELS</text>
          <line x1="26" y1={Y} x2="1174" y2={Y} stroke="url(#lane)" strokeWidth="2" />
          <text x="30" y="196" className="tx-zone tx-zone-off">INSIDE CONFIDENTIAL HARDWARE · INTEL TDX · NVIDIA</text>
          <line x1="26" y1="176" x2="1174" y2="176" className="tx-border" />

          <path d={pathFor(decision)} className="tx-path" ref={pathRef} />
          {!signal.done && <circle r="7" cx={signal.x} cy={signal.y} className="tx-dot" />}

          {(
            [
              [N.browser, example.who, 'seals the prompt', true],
              [N.relay, 'OutLayer', 'relays ciphertext', true],
              [N.officer, example.officer ?? 'officer', example.officer ? 'approves: wallet signature' : 'not needed', !!example.officer],
              [N.label, 'label', 'signed twice', true],
              [N.gate, 'gate', settled ? gateWord : 'checks it', true],
            ] as [number, string, string, boolean][]
          ).map(([x, who, what, used]) => (
            <g key={x} className={used && reached(x) ? 'lit' : 'dim'}>
              <circle cx={x} cy={Y} r="9" className="tx-node" />
              <text x={x} y={Y - 22} textAnchor="middle" className="tx-who">
                {who}
              </text>
              <text x={x} y={Y + 30} textAnchor="middle" className="tx-what">
                {what}
              </text>
            </g>
          ))}

          {settled && (
            <g className={`tx-out tx-out-${decision} lit`}>
              <circle cx={N.gate} cy={Y} r="18" className="tx-out-base" />
              <circle cx={N.gate} cy={Y} r="18" />
              <text x={N.gate} y={Y + 6} textAnchor="middle" className="tx-out-mark">
                {decision === 'pass' ? '✓' : decision === 'block' ? '✕' : '!'}
              </text>
            </g>
          )}

          <foreignObject x={N.enclaveIn - 18} y="208" width={N.enclaveOut - N.enclaveIn + 36} height="400">
            <div className={`enclave ${inEnclave ? 'busy' : ''} ${judged ? 'judged' : ''}`}>
              <div className="enclave-head">OutLayer · Intel TDX enclave</div>
              <div className="enclave-sub">opens the prompt; Sage scores every rule of every pack</div>
              <ul className="enclave-rules">
                {packs.map((p) => (
                  <Fragment key={p.id}>
                    <li className="enclave-pack">{p.id}</li>
                    {p.outcomes.map((o) => {
                      const i = rules.findIndex((r) => r.pack === p.id && r.id === o.id);
                      const fired = o.tripped;
                      return (
                        <li key={o.id} className={answered(i) ? (fired ? 'fired' : 'answered') : 'pending'}>
                          <span>{o.id}</span>
                          <b>{answered(i) ? pct(o.p_yes) : '·'}</b>
                        </li>
                      );
                    })}
                  </Fragment>
                ))}
              </ul>
              {judged ? <div className={`enclave-verdict v-${decision}`}>{WORD[decision]}</div> : <div className="enclave-wait">{inEnclave ? 'scoring…' : 'waiting for the prompt'}</div>}
            </div>
          </foreignObject>

          <foreignObject x={N.modelIn - 22} y="208" width={N.modelOut - N.modelIn + 44} height="150">
            <div className={`model-box ${decision === 'block' ? 'skipped' : ''} ${inModel ? 'busy' : ''} ${modelDone ? 'done' : ''}`}>
              <div className="model-head">NEAR AI Cloud</div>
              <div className="model-sub">a model in TDX + NVIDIA confidential GPUs</div>
              <div className="model-state">
                {decision === 'block' ? (judged ? 'never called' : '…') : modelDone ? 'answered, and its TEE signed the answer' : inModel ? 'answering…' : decision === 'escalate' ? 'waits for the officer' : '…'}
              </div>
            </div>
          </foreignObject>

          <foreignObject x={N.modelIn - 22} y="390" width={1180 - N.modelIn + 22} height="218">
            <div className={`label-card ${reached(N.label) ? 'shown' : ''}`}>
              <div className="label-head">The label the gate receives: no prompt in it</div>
              {label && reached(N.label) ? (
                <dl>
                  <dt>outcome</dt>
                  <dd>
                    {label.outcome}
                    {decision === 'escalate' ? ' after approval' : ''}
                  </dd>
                  <dt>fired</dt>
                  <dd>{label.fired.length ? label.fired.map((f) => `${f.cite ?? f.rule} → ${f.action}`).join(', ') : 'none'}</dd>
                  <dt>packs</dt>
                  <dd>{label.packs.map((p) => `${p.id}@${p.version}`).join(', ')}, by hash</dd>
                  <dt>prompt</dt>
                  <dd className="mono">commitment {label.prompt_commitment.slice(0, 12)}…</dd>
                  <dt>signed</dt>
                  <dd>company key ✓ · employee key ✓</dd>
                </dl>
              ) : (
                <p className="enclave-wait">signed when the run ends</p>
              )}
            </div>
          </foreignObject>
        </svg>

        <div className={`tx-why ${settled ? 'shown' : ''}`}>
          <b>Why:</b> {settled ? example.why : 'the request is on its way…'}
        </div>
      </div>
    </section>
  );
}
