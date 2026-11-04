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
  const rules = screening?.packs.reduce((n, p) => n + p.outcomes.length, 0) ?? 0;
  const fired = screening?.fired.length ?? 0;
  const packs = screening?.packs.length ?? 0;
  const models = Array.from(new Set(screening?.packs.map((p) => p.model) ?? [])).join(', ');

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

  const title =
    receipt.outcome === 'answered' ? (receipt.approval ? 'Answer, after the officer’s approval' : 'Answer') : receipt.outcome === 'blocked' ? 'Blocked by policy' : 'Escalated to an officer';
  const line =
    receipt.outcome === 'answered'
      ? `${receipt.answer?.call.model} · ${verdictLine(verdict)}`
      : receipt.outcome === 'blocked'
        ? `The prompt never reached the answering model · ${verdictLine(verdict)}`
        : `The prompt waits for ${receipt.escalated_to} · ${verdictLine(verdict)}`;

  return (
    <section className={`answer card answer-${receipt.outcome}`}>
      <header>
        <Badge verdict={verdict} size={16} />
        <div>
          <h2>{title}</h2>
          <p>
            {line}
            {outcome.timeMs ? ` · ${(outcome.timeMs / 1000).toFixed(1)} s in the enclave` : ''}
          </p>
        </div>
        <button className="secondary" onClick={download}>
          Download receipt
        </button>
      </header>

      {receipt.outcome !== 'answered' && screening && (
        <>
          <div className={`blocked-banner ${receipt.outcome}`}>
            <Shield size={22} />
            <div>
              <strong>
                {receipt.outcome === 'blocked' ? 'Stopped inside the enclave' : 'Held inside the enclave'}: {fired} of {rules} rules fired across {packs} pack
                {packs === 1 ? '' : 's'}
              </strong>
              <span>
                {models} screened the prompt
                {receipt.outcome === 'blocked'
                  ? '; the answering model was never called. The receipt has no answer, and OutLayer’s attestation covers that.'
                  : `; nothing was answered. A task is in ${receipt.escalated_to}’s OutLayer inbox, and their wallet’s signature starts the run that answers.`}
              </span>
            </div>
          </div>
          <PolicyBars screening={screening} />
        </>
      )}

      {receipt.outcome === 'answered' && (
        <>
          {receipt.approval && (
            <div className="blocked-banner approved">
              <Shield size={22} />
              <div>
                <strong>
                  Approved by {receipt.approval.officer} · {new Date(receipt.approval.at * 1000).toLocaleString()}
                </strong>
                <span>
                  {fired} rule{fired === 1 ? '' : 's'} escalated; the officer read the prompt in their inbox and signed. The run that answered is attested
                  separately, and the label carries the approval.
                </span>
              </div>
            </div>
          )}
          {screening && (
            <details className="passed-policy" open={!!receipt.approval}>
              <summary>
                {receipt.approval ? 'The screen that escalated' : 'Passed the packs'} · {rules} rule{rules === 1 ? '' : 's'} in {packs} pack{packs === 1 ? '' : 's'}, checked by{' '}
                {models}
              </summary>
              <PolicyBars screening={screening} compact />
            </details>
          )}
          {!screening && receipt.mode.mode === 'personal' && (
            <p className="hint">Not screened: no pack was chosen. The label says so, and a company’s gate refuses it.</p>
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
