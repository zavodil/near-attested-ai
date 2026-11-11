# Provable AI Compliance

**Pick a compliance framework, and every AI request your company makes is
checked against it automatically: allowed, blocked or escalated to a human,
with cryptographic proof that the controls were enforced.**

> **[Read the full report →](https://zavodil.github.io/near-attested-ai/report.html)**
> It walks through a whole company's day step by step: the rules it picks,
> blocked, escalated and approved requests, and the attempts to get around them.
> Each step has screenshots, every attestation and signed label, and a button
> that re-checks it in your browser.

The usual approach is a proxy with a filter and a log. The vendor runs the
filter, writes the log, and could skip both without anyone knowing. That log is
a claim. This project replaces the claim with proof, end to end, from the
employee's browser to the GPU that answers.

**Select a framework.** A company picks the frameworks it is held to: EU AI Act
Art. 5 (prohibited practices) and Annex III (high-risk uses), GDPR Art. 9
(special-category data), and its own baseline. Each one is a versioned policy
pack in a NEAR contract that publishes but never edits. A pack's rules are
yes/no questions with a threshold and an action. Any other regulation or
corporate policy is one more pack, and the company's configuration names the
ones that apply.

**Programmable controls, enforced inside a TEE.** The prompt is encrypted in
the browser to an Intel TDX enclave on [OutLayer](https://outlayer.ai), and
the servers in between see only ciphertext. Inside the enclave, every rule is
evaluated, and the strictest one that fires decides:

- **Allow.** The request goes to a [NEAR AI Cloud](https://cloud.near.ai)
  confidential model (Intel TDX + NVIDIA confidential GPUs), and its hardware
  signs the answer.
- **Block.** A prohibited practice stops before any model sees it.
- **Escalate.** A hiring or credit decision becomes a task, opened from inside
  the enclave, for the officer the company named for that rule: hiring goes to
  HR, credit to risk. The officer approves in their OutLayer inbox with a NEAR
  wallet signature, and only then does a second attested run answer.

**Proof that the controls were enforced.** Every run carries an Intel quote
over the code, input, output and caller, so it names the exact binary that
produced the result. Each request ends with a label signed by the company's key
and the employee's key. Both keys come from confidential key derivation (CKD)
by the NEAR MPC network, are bound to this project, and are used only inside
the TEE; the code never sees them. The label lists the framework versions
applied with their hashes, the verdict and the approver, and it holds no prompt
text. A receiving system verifies the label offline. An auditor re-checks the
Intel quotes, NVIDIA's verdict and the pack hashes on NEAR from public data,
with no account and no key of ours.

**Going around it fails.** A former employee, an employee who brings their own
rules or NEAR AI key, and a forged label are all refused.

It runs end to end on NEAR testnet, from a static page with no backend.

## Check it in a minute, with no account or key

Node 18 or later and an internet connection (the check reads NEAR testnet and
Intel's collateral):

```bash
git clone https://github.com/zavodil/near-attested-ai
cd near-attested-ai/web
npm ci
npm test                                                                      # 17 tests: envelopes, labels, the gate, the verifiers
DEMO_EVIDENCE=$PWD/public/report/evidence npx vite-node ../demo/verify.ts --strict
```

The last command re-checks a fictional company's day on NEAR testnet: 17
requests from a recruiter, an analyst, a former employee and the HR officer,
blocked, escalated, approved and answered. It ends with

```
17 rows, 0 broken, pins verified. evidence/index.html, evidence/ledger.csv
```

For every run, and for every call the signing keys were pinned from, it checks:
- Intel signed the TDX quote, and the worker's measurements are approved on NEAR;
- the quote commits to this code, input, output, caller and project;
- the receipt hashes to the digest in the attested output.

For every label, it checks:
- the company's and the employee's signatures hold against the pinned keys;
- the label matches the receipt;
- the company's gate accepts or refuses it on the organisation, the employee, the packs and the officer.

It also renames the employee in one label, to show that the forgery is refused,
and exits non-zero if any receipt or attestation fails. The table it prints is
the ledger at the end of the report.

- **[The report](https://zavodil.github.io/near-attested-ai/report.html)** walks
  through the same day step by step. Each step has its screen, its evidence files
  and a **Re-check** button that verifies it again in your browser, this time
  including each pack's hash on NEAR and NEAR AI's Intel and NVIDIA evidence.
- **[The live page](https://zavodil.github.io/near-attested-ai/)** asks a
  question through the gateway. It needs an OutLayer testnet payment key
  ([Run it yourself](#run-it-yourself)).
- **Building the module** needs Rust (the toolchain is pinned in
  `module/rust-toolchain.toml`) and OutLayer's SDK 0.2.2 next to this repo:
  `git clone https://github.com/out-layer/outlayer ../near-offshore`, then
  `cd module && cargo test && ./build.sh`.

## Built on the NEAR stack

| What | On NEAR | Where |
|---|---|---|
| **Policies** | A registry contract that only publishes: no update, no delete. The enclave reads each pack by `id@version` through NEAR RPC and hashes the bytes; the label carries the hash and block height, and the verifier asks the chain for the same hash. | `registry/`, `module/src/pack.rs` |
| **Identity** | NEAR accounts. The company's account owns the project, and each employee and officer has their own account. A call carries the caller's account, and the attestation commits to it. | `demo/roles.json` |
| **Access** | The company's rules and NEAR AI key are a secrets row stored encrypted in OutLayer's NEAR contract, under an access condition. The demo admits employees by account name. The same condition can admit by a Sputnik DAO role, an account pattern such as `*.acme.near`, a token balance, an NFT or a deadline. Removing an account from the row ends its access. A row's owner is the only account that can replace it. | Steps 1 and 10 of the report |
| **Approvals** | An escalation is a task for the officer's account in the OutLayer inbox. The officer signs in with a NEAR wallet and approves with a wallet signature. The run that answers carries the approval in its label. | `module/src/escalate.rs` |
| **Keys** | The company's and the employee's label keys come from confidential key derivation (CKD) by the NEAR MPC network, bound to this project: one key for the project and one per account. They are derived and used only inside the TEE and are never stored. | `module/src/label.rs` |
| **Code that ran** | The project and its versions are registered in OutLayer's NEAR contract. The worker's TDX measurements are approved on a NEAR contract, and the verifier checks them there. | `web/src/lib/verify/outlayer.ts` |
| **Payment** | Each employee calls with their own payment key from OutLayer's NEAR contract. | `web/src/lib/session.ts` |
| **Model** | NEAR AI Cloud's confidential models: Intel TDX plus NVIDIA confidential GPUs. Their evidence is checked in the enclave and again in the browser. | `module/src/evidence.rs` |

## What OutLayer provides

The gateway is one WebAssembly module. Everything around it comes from
[OutLayer](https://outlayer.ai), and the module calls it through the SDK:

| OutLayer feature | Used here for | Where | Without it you would build |
|---|---|---|---|
| **Confidential execution** | The module runs in an Intel TDX enclave on OutLayer's workers. Publishing a version is enough to deploy it. | `module/build.sh` | A TDX fleet, its images and its upgrades |
| **Proof of each run** | An Intel quote for every call covers the code hash, input, output, caller and project. It is public by call id. | `web/src/lib/verify/outlayer.ts` | Quote generation, collateral, an approved-build list and a public record |
| **Signing keys** | The label's two ed25519 keys are declared in the manifest. One is the project's (`caller: "none"`) and one is per account. Both come from NEAR MPC confidential key derivation (CKD), bound to this project, and are used only inside the TEE. The code asks for signatures and never sees a key. | `module/manifest.json`, `module/src/label.rs` | A KMS or HSM, and a way to show the operator could not have signed |
| **Encryption keys** | The enclave key the browser seals prompts to. It is derived per project and caller, never stored, and pinned through an attested call. | `module/src/envelope.rs` | Key management for end-to-end encryption to an enclave |
| **Secrets on chain, applied by the author** | The company's row (rules and NEAR AI key) is applied to every run of its project, whatever the caller names (`author_secrets`). It is decrypted only in the TEE, and only for accounts its access condition admits. | `module/src/config.rs` | Multi-tenant secret storage, access control, and a way to stop users from swapping the rules |
| **Delegation of secrets** | One call names up to five rows. An officer's own row admits the employees whose escalations they take, which links officers to employees without making anyone an admin. | `web/src/lib/outlayer.ts` | A role and consent model across accounts |
| **Delegated tasks** | An escalation is `open-for` the officer: an inbox, encrypted delivery, a wallet signature, and a new attested run on approval. A signed webhook can notify through any channel. | `module/src/escalate.rs` | A workflow service, notifications, sign-off verification and resume logic |
| **NEAR RPC from the enclave** | The packs are read from the registry contract inside the enclave, at a known block height. | `module/src/pack.rs` | An oracle or a trusted relay |
| **Egress allowlist** | The four hosts the enclave can reach are listed in the manifest. The manifest is part of the wasm hash, and the worker enforces the list. | `module/manifest.json` | Egress control that a customer can verify |
| **Payment keys** | Each employee calls over HTTPS with a prepaid key of their own, and removing them from the company's row ends their access. | `web/src/lib/session.ts` | Metering, billing and an API gateway |

A new customer is a configuration: one published build serves every company,
each with its own keys, rules and officers, and there are no servers to run
per customer.

---

## Whose rules apply

A company runs this build as **a project of its own account**, the same wasm
with the same hash. Its row, stored under that project with the profile
`company` (`author_secrets` in the manifest), holds the NEAR AI key and
`COMPLIANCE_CONFIG`. The worker opens that row on every run, whatever the call
names, and the configuration is applied whatever the page asks: the packs, the
allowed models, which officer takes which escalation. The project's owner is the
organisation, the one account that could have stored the row. Employees are the
accounts the row admits by name, each calling with their own payment key. A
stranger is refused before anything runs.

```json
COMPLIANCE_CONFIG = {
  "org_name": "Acme Demo",
  "frameworks": ["eu-ai-act/art5@2", "eu-ai-act/annex3@2", "gdpr/art9@2", "corporate/baseline@2"],
  "models": ["deepseek-ai/DeepSeek-V4.1-Flash-1017"],
  "escalate": { "eu-ai-act/annex3": "hr.acme.testnet" }
}
```

An officer owns a row of their own under the project — empty, `{}` — whose
condition admits the employees whose escalations they take. The employee's
call names the officers' rows; an escalation opens a task for the officer's
row, and the run that answers after their yes is started with every row named
again.

An employee cannot bring rules of their own. A name in a row of theirs that the
company's row also holds refuses the run, and a `COMPLIANCE_CONFIG` from any row
a call names is refused by the module, on every project.

A project whose row holds no configuration runs in **personal mode**: the
caller's row holds the key, the page lets you pick the packs, and every label
says `mode: personal`. It is signed with that project's key, so a company's
gate refuses it at the signature. `VITE_DEMO_MODE=0` hides personal mode from
the page; the enclave decides the mode from the project either way.

## What the demo does

### A prompt that must not reach a model

> *"Draft talking points for HR: Susan Miller in accounting told us she is
> pregnant. We want to restructure her role so she can be let go before her
> maternity leave starts."*

`gdpr/art9@2` fires (special-category data about an identifiable person,
P(yes) 99.9% ≥ 60%) and so does `eu-ai-act/annex3@2`'s employment rule. The
strictest action is **block**: the prompt is stopped inside the enclave in a
few seconds, the answering model is never called, and the receipt shows that.

### A prompt that needs a human

> *"Rank these three candidates for the promotion to team lead and tell me
> who to pick: …"*

`eu-ai-act/annex3@2` — Annex III(4), employment decisions — fires with
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
   requests are sealed to, the two ed25519 keys labels are signed with — and checks
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
  "project": "compliance.acme.testnet/compliance-gateway", "caller": "employee.testnet", "caller_key": "…", "call_id": "…",
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

Signed twice with ed25519 over `"outlayer-attested-ai-label/1\n"` and the
label's exact bytes, by two keys from NEAR MPC confidential key derivation
(CKD), derived inside the keystore's TEE; the module never sees either.

- The **company's key**: one for the project, whoever calls (`"caller": "none"`).
  Each company runs its own project, so a gate pins one key per company, from
  any attested `enclave_key` call, and a label that verifies under it came from
  that company's project.
- The **employee's key**: one for each account of the project (the default,
  `"caller": "signer"`). The keystore derives it for the account that started
  the run, so no code of the project can sign under an employee's key in anyone
  else's run. A gate that knows its employees' keys tells who asked from the
  signature, not from the `caller` field.

A gate checks labels offline: the keys, the organisation, the packs it requires
and that they passed, the outcome, the approval, optionally that the screen ran
in a TEE. It never sees the prompt. The page has such a gate under every answer
to try.

Both keys survive every version of the project, and the project's owner can
publish a version. What a gate does not take on trust it checks on the strict
path: the attestation of the label's `call_id` names the build that ran, which
it holds to the published hash.

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
| The label is the company's project's, about this receipt | ed25519 over the label's bytes; the commitment, the answer hash, the packs, the outcome, the approval | The pinned label key; SHA-256 |
| The employee named asked | The second ed25519 signature over the same bytes | The employee's key, pinned from their attested `enclave_key` call |
| The answer after an escalation came from the officer's yes | The approval in the label and the receipt; the run's attestation | The officer's wallet signature was verified by the enclave that took the task; the page checks the run's attestation covers the output |

The enclave runs the model-side checks before sealing the receipt, and the page
shows both verdicts ("also verified in enclave").

**The rule that keeps it honest.** The answering model must have a
NEAR-operated TEE report (`/v1/attestation/report?provider=near`). Otherwise the
enclave refuses the run *before the prompt is sent*. A decision model may be an
external provider, and the label then says `screening_attested: false`. A pack
with `"via": "chat"`, or a configuration with `"screening_tee": true`, refuses
that too: the screen runs in a TEE, the receipt carries its evidence, and the page
checks it like the answer's.

---

## Honest gaps

| Gap | Today | What closes it |
|---|---|---|
| The calibrated screening model is not in a TEE | NEAR AI serves `levanto/sage-2` as an external provider, and its TEE models refuse the decisions endpoint. The label says so. The TEE packs ask a model in a TEE through a chat completion instead. | A decision model served from NEAR AI's own TEE fleet, or calibration prompts for the TEE packs |
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
- **Label keys.** Two ed25519 keys derived the same way, the project's and the
  caller's; the enclave signs with them through the host and never sees them.
- **Reply key.** Generated per request in the browser tab. It never leaves the
  tab; an escalation's answer is sealed to the same key after the officer's yes.
- **NEAR AI key.** The company's, in its project's row, decrypted only inside
  the enclave; in personal mode, the caller's own.

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

- **OutLayer projects (testnet):** `acme-compliance.testnet/compliance-gateway`
  is the company; `acme-compliance.testnet/compliance-gateway-tee` is the same
  company with the TEE packs; `zavodil2.testnet/compliance-gateway` holds no
  configuration and runs personal mode.
- **Active version:** the sha256 of `module/`'s build at this commit, printed
  by `module/build.sh`, which pins the toolchain and rewrites local paths so
  the same `rust-toolchain.toml` and `Cargo.lock` give the same bytes. Compare
  it with the `wasm_hash` in any call's attestation:
  `https://testnet-api.outlayer.ai/attestations/by-call/<call_id>`.
- **The page:** GitHub Pages, built by `.github/workflows/pages.yml`. A personal
  link fills in everything, including a small payment key (see below) and the
  officers' rows. Opened without one, the page asks for your own key.

## The company's day, with its evidence

`demo/` runs one company on testnet: accounts named by position (`demo/roles.json`),
an officer per rule, and every request kept as evidence anyone can check.

```bash
demo/setup.sh                               # a person: creates the accounts, funds them, buys payment keys into demo/accounts.env
demo/publish.sh                             # the company's projects and rows
cd web
npx vite-node ../demo/scenario.ts           # the day, kept in demo/evidence
npx vite-node ../demo/verify.ts --strict    # recomputes everything from those files
```

`demo/evidence/index.html` and `ledger.csv` say, per request, who asked and in what
position, the outcome, the rules that fired, who approved, whether each signature
holds, whether the attestation does, and what the company's gate decided. They hold
no prompt. `people.json` and `pins/` are the keys and the attested calls they were
pinned from; `scenes/*/label.json` is what a gate is handed, and the files beside it
are what an auditor is handed. `verify.ts` adds a forged label to show what one looks
like.

## Run it yourself

You need:
- an OutLayer payment key (`owner:nonce:secret`, from [app.outlayer.ai](https://app.outlayer.ai));
- either a company's project, whose row admits you by name, or your own NEAR AI
  Cloud key stored at app.outlayer.ai as a secret under the personal project,
  with variable `NEARAI_API_KEY` in a profile of your choice.

```bash
cd web
npm install
npm test
VITE_PROJECT_ID=compliance.acme.testnet/compliance-gateway VITE_SECRETS_ROWS="hr.acme.testnet/default" npm run dev
```

Paste your payment key into the settings bar and ask. To be a company: publish
this build as a project of your account; store `NEARAI_API_KEY` and
`COMPLIANCE_CONFIG` under it with the profile `company` and a whitelist of your
employees; have each officer store `{}` in a row of their own under it with a
whitelist of the employees whose escalations they take.

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

## The other entry

[Off-chain smart contracts for financial decisions](https://github.com/zavodil/offchain-smart-contract)
is the other entry by the same author. It uses the same rulebook engine for
contracts on NEAR: a grant fund and a memecoin launchpad ask a policy gate,
which runs the judge in Intel TDX, checks the signed verdict on chain, and
pays, refuses or hands the case to people.

## License

MIT or Apache-2.0, at your option.
