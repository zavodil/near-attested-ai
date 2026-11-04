import { useState } from 'react';
import { NETWORKS, type NetworkId } from '../lib/network';
import { parseRows, paymentKeyOwner } from '../lib/outlayer';

export interface SettingsValue {
  networkId: NetworkId;
  projectId: string;
  paymentKey: string;
  /** The profile of the visitor's own secret row holding `NEARAI_API_KEY` (personal mode). */
  secretsProfile: string;
  /** The rows a call names, `owner/profile, owner/profile`: the company's first, then the officers'. Empty: personal mode. */
  rows: string;
}

export function settingsProblem(s: SettingsValue): string | null {
  if (!/^[^/\s]+\/[^/\s]+$/.test(s.projectId.trim())) return 'Set the project as owner/name.';
  if (!paymentKeyOwner(s.paymentKey)) return 'Paste your OutLayer payment key (owner:nonce:secret).';
  if (s.rows.trim()) {
    try {
      if (parseRows(s.rows).length > 5) return 'A call names at most 5 rows.';
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  } else if (!s.secretsProfile.trim()) {
    return 'Name the secrets profile that holds your NEARAI_API_KEY, or the company’s rows.';
  }
  return null;
}

/**
 * Connection settings: a one-line summary once they are complete, the form
 * while something is missing or the visitor asks to edit.
 */
export function Settings({ value, onChange }: { value: SettingsValue; onChange: (v: SettingsValue) => void }) {
  const owner = paymentKeyOwner(value.paymentKey);
  const problem = settingsProblem(value);
  const [editing, setEditing] = useState(problem !== null);
  const open = editing || problem !== null;

  if (!open) {
    return (
      <div className="settings settings-summary">
        <span className="summary-item">
          <span className="summary-label">Network</span> {value.networkId}
        </span>
        <span className="summary-item">
          <span className="summary-label">Project</span> <span className="mono">{value.projectId}</span>
        </span>
        <span className="summary-item">
          <span className="summary-label">Runs as</span> {owner}
        </span>
        <span className="summary-item">
          {value.rows.trim() ? (
            <>
              <span className="summary-label">Rows</span> <span className="mono">{value.rows}</span>
            </>
          ) : (
            <>
              <span className="summary-label">NEAR AI key</span> profile <span className="mono">{value.secretsProfile}</span>
            </>
          )}
        </span>
        <button className="link summary-edit" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="settings">
      <label>
        <span>Network</span>
        <select value={value.networkId} onChange={(e) => onChange({ ...value, networkId: e.target.value as NetworkId })}>
          {Object.values(NETWORKS).map((n) => (
            <option key={n.id} value={n.id}>
              {n.id}
            </option>
          ))}
        </select>
      </label>
      <label className="grow">
        <span>OutLayer project</span>
        <input value={value.projectId} placeholder="owner.testnet/compliance-gateway" spellCheck={false} onChange={(e) => onChange({ ...value, projectId: e.target.value })} />
      </label>
      <label className="grow">
        <span>Your payment key {owner && <em>· runs as {owner}</em>}</span>
        <input
          type="password"
          value={value.paymentKey}
          placeholder="owner:nonce:secret — create one at app.outlayer.ai"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange({ ...value, paymentKey: e.target.value })}
        />
      </label>
      <label className="grow" title="The company's row (NEARAI_API_KEY and COMPLIANCE_CONFIG) first, then the officers' rows; each must admit you by name. Leave empty to run on your own row">
        <span>Company rows · owner/profile, owner/profile</span>
        <input value={value.rows} placeholder="compliance.acme.testnet/default, hr.acme.testnet/default" spellCheck={false} onChange={(e) => onChange({ ...value, rows: e.target.value })} />
      </label>
      {!value.rows.trim() && (
        <label className="narrow-setting" title="Store NEARAI_API_KEY under this project at app.outlayer.ai, as your own secret, and name its profile here">
          <span>Your NEAR AI key · secrets profile</span>
          <input value={value.secretsProfile} placeholder="default" spellCheck={false} onChange={(e) => onChange({ ...value, secretsProfile: e.target.value })} />
        </label>
      )}
      <button className="secondary settings-done" onClick={() => setEditing(false)} disabled={problem !== null} title={problem ?? undefined}>
        Done
      </button>
    </div>
  );
}
