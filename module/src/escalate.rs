//! An escalated prompt: a task for the officer the company's configuration
//! names, and the run that answers after their yes.
//!
//! The officer owns a secret row under this project that admits the
//! employee by name — their consent to be asked — and the employee's call
//! names it (`secrets_refs`). The task is opened for that row's owner
//! (`open-for`): it lands in the officer's own inbox, and their wallet's
//! signature approves it. The platform then runs `answer_escalated` as the
//! employee's own run, with every row named again, the officer's first; that
//! run takes back what was kept here — the request, and the screen as made —
//! answers with the model, and seals the receipt to the employee's reply key,
//! with the officer's approval in the label.
//!
//! The screen stays whole for that receipt, and a screen in a TEE carries a
//! report per pack, far over what a task seals: it waits in the employee's
//! encrypted cell of the project's storage, under its hash, which the task's
//! sealed state names. A task that ends without an answer leaves it there.
//!
//! The task is made under the company's configuration as its policy: a
//! configuration changed since voids it.

use crate::config::{self, Company, Mode};
use crate::label::{Approval, Summary};
use crate::receipt::{Answer, Outcome, Parts, Receipt};
use crate::request::Request;
use crate::screening::{Fired, Screening};
use crate::{nearai, sha256_hex, SealedReceipt};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use outlayer::tasks::{self, Display, FieldKind, WrittenBy};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// The operation the platform starts on the officer's approval.
pub const ANSWERED_BY: &str = "answer_escalated";
/// The most of a prompt the officer is shown as the field; a longer one is
/// shown cut, with the length said, and answered whole.
const SHOWN_PROMPT_CHARS: usize = 20_000;

fn screen_key(digest: &str) -> String {
    format!("screen/{digest}")
}

/// The screen as stored: the bytes back under their hash, or why not.
fn stored_screen(digest: &str) -> Result<Value, String> {
    let bytes = outlayer::storage::get(&screen_key(digest))
        .map_err(|e| format!("the screen this task was made with could not be read: {e}"))?
        .ok_or("the screen this task was made with is no longer stored")?;
    if sha256_hex(&bytes) != digest {
        return Err("the stored screen is not the one this task was made with".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("the stored screen does not read: {e}"))
}

/// What waits sealed with the task, for the run that answers.
#[derive(Serialize, Deserialize)]
struct State {
    /// The request as opened, base64 of its JSON.
    request: String,
    /// The hash of the screen as made, the key it waits under in storage.
    screening_sha256: String,
    summary: Summary,
    org: String,
    config_sha256: String,
}

/// Where the fired rule sends the prompt.
pub fn officer_for(company: &Company, fired: &[Fired]) -> Result<String, String> {
    let escalated: Vec<&Fired> = fired.iter().filter(|f| f.action == crate::pack::Action::Escalate).collect();
    let mut officers: Vec<String> = Vec::new();
    for rule in &escalated {
        match company.config.officer_for(&rule.pack, &rule.rule) {
            Some(officer) if !officers.iter().any(|o| o == officer) => officers.push(officer.to_string()),
            Some(_) => {}
            None => {
                return Err(format!(
                    "rule {}/{} escalates and {}'s configuration names no officer for it (`escalate`)",
                    rule.pack, rule.rule, company.org
                ))
            }
        }
    }
    match officers.as_slice() {
        [one] => Ok(one.clone()),
        [] => Err("nothing escalated".to_string()),
        several => Ok(several[0].clone()),
    }
}

/// Open the task and answer the call: the receipt of the screen, sealed to
/// the employee, and where the prompt waits.
pub fn open(
    request: &Request,
    request_bytes: &[u8],
    company: &Company,
    screening: Screening,
    officer: &str,
    reply_pubkey: &[u8],
    now: u64,
) -> Result<Value, String> {
    let rows = outlayer::env::secrets_rows()?;
    if !rows.iter().any(|row| row.owner == officer) {
        return Err(format!(
            "the prompt escalates to {officer}, whose row this call does not name: name it in `secrets_refs`"
        ));
    }
    let summary = screening.summary();
    let screening_value = serde_json::to_value(&screening).map_err(|e| format!("the screen does not encode: {e}"))?;
    let screening_bytes = serde_json::to_vec(&screening_value).map_err(|e| format!("the screen does not encode: {e}"))?;
    let screening_sha256 = sha256_hex(&screening_bytes);
    outlayer::storage::set(&screen_key(&screening_sha256), &screening_bytes).map_err(|e| format!("the screen could not be kept for the officer's answer: {e}"))?;
    let state = State {
        request: BASE64.encode(request_bytes),
        screening_sha256,
        summary: summary.clone(),
        org: company.org.clone(),
        config_sha256: company.config_sha256.clone(),
    };
    let state = serde_json::to_vec(&state).map_err(|e| format!("the task's state does not encode: {e}"))?;
    let opened = tasks::confirm(display(request, &summary.fired, company), ANSWERED_BY, &state, &config::stored_config())
        .owner(officer)
        .open()
        .map_err(|e| format!("the escalation could not be opened for {officer}: {}", e.refusal()))?;

    let mode = Mode::Company(company.clone());
    let receipt = Receipt::new(Parts {
        mode: &mode,
        outcome: Outcome::Escalated,
        prompt: request.prompt.clone(),
        screening: Some(screening_value),
        summary: Some(summary),
        answer: None,
        approval: None,
        escalated_to: Some(officer.to_string()),
        now,
    })?;
    let bytes = serde_json::to_vec(&receipt).map_err(|e| format!("the receipt does not encode: {e}"))?;
    // Members in alphabetical order: the attested output hash is over this JSON.
    Ok(json!({
        "officer": officer,
        "receipt_digest": sha256_hex(&bytes),
        "sealed": BASE64.encode(crate::envelope::seal(reply_pubkey, &bytes)?),
        "status": "escalated",
        "task_hash": opened.hash,
        "task_id": opened.id,
    }))
}

fn display(request: &Request, fired: &[Fired], company: &Company) -> Display {
    let shown: String = request.prompt.chars().take(SHOWN_PROMPT_CHARS).collect();
    let prompt = if shown.chars().count() < request.prompt.chars().count() {
        format!("{shown}\n\n[cut here; the whole prompt is {} characters and is answered whole]", request.prompt.chars().count())
    } else {
        shown
    };
    let rules: Vec<String> = fired
        .iter()
        .map(|f| {
            format!(
                "{}/{}{} — {:.1}% ({})",
                f.pack,
                f.rule,
                f.cite.as_deref().map(|c| format!(" ({c})")).unwrap_or_default(),
                f.p_yes * 100.0,
                match f.action {
                    crate::pack::Action::Escalate => "escalate",
                    crate::pack::Action::Block => "block",
                }
            )
        })
        .collect();
    Display::new("Approve an AI request")
        .field("Organisation", FieldKind::Text, company.config.org_name.as_deref().unwrap_or(&company.org), WrittenBy::Project)
        .field("Asked by", FieldKind::Text, &outlayer::env::signer_account_id().unwrap_or_default(), WrittenBy::Project)
        .list("Rules that fired", &rules, WrittenBy::Project)
        .field("Model", FieldKind::Text, &request.model, WrittenBy::Agent)
        .field("Prompt", FieldKind::LongText, &prompt, WrittenBy::Agent)
}

/// `answer_escalated`: the employee's run on the officer's yes. Takes the
/// sealed request and screen back, answers with the model, seals the
/// receipt — the officer's approval in its label — to the employee's reply
/// key. The sealed receipt is this run's output, under its attestation, which
/// the employee's payment key reads; a receipt with its evidence is far over
/// what a task keeps, so the task is told its digest and the run's id does the
/// rest.
pub fn answer(input: &Value, now: u64) -> Result<Value, tasks::Refused> {
    let answered = tasks::answered_for(ANSWERED_BY, input, &config::stored_config()).map_err(|e| e.refusal())?;
    let id = answered.id.clone();
    let result = answer_with(&answered, input, now);
    match &result {
        Ok(output) => {
            let bytes = reported(output).map_err(|e| e.to_string())?;
            tasks::report(&id, &bytes).map_err(|e| e.refusal())?;
        }
        Err(refusal) => {
            let told = tasks::failed_and_told(&id, refusal, &config::stored_config());
            told.reported.map_err(|e| e.refusal())?;
            return Err(tasks::Refused { refusal: refusal.clone(), notice: told.notice });
        }
    }
    result.map_err(tasks::Refused::from)
}

/// What the task keeps of a run's output: the digest of the sealed receipt.
fn reported(output: &Value) -> Result<Vec<u8>, String> {
    let digest = output.get("receipt_digest").and_then(Value::as_str).ok_or("the output names no receipt digest")?;
    serde_json::to_vec(&serde_json::json!({ "receipt_digest": digest })).map_err(|e| format!("the digest does not encode: {e}"))
}

fn answer_with(answered: &tasks::Answer, input: &Value, now: u64) -> Result<Value, String> {
    let state: State = serde_json::from_slice(&answered.state).map_err(|_| "the task's state does not read".to_string())?;
    let request_bytes = BASE64.decode(&state.request).map_err(|_| "the task's request is not base64".to_string())?;
    let request = Request::parse(&request_bytes)?;
    let reply_pubkey = crate::envelope::parse_pubkey(&request.reply_pubkey)?;
    // The run names the rows the preparing run named, the officer's first:
    // the company's key and configuration are here again, and the
    // configuration is the one the task was made under or the task is void.
    let mode = config::detect()?;
    let Mode::Company(company) = &mode else {
        return Err("the run that answers an escalation names no company configuration".to_string());
    };
    if company.org != state.org || company.config_sha256 != state.config_sha256 {
        return Err(format!("the task was made under {}'s configuration {}, and this run holds another", state.org, state.config_sha256));
    }
    let approval = tasks::approval_of(input).map_err(|e| e.refusal())?;
    let approval = Approval {
        officer: outlayer::env::secrets_owner().unwrap_or_default(),
        public_key: approval.public_key,
        at: approval.at,
        task_id: answered.id.clone(),
    };
    let screening = stored_screen(&state.screening_sha256)?;
    let api = nearai::Client::from_env()?;
    let answer: Answer = crate::answer(&api, &request, now)?;
    let receipt = Receipt::new(Parts {
        mode: &mode,
        outcome: Outcome::Answered,
        prompt: request.prompt.clone(),
        screening: Some(screening),
        summary: Some(state.summary),
        answer: Some(answer),
        approval: Some(approval),
        escalated_to: None,
        now,
    })?;
    let bytes = serde_json::to_vec(&receipt).map_err(|e| format!("the receipt does not encode: {e}"))?;
    let output = SealedReceipt { receipt_digest: sha256_hex(&bytes), sealed: BASE64.encode(crate::envelope::seal(&reply_pubkey, &bytes)?) };
    let output = serde_json::to_value(output).map_err(|e| format!("the output does not encode: {e}"))?;
    // The officer's yes is answered whatever happens to the kept copy: the
    // answer goes out, and a copy that stays is encrypted in the employee's cell.
    let _ = outlayer::storage::delete(&screen_key(&state.screening_sha256));
    Ok(output)
}

#[cfg(test)]
mod reported_tests {
    use super::*;

    /// A receipt with its evidence is far over the 16 KiB a task keeps: the
    /// task is told the digest and nothing of the sealed receipt.
    #[test]
    fn the_task_keeps_the_digest_and_not_the_receipt() {
        let output = serde_json::json!({ "receipt_digest": "ab".repeat(32), "sealed": "x".repeat(300_000) });
        let bytes = reported(&output).unwrap();
        assert!(bytes.len() < 200, "{}", bytes.len());
        let told: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(told["receipt_digest"], "ab".repeat(32));
        assert!(told.get("sealed").is_none());
        assert!(reported(&serde_json::json!({ "sealed": "x" })).is_err());
    }
}
