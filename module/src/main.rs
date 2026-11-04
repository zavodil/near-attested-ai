//! Attested AI — a compliance gateway on OutLayer.
//!
//! A prompt that nobody on the path can read is screened against policy
//! packs read from a registry on NEAR, answered by a model running in a NEAR
//! AI TEE — or held for an officer's approval — and returned with a receipt
//! that proves which code ran where, and a signed label a gate can check
//! without the prompt.
//!
//! | `op` | input | output |
//! |---|---|---|
//! | `enclave_key` | — | `{enclave_pubkey, label_pubkey}`: the key requests are sealed to, and the key labels are signed with, for this project and this caller |
//! | `org_policy` | — | the mode this call runs in (`personal`, or `company` with the organisation, its configuration's hash, its packs as the registry holds them, its officers) |
//! | `ask` | `{sealed}`: the request, ECIES-sealed to the enclave key | `{receipt_digest, sealed}`: the receipt, ECIES-sealed to the caller's `reply_pubkey`, and its sha256; or `{status: "escalated", task_id, task_hash, officer, receipt_digest, sealed}` when the prompt waits for an officer |
//! | `answer_escalated` | the platform's, on the officer's approval | `{receipt_digest, sealed}`, also reported to the task for `task_status` |
//! | `task_status`, `task_cancel`, `task_delete`, `tasks`, `tasks_unlock` | the SDK's | the SDK's |
//!
//! The coordinator relays and stores only envelopes. Inside the enclave an
//! `ask` opens the request, reads the packs from the registry and hashes
//! their bytes, screens the prompt, sends it to the answering model —
//! refused before anything is sent when that model has no NEAR-operated TEE
//! — checks the model's attestation (Intel TDX quote, NVIDIA GPU verdict,
//! response signature), signs the label, and seals the receipt back.
//!
//! Whose rules apply is the rows' doing (`config`): a call on a company's
//! row runs under the company's configuration; a call on the caller's own
//! key runs the packs the request names, in personal mode, and the label
//! says which.
//!
//! The network is the manifest's four hosts: NEAR AI (120 s a request),
//! Intel PCS and its CRL host, NVIDIA's attestation service; the registry is
//! read through the worker's NEAR RPC. A request is never given more than
//! what is left of the run, and a call that asks for nothing runs 60 s: a
//! caller asks for 150 s (`resource_limits.max_execution_seconds`), as the
//! page does.

mod config;
mod eip191;
mod envelope;
mod escalate;
mod evidence;
mod http;
mod intel;
mod label;
mod model_call;
mod nearai;
mod nvidia;
mod pack;
mod receipt;
mod request;
mod screening;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use config::Mode;
use model_call::{Endpoint, Requirement};
use outlayer::env;
use receipt::{Answer, Outcome, Parts, Receipt};
use request::Request;
use screening::Verdict;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The manifest, embedded so the project's wasm hash covers it: the outbound
/// allowlist with NEAR AI's request time, the `inbox` encryption key, the
/// `label` signing key, and that the project leaves tasks.
#[cfg(target_family = "wasm")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

/// Every operation, as the manifest lists them.
pub const OPERATIONS: &[&str] = &[
    "enclave_key",
    "org_policy",
    "ask",
    "answer_escalated",
    "task_status",
    "task_cancel",
    "task_delete",
    "tasks",
    "tasks_unlock",
];

/// The operation a call names: `op`, as this project's callers write it, or
/// `operation`, as the platform writes it when it starts a run on an
/// officer's approval.
#[derive(Deserialize)]
struct Named {
    #[serde(default)]
    op: Option<String>,
    #[serde(default)]
    operation: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Ask {
    #[allow(dead_code)]
    op: String,
    sealed: String,
}

/// What an `ask` leaves outside the enclave. Members in alphabetical order:
/// the attested output hash is taken over this JSON, and alphabetical is the
/// order every serialiser on the way agrees on.
#[derive(Serialize)]
pub struct SealedReceipt {
    pub receipt_digest: String,
    pub sealed: String,
}

fn main() {
    let input = env::input();
    let answer = match serde_json::from_slice::<Named>(&input) {
        Err(e) => Err(format!("the input is not JSON: {e}")),
        Ok(named) => {
            let op = named.op.or(named.operation).unwrap_or_default();
            run(&op, &input)
        }
    };
    let output = answer.unwrap_or_else(|error| json!({ "error": error }));
    let _ = env::output_json(&output);
}

fn run(op: &str, input: &[u8]) -> Result<Value, String> {
    let now = unix_now();
    match op {
        "enclave_key" => Ok(json!({ "enclave_pubkey": envelope::enclave_public_key()?, "label_pubkey": label::public_key()? })),
        "org_policy" => org_policy(),
        "ask" => {
            let ask: Ask = serde_json::from_slice(input).map_err(|e| format!("`ask` takes `sealed` and nothing else: {e}"))?;
            self::ask(&ask.sealed, now)
        }
        escalate::ANSWERED_BY => {
            let value: Value = serde_json::from_slice(input).map_err(|e| format!("the input does not read: {e}"))?;
            escalate::answer(&value, now).map_err(|refused| refused.refusal)
        }
        other => {
            let value: Value = serde_json::from_slice(input).map_err(|e| format!("the input does not read: {e}"))?;
            outlayer::tasks::dispatch(other, &value)
                .unwrap_or_else(|| Err(format!("the input is not an operation of this project ({}): {other:?}", OPERATIONS.join(", "))))
        }
    }
}

/// The mode this call runs in, with the packs as the registry holds them:
/// what the page shows before anything is typed.
fn org_policy() -> Result<Value, String> {
    let mode = config::detect()?;
    let (registry, refs) = match &mode {
        Mode::Company(company) => (company.config.registry.clone().unwrap_or_else(pack::default_registry), company.config.packs()),
        Mode::Personal => (pack::default_registry(), Vec::new()),
    };
    let packs: Vec<Value> = refs
        .iter()
        .map(|reference| pack::load(&registry, reference).map(|loaded| serde_json::to_value(loaded).unwrap_or(Value::Null)))
        .collect::<Result<_, _>>()?;
    let mut answer = serde_json::to_value(&mode).map_err(|e| format!("the mode does not encode: {e}"))?;
    answer["registry"] = json!(registry);
    answer["packs"] = json!(packs);
    Ok(answer)
}

fn ask(sealed: &str, now: u64) -> Result<Value, String> {
    let sealed = BASE64.decode(sealed.trim()).map_err(|_| "`sealed` is not base64".to_string())?;
    let request_bytes = envelope::open(&sealed)?;
    let request = Request::parse(&request_bytes)?;
    let reply_pubkey = envelope::parse_pubkey(&request.reply_pubkey)?;
    let api = nearai::Client::from_env()?;
    let mode = config::detect()?;

    let refs = request.packs_under(&mode)?;
    let registry = match &mode {
        Mode::Company(company) => company.config.registry.clone().unwrap_or_else(pack::default_registry),
        Mode::Personal => pack::default_registry(),
    };
    let loaded = refs.iter().map(|reference| pack::load(&registry, reference)).collect::<Result<Vec<_>, _>>()?;
    let screening = match loaded.is_empty() {
        true => None,
        false => Some(screening::screen(&api, &request.prompt, &loaded, now)?),
    };

    let (outcome, answer) = match (screening.as_ref().map(|s| s.verdict), &mode) {
        (Some(Verdict::Escalated), Mode::Company(company)) => {
            let screening = screening.expect("a verdict comes from a screen");
            let officer = escalate::officer_for(company, &screening.fired)?;
            return escalate::open(&request, &request_bytes, company, screening, &officer, &reply_pubkey, now);
        }
        // Nobody to ask in personal mode: a rule that escalates blocks, and
        // the label shows the rule's action beside the outcome.
        (Some(Verdict::Escalated), Mode::Personal) | (Some(Verdict::Blocked), _) => (Outcome::Blocked, None),
        _ => (Outcome::Answered, Some(answer(&api, &request, now)?)),
    };

    let summary = screening.as_ref().map(screening::Screening::summary);
    let screening = screening.map(|s| serde_json::to_value(&s)).transpose().map_err(|e| format!("the screen does not encode: {e}"))?;
    let receipt = Receipt::new(Parts {
        mode: &mode,
        outcome,
        prompt: request.prompt,
        screening,
        summary,
        answer,
        approval: None,
        escalated_to: None,
        now,
    })?;
    let bytes = serde_json::to_vec(&receipt).map_err(|e| format!("the receipt does not encode: {e}"))?;
    let output = SealedReceipt { receipt_digest: sha256_hex(&bytes), sealed: BASE64.encode(envelope::seal(&reply_pubkey, &bytes)?) };
    serde_json::to_value(output).map_err(|e| format!("the output does not encode: {e}"))
}

/// The answer, without the model's hidden reasoning: reasoning tokens count
/// against `max_tokens` and the request's time, and a reasoning model can
/// spend all of both before it writes a word of the answer.
pub(crate) fn answer(api: &nearai::Client, request: &Request, now: u64) -> Result<Answer, String> {
    let body = serde_json::to_vec(&json!({
        "model": request.model,
        "messages": [{"role": "user", "content": request.prompt}],
        "max_tokens": request.max_tokens(),
        "stream": false,
        "chat_template_kwargs": {"enable_thinking": false},
    }))
    .map_err(|e| format!("the completion request does not encode: {e}"))?;

    let (call, response) = model_call::run(api, Endpoint::Chat, Requirement::Tee, &request.model, body, now)?;
    let text = serde_json::from_slice::<Value>(&response)
        .ok()
        .and_then(|v| v.pointer("/choices/0/message/content").and_then(Value::as_str).map(str::to_string))
        .ok_or_else(|| format!("{}'s completion carries no message text", request.model))?;
    Ok(Answer { text, call })
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn unix_now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_operation_is_named_by_op_or_by_operation() {
        let by_op: Named = serde_json::from_str(r#"{"op":"ask","sealed":"AA=="}"#).unwrap();
        assert_eq!(by_op.op.as_deref(), Some("ask"));
        let by_operation: Named = serde_json::from_str(r#"{"operation":"answer_escalated","task_id":"t"}"#).unwrap();
        assert_eq!(by_operation.operation.as_deref(), Some("answer_escalated"));
        assert!(serde_json::from_str::<Ask>(r#"{"op":"ask","sealed":"AA==","prompt":"leak"}"#).is_err(), "`ask` takes nothing else");
    }

    /// Every operation the manifest lists is one `run` serves, and the
    /// other way round.
    #[test]
    fn the_manifest_and_the_code_name_the_same_operations() {
        let manifest: Value = serde_json::from_str(include_str!("../manifest.json")).unwrap();
        let listed: Vec<&str> = manifest["operations"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
        assert_eq!(listed, OPERATIONS);
        assert!(manifest["tasks"].as_bool() == Some(true));
        assert!(manifest["secrets_refs"].as_bool() == Some(true), "the company's and the officers' rows join");
        assert_eq!(manifest["signing_keys"][0]["path"], "label");
        assert_eq!(manifest["encryption_keys"][0]["path"], "inbox");
        let nearai = manifest["capabilities"]["network"].as_array().unwrap().iter().find(|h| h["host"] == "cloud-api.near.ai").expect("NEAR AI's entry");
        assert_eq!(nearai["timeout_secs"], 120);
    }

    /// The order the attested output hash depends on.
    #[test]
    fn the_output_members_are_alphabetical() {
        let out = SealedReceipt { receipt_digest: "d".into(), sealed: "s".into() };
        assert_eq!(serde_json::to_string(&out).unwrap(), r#"{"receipt_digest":"d","sealed":"s"}"#);
    }
}
