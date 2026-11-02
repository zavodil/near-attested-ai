import type { Outcome } from '../lib/session';
import { Eye } from './Icons';

const clip = (value: string, keep = 220) => (value.length > keep ? `${value.slice(0, keep)}… (${value.length} chars)` : value);

/** Everything OutLayer's coordinator relayed and stored for this call. */
export function OperatorView({ outcome }: { outcome: Outcome }) {
  const { input, output } = outcome.operatorView;
  return (
    <section className="operator">
      <header>
        <Eye />
        <div>
          <h3>What the operator sees</h3>
          <p>The coordinator, its database and anyone who subpoenas them hold exactly this for call {outcome.callId}.</p>
        </div>
      </header>
      <div className="operator-grid">
        <div>
          <span className="operator-label">Request</span>
          <pre>{JSON.stringify({ op: input.op, sealed: clip(input.sealed) }, null, 2)}</pre>
        </div>
        <div>
          <span className="operator-label">Response</span>
          <pre>{JSON.stringify({ receipt_digest: output.receipt_digest, sealed: clip(output.sealed) }, null, 2)}</pre>
        </div>
      </div>
      <p className="operator-note">
        No prompt, no answer, no policy, no model name. The digest is salted, so it cannot confirm a guessed prompt. What
        stays visible is the envelope: who paid for the call, when, and how large it was.
      </p>
    </section>
  );
}
