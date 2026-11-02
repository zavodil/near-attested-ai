import { useEffect, useRef, useState } from 'react';
import { Answer } from './components/Answer';
import { Composer, type Draft } from './components/Composer';
import { LiveRun } from './components/LiveRun';
import { OperatorView } from './components/OperatorView';
import { Pipeline } from './components/Pipeline';
import { ProofCard } from './components/ProofCard';
import { Settings, settingsProblem, type SettingsValue } from './components/Settings';
import { TrustChain } from './components/TrustChain';
import { loadCatalogue, type Catalogue } from './lib/models';
import { DEFAULT_NETWORK, DEFAULT_PROJECT, DEFAULT_SECRETS_PROFILE, NETWORKS, SEALED_PAYMENT_KEY } from './lib/network';
import { openSealedKey, takeDecryptKey } from './lib/sealedKey';
import { paymentKeyOwner } from './lib/outlayer';
import { DEFAULT_RULES, EXAMPLES } from './lib/presets';
import { ask, pinEnclave, type Outcome, type PinnedEnclave, type Stage, type Target } from './lib/session';
import { message } from './lib/verify/types';

const SETTINGS_KEY = 'attested-ai:settings';
const PAYMENT_KEY = 'attested-ai:payment-key';

function loadSettings(): SettingsValue {
  const fallback: SettingsValue = {
    networkId: DEFAULT_NETWORK,
    projectId: DEFAULT_PROJECT,
    paymentKey: '',
    secretsProfile: DEFAULT_SECRETS_PROFILE,
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
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ networkId: s.networkId, projectId: s.projectId, secretsProfile: s.secretsProfile }),
    );
    // The payment key lives for this tab only.
    sessionStorage.setItem(PAYMENT_KEY, s.paymentKey);
  } catch {
    // Storage refused (private window): the page works, it just forgets on reload.
  }
}

export function App() {
  const [settings, setSettings] = useState<SettingsValue>(loadSettings);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [draft, setDraft] = useState<Draft>({
    prompt: EXAMPLES[0].prompt,
    model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    maxTokens: 900,
    screen: true,
    screeningModel: 'levanto/sage-1.4',
    rules: DEFAULT_RULES,
  });
  const [stage, setStage] = useState<Stage | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [stageStartedAt, setStageStartedAt] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const pinned = useRef(new Map<string, PinnedEnclave>());
  const [enclave, setEnclave] = useState<PinnedEnclave | null>(null);

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
    secretsProfile: settings.secretsProfile,
  };
  const pinKey = `${settings.networkId}|${target.projectId}|${paymentKeyOwner(settings.paymentKey)}`;

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
      const result = await ask(
        target,
        key,
        {
          prompt: draft.prompt,
          model: draft.model.trim(),
          maxTokens: draft.maxTokens,
          screening: draft.screen ? { model: draft.screeningModel.trim(), rules: draft.rules } : null,
        },
        onStage,
      );
      setOutcome(result);
      currentStage.current = null;
      setStage(null);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const proofs = outcome ? [...(enclave ? [enclave.proof] : []), ...outcome.proofs] : [];
  const started = busy || error !== null || outcome !== null;

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
          Your prompt is sealed in this browser, opened only inside an attested enclave, screened against your policy, answered
          by a model running in a GPU TEE, and returned with a receipt anyone can check — trusting Intel and NVIDIA, not us.
        </p>
      </header>

      {linkProblem && <div className="error card link-problem">{linkProblem}</div>}
      <Settings key={settingsGeneration} value={settings} onChange={setSettings} />

      <main ref={layout} className={`layout ${started ? 'active' : 'idle'}`}>
        <Composer
          draft={draft}
          catalogue={catalogue}
          busy={busy}
          disabledReason={settingsProblem(settings)}
          onChange={setDraft}
          onSubmit={submit}
        />

        <section className="results" aria-hidden={!started}>
          {started && <Pipeline current={stage} failed={error !== null} done={outcome !== null} />}
          {busy && stage && (
            <LiveRun
              stage={stage}
              note={note}
              startedAt={stageStartedAt}
              model={draft.model.trim()}
              screening={draft.screen ? { model: draft.screeningModel.trim(), rules: draft.rules.length } : null}
            />
          )}
          {error && (
            <div className="error card">
              <strong>Stopped.</strong> {error}
            </div>
          )}
          {outcome && (
            <>
              <Answer outcome={outcome} network={settings.networkId} projectId={target.projectId} />
              <TrustChain proofs={proofs} blocked={outcome.receipt.outcome === 'blocked'} />
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
        Verification runs in this page: Intel TDX quotes with Intel DCAP (WebAssembly), NVIDIA tokens against NVIDIA’s published keys,
        signatures with secp256k1 recovery. Nothing here asks OutLayer whether OutLayer is honest.
      </footer>
    </div>
  );
}

function Explainer() {
  const items = [
    ['Sealed here', 'ECIES to a key that exists only inside the OutLayer enclave — pinned after its TDX attestation verifies.'],
    ['Screened inside', 'Your policy, as yes/no questions to a decision model. A rule over its threshold stops the prompt.'],
    ['Answered in a TEE', 'Only a model NEAR AI serves from its own Intel TDX + NVIDIA confidential GPUs. Anything else is refused before it is sent.'],
    ['Proven to you', 'The receipt carries the quotes, NVIDIA’s verdict and the model’s signature. This page checks each one.'],
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
