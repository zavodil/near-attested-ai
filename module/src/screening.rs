//! The optional policy check: every rule is a yes/no question a decision
//! model answers about the prompt, with a calibrated probability. The prompt
//! is blocked when any rule's P(yes) reaches its threshold, and then it never
//! reaches the answering model.
//!
//! A decision model need not run in a TEE (Sage, today, is an external
//! provider). The receipt says which it was, from NEAR AI's attestation
//! endpoint, rather than assuming.

use crate::model_call::{self, Endpoint, ModelCall, Requirement};
use crate::nearai::Client;
use crate::request::Policy;
use crate::sha256_hex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Passed,
    Blocked,
}

#[derive(Debug, Serialize)]
pub struct Screening {
    pub policy: Policy,
    /// sha256 of the policy as JSON (`model`, then `rules` of `id`,
    /// `question`, `block_at`): the fingerprint an auditor compares with the
    /// policy that was supposed to apply.
    pub policy_sha256: String,
    pub outcomes: Vec<Outcome>,
    pub verdict: Verdict,
    pub call: ModelCall,
}

#[derive(Debug, Serialize)]
pub struct Outcome {
    pub id: String,
    pub p_yes: f64,
    pub tripped: bool,
}

/// One `noul` (yes/no) answer of the decision model.
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Answer {
    Noul { noul: f64 },
}

#[derive(Deserialize)]
struct Decisions {
    answers: HashMap<String, Answer>,
}

pub fn screen(api: &Client, prompt: &str, policy: &Policy, now: u64) -> Result<Screening, String> {
    let questions: Map<String, Value> = policy
        .rules
        .iter()
        .map(|rule| (rule.id.clone(), json!({"type": "noul", "instructions": rule.question})))
        .collect();
    let body = serde_json::to_vec(&json!({"model": policy.model, "state": prompt, "questions": questions}))
        .map_err(|e| format!("the screening request does not encode: {e}"))?;

    let (call, response) = model_call::run(api, Endpoint::Decide, Requirement::Disclosed, &policy.model, body, now)?;
    let decisions: Decisions = serde_json::from_slice(&response)
        .map_err(|e| format!("{}'s decisions do not read as yes/no answers: {e}", policy.model))?;

    let outcomes = policy
        .rules
        .iter()
        .map(|rule| {
            let Answer::Noul { noul } = decisions
                .answers
                .get(&rule.id)
                .ok_or_else(|| format!("{} gave no answer for rule {:?}", policy.model, rule.id))?;
            if !(0.0..=1.0).contains(noul) {
                return Err(format!("{} answered rule {:?} with {noul}, not a probability", policy.model, rule.id));
            }
            Ok(Outcome { id: rule.id.clone(), p_yes: *noul, tripped: noul * 100.0 >= f64::from(rule.block_at) })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let verdict = if outcomes.iter().any(|o| o.tripped) { Verdict::Blocked } else { Verdict::Passed };
    let policy_sha256 = sha256_hex(&serde_json::to_vec(policy).map_err(|e| format!("the policy does not encode: {e}"))?);
    Ok(Screening { policy: policy.clone(), policy_sha256, outcomes, verdict, call })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::request::Rule;

    /// The fingerprint the browser recomputes with `JSON.stringify` over the
    /// same members in the same order.
    #[test]
    fn the_policy_fingerprint_is_its_json_in_member_order() {
        let policy = Policy {
            model: "levanto/sage-1.4".into(),
            rules: vec![Rule { id: "pii".into(), question: "Personal data?".into(), block_at: 50 }],
        };
        assert_eq!(
            String::from_utf8(serde_json::to_vec(&policy).unwrap()).unwrap(),
            r#"{"model":"levanto/sage-1.4","rules":[{"id":"pii","question":"Personal data?","block_at":50}]}"#
        );
    }

    #[test]
    fn a_decision_reads_as_a_yes_no_probability_and_nothing_else() {
        let ok: Decisions = serde_json::from_str(r#"{"answers":{"pii":{"type":"noul","noul":0.93}}}"#).unwrap();
        assert!(matches!(ok.answers["pii"], Answer::Noul { noul } if noul == 0.93));
        assert!(serde_json::from_str::<Decisions>(r#"{"answers":{"pii":{"type":"choice","choice":"a"}}}"#).is_err());
    }
}
