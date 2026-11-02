import type { Outcome } from '../lib/session';
import { base64 } from '../lib/bytes';
import { Badge, Shield } from './Icons';
import { PolicyBars } from './PolicyBars';
import type { Verdict } from '../lib/verify/types';
import { overall } from '../lib/verify/types';

export function Answer({ outcome, network, projectId }: { outcome: Outcome; network: string; projectId: string }) {
  const { receipt } = outcome;
  const verdict: Verdict = overall(outcome.proofs.map((p) => ({ label: p.title, verdict: p.verdict, detail: '' })));
  const screening = receipt.screening;
  const fired = screening?.outcomes.filter((o) => o.tripped).length ?? 0;

  const download = () => {
    const bundle = {
      format: 'outlayer-attested-ai-audit/1',
      network,
      project: projectId,
      call_id: outcome.callId,
      attestation_url: `/attestations/by-call/${outcome.callId}`,
      receipt_base64: base64(outcome.receiptBytes),
      sealed_output: outcome.operatorView.output,
      receipt,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `receipt-${outcome.callId}.json` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={`answer card answer-${receipt.outcome}`}>
      <header>
        <Badge verdict={verdict} size={16} />
        <div>
          <h2>{receipt.outcome === 'answered' ? 'Answer' : 'Blocked by policy'}</h2>
          <p>
            {receipt.outcome === 'answered'
              ? `${receipt.answer?.call.model} · ${verdictLine(verdict)}`
              : `The prompt never reached the answering model · ${verdictLine(verdict)}`}
            {outcome.timeMs ? ` · ${(outcome.timeMs / 1000).toFixed(1)} s in the enclave` : ''}
          </p>
        </div>
        <button className="secondary" onClick={download}>
          Download receipt
        </button>
      </header>

      {receipt.outcome === 'blocked' && screening && (
        <>
          <div className="blocked-banner">
            <Shield size={22} />
            <div>
              <strong>
                Stopped inside the enclave: {fired} of {screening.policy.rules.length} rules fired
              </strong>
              <span>
                {screening.policy.model} screened the prompt; the answering model was never called. The receipt has no answer,
                and OutLayer’s attestation covers that.
              </span>
            </div>
          </div>
          <PolicyBars screening={screening} />
        </>
      )}

      {receipt.outcome === 'answered' && (
        <>
          {screening && (
            <details className="passed-policy">
              <summary>
                Passed the policy · {screening.policy.rules.length} rule{screening.policy.rules.length === 1 ? '' : 's'} checked by{' '}
                {screening.policy.model}
              </summary>
              <PolicyBars screening={screening} compact />
            </details>
          )}
          <div className="answer-text">{receipt.answer?.text}</div>
        </>
      )}
    </section>
  );
}

function verdictLine(v: Verdict): string {
  return { pass: 'every proof verified in this browser', warn: 'verified, with notes below', fail: 'a proof failed — see below', skip: 'not verified' }[v];
}
