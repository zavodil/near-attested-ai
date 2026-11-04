import type { Catalogue } from '../lib/models';
import { EXAMPLES, PACKS } from '../lib/presets';
import type { OrgPolicy } from '../lib/session';

export interface Draft {
  prompt: string;
  model: string;
  maxTokens: number;
  /** Personal mode: the packs to screen with. */
  packs: string[];
}

interface Props {
  draft: Draft;
  catalogue: Catalogue | null;
  /** Whose rules apply, once known; `null` until the first run asks. */
  policy: OrgPolicy | null;
  busy: boolean;
  disabledReason: string | null;
  onChange: (d: Draft) => void;
  onSubmit: () => void;
}

export function Composer({ draft, catalogue, policy, busy, disabledReason, onChange, onSubmit }: Props) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const company = policy?.mode === 'company' ? policy : null;
  const allowedModels = company?.config.models ?? null;
  const toggle = (ref: string) => set({ packs: draft.packs.includes(ref) ? draft.packs.filter((p) => p !== ref) : [...draft.packs, ref] });

  return (
    <section className="composer card">
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} className="chip" onClick={() => set({ prompt: ex.prompt })} disabled={busy}>
            {ex.label}
          </button>
        ))}
      </div>

      <textarea
        value={draft.prompt}
        rows={7}
        placeholder="Ask something you would not paste into a public chatbot."
        onChange={(e) => set({ prompt: e.target.value })}
        disabled={busy}
      />

      <div className="row">
        <label className="grow">
          <span>Answering model · must run in a NEAR AI TEE{allowedModels ? ' · allowed by the company' : ''}</span>
          <ModelInput
            value={draft.model}
            options={allowedModels ?? catalogue?.answering.map((m) => m.id) ?? []}
            list="answering-models"
            onChange={(model) => set({ model })}
            disabled={busy}
          />
        </label>
        <label className="narrow">
          <span>Max tokens</span>
          <input type="number" min={1} max={1200} value={draft.maxTokens} onChange={(e) => set({ maxTokens: Number(e.target.value) })} disabled={busy} />
        </label>
      </div>

      {company ? (
        <div className="screening on company-rules">
          <div className="packs-head">
            <strong>Screened under {company.config.org_name ?? company.org}’s rules</strong>
            <small>set by {company.org} · the enclave applies them whatever this page asks</small>
          </div>
          <ul className="packs">
            {company.packs.map((p) => (
              <li key={`${p.pack.id}@${p.pack.version}`} className="pack locked">
                <span className="pack-title">{p.pack.title ?? p.pack.id}</span>
                <span className="pack-sub mono">
                  {p.pack.id}@{p.pack.version} · {p.pack.rules.length} rule{p.pack.rules.length === 1 ? '' : 's'} · {p.sha256.slice(0, 12)}…
                </span>
                <span className="pack-rules">{p.pack.rules.map((r) => `${r.id}${r.cite ? ` (${r.cite})` : ''} → ${r.action}`).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className={`screening ${draft.packs.length ? 'on' : ''}`}>
          <div className="packs-head">
            <strong>Screen the prompt with</strong>
            <small>each pack is read from the registry on NEAR inside the enclave; a rule at or over its threshold blocks the prompt or escalates it</small>
          </div>
          <ul className="packs">
            {PACKS.map((p) => (
              <li key={p.ref} className={`pack ${draft.packs.includes(p.ref) ? 'chosen' : ''}`}>
                <label>
                  <input type="checkbox" checked={draft.packs.includes(p.ref)} onChange={() => toggle(p.ref)} disabled={busy} />
                  <span className="pack-title">
                    {p.title} <span className={`policy-pill ${p.action === 'block' ? 'fired' : 'escalate'}`}>{p.action}</span>
                  </span>
                  <span className="pack-sub">
                    <span className="mono">{p.ref}</span> · {p.summary}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {draft.packs.length === 0 && <p className="hint">No pack: the prompt goes straight to the model, and the label says so.</p>}
        </div>
      )}

      <button className="primary" onClick={onSubmit} disabled={busy || !!disabledReason || !draft.prompt.trim()}>
        {busy ? 'Working…' : 'Seal and ask'}
      </button>
      {disabledReason && <p className="hint">{disabledReason}</p>}
    </section>
  );
}

function ModelInput(props: { value: string; options: string[]; list: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <>
      <input className="mono" value={props.value} list={props.list} spellCheck={false} onChange={(e) => props.onChange(e.target.value)} disabled={props.disabled} />
      <datalist id={props.list}>
        {props.options.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </>
  );
}
