//! The receipt: everything the run did and everything it can prove, sealed to
//! the browser that asked.
//!
//! Outside the enclave only its sha256 is visible. The digest is in the run's
//! output, and the output's hash is in OutLayer's TDX quote for this call, so
//! a receipt anyone is later shown can be tied to this exact execution. The
//! random salt keeps the digest from confirming a guessed prompt. The label
//! inside it is the one part made to be handed on: signed, and holding
//! nothing of the prompt.

use crate::config::Mode;
use crate::label::{self, Approval, Facts, Signed, Summary};
use crate::model_call::{ModelCall, TeeRecord};
use serde::Serialize;
use serde_json::Value;

pub const FORMAT: &str = "outlayer-attested-ai-receipt/1";

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Answered,
    Blocked,
    Escalated,
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
    /// `personal`, or `company` with the organisation and its configuration's hash.
    pub mode: Value,
    pub prompt: String,
    pub outcome: Outcome,
    /// The screen as it was made: in this run, or in the run that escalated.
    pub screening: Option<Value>,
    pub answer: Option<Answer>,
    /// The officer's approval, on an answer that was escalated first.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval: Option<Approval>,
    /// Who the escalation went to, on a receipt that waits for them.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub escalated_to: Option<String>,
    pub label: Signed,
}

#[derive(Debug, Serialize)]
pub struct Answer {
    pub text: String,
    pub call: ModelCall,
}

pub struct Parts<'a> {
    pub mode: &'a Mode,
    pub outcome: Outcome,
    pub prompt: String,
    pub screening: Option<Value>,
    pub summary: Option<Summary>,
    pub answer: Option<Answer>,
    pub approval: Option<Approval>,
    pub escalated_to: Option<String>,
    pub now: u64,
}

impl Receipt {
    pub fn new(parts: Parts<'_>) -> Result<Self, String> {
        let mut salt = [0u8; 32];
        getrandom::getrandom(&mut salt).map_err(|e| format!("no randomness for the receipt's salt: {e}"))?;
        let salt = hex::encode(salt);
        let outcome = parts.outcome;
        let model_attested = parts.answer.as_ref().is_some_and(|a| matches!(a.call.tee, TeeRecord::Attested(_)));
        let label = label::sign(Facts {
            mode: parts.mode,
            outcome: match outcome {
                Outcome::Answered => label::Outcome::Answered,
                Outcome::Blocked => label::Outcome::Blocked,
                Outcome::Escalated => label::Outcome::Escalated,
            },
            screening: parts.summary.as_ref(),
            salt: &salt,
            prompt: &parts.prompt,
            answer: parts.answer.as_ref().map(|a| a.text.as_str()),
            model: parts.answer.as_ref().map(|a| a.call.model.as_str()),
            model_attested,
            approval: parts.approval.clone(),
            now: parts.now,
        })?;
        Ok(Receipt {
            format: FORMAT,
            issued_at: parts.now,
            salt,
            call_id: outlayer::env::var("OUTLAYER_CALL_ID").filter(|id| !id.is_empty()),
            caller: outlayer::env::signer_account_id(),
            mode: serde_json::to_value(parts.mode).map_err(|e| format!("the mode does not encode: {e}"))?,
            prompt: parts.prompt,
            outcome,
            screening: parts.screening,
            answer: parts.answer,
            approval: parts.approval,
            escalated_to: parts.escalated_to,
            label,
        })
    }
}
