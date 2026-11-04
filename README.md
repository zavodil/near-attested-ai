# Attested AI

**Ask an AI model about privileged material, under the EU AI Act and your
company's rules, and keep a proof of what happened to it.**

People don't buy AI privacy, they buy protection from liability. This demo
shows what that looks like when it is enforced by hardware instead of
promised:

- **Sealed.** The prompt is encrypted in your browser to a key that exists only
  inside an attested [OutLayer](https://outlayer.ai) enclave. Nobody in the
  middle can read it: not OutLayer's servers, not its database, not anyone who
  subpoenas them.
- **Screened.** Inside the enclave, policy packs — EU AI Act Art. 5, Annex III,
  GDPR Art. 9, a company baseline — read from a registry on NEAR are put to a
  decision model as yes/no questions. A rule that fires **blocks** the prompt
  there, or **escalates** it: a task for the officer the company names, in
  their own OutLayer inbox, approved with their own wallet.
- **Answered in a TEE.** The answering model runs in
  [NEAR AI Cloud](https://cloud.near.ai)'s confidential computing: Intel TDX
  plus NVIDIA confidential GPUs.
- **Labelled and proven.** The answer comes with a signed label — which packs
  applied, what they decided, who approved, nothing of the prompt — that any
  downstream system can check, and a receipt with the Intel quotes, NVIDIA's
  GPU verdict and the model's signature. Your browser re-checks every one of
  them, trusting Intel and NVIDIA and nobody else.

It runs end to end on NEAR testnet, from a static page with no backend.

---

## Whose rules apply

A call names secret rows under the project (`secrets_refs`). The row that
holds both the NEAR AI key and `COMPLIANCE_CONFIG` is the **company's**: only
its owner's account could have stored it, so that account is the
organisation, and its configuration is applied whatever the page asks — the
packs, the allowed models, which officer takes which escalation. Employees
are the accounts the row admits by name, each calling with their own payment
key, so the label's `caller` is proven, not asserted.

```json
COMPLIANCE_CONFIG = {
  "org_name": "Acme Demo",
  "frameworks": ["eu-ai-act/art5@1", "eu-ai-act/annex3@1", "gdpr/art9@1", "corporate/baseline@1"],
  "models": ["deepseek-ai/DeepSeek-V4.1-Flash-1017"],
  "escalate": { "eu-ai-act/annex3": "hr.acme.testnet" }
}
```

An officer owns a row of their own under the project — empty, `{}` — whose
condition admits the employees whose escalations they take. The employee's
call names the company's row and the officers'; an escalation opens a task
for the officer's row, and the run that answers after their yes is started
with every row named again.

A call whose rows hold a key and no configuration runs in **personal mode**:
the page lets you pick the packs, and every label says `mode: personal` — a
company's gate refuses it. `VITE_DEMO_MODE=0` hides personal mode from the
page; the enclave decides the mode from the rows either way.

## What the demo does

### A prompt that must not reach a model

> *"Draft talking points for HR: Susan Miller in accounting told us she is
> pregnant. We want to restructure her role so she can be let go before her
> maternity leave starts."*

`gdpr/art9@1` fires (special-category data about an identifiable person,
P(yes) 99.9% ≥ 60%) and so does `eu-ai-act/annex3@1`'s employment rule. The
strictest action is **block**: the prompt is stopped inside the enclave in a
few seconds, the answering model is never called, and the receipt shows that.

### A prompt that needs a human

> *"Rank these three candidates for the promotion to team lead and tell me
> who to pick: …"*

`eu-ai-act/annex3@1` — Annex III(4), employment decisions — fires with
**escalate**. Nothing is answered: a task appears in the officer's OutLayer
inbox with the prompt, the rule and its citation, and the model. The officer
approves with one wallet signature; the platform starts the employee's run
again, which answers with the model and seals the receipt to the employee's
browser, with the officer's approval in the label.

### Privileged work that passes

> *"You are reviewing a draft share purchase agreement. Clause 9.2 says: …
> List the three biggest risks for the Buyer and suggest tighter wording."*

Every rule scores well under its threshold, so the prompt goes on to
`deepseek-ai/DeepSeek-V4.1-Flash-1017` in NEAR AI's TEE. The answer comes back
in about 20–30 seconds with every proof green and a label a gate accepts.

### Every run, step by step

1. **Pin.** The page asks the project for its keys — the encryption key
   requests are sealed to, the ed25519 key labels are signed with — and checks
   that call's Intel TDX attestation *before* encrypting anything.
2. **Whose rules.** The page asks the enclave which mode this call runs in,
   attested the same way, and shows the company's configuration read-only.
3. **Seal.** The prompt and the model choice are encrypted in the browser.
4. **Run.** OutLayer relays ciphertext it cannot open. Inside the enclave:
   - read each pack from the registry on NEAR, hash the bytes;
   - screen the prompt with each pack's decision model;
   - on **block**: stop. On **escalate**: open the officer's task, seal the
     receipt of the screen. Otherwise get NEAR AI's attestation for the
     model, bound to this exact request, and the answer;
   - check the model's Intel quote, NVIDIA's verdict and the model's signature;
   - sign the label, seal the receipt back to the browser.
5. **Officer** (an escalation only). The page follows the task until the
   officer's yes has started the run that answers.
6. **Open.** Only the browser tab that asked can decrypt the receipt.
7. **Verify.** The page re-checks every claim itself, and asks the chain
   whether each pack's hash is the one the registry holds.

At the bottom, **What the operator sees** is the full record OutLayer keeps for
the call: a sealed blob and a salted hash. There is no prompt, no answer, no
policy and no model name.

**Download receipt** saves a JSON file an auditor can verify later from public
data alone. **Copy label** gives a gate what it needs and nothing more.

---

## The label

```json
{
  "format": "outlayer-attested-ai-label/1",
  "mode": "company", "org": "compliance.acme.testnet", "config_sha256": "…",
  "project": "zavodil2.testnet/compliance-gateway", "caller": "employee.testnet", "call_id": "…",
  "issued_at": 1793652984,
  "outcome": "answered",
  "packs": [{"id": "eu-ai-act/annex3", "version": 1, "sha256": "…", "registry": "…", "block_height": 123, "verdict": "escalated"}],
  "fired": [{"pack": "eu-ai-act/annex3", "rule": "employment_decision", "cite": "Annex III(4)", "action": "escalate", "p_yes": 0.97}],
  "prompt_commitment": "sha256(salt ‖ prompt)",
  "answer_sha256": "…", "model": "deepseek-ai/DeepSeek-V4.1-Flash-1017",
  "model_attested": true, "screening_attested": false,
  "approval": {"officer": "hr.acme.testnet", "public_key": "ed25519:…", "at": 1793653100, "task_id": "…"}
}
```

Signed with ed25519 over `"outlayer-attested-ai-label/1\n"` and the label's
exact bytes, by a key the keystore derives inside the TEE for this project
and this caller; the enclave never sees it. A gate pins the key from the
attested `enclave_key` call and then checks labels offline: the
organisation, the packs it requires and that they passed, the outcome, the
approval. It never sees the prompt. The page has such a gate under every
answer to try.

## What is proven, and how

| Claim | Evidence | Checked with |
|---|---|---|
| An approved OutLayer worker ran this code, on this input, producing this output | OutLayer's TDX quote for the call. Its `report_data` = sha256(code hash, input hash, output hash, caller, project, time). | Intel DCAP verification compiled to WebAssembly, with Intel-signed collateral. Measurements must appear on `worker.outlayer.testnet` (`is_measurements_approved`). |
| The enclave's keys belong to that code | The same check, on the `enclave_key` call | Done before anything is sealed to them |
| The receipt is that run's output | `sha256(receipt) == receipt_digest` in the attested output | SHA-256 |
| The packs applied are the ones the registry holds | Each pack's `sha256`, registry and block height in the receipt and the label | The registry's `get_meta` on NEAR: the same hash, not deprecated |
| The rules decided as recorded | Every rule's probability, threshold and action | Arithmetic; the verdict is the strictest fired action |
| The model ran in Intel TDX, attested for this request | NEAR AI's TDX quote for the model. `report_data` = signing address ‖ zero pad ‖ nonce, where nonce = sha256(exact request bytes). | Intel DCAP, with collateral the enclave fetched from Intel PCS. |
| The model's GPUs are genuine and in confidential mode | NVIDIA NRAS token for evidence taken for that nonce | ES384 signature against NVIDIA's published JWKS; `x-nvidia-overall-att-result == true` |
| This answer came from that model's TEE | EIP-191 signature over `model:sha256(request):sha256(response)` | secp256k1 recovery. The signer must be the attested address, and `signature_kind` must be `provider_tee`. |
| The label is the enclave's, about this receipt | ed25519 over the label's bytes; the commitment, the answer hash, the packs, the outcome, the approval | The pinned label key; SHA-256 |
| The answer after an escalation came from the officer's yes | The approval in the label and the receipt; the run's attestation | The officer's wallet signature was verified by the enclave that took the task; the page checks the run's attestation covers the output |

The enclave runs the model-side checks before sealing the receipt, and the page
shows both verdicts ("also verified in enclave").

**The rule that keeps it honest.** The answering model must have a
NEAR-operated TEE report (`/v1/attestation/report?provider=near`). Otherwise the
enclave refuses the run *before the prompt is sent*. A decision model may be an
external provider, and the label then says `screening_attested: false`.

---

## Honest gaps

| Gap | Today | What closes it |
|---|---|---|
| The screening model is not in a TEE | NEAR AI serves `levanto/sage-1.4` as an external provider. The label says so. | A decision model served from NEAR AI's own TEE fleet |
| The label key is per caller | The keystore derives it for the project and the caller; a gate pins one key per employee, from that employee's attested `enclave_key` call | A project-wide signing key (`caller: "none"`), planned on the platform |
| The gate trusts the key it pinned | The page pins it after verifying the attestation; an offline gate trusts whoever pinned it for them | A gate that verifies the `enclave_key` attestation itself, from the same public data |
| No audit log for the company | Receipts go to the employee's browser only; the company sees who called, when, and the envelopes | Receipts sealed to a company audit key, in project storage |
| Metadata | The operator still sees who paid, when, and how big the envelopes were | Inherent in a metered service |
| Geography, ISO 27001 | Not proven. A TDX quote does not encode location. | These stay paper attestations, shown beside the cryptographic ones |
| Rule wording | A prompt that breaks a rule nobody wrote passes. The packs are a start, not a legal opinion. | Calibration prompts per rule, and a lawyer |

---

## How it works

```
Browser (static page, this repo's web/)
  │  ECIES(secp256k1) to the enclave key      POST api.outlayer.ai/call/{project}  secrets_refs: [company, officers…]
  ▼
OutLayer worker: Intel TDX, WASI P2 component (this repo's module/)
  │  0. whose rows opened → company mode or personal        OUTLAYER_SECRETS_ROWS
  │  1. near:rpc view registry.get(id, version) → hash the bytes
  │  2. POST /v1/systemone per pack                          decision model, yes/no questions
  │  3. block → stop · escalate → tasks open-for(officer) · else:
  │  4. GET  /v1/attestation/report?model&nonce=sha256(request)&provider=near
  │  5. POST /v1/chat/completions                            non-streaming, thinking off, 120 s
  │  6. GET  /v1/signature/{id}?signing_algo=ecdsa
  │  7. Intel PCS collateral → verify the model's quote; GPU evidence → NVIDIA NRAS
  │  8. sign the label (ed25519, keystore-held key) → receipt (JSON, random salt) → ECIES → the browser's reply key
  ▼
Stored by OutLayer: {"receipt_digest": sha256(receipt), "sealed": base64}
```

The enclave can reach only the four hosts in `module/manifest.json`: NEAR AI
(120 s a request), Intel PCS, Intel's CRL host and NVIDIA NRAS; the registry
is read through the worker's NEAR RPC. The manifest is embedded in the wasm,
so its hash is part of the attested code. A request is never given more than
what is left of the run, and a call that asks for nothing runs 60 s, so the
page asks every call for 150 s (`resource_limits.max_execution_seconds`);
a client of your own must do the same.

### Keys

- **Enclave key.** A secp256k1 key derived inside the TEE by OutLayer's keystore
  from (project, caller). It is never stored anywhere. Every run of the project
  for the same caller gets the same key; no other caller or project can open
  what was sealed to it.
- **Label key.** An ed25519 key derived the same way; the enclave signs with
  it through the host and never sees it.
- **Reply key.** Generated per request in the browser tab. It never leaves the
  tab; an escalation's answer is sealed to the same key after the officer's yes.
- **NEAR AI key.** The company's, in its row, decrypted only inside the
  enclave; in personal mode, the caller's own.

### The registry

`registry/` is a NEAR contract: `publish(id, version, bytes)` once,
`deprecate` by the publisher, `get`, `get_meta`, `versions`, `list`. No
update, no delete. `policies/` holds the packs and a script that publishes
them.

---

## Repository

```
module/     the OutLayer project: Rust, wasm32-wasip2
  src/main.rs           the operations
  src/config.rs         whose rules apply, from the rows the call named
  src/pack.rs           packs, read from the registry by id@version
  src/screening.rs      the screen, per pack; the strictest fired action
  src/escalate.rs       the officer's task, and the run after their yes
  src/label.rs          the signed label
  src/envelope.rs       enclave key and ECIES both ways
  src/model_call.rs     one NEAR AI exchange, attested for its own request bytes
  src/evidence.rs, intel.rs, nvidia.rs, eip191.rs   the model-side checks
  manifest.json         allowlist with NEAR AI's request time, keys, tasks — embedded in the wasm
registry/   the policy registry contract (near-sdk 5.9, Rust 1.85)
policies/   the packs, and publish.sh
web/        the page: Vite + React + TypeScript, no backend
  src/lib/session.ts    pin · whose rules · ask · await the officer
  src/lib/verify/       every browser-side check, the label and the gate included
  scripts/seal-key.mjs  seals a payment key for a hosted build
```

## The deployed demo

- **OutLayer project:** `zavodil2.testnet/compliance-gateway` (testnet).
- **Active version:** the sha256 of `module/`'s build at this commit, printed
  by `module/build.sh`, which pins the toolchain and rewrites local paths so
  the same `rust-toolchain.toml` and `Cargo.lock` give the same bytes. Compare
  it with the `wasm_hash` in any call's attestation:
  `https://testnet-api.outlayer.ai/attestations/by-call/<call_id>`.
- **The page:** GitHub Pages, built by `.github/workflows/pages.yml`. A personal
  link fills in everything, including a small payment key (see below) and the
  company's rows. Opened without one, the page asks for your own key.

## Run it yourself

You need:
- an OutLayer payment key (`owner:nonce:secret`, from [app.outlayer.ai](https://app.outlayer.ai));
- either the company's rows, which admit you by name, or your own NEAR AI
  Cloud key stored at app.outlayer.ai as a secret under the project, with
  variable `NEARAI_API_KEY` in a profile of your choice.

```bash
cd web
npm install
npm test
VITE_PROJECT_ID=zavodil2.testnet/compliance-gateway VITE_SECRETS_ROWS="compliance.acme.testnet/default,hr.acme.testnet/default" npm run dev
```

Paste your payment key into the settings bar and ask. To be a company: store
`NEARAI_API_KEY` and `COMPLIANCE_CONFIG` in one row under the project, with a
whitelist of your employees; have each officer store `{}` in a row of their
own with a whitelist of the employees whose escalations they take.

### Build the module

```bash
cd module
cargo test
./build.sh        # wasm32-wasip2 build, checks the manifest and imports, prints the sha256
```

The module takes OutLayer's SDK as a path dependency (`../../near-offshore/sdk/outlayer`)
until SDK 0.2.2 — the rows and `Task::owner` — is on crates.io. To run your own
copy, publish the wasm under a URL, then create an OutLayer project with a
`WasmUrl` source. Encryption and signing keys are issued only to projects whose
code comes from a `WasmUrl`.

### Hosting with a personal link

A hosted build never carries a payment key in the clear:

```bash
cd web
node scripts/seal-key.mjs < payment-key.txt > sealed.json   # key read from stdin
gh secret set VITE_PAYMENT_KEY_SEALED < <(jq -r .sealed sealed.json)
gh variable set VITE_SECRETS_ROWS --body "compliance.acme.testnet/default,hr.acme.testnet/default"
```

The build embeds only the sealed value. The link is
`https://<pages>/#decrypt_key=<decrypt_key from sealed.json>`. The decrypt key
sits after `#`, so the browser never sends it to the host. The page unseals the
payment key and immediately removes the decrypt key from the address bar.
Give the payment key only a small balance, and delete it when the demo is over.

## License

MIT or Apache-2.0, at your option.
