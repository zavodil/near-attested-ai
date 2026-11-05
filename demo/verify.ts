/**
 * Checks a run's evidence with no account and no key of ours, and writes what
 * it found: `ledger.csv` and `index.html` beside the evidence.
 *
 * Every label is held to the keys pinned in `pins/` and to a gate that requires
 * this company, a known employee and every pack; the receipt to the digest in
 * the attested output. `--strict` also re-checks each OutLayer attestation
 * (Intel's quote, an approved worker, the code, the input and the output) from
 * the files kept here; it asks Intel's collateral service and the chain.
 *
 * Run: cd web && npx vite-node ../demo/verify.ts [--strict]
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HERE } from './node';
import { sha256Hex } from '../web/src/lib/bytes';
import { NETWORKS } from '../web/src/lib/network';
import { parseLabel, parseReceipt } from '../web/src/lib/receipt';
import { callerSignatureHolds, gate, labelSignatureHolds, verifyLabel } from '../web/src/lib/verify/label';
import { verifyOutlayerRun } from '../web/src/lib/verify/outlayer';

const EVIDENCE = process.env.DEMO_EVIDENCE ?? resolve(HERE, 'evidence');
const STRICT = process.argv.includes('--strict');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const people = read(resolve(EVIDENCE, 'people.json'));
const network = NETWORKS.testnet;

interface Row {
  scene: string; title: string; who: string; position: string; project: string; mode: string; outcome: string; rules: string; approved_by: string; screen_in_tee: string; answer_in_tee: string;
  company_signature: string; employee_signature: string; receipt_matches: string; attestation: string; company_gate: string; why: string; call_id: string; label_file: string;
}
const positionOf = (account: string) => people.employees[account]?.position ?? people.officers[account]?.position ?? (people.outsider.account === account ? people.outsider.position : account === people.company.account ? people.company.position : '');
const yn = (ok: boolean) => (ok ? 'valid' : 'INVALID');

async function attested(dir: string): Promise<string> {
  if (!STRICT) return 'not checked';
  const proof = await verifyOutlayerRun(network, read(`${dir}/attestation.json`), read(`${dir}/input.json`).input, read(`${dir}/output.json`), { id: 'run', title: 'run' });
  return proof.verdict === 'fail' ? `FAILED: ${proof.steps.filter((s) => s.verdict === 'fail').map((s) => s.label).join('; ')}` : 'verified';
}

async function row(scene: string, title: string, dir: string, who: string): Promise<Row> {
  const signed = read(`${dir}/label.json`);
  const label = parseLabel(signed.body);
  const receiptBytes = readFileSync(`${dir}/receipt.json`);
  const receipt = parseReceipt(new Uint8Array(receiptBytes));
  const output = read(`${dir}/output.json`);
  // The company's second project has keys of its own, pinned the same way.
  const inTee = label.project === people.tee_project;
  const companyKey = inTee ? people.tee_company.label_key : people.company.label_key;
  const employeeKey = inTee ? people.tee_company.caller_key : people.employees[label.caller ?? '']?.caller_key;
  const companyOk = labelSignatureHolds(signed, companyKey);
  const employeeOk = !!employeeKey && callerSignatureHolds(signed, employeeKey);
  const known = inTee ? { [label.caller ?? '']: employeeKey } : Object.fromEntries(Object.entries<any>(people.employees).map(([account, e]) => [account, e.caller_key]));
  const verdict = gate(label, companyOk, { org: people.org, packs: label.packs.map((p) => `${p.id}@${p.version}`), officers: Object.keys(people.officers), employees: known }, signed);
  const heldToReceipt = sha256Hex(new Uint8Array(receiptBytes)) === output.receipt_digest && verifyLabel(receipt, signed.public_key, label.caller_key).steps.every((s) => s.verdict !== 'fail');
  return {
    scene, title, who, position: positionOf(who), project: label.project ?? '', mode: label.mode, outcome: label.outcome,
    rules: label.fired.map((f) => `${f.pack}/${f.rule} ${f.action}`).join('; '), approved_by: label.approval?.officer ?? '',
    screen_in_tee: label.packs.length ? String(label.screening_attested) : '', answer_in_tee: label.answer_sha256 ? String(label.model_attested) : '',
    company_signature: yn(companyOk), employee_signature: yn(employeeOk), receipt_matches: yn(heldToReceipt), attestation: await attested(dir),
    company_gate: verdict.accepted ? 'accepted' : 'refused', why: verdict.reasons.join('; '), call_id: label.call_id ?? '', label_file: `scenes/${scene}/${dir.endsWith('scenes/' + scene) ? '' : dir.split('/').pop() + '/'}label.json`,
  };
}
const refusal = (scene: string, title: string, who: string, why: string): Row => ({
  scene, title, who, position: positionOf(who), project: '', mode: '', outcome: 'refused, nothing signed', rules: '', approved_by: '', screen_in_tee: '', answer_in_tee: '',
  company_signature: '', employee_signature: '', receipt_matches: '', attestation: '', company_gate: '', why, call_id: '', label_file: '',
});

const rows: Row[] = [];
let pinsOk = true;
if (STRICT) {
  for (const pin of readdirSync(resolve(EVIDENCE, 'pins'))) {
    const verdict = await attested(resolve(EVIDENCE, 'pins', pin));
    console.log(`pin ${pin}: ${verdict}`);
    pinsOk &&= verdict === 'verified';
  }
}
for (const scene of readdirSync(resolve(EVIDENCE, 'scenes')).sort()) {
  const dir = resolve(EVIDENCE, 'scenes', scene);
  const m = read(`${dir}/scene.json`);
  if ('refused' in m) rows.push(refusal(scene, m.title, m.who, m.refused ?? m.unexpected));
  else if (existsSync(`${dir}/label.json`)) rows.push(await row(scene, m.title, dir, m.who));
  else {
    rows.push(await row(scene, `${m.title}: while it waits`, `${dir}/1-waiting`, m.who));
    if (existsSync(`${dir}/2-answer`)) rows.push(await row(scene, `${m.title}: after the yes`, `${dir}/2-answer`, m.who));
    else rows.push(refusal(scene, `${m.title}: the officer’s no`, m.who, read(`${dir}/2-rejected.json`).refused));
  }
}

// One label with the name changed, to show what a forgery looks like.
const first = rows.find((r) => r.company_gate === 'accepted');
if (first) {
  const signed = read(resolve(EVIDENCE, first.label_file));
  const other = Object.keys(people.employees).find((a) => a !== first.who) ?? 'someone.testnet';
  const forged = { ...signed, body: signed.body.replaceAll(first.who, other) };
  const label = parseLabel(forged.body);
  const companyOk = labelSignatureHolds(forged, people.company.label_key);
  const verdict = gate(label, companyOk, { org: people.org, packs: [], employees: Object.fromEntries(Object.entries<any>(people.employees).map(([a, e]) => [a, e.caller_key])) }, forged);
  rows.push({ ...first, scene: 'forged', title: `The same label, ${first.who} renamed to ${other}`, who: other, position: positionOf(other), company_signature: yn(companyOk), employee_signature: yn(!!people.employees[other] && callerSignatureHolds(forged, people.employees[other].caller_key)), receipt_matches: '', attestation: '', company_gate: verdict.accepted ? 'accepted' : 'refused', why: verdict.reasons.join('; '), label_file: '' });
}

const columns: (keyof Row)[] = ['scene', 'title', 'who', 'position', 'mode', 'outcome', 'rules', 'approved_by', 'screen_in_tee', 'answer_in_tee', 'company_signature', 'employee_signature', 'receipt_matches', 'attestation', 'company_gate', 'why', 'call_id', 'label_file'];
const csv = (value: string) => `"${String(value).replaceAll('"', '""')}"`;
writeFileSync(resolve(EVIDENCE, 'ledger.csv'), [columns.join(','), ...rows.map((r) => columns.map((c) => csv(r[c])).join(','))].join('\n') + '\n');

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const short = (key: string) => (key ? `${key.slice(0, 8)}…${key.slice(-8)}` : '');
const mark = (v: string) => (v === 'valid' || v === 'accepted' || v === 'verified' ? `<span class="ok">${esc(v)}</span>` : v === 'INVALID' || v === 'refused' || v.startsWith('FAILED') ? `<span class="no">${esc(v)}</span>` : esc(v));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(people.org_name)} evidence</title><style>
:root{--bg:#fff;--fg:#1a1d21;--muted:#5f6b76;--line:#dfe3e8;--ok:#0a7a4f;--no:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#14171a;--fg:#e8eaed;--muted:#9aa4ae;--line:#2c3238;--ok:#4cc38a;--no:#f2857d}}
body{font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px 16px}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px}p{color:var(--muted);margin:0 0 12px;max-width:760px}
.wrap{overflow-x:auto}table{border-collapse:collapse;min-width:100%}th,td{border-bottom:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600;white-space:nowrap}code{font:12px ui-monospace,monospace}.ok{color:var(--ok);font-weight:600}.no{color:var(--no);font-weight:600}.why{color:var(--muted);max-width:360px}
</style></head><body><h1>${esc(people.org_name)}: what happened, and what proves it</h1><p>Recomputed from the evidence files by <code>demo/verify.ts</code>${STRICT ? ', OutLayer attestations included' : ''}. The ledger holds no prompt: a label carries only a salted commitment to it.</p>
<h2>Who signs</h2><div class="wrap"><table><tr><th>Who</th><th>Position</th><th>Key</th><th>What it proves</th></tr>
<tr><td>${esc(people.company.account)}</td><td>${esc(people.company.position)}</td><td><code>${short(people.company.label_key)}</code></td><td>This company’s project signed the label</td></tr>
${Object.entries<any>(people.employees).map(([a, e]) => `<tr><td>${esc(a)}</td><td>${esc(e.position)}</td><td><code>${short(e.caller_key)}</code></td><td>This employee started the run</td></tr>`).join('')}
${Object.entries<any>(people.officers).map(([a, o]) => `<tr><td>${esc(a)}</td><td>${esc(o.position)}</td><td>wallet</td><td>Approves: ${esc(o.takes)}</td></tr>`).join('')}
</table></div><h2>Every request</h2><div class="wrap"><table><tr><th>What happened</th><th>Who</th><th>Outcome</th><th>Rules fired</th><th>Approved by</th><th>Company signature</th><th>Employee signature</th><th>Receipt</th><th>Attestation</th><th>Company’s gate</th><th>Why</th><th>Label</th></tr>
${rows.map((r) => `<tr><td>${esc(r.title)}</td><td>${esc(r.who)}<br><small>${esc(r.position)}</small></td><td>${esc(r.outcome)}</td><td>${esc(r.rules)}</td><td>${esc(r.approved_by)}</td><td>${mark(r.company_signature)}</td><td>${mark(r.employee_signature)}</td><td>${mark(r.receipt_matches)}</td><td>${mark(r.attestation)}</td><td>${mark(r.company_gate)}</td><td class="why">${esc(r.why)}</td><td>${r.label_file ? `<a href="${esc(r.label_file)}">label</a>` : ''}</td></tr>`).join('')}
</table></div></body></html>
`;
writeFileSync(resolve(EVIDENCE, 'index.html'), html);

for (const r of rows) console.log(`${r.company_gate.padEnd(9)} ${r.company_signature.padEnd(8)} ${r.employee_signature.padEnd(8)} ${r.attestation.slice(0, 10).padEnd(11)} ${r.outcome.padEnd(24)} ${r.title}`.slice(0, 170));
const broken = rows.filter((r) => r.scene !== 'forged' && (r.receipt_matches === 'INVALID' || r.attestation.startsWith('FAILED')));
console.log(`${rows.length} rows, ${broken.length} broken${STRICT ? `, pins ${pinsOk ? 'verified' : 'FAILED'}` : ''}. evidence/index.html, evidence/ledger.csv`);
if (!rows.length) console.log('no request in this evidence: the scenario did not run through');
process.exit(broken.length || !pinsOk || !rows.length ? 1 : 0);
