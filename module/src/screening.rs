//! The policy screen: every rule of every pack is a yes/no question a
//! decision model answers about the prompt, with a calibrated probability.
//! A rule fires when P(yes) reaches its threshold; the strictest fired
//! action is the verdict — `block` over `escalate` — and a blocked or
//! escalated prompt never reaches the answering model in this run.
//!
//! A decision model need not run in a TEE (Sage, today, is an external
//! provider). The receipt says which it was, from NEAR AI's attestation
//! endpoint, rather than assuming.

use crate::label::{PackApplied, Summary};
use crate::model_call::{self, Endpoint, ModelCall, Requirement, TeeRecord};
use crate::nearai::Client;
use crate::pack::{Action, Loaded};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Passed,
    Escalated,
    Blocked,
}

#[derive(Debug, Serialize)]
pub struct Screening {
    pub packs: Vec<PackScreening>,
    /// The strictest action among the fired rules, or `passed`.
    pub verdict: Verdict,
    /// Every rule that fired, in pack order.
    pub fired: Vec<Fired>,
}

#[derive(Debug, Serialize)]
pub struct PackScreening {
    pub id: String,
    pub version: u32,
    pub title: Option<String>,
    pub model: String,
    /// SHA-256 of the pack's bytes as the registry answered them.
    pub sha256: String,
    pub registry: String,
    pub block_height: u64,
    pub publisher: String,
    pub outcomes: Vec<Outcome>,
    pub verdict: Verdict,
    pub call: ModelCall,
}

#[derive(Debug, Serialize)]
pub struct Outcome {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cite: Option<String>,
    pub question: String,
    pub threshold: u8,
    pub action: Action,
    pub p_yes: f64,
    pub tripped: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Fired {
    pub pack: String,
    pub rule: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cite: Option<String>,
    pub action: Action,
    pub p_yes: f64,
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

pub fn screen(api: &Client, prompt: &str, packs: &[Loaded], now: u64) -> Result<Screening, String> {
    let mut screened = Vec::with_capacity(packs.len());
    for loaded in packs {
        screened.push(screen_one(api, prompt, loaded, now)?);
    }
    let fired: Vec<Fired> = screened
        .iter()
        .flat_map(|p| {
            p.outcomes.iter().filter(|o| o.tripped).map(move |o| Fired {
                pack: p.id.clone(),
                rule: o.id.clone(),
                cite: o.cite.clone(),
                action: o.action,
                p_yes: o.p_yes,
            })
        })
        .collect();
    let verdict = fired.iter().map(|f| f.action.verdict()).max().unwrap_or(Verdict::Passed);
    Ok(Screening { packs: screened, verdict, fired })
}

fn screen_one(api: &Client, prompt: &str, loaded: &Loaded, now: u64) -> Result<PackScreening, String> {
    let pack = &loaded.pack;
    let questions: Map<String, Value> =
        pack.rules.iter().map(|rule| (rule.id.clone(), json!({"type": "noul", "instructions": rule.question}))).collect();
    let body = serde_json::to_vec(&json!({"model": pack.model, "state": prompt, "questions": questions}))
        .map_err(|e| format!("the screening request does not encode: {e}"))?;

    let (call, response) = model_call::run(api, Endpoint::Decide, Requirement::Disclosed, &pack.model, body, now)?;
    let decisions: Decisions =
        serde_json::from_slice(&response).map_err(|e| format!("{}'s decisions do not read as yes/no answers: {e}", pack.model))?;

    let outcomes = pack
        .rules
        .iter()
        .map(|rule| {
            let Answer::Noul { noul } = decisions
                .answers
                .get(&rule.id)
                .ok_or_else(|| format!("{} gave no answer for rule {:?}", pack.model, rule.id))?;
            if !(0.0..=1.0).contains(noul) {
                return Err(format!("{} answered rule {:?} with {noul}, not a probability", pack.model, rule.id));
            }
            Ok(Outcome {
                id: rule.id.clone(),
                cite: rule.cite.clone(),
                question: rule.question.clone(),
                threshold: rule.threshold,
                action: rule.action,
                p_yes: *noul,
                tripped: noul * 100.0 >= f64::from(rule.threshold),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let verdict = outcomes.iter().filter(|o| o.tripped).map(|o| o.action.verdict()).max().unwrap_or(Verdict::Passed);
    Ok(PackScreening {
        id: pack.id.clone(),
        version: pack.version,
        title: pack.title.clone(),
        model: pack.model.clone(),
        sha256: loaded.sha256.clone(),
        registry: loaded.registry.clone(),
        block_height: loaded.block_height,
        publisher: loaded.publisher.clone(),
        outcomes,
        verdict,
        call,
    })
}

impl Screening {
    /// What the label says of each pack.
    pub fn applied(&self) -> Vec<PackApplied> {
        self.packs
            .iter()
            .map(|p| PackApplied {
                id: p.id.clone(),
                version: p.version,
                sha256: p.sha256.clone(),
                registry: p.registry.clone(),
                block_height: p.block_height,
                verdict: p.verdict,
            })
            .collect()
    }

    /// Every decision model ran in a NEAR-operated TEE.
    pub fn attested(&self) -> bool {
        self.packs.iter().all(|p| matches!(p.call.tee, TeeRecord::Attested(_)))
    }

    /// What the label needs of the screen, and what an escalation seals
    /// for the run that answers after the officer's yes.
    pub fn summary(&self) -> Summary {
        Summary { applied: self.applied(), fired: self.fired.clone(), attested: self.attested(), verdict: self.verdict }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_decision_reads_as_a_yes_no_probability_and_nothing_else() {
        let ok: Decisions = serde_json::from_str(r#"{"answers":{"pii":{"type":"noul","noul":0.93}}}"#).unwrap();
        assert!(matches!(ok.answers["pii"], Answer::Noul { noul } if noul == 0.93));
        assert!(serde_json::from_str::<Decisions>(r#"{"answers":{"pii":{"type":"choice","choice":"a"}}}"#).is_err());
    }

    #[test]
    fn the_verdict_is_the_strictest_fired_action() {
        assert!(Verdict::Blocked > Verdict::Escalated && Verdict::Escalated > Verdict::Passed);
        let fired = [Action::Escalate, Action::Block, Action::Escalate];
        assert_eq!(fired.iter().map(|a| a.verdict()).max(), Some(Verdict::Blocked));
        assert_eq!([Action::Escalate].iter().map(|a| a.verdict()).max(), Some(Verdict::Escalated));
        assert_eq!(std::iter::empty::<Verdict>().max().unwrap_or(Verdict::Passed), Verdict::Passed);
    }
}
