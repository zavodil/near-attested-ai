//! Attested AI — a compliance gateway on OutLayer.
//!
//! A prompt that nobody on the path can read is screened by a policy model,
//! answered by a model running in a NEAR AI TEE, and returned with a receipt
//! that proves which code ran where, checkable by anyone who trusts Intel and
//! NVIDIA and nobody else.
//!
//! | `op` | input | output |
//! |---|---|---|
//! | `enclave_key` | — | `{enclave_pubkey}`: the key requests are sealed to, for this project and this caller |
//! | `ask` | `{sealed}`: the request, ECIES-sealed to the enclave key | `{receipt_digest, sealed}`: the receipt, ECIES-sealed to the caller's `reply_pubkey`, and its sha256 |
//!
//! The coordinator relays and stores only these envelopes. Inside the enclave
//! an `ask` opens the request, screens the prompt when the request carries a
//! policy, sends it to the answering model — refused before anything is sent
//! when that model has no NEAR-operated TEE — checks the model's attestation
//! (Intel TDX quote, NVIDIA GPU verdict, response signature), and seals the
//! receipt back.
//!
//! The network is the manifest's four hosts: NEAR AI, Intel PCS and its CRL
//! host, NVIDIA's attestation service.

mod eip191;
mod envelope;
mod evidence;
mod http;
mod intel;
mod model_call;
mod nearai;
mod nvidia;
mod receipt;
mod request;
mod screening;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use model_call::{Endpoint, Requirement};
use outlayer::env;
use receipt::{Answer, Receipt};
use request::Request;
use screening::Verdict;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

/// The manifest, embedded so the project's wasm hash covers it: the outbound
/// allowlist and the `inbox` key. The NEAR AI key is the caller's own secret,
/// named in each call's `secrets_ref`.
#[cfg(target_family = "wasm")]
#[used]
#[link_section = "outlayer.manifest"]
static OUTLAYER_MANIFEST: [u8; include_bytes!("../manifest.json").len()] = *include_bytes!("../manifest.json");

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
enum Input {
    EnclaveKey,
    Ask { sealed: String },
}

/// What an `ask` leaves outside the enclave. Members in alphabetical order:
/// the attested output hash is taken over this JSON, and alphabetical is the
/// order every serialiser on the way agrees on.
#[derive(Serialize)]
struct SealedReceipt {
    receipt_digest: String,
    sealed: String,
}

fn main() {
    let answer = match serde_json::from_slice::<Input>(&env::input()) {
        Err(e) => Err(format!("the input is not an operation of this project (`enclave_key`, `ask`): {e}")),
        Ok(Input::EnclaveKey) => envelope::enclave_public_key().map(|key| json!({ "enclave_pubkey": key })),
        Ok(Input::Ask { sealed }) => ask(&sealed),
    };
    let output = answer.unwrap_or_else(|error| json!({ "error": error }));
    let _ = env::output_json(&output);
}

fn ask(sealed: &str) -> Result<Value, String> {
    let sealed = BASE64.decode(sealed.trim()).map_err(|_| "`sealed` is not base64".to_string())?;
    let request = Request::parse(&envelope::open(&sealed)?)?;
    let reply_pubkey = envelope::parse_pubkey(&request.reply_pubkey)?;
    let api = nearai::Client::from_env()?;
    let now = unix_now();

    let screening = match &request.screening {
        Some(policy) => Some(screening::screen(&api, &request.prompt, policy, now)?),
        None => None,
    };
    let answer = match screening.as_ref().map(|s| s.verdict) {
        Some(Verdict::Blocked) => None,
        _ => Some(answer(&api, &request, now)?),
    };

    let receipt = Receipt::new(request.prompt, screening, answer, now)?;
    let bytes = serde_json::to_vec(&receipt).map_err(|e| format!("the receipt does not encode: {e}"))?;
    let output = SealedReceipt { receipt_digest: sha256_hex(&bytes), sealed: BASE64.encode(envelope::seal(&reply_pubkey, &bytes)?) };
    serde_json::to_value(output).map_err(|e| format!("the output does not encode: {e}"))
}

/// The answer, without the model's hidden reasoning: reasoning tokens count
/// against `max_tokens` and the 30 s budget, and a reasoning model can spend
/// all of both before it writes a word of the answer.
fn answer(api: &nearai::Client, request: &Request, now: u64) -> Result<Answer, String> {
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
    fn the_operations_are_a_closed_set() {
        assert!(matches!(serde_json::from_str::<Input>(r#"{"op":"enclave_key"}"#), Ok(Input::EnclaveKey)));
        assert!(matches!(serde_json::from_str::<Input>(r#"{"op":"ask","sealed":"AA=="}"#), Ok(Input::Ask { .. })));
        assert!(serde_json::from_str::<Input>(r#"{"op":"answer"}"#).is_err());
        assert!(serde_json::from_str::<Input>(r#"{"op":"ask","sealed":"AA==","prompt":"leak"}"#).is_err());
    }

    /// The order the attested output hash depends on.
    #[test]
    fn the_output_members_are_alphabetical() {
        let out = SealedReceipt { receipt_digest: "d".into(), sealed: "s".into() };
        assert_eq!(serde_json::to_string(&out).unwrap(), r#"{"receipt_digest":"d","sealed":"s"}"#);
    }
}
