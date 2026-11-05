//! The label: one signed statement about an answer, for whoever consumes it.
//!
//! A gate that takes AI output needs to know which rules the prompt was
//! screened with, what they decided, who approved an escalation, and that
//! the answer is the one screened — and it needs none of the prompt. The
//! label carries exactly that, and two signatures over it:
//!
//! - `label`, an ed25519 key of no caller (`"caller": "none"`), one for the
//!   project. A company runs its own project (`config`), so this is the
//!   company's key: a gate pins one public key, and a label that verifies under
//!   it came from that company's project. Every caller drives it alike, so it
//!   signs only the label this module composes, under [`PREFIX`], with the
//!   caller named from the host, never from the input.
//! - `caller`, an ed25519 key of the caller (`"caller": "signer"`, the
//!   default), one for each account of the project. The keystore derives it for
//!   the account the run was started by, so no run of any code signs under an
//!   employee's key but that employee's: a gate that knows its employees' keys
//!   tells who asked from the signature, without trusting the `caller` field.
//!
//! The keystore derives both inside the TEE; the module never holds them.
//! `enclave_key` answers their public halves in the same attested output as
//! the encryption key.
//!
//! Each signature is over `PREFIX ‖ the label's JSON bytes`, exactly the bytes
//! the receipt carries as `body`: a verifier checks those bytes and parses them
//! after.

use crate::config::Mode;
use crate::pack::Action;
use crate::screening::{Fired, Verdict};
use crate::sha256_hex;
use outlayer::signing_keys;
use serde::Serialize;

pub const FORMAT: &str = "outlayer-attested-ai-label/1";
pub const PREFIX: &[u8] = b"outlayer-attested-ai-label/1\n";
pub const KEY_PATH: &str = "label";
pub const CALLER_KEY_PATH: &str = "caller";

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Answered,
    Blocked,
    Escalated,
}

#[derive(Debug, Serialize)]
pub struct Label {
    pub format: &'static str,
    /// `personal` or `company`.
    pub mode: &'static str,
    /// The organisation: the account whose row holds the key and the
    /// configuration. Absent in personal mode.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_sha256: Option<String>,
    pub project: Option<String>,
    pub caller: Option<String>,
    /// The `caller` key's public half, hex.
    pub caller_key: String,
    pub call_id: Option<String>,
    pub issued_at: u64,
    pub outcome: Outcome,
    pub packs: Vec<PackApplied>,
    pub fired: Vec<Fired>,
    /// sha256(salt ‖ prompt), with the receipt's salt: the holder of the
    /// receipt can show the prompt was this one; nobody else learns it.
    pub prompt_commitment: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The enclave's own verdict on the answering model's TEE evidence.
    pub model_attested: bool,
    /// Whether every pack's decision model ran in a NEAR-operated TEE.
    pub screening_attested: bool,
    /// The officer's approval, on an answer that was escalated first.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<Approval>,
}

#[derive(Clone, Debug, Serialize, serde::Deserialize)]
pub struct PackApplied {
    pub id: String,
    pub version: u32,
    pub sha256: String,
    pub registry: String,
    pub block_height: u64,
    pub verdict: Verdict,
}

#[derive(Clone, Debug, Serialize, serde::Deserialize)]
pub struct Approval {
    /// The officer: the owner of the row the task was opened for.
    pub officer: String,
    pub public_key: String,
    pub at: u64,
    pub task_id: String,
}

/// What the label says of the screen: carried into an escalation's task
/// state, so the run that answers after the officer's yes labels the answer
/// with the screen that was made, not a second one.
#[derive(Clone, Debug, Serialize, serde::Deserialize)]
pub struct Summary {
    pub applied: Vec<PackApplied>,
    pub fired: Vec<Fired>,
    /// Every decision model ran in a NEAR-operated TEE.
    pub attested: bool,
    pub verdict: Verdict,
}

/// The label as the receipt carries it: the exact bytes signed, and both
/// signatures.
#[derive(Debug, Serialize)]
pub struct Signed {
    /// The label's JSON, byte for byte.
    pub body: String,
    /// ed25519 over `PREFIX ‖ body`, base64.
    pub signature: String,
    /// The `label` key's public half, hex.
    pub public_key: String,
    /// ed25519 over `PREFIX ‖ body` with the `caller` key the body names, base64.
    pub caller_signature: String,
}

pub struct Facts<'a> {
    pub mode: &'a Mode,
    pub outcome: Outcome,
    pub screening: Option<&'a Summary>,
    pub salt: &'a str,
    pub prompt: &'a str,
    pub answer: Option<&'a str>,
    pub model: Option<&'a str>,
    pub model_attested: bool,
    pub approval: Option<Approval>,
    pub now: u64,
}

/// The label's public key, hex: what `enclave_key` answers beside the
/// encryption key.
pub fn public_key() -> Result<String, String> {
    signing_keys::public_key(KEY_PATH, None)
        .map(hex::encode)
        .map_err(|e| format!("the label key is not available to this run: {e}"))
}

/// The caller's own key, hex: what `enclave_key` answers beside the label key.
pub fn caller_public_key() -> Result<String, String> {
    signing_keys::public_key(CALLER_KEY_PATH, None)
        .map(hex::encode)
        .map_err(|e| format!("the caller's key is not available to this run: {e}"))
}

pub fn sign(facts: Facts<'_>) -> Result<Signed, String> {
    let (mode, org, config_sha256) = match facts.mode {
        Mode::Personal => ("personal", None, None),
        Mode::Company(company) => ("company", Some(company.org.clone()), Some(company.config_sha256.clone())),
    };
    let label = Label {
        format: FORMAT,
        mode,
        org,
        config_sha256,
        project: outlayer::env::var("OUTLAYER_PROJECT_ID"),
        caller: outlayer::env::signer_account_id(),
        caller_key: caller_public_key()?,
        call_id: outlayer::env::var("OUTLAYER_CALL_ID").filter(|id| !id.is_empty()),
        issued_at: facts.now,
        outcome: facts.outcome,
        packs: facts.screening.map(|s| s.applied.clone()).unwrap_or_default(),
        fired: facts.screening.map(|s| s.fired.clone()).unwrap_or_default(),
        prompt_commitment: sha256_hex(&[hex::decode(facts.salt).unwrap_or_default(), facts.prompt.as_bytes().to_vec()].concat()),
        answer_sha256: facts.answer.map(|a| sha256_hex(a.as_bytes())),
        model: facts.model.map(str::to_string),
        model_attested: facts.model_attested,
        screening_attested: facts.screening.is_some_and(|s| s.attested),
        approval: facts.approval,
    };
    let body = serde_json::to_string(&label).map_err(|e| format!("the label does not encode: {e}"))?;
    let message = [PREFIX, body.as_bytes()].concat();
    let signature = signing_keys::sign(KEY_PATH, None, &message).map_err(|e| format!("the label could not be signed: {e}"))?;
    let caller_signature =
        signing_keys::sign(CALLER_KEY_PATH, None, &message).map_err(|e| format!("the label could not be signed with the caller's key: {e}"))?;
    let encode = |bytes: Vec<u8>| base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Ok(Signed { body, signature: encode(signature), public_key: public_key()?, caller_signature: encode(caller_signature) })
}

impl Action {
    pub fn verdict(self) -> Verdict {
        match self {
            Action::Block => Verdict::Blocked,
            Action::Escalate => Verdict::Escalated,
        }
    }
}
