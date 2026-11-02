//! One exchange with a NEAR AI model, and the evidence for it.
//!
//! The request is built once. Its sha256 is the nonce the attestation report
//! is asked for, so the report — fetched BEFORE the request is sent — is
//! fresh for exactly these bytes. A model that must run in a TEE and has no
//! NEAR-operated report is refused there, and the prompt never leaves the
//! enclave.

use crate::evidence::{self, Evidence};
use crate::nearai::{Client, ResponseSignature, Tee};
use crate::sha256_hex;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;

pub enum Endpoint {
    /// `/v1/chat/completions`
    Chat,
    /// `/v1/systemone`
    Decide,
}

/// Whether a model without a NEAR-operated TEE may be used at all.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Requirement {
    Tee,
    Disclosed,
}

#[derive(Debug, Serialize)]
pub struct ModelCall {
    pub model: String,
    /// The exact bytes, base64, so anyone can hash them again.
    pub request_body: String,
    pub response_body: String,
    pub request_sha256: String,
    pub response_sha256: String,
    pub signature: Option<ResponseSignature>,
    pub signature_error: Option<String>,
    pub tee: TeeRecord,
}

#[derive(Debug, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum TeeRecord {
    Attested(Box<Evidence>),
    NotAttested { reason: String },
}

pub fn run(
    api: &Client,
    endpoint: Endpoint,
    requirement: Requirement,
    model: &str,
    body: Vec<u8>,
    now: u64,
) -> Result<(ModelCall, Vec<u8>), String> {
    let nonce = sha256_hex(&body);
    let tee = api.attestation(model, &nonce)?;
    if let (Requirement::Tee, Tee::NotAttested(reason)) = (requirement, &tee) {
        return Err(format!(
            "{model} has no NEAR-operated TEE attestation ({reason}), so the prompt was not sent. \
             Choose a model NEAR AI serves from its own TEEs (owned_by \"nearai\" in /v1/models)"
        ));
    }

    let exchange = match endpoint {
        Endpoint::Chat => api.chat(body)?,
        Endpoint::Decide => api.decide(body)?,
    };
    let signature = api.signature(&exchange.id, model);
    let tee = match tee {
        Tee::NotAttested(reason) => TeeRecord::NotAttested { reason },
        Tee::Attested(reports) => TeeRecord::Attested(Box::new(evidence::collect(
            model,
            &nonce,
            reports,
            signature.as_ref().ok(),
            &exchange,
            now,
        )?)),
    };

    let (signature, signature_error) = match signature {
        Ok(s) => (Some(s), None),
        Err(e) => (None, Some(e)),
    };
    let call = ModelCall {
        model: model.to_string(),
        request_body: BASE64.encode(&exchange.request),
        response_body: BASE64.encode(&exchange.response),
        request_sha256: sha256_hex(&exchange.request),
        response_sha256: sha256_hex(&exchange.response),
        signature,
        signature_error,
        tee,
    };
    Ok((call, exchange.response))
}
