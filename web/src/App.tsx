import { useEffect, useRef, useState } from 'react';
import { Answer } from './components/Answer';
import { Composer, type Draft } from './components/Composer';
import { LabelCard } from './components/LabelCard';
import { LiveRun } from './components/LiveRun';
import { OperatorView } from './components/OperatorView';
import { OrgPolicyCard } from './components/OrgPolicy';
import { Pipeline } from './components/Pipeline';
import { ProofCard } from './components/ProofCard';
import { Settings, settingsProblem, type SettingsValue } from './components/Settings';
import { TrustChain } from './components/TrustChain';
import { loadCatalogue, type Catalogue } from './lib/models';
import { DEFAULT_NETWORK, DEFAULT_PROJECT, DEFAULT_ROWS, DEFAULT_SECRETS_PROFILE, DEMO_MODE, NETWORKS, SEALED_PAYMENT_KEY } from './lib/network';
import { openSealedKey, takeDecryptKey } from './lib/sealedKey';
import { parseRows, paymentKeyOwner, type SecretsRef } from './lib/outlayer';
import { DEFAULT_PACKS, EXAMPLES } from './lib/presets';
import { ask, awaitApproval, orgPolicy, pinEnclave, type OrgPolicy, type Outcome, type PinnedEnclave, type Stage, type Target } from './lib/session';
import { message } from './lib/verify/types';

const SETTINGS_KEY = 'attested-ai:settings';
const PAYMENT_KEY = 'attested-ai:payment-key';

function loadSettings(): SettingsValue {
  const fallback: SettingsValue = {
    networkId: DEFAULT_NETWORK,
    projectId: DEFAULT_PROJECT,
    paymentKey: '',
    secretsProfile: DEFAULT_SECRETS_PROFILE,
    rows: DEFAULT_ROWS,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { ...fallback, ...saved, paymentKey: sessionStorage.getItem(PAYMENT_KEY) ?? '' };
  } catch {
    return fallback;
  }
}

function saveSettings(s: SettingsValue) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ networkId: s.networkId, projectId: s.projectId, secretsProfile: s.secretsProfile, rows: s.rows }));
    // The payment key lives for this tab only.
    sessionStorage.setItem(PAYMENT_KEY, s.paymentKey);
  } catch {
    // Storage refused (private window): the page works, it just forgets on reload.
  }
}

/** The rows a call names: the company's and the officers', or the visitor's own. */
function rowsOf(s: SettingsValue): SecretsRef[] {
  if (s.rows.trim()) {
    try {
      return parseRows(s.rows);
    } catch {
      return [];
    }
  }
  const owner = paymentKeyOwner(s.paymentKey);
  return owner ? [{ account_id: owner, profile: s.secretsProfile.trim() }] : [];
}

export function App() {
  const [settings, setSettings] = useState<SettingsValue>(loadSettings);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [draft, setDraft] = useState<Draft>({
    prompt: EXAMPLES[0].prompt,
    model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    maxTokens: 900,
    packs: DEFAULT_PACKS,
  });
  const [stage, setStage] = useState<Stage | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [stageStartedAt, setStageStartedAt] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const pinned = useRef(new Map<string, PinnedEnclave>());
  const policies = useRef(new Map<string, OrgPolicy>());
  const [enclave, setEnclave] = useState<PinnedEnclave | null>(null);
  const [policy, setPolicy] = useState<OrgPolicy | null>(null);

  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  // Bumped when a link fills the form, so the settings panel opens collapsed.
  const [settingsGeneration, setSettingsGeneration] = useState(0);

  useEffect(() => saveSettings(settings), [settings]);
  // A personal link opens the payment key this build carries sealed; the
  // decrypt key leaves the address bar as soon as it has been read.
  useEffect(() => {
    const { decryptKey, cleanUrl } = takeDecryptKey(window.location);
    if (!decryptKey) return;
    window.history.replaceState(null, '', cleanUrl);
    if (!SEALED_PAYMENT_KEY) {
      setLinkProblem('This build carries no sealed payment key for the link to open.');
      return;
    }
    openSealedKey(SEALED_PAYMENT_KEY, decryptKey).then(
      (paymentKey) => {
        setSettings((s) => ({ ...s, paymentKey }));
        setSettingsGeneration((g) => g + 1);
      },
      (e) => setLinkProblem(message(e)),
    );
  }, []);
  useEffect(() => {
    loadCatalogue().then(setCatalogue, () => setCatalogue({ answering: [], screening: [] }));
  }, []);

  const target: Target = {
    network: NETWORKS[settings.networkId],
    projectId: settings.projectId.trim(),
    paymentKey: settings.paymentKey,
    rows: rowsOf(settings),
  };
  const pinKey = `${settings.networkId}|${target.projectId}|${paymentKeyOwner(settings.paymentKey)}|${target.rows.map((r) => `${r.account_id}/${r.profile}`).join(',')}`;

  const currentStage = useRef<Stage | null>(null);
  const layout = useRef<HTMLElement>(null);
  const onStage = (s: Stage, n?: string) => {
    if (currentStage.current !== s) {
      currentStage.current = s;
      setStageStartedAt(Date.now());
    }
    setStage(s);
    setNote(n);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    currentStage.current = null;
    requestAnimationFrame(() => layout.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    try {
      let key = pinned.current.get(pinKey);
      if (!key) {
        onStage('pin');
        key = await pinEnclave(target, (s) => onStage('pin', s));
        pinned.current.set(pinKey, key);
      }
      setEnclave(key);
      let whose = policies.current.get(pinKey);
      if (!whose) {
        onStage('pin', 'policy');
        whose = await orgPolicy(target, (s) => onStage('pin', s === 'verifying' ? 'policy-verifying' : 'policy'));
        policies.current.set(pinKey, whose);
      }
      setPolicy(whose);
      if (whose.mode === 'personal' && !DEMO_MODE) {
        throw new Error('This page runs on a company’s rows only, and the rows named hold no company configuration.');
      }
      let result = await ask(
        target,
        key,
        { prompt: draft.prompt, model: draft.model.trim(), maxTokens: draft.maxTokens, packs: whose.mode === 'company' ? [] : draft.packs },
        onStage,
      );
      setOutcome(result);
      if (result.escalation) {
        result = await awaitApproval(target, key, result, onStage);
        setOutcome(result);
      }
      currentStage.current = null;
      setStage(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const proofs = outcome ? [...(enclave ? [enclave.proof] : []), ...(policy ? [policy.proof] : []), ...outcome.proofs] : [];
  const started = busy || error !== null || outcome !== null;
  const screening =
    policy?.mode === 'company'
      ? { packs: policy.packs.length, company: policy.config.org_name ?? policy.org }
      : draft.packs.length
        ? { packs: draft.packs.length, company: null }
        : null;

  return (
    <div className="page">
      <header className="hero">
        <div className="brand">
          <span className="brand-mark" />
          <span>Attested AI</span>
          <span className="brand-sub">on OutLayer × NEAR AI</span>
        </div>
        <h1>
          Ask with privileged data.
          <br />
          <span>Prove what happened to it.</span>
        </h1>
        <p className="lede">
          Your prompt is sealed in this browser, opened only inside an attested enclave, screened against the EU AI Act and your company’s rules,
          answered by a model running in a GPU TEE or held for an officer — and returned with a receipt and a signed label anyone can check,
          trusting Intel and NVIDIA, not us.
        </p>
      </header>

      {linkProblem && <div className="error card link-problem">{linkProblem}</div>}
      <Settings key={settingsGeneration} value={settings} onChange={setSettings} />
      {policy && <OrgPolicyCard policy={policy} />}

      <main ref={layout} className={`layout ${started ? 'active' : 'idle'}`}>
        <Composer draft={draft} catalogue={catalogue} policy={policy} busy={busy} disabledReason={settingsProblem(settings)} onChange={setDraft} onSubmit={submit} />

        <section className="results" aria-hidden={!started}>
          {started && <Pipeline current={stage} failed={error !== null} done={outcome !== null && !busy} escalated={!!outcome?.escalation || !!outcome?.receipt.approval} />}
          {busy && stage && (
            <LiveRun stage={stage} note={note} startedAt={stageStartedAt} model={draft.model.trim()} screening={screening} officer={outcome?.escalation?.officer} />
          )}
          {error && (
            <div className="error card">
              <strong>Stopped.</strong> {error}
            </div>
          )}
          {outcome && (
            <>
              <Answer outcome={outcome} network={settings.networkId} projectId={target.projectId} />
              <TrustChain proofs={proofs} outcome={outcome.receipt.outcome} />
              <LabelCard signed={outcome.receipt.label} label={outcome.label} labelPubkey={enclave?.labelPubkey ?? null} />
              <div className="proofs">
                {proofs.map((group) => (
                  <ProofCard key={group.id + group.title} group={group} />
                ))}
              </div>
              <OperatorView outcome={outcome} />
            </>
          )}
        </section>
      </main>

      {!started && <Explainer />}

      <footer className="footer">
        Verification runs in this page: Intel TDX quotes with Intel DCAP (WebAssembly), NVIDIA tokens against NVIDIA’s published keys, signatures with
        secp256k1 recovery and ed25519. Nothing here asks OutLayer whether OutLayer is honest.
      </footer>
    </div>
  );
}

function Explainer() {
  const items = [
    ['Sealed here', 'ECIES to a key that exists only inside the OutLayer enclave — pinned after its TDX attestation verifies.'],
    ['Screened inside', 'Policy packs read from a registry on NEAR: yes/no questions to a decision model. A rule over its threshold blocks the prompt, or holds it for an officer’s approval in their OutLayer inbox.'],
    ['Answered in a TEE', 'Only a model NEAR AI serves from its own Intel TDX + NVIDIA confidential GPUs. Anything else is refused before it is sent.'],
    ['Labelled and proven', 'A signed label says which rules applied and what they decided, with no prompt in it. The receipt carries every quote and signature; this page checks each one.'],
  ];
  return (
    <div className="explainer">
      {items.map(([title, text], i) => (
        <div key={title} className="explainer-item">
          <span className="explainer-n">{i + 1}</span>
          <div>
            <h4>{title}</h4>
            <p>{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
