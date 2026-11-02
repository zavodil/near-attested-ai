# Attested AI

**Ask an AI model about privileged material, and keep a proof of what happened to it.**

People don't buy AI privacy, they buy protection from liability. This demo shows
what that looks like when it is enforced by hardware instead of promised:

- **Sealed.** The prompt is encrypted in your browser to a key that exists only
  inside an attested [OutLayer](https://outlayer.ai) enclave. Nobody in the
  middle can read it: not OutLayer's servers, not its database, not anyone who
  subpoenas them.
- **Screened.** Inside the enclave, a policy model checks the prompt against
  your rules first. A prompt that breaks a rule is stopped there and never
  reaches the answering model.
- **Answered in a TEE.** The answering model runs in
  [NEAR AI Cloud](https://cloud.near.ai)'s confidential computing: Intel TDX
  plus NVIDIA confidential GPUs.
- **Proven.** You get a receipt with the Intel quotes, NVIDIA's GPU verdict and
  the model's signature. Your browser re-checks every one of them, trusting
  Intel and NVIDIA and nobody else.

It runs end to end on NEAR testnet, from a static page with no backend.

---

## What the demo does

### A prompt that must not reach a model

> *"Draft talking points for HR: Susan Miller in accounting told us she is
> pregnant. We want to restructure her role so she can be let go before her
> maternity leave starts."*

The policy screen scores it with `levanto/sage-1.4`:

| Rule | P(yes) | Blocks at | Result |
|---|---|---|---|
| Special-category data (health, pregnancy, religion…) about an identifiable person | 99.9% | 60% | **Blocked** |
| Plan to dismiss or demote a specific person | 99.8% | 60% | **Blocked** |
| Contains a password or API key | 0.1% | 50% | Passed |

The prompt is stopped inside the enclave in about 3 seconds and the answering
model is never called. The receipt shows that: it has no answer, and OutLayer's
hardware attestation covers the receipt.

### Privileged work that passes

> *"You are reviewing a draft share purchase agreement. Clause 9.2 says: 'The
> Seller shall indemnify the Buyer… not exceed 10% of the Consideration.' List
> the three biggest risks for the Buyer and suggest tighter wording."*

Every rule scores well under 0.1%, so the prompt goes on to
`deepseek-ai/DeepSeek-V4.1-Flash-1017` in NEAR AI's TEE. The answer comes back
in about 20–30 seconds with every proof green.

### Every run, step by step

1. **Pin.** The page asks the project for its enclave key and checks that call's
   Intel TDX attestation *before* encrypting anything to it.
2. **Seal.** The prompt, the policy and the model choice are encrypted in the
   browser.
3. **Run.** OutLayer relays ciphertext it cannot open. Inside the enclave:
   - screen the prompt;
   - get NEAR AI's attestation for the model, bound to this exact request;
   - get the answer;
   - check the model's Intel quote, NVIDIA's verdict and the model's signature;
   - seal the receipt back to the browser.
4. **Open.** Only the browser tab that asked can decrypt the receipt.
5. **Verify.** The page re-checks every claim itself.

At the bottom, **What the operator sees** is the full record OutLayer keeps for
the call: a sealed blob and a salted hash. There is no prompt, no answer, no
policy and no model name.

**Download receipt** saves a JSON file an auditor can verify later from public
data alone.

---

## What is proven, and how

| Claim | Evidence | Checked with |
|---|---|---|
| An approved OutLayer worker ran this code, on this input, producing this output | OutLayer's TDX quote for the call. Its `report_data` = sha256(code hash, input hash, output hash, caller, project, time). | Intel DCAP verification compiled to WebAssembly, with Intel-signed collateral. Measurements must appear on `worker.outlayer.testnet` (`is_measurements_approved`). |
| The enclave key belongs to that code | The same check, on the `enclave_key` call | Done before anything is sealed to the key |
| The receipt is that run's output | `sha256(receipt) == receipt_digest` in the attested output | SHA-256 |
| The model ran in Intel TDX, attested for this request | NEAR AI's TDX quote for the model. `report_data` = signing address ‖ zero pad ‖ nonce, where nonce = sha256(exact request bytes). | Intel DCAP, with collateral the enclave fetched from Intel PCS. It is Intel-signed, so where it came from does not matter. |
| The model's GPUs are genuine and in confidential mode | NVIDIA NRAS token for evidence taken for that nonce | ES384 signature against NVIDIA's published JWKS; `x-nvidia-overall-att-result == true` |
| This answer came from that model's TEE | EIP-191 signature over `model:sha256(request):sha256(response)` | secp256k1 recovery. The signer must be the attested address, and `signature_kind` must be `provider_tee`. |
| The stated policy is the one that ran | `policy_sha256`, plus every rule's probability and threshold | SHA-256 and arithmetic |

The enclave runs the model-side checks before sealing the receipt, and the page
shows both verdicts ("also verified in enclave").

**The rule that keeps it honest.** The answering model must have a
NEAR-operated TEE report (`/v1/attestation/report?provider=near`). Otherwise the
enclave refuses the run *before the prompt is sent*. The screening model may be
an external provider, and the receipt then marks it "not attested".

---

## Honest gaps

| Gap | Today | What closes it |
|---|---|---|
| The screening model is not in a TEE | NEAR AI serves `levanto/sage-1.4` as an external provider. The receipt says "not attested", and its signature comes from NEAR AI's gateway. | A decision model served from NEAR AI's own TEE fleet, with `provider_tee` signatures |
| Answer length | OutLayer cuts every outbound request from an enclave at 30 s. The demo therefore uses a fast model, turns thinking off and caps answers at 900 tokens by default. | A longer request budget, or streaming |
| Metadata | The operator still sees who paid, when, and how big the envelopes were | Inherent in a metered service |
| Geography, ISO 27001 | Not proven. A TDX quote does not encode location. | These stay paper attestations, shown beside the cryptographic ones |
| TLS to NEAR AI | The enclave does not pin NEAR AI's gateway certificate, because `wasi:http` does not expose it | NEAR AI's end-to-end encryption to the model key |

---

## How it works

```
Browser (static page, this repo's web/)
  │  ECIES(secp256k1) to the enclave key      POST api.outlayer.ai/call/{project}
  ▼
OutLayer worker: Intel TDX, WASI P2 component (this repo's module/)
  │  1. POST /v1/systemone                          decision model, yes/no questions
  │  2. GET  /v1/attestation/report?model&nonce=sha256(request)&provider=near
  │  3. POST /v1/chat/completions                   non-streaming, thinking off
  │  4. GET  /v1/signature/{id}?signing_algo=ecdsa
  │  5. Intel PCS collateral → verify the model's quote
  │  6. GPU evidence → NVIDIA NRAS
  │  7. receipt (JSON, random salt) → ECIES → the browser's reply key
  ▼
Stored by OutLayer: {"receipt_digest": sha256(receipt), "sealed": base64}
```

The enclave can reach only the four hosts in `module/manifest.json`: NEAR AI,
Intel PCS, Intel's CRL host and NVIDIA NRAS. The manifest is embedded in the
wasm, so its hash is part of the attested code.

### Keys

- **Enclave key.** A secp256k1 key derived inside the TEE by OutLayer's keystore
  from (project, caller). It is never stored anywhere. Every run of the project
  for the same caller gets the same key; no other caller or project can open
  what was sealed to it.
- **Reply key.** Generated per request in the browser tab. It never leaves the
  tab.
- **NEAR AI key.** The caller's own key, stored as an OutLayer secret and
  decrypted only inside the enclave. The call selects it with `secrets_ref`.

### Receipt (abbreviated)

```json
{
  "format": "outlayer-attested-ai-receipt/1",
  "issued_at": 1793652984,
  "salt": "…32 random bytes…",
  "call_id": "…",
  "caller": "…",
  "prompt": "…",
  "outcome": "blocked | answered",
  "screening": {
    "policy": {"model": "levanto/sage-1.4", "rules": [{"id": "…", "question": "…", "block_at": 60}]},
    "policy_sha256": "…",
    "outcomes": [{"id": "…", "p_yes": 0.9991, "tripped": true}],
    "verdict": "blocked",
    "call": {"request_body": "…", "response_body": "…", "signature": {}, "tee": {"status": "not_attested", "reason": "…"}}
  },
  "answer": {
    "text": "…",
    "call": {"model": "…", "request_body": "…", "response_body": "…",
             "signature": {"signature_kind": "provider_tee"},
             "tee": {"status": "attested", "attestation": {}, "collateral": {},
                     "checks": {"quote": {}, "binding": {}, "gpu": {}, "signature": {}}}}
  }
}
```

---

## Repository

```
module/   the OutLayer project: Rust, wasm32-wasip2
  src/main.rs           operations `enclave_key` and `ask`
  src/envelope.rs       enclave key and ECIES both ways
  src/model_call.rs     one NEAR AI exchange, attested for its own request bytes
  src/nearai.rs         NEAR AI Cloud client
  src/evidence.rs       the four checks on a model exchange
  src/intel.rs          Intel PCS collateral and quote verification
  src/nvidia.rs         NVIDIA NRAS
  src/eip191.rs         model signature recovery
  src/screening.rs      the policy screen
  src/request.rs, receipt.rs
  manifest.json         outbound allowlist and encryption key, embedded in the wasm
web/      the page: Vite + React + TypeScript, no backend
  src/lib/session.ts    the two flows: pin the enclave key, ask
  src/lib/verify/       every browser-side check
  scripts/seal-key.mjs  seals a payment key for a hosted build
```

## The deployed demo

- **OutLayer project:** `zavodil2.testnet/compliance-gateway` (testnet).
- **Active version:** `52785a273fa529d883002f8ad130d0d3b3a990d9f8f396a28c05388ab0296312`.
  That is the sha256 of `module/`'s build at this commit. `module/build.sh`
  pins the toolchain and rewrites local paths, so the same `rust-toolchain.toml`
  and `Cargo.lock` give the same bytes. Rebuild it and compare with the
  `wasm_hash` in any call's attestation:
  `https://testnet-api.outlayer.ai/attestations/by-call/<call_id>`.
- **The page:** GitHub Pages, built by `.github/workflows/pages.yml`. A personal
  link fills in everything, including a small payment key (see below). Opened
  without one, the page asks for your own key.

## Run it yourself

You need:
- an OutLayer payment key (`owner:nonce:secret`, from [app.outlayer.ai](https://app.outlayer.ai));
- your NEAR AI Cloud key, stored at app.outlayer.ai as a secret under the
  project, with variable `NEARAI_API_KEY` in a profile of your choice, and
  access granted to your own account.

```bash
cd web
npm install
npm test
VITE_PROJECT_ID=zavodil2.testnet/compliance-gateway VITE_SECRETS_PROFILE=<your profile> npm run dev
```

Paste your payment key into the settings bar and ask.

### Build the module

```bash
cd module
cargo test
./build.sh        # wasm32-wasip2 build, checks the manifest and imports, prints the sha256
```

To run your own copy, publish the wasm under a URL, then create an OutLayer
project with a `WasmUrl` source. Encryption keys are issued only to projects
whose code comes from a `WasmUrl`.

### Hosting with a personal link

A hosted build never carries a payment key in the clear:

```bash
cd web
node scripts/seal-key.mjs < payment-key.txt > sealed.json   # key read from stdin
gh secret set VITE_PAYMENT_KEY_SEALED < <(jq -r .sealed sealed.json)
```

The build embeds only the sealed value. The link is
`https://<pages>/#decrypt_key=<decrypt_key from sealed.json>`. The decrypt key
sits after `#`, so the browser never sends it to the host. The page unseals the
payment key and immediately removes the decrypt key from the address bar.
Give the payment key only a small balance, and delete it when the demo is over.

## License

MIT or Apache-2.0, at your option.
