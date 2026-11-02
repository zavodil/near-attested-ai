//! The receipt: everything the run did and everything it can prove, sealed to
//! the browser that asked.
//!
//! Outside the enclave only its sha256 is visible. The digest is in the run's
//! output, and the output's hash is in OutLayer's TDX quote for this call, so
//! a receipt anyone is later shown can be tied to this exact execution. The
//! random salt keeps the digest from confirming a guessed prompt.

use crate::model_call::ModelCall;
use crate::screening::{Screening, Verdict};
use serde::Serialize;

pub const FORMAT: &str = "outlayer-attested-ai-receipt/1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Answered,
    Blocked,
}

#[derive(Debug, Serialize)]
pub struct Receipt {
    pub format: &'static str,
    pub issued_at: u64,
    pub salt: String,
    /// The OutLayer call this receipt came out of: `/attestations/by-call/{id}`.
    pub call_id: Option<String>,
    /// Who the run ran for: the payment-key owner.
    pub caller: Option<String>,
    pub prompt: String,
    pub outcome: Outcome,
    pub screening: Option<Screening>,
    pub answer: Option<Answer>,
}

#[derive(Debug, Serialize)]
pub struct Answer {
    pub text: String,
    pub call: ModelCall,
}

impl Receipt {
    pub fn new(prompt: String, screening: Option<Screening>, answer: Option<Answer>, now: u64) -> Result<Self, String> {
        let mut salt = [0u8; 32];
        getrandom::getrandom(&mut salt).map_err(|e| format!("no randomness for the receipt's salt: {e}"))?;
        let outcome = match screening.as_ref().map(|s| s.verdict) {
            Some(Verdict::Blocked) => Outcome::Blocked,
            _ => Outcome::Answered,
        };
        Ok(Receipt {
            format: FORMAT,
            issued_at: now,
            salt: hex::encode(salt),
            call_id: outlayer::env::var("OUTLAYER_CALL_ID").filter(|id| !id.is_empty()),
            caller: outlayer::env::signer_account_id(),
            prompt,
            outcome,
            screening,
            answer,
        })
    }
}
