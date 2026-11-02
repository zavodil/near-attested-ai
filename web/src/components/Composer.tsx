import type { Catalogue } from '../lib/models';
import { EXAMPLES } from '../lib/presets';
import type { Rule } from '../lib/receipt';

export interface Draft {
  prompt: string;
  model: string;
  maxTokens: number;
  screen: boolean;
  screeningModel: string;
  rules: Rule[];
}

interface Props {
  draft: Draft;
  catalogue: Catalogue | null;
  busy: boolean;
  disabledReason: string | null;
  onChange: (d: Draft) => void;
  onSubmit: () => void;
}

export function Composer({ draft, catalogue, busy, disabledReason, onChange, onSubmit }: Props) {
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setRule = (i: number, patch: Partial<Rule>) =>
    set({ rules: draft.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

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
          <span>Answering model · must run in a NEAR AI TEE</span>
          <ModelInput
            value={draft.model}
            options={catalogue?.answering.map((m) => m.id) ?? []}
            list="answering-models"
            onChange={(model) => set({ model })}
            disabled={busy}
          />
        </label>
        <label className="narrow">
          <span>Max tokens</span>
          <input
            type="number"
            min={1}
            max={1200}
            value={draft.maxTokens}
            onChange={(e) => set({ maxTokens: Number(e.target.value) })}
            disabled={busy}
          />
        </label>
      </div>

      <div className={`screening ${draft.screen ? 'on' : ''}`}>
        <label className="toggle">
          <input type="checkbox" checked={draft.screen} onChange={(e) => set({ screen: e.target.checked })} disabled={busy} />
          <span className="toggle-track" />
          <span>
            Screen the prompt first
            <small>a decision model answers each rule; any rule at or over its threshold blocks the prompt</small>
          </span>
        </label>

        {draft.screen && (
          <>
            <label>
              <span>Decision model</span>
              <ModelInput
                value={draft.screeningModel}
                options={catalogue?.screening.map((m) => m.id) ?? []}
                list="screening-models"
                onChange={(screeningModel) => set({ screeningModel })}
                disabled={busy}
              />
            </label>
            <div className="rules">
              {draft.rules.map((rule, i) => (
                <div key={i} className="rule">
                  <input
                    className="rule-id mono"
                    value={rule.id}
                    onChange={(e) => setRule(i, { id: e.target.value })}
                    disabled={busy}
                  />
                  <textarea
                    rows={2}
                    value={rule.question}
                    onChange={(e) => setRule(i, { question: e.target.value })}
                    disabled={busy}
                  />
                  <label className="threshold">
                    <span>blocks at</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={rule.block_at}
                      onChange={(e) => setRule(i, { block_at: Number(e.target.value) })}
                      disabled={busy}
                    />
                    <span>%</span>
                  </label>
                  <button
                    className="icon-button"
                    title="Remove rule"
                    onClick={() => set({ rules: draft.rules.filter((_, j) => j !== i) })}
                    disabled={busy || draft.rules.length === 1}
                  >
                    ×
                  </button>
                </div>
              ))}
              {draft.rules.length < 8 && (
                <button
                  className="link"
                  onClick={() => set({ rules: [...draft.rules, { id: `rule_${draft.rules.length + 1}`, question: '', block_at: 50 }] })}
                  disabled={busy}
                >
                  + Add a rule
                </button>
              )}
            </div>
          </>
        )}
      </div>

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
      <input
        className="mono"
        value={props.value}
        list={props.list}
        spellCheck={false}
        onChange={(e) => props.onChange(e.target.value)}
        disabled={props.disabled}
      />
      <datalist id={props.list}>
        {props.options.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </>
  );
}
