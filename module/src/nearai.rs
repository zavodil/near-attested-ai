//! NEAR AI Cloud, as the enclave uses it: attestation reports, the two
//! inference endpoints, and the response signatures.
//!
//! Requests follow NEAR AI's verification guide: the body is built once and
//! its bytes are what gets hashed; `Accept-Encoding: identity`, because the
//! signature covers the uncompressed body; `x-no-aliasing: true`, because only
//! a canonical model id gets a signature from the model's own TEE.

use crate::http::{self, Reply};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const BASE: &str = "https://cloud-api.near.ai";

/// Which key the signatures are asked for, and what the attestation binds.
pub const SIGNING_ALGO: &str = "ecdsa";

pub struct Client {
    authorization: String,
}

/// A request and its answer, byte for byte.
pub struct Exchange {
    pub request: Vec<u8>,
    pub response: Vec<u8>,
    /// What `/v1/signature/{id}` knows the exchange by.
    pub id: String,
}

/// Whether NEAR AI serves a model from a TEE it operates, as its attestation
/// endpoint answers for this request's nonce.
pub enum Tee {
    Attested(Vec<ModelAttestation>),
    /// NEAR AI's own words for why there is no report.
    NotAttested(String),
}

/// One model instance's report, with the fields the receipt carries.
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ModelAttestation {
    pub model_name: String,
    pub signing_address: String,
    pub signing_algo: String,
    pub request_nonce: String,
    /// Hex.
    pub intel_quote: String,
    /// JSON text: NVIDIA's GPU evidence, sent to NRAS unchanged.
    pub nvidia_payload: String,
    /// dstack's description of the software the TEE runs (app id, compose
    /// hash, OS image hash, TCB info).
    #[serde(default)]
    pub info: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ResponseSignature {
    pub text: String,
    pub signature: String,
    pub signing_address: String,
    pub signing_algo: String,
    /// `provider_tee` (signed in the model's TEE) or `gateway` (signed by the
    /// relaying gateway, which proves nothing about where the model ran).
    #[serde(default)]
    pub signature_kind: Option<String>,
}

#[derive(Deserialize)]
struct Report {
    #[serde(default)]
    model_attestations: Vec<ModelAttestation>,
}

impl Client {
    /// The caller's own NEAR AI key: a secret they stored under this project
    /// and named in the call's `secrets_ref`. Every caller pays NEAR AI with
    /// their own key.
    pub fn from_env() -> Result<Self, String> {
        let key = outlayer::env::var("NEARAI_API_KEY").filter(|k| !k.trim().is_empty()).ok_or(
            "NEARAI_API_KEY is not set: store your NEAR AI key as a secret under this project \
             and name its profile in the call's `secrets_ref`",
        )?;
        Ok(Self { authorization: format!("Bearer {}", key.trim()) })
    }

    /// The model's attestation report for `nonce`, from NEAR AI's own fleet
    /// only (`provider=near`): an attested third party has a contract of its
    /// own, which this receipt does not check.
    pub fn attestation(&self, model: &str, nonce: &str) -> Result<Tee, String> {
        let url = format!(
            "{BASE}/v1/attestation/report?model={}&signing_algo={SIGNING_ALGO}&nonce={nonce}&provider=near",
            http::urlencode(model)
        );
        let reply = http::get(&url, &[("Authorization", &self.authorization), ("Accept", "application/json")])?;
        // A refusal of the caller — a bad key, a spent limit, too many
        // requests — says nothing about the model, and must not read as
        // "this model has no TEE".
        if matches!(reply.status, 401 | 402 | 403 | 429) {
            return Err(format!("NEAR AI refused this key: HTTP {} {}", reply.status, error_message(&reply)));
        }
        if !reply.ok() {
            return Ok(Tee::NotAttested(error_message(&reply)));
        }
        let report: Report =
            serde_json::from_slice(&reply.body).map_err(|e| format!("NEAR AI's attestation report does not read: {e}"))?;
        let mine: Vec<_> = report.model_attestations.into_iter().filter(|a| a.model_name == model).collect();
        if mine.is_empty() {
            return Ok(Tee::NotAttested(format!("the report names no NEAR-operated instance of {model}")));
        }
        Ok(Tee::Attested(mine))
    }

    /// `POST /v1/chat/completions`, non-streaming. The chat id is the
    /// signature's handle.
    pub fn chat(&self, body: Vec<u8>) -> Result<Exchange, String> {
        let reply = self.post("/v1/chat/completions", &body)?;
        let id = serde_json::from_slice::<Value>(&reply.body)
            .ok()
            .and_then(|v| v.get("id").and_then(Value::as_str).map(str::to_string))
            .ok_or("NEAR AI's completion has no `id`")?;
        Ok(Exchange { request: body, response: reply.body, id })
    }

    /// `POST /v1/systemone`: typed decisions. The receipt id comes back in
    /// the `X-Generation-Id` header.
    pub fn decide(&self, body: Vec<u8>) -> Result<Exchange, String> {
        let reply = self.post("/v1/systemone", &body)?;
        let id = reply.header("x-generation-id").unwrap_or_default().to_string();
        Ok(Exchange { request: body, response: reply.body, id })
    }

    /// The signature over an exchange, or why there is none.
    ///
    /// NEAR AI answers 404 for a moment after an exchange and documents a
    /// short, bounded retry; this is the one pause in the run: at most three
    /// tries, a second apart.
    pub fn signature(&self, id: &str, model: &str) -> Result<ResponseSignature, String> {
        if id.is_empty() {
            return Err("NEAR AI gave this exchange no id to ask a signature for".to_string());
        }
        let url = format!(
            "{BASE}/v1/signature/{}?model={}&signing_algo={SIGNING_ALGO}",
            http::urlencode(id),
            http::urlencode(model)
        );
        for attempt in 1..=3 {
            let reply = http::get(&url, &[("Authorization", &self.authorization), ("Accept", "application/json")])?;
            if reply.status == 404 && attempt < 3 {
                std::thread::sleep(Duration::from_secs(1));
                continue;
            }
            if !reply.ok() {
                return Err(format!("no signature: {}", error_message(&reply)));
            }
            let value: Value =
                serde_json::from_slice(&reply.body).map_err(|e| format!("the signature answer does not read: {e}"))?;
            if let Some(code) = value.get("error_code") {
                let message = value.get("message").and_then(Value::as_str).unwrap_or_default();
                return Err(format!("signature unavailable ({code}): {message}"));
            }
            return serde_json::from_value(value).map_err(|e| format!("the signature answer does not read: {e}"));
        }
        Err("no signature: NEAR AI still had none after three tries".to_string())
    }

    fn post(&self, path: &str, body: &[u8]) -> Result<Reply, String> {
        let reply = http::post(
            &format!("{BASE}{path}"),
            &[
                ("Authorization", &self.authorization),
                ("Content-Type", "application/json"),
                ("Accept", "application/json"),
                ("Accept-Encoding", "identity"),
                ("x-no-aliasing", "true"),
            ],
            body,
        )?;
        if !reply.ok() {
            return Err(format!("NEAR AI refused {path}: HTTP {} {}", reply.status, error_message(&reply)));
        }
        Ok(reply)
    }
}

/// NEAR AI's error text: `error.message` when the body has one.
fn error_message(reply: &Reply) -> String {
    serde_json::from_slice::<Value>(&reply.body)
        .ok()
        .and_then(|v| v.pointer("/error/message").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| reply.excerpt())
}
