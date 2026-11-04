//! Policy packs: what a prompt is screened with, read from the registry
//! contract on NEAR by `id@version`.
//!
//! The enclave hashes the bytes the chain gave it and signs that hash into
//! the label, with the registry's account and the block it read at. The RPC
//! the worker proxies needs no trust: an answer that lied yields a hash the
//! chain does not hold, which any verifier sees by asking the chain itself.

use crate::sha256_hex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const MAX_RULES: usize = 8;
const MAX_QUESTION_CHARS: usize = 1000;
/// The most packs one request screens with.
pub const MAX_PACKS: usize = 6;

/// The registry on each network. The company's configuration may name
/// another (`registry`); personal mode uses this one.
pub const REGISTRY_TESTNET: &str = "policies.zavodil.testnet";
pub const REGISTRY_MAINNET: &str = "policies.outlayer.near";

/// What a rule does when it fires.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    /// Opens a task for the officer the company's configuration names; the
    /// prompt waits for their approval. In personal mode, with nobody to
    /// ask, it blocks.
    Escalate,
    /// Stops the prompt inside the enclave.
    Block,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    /// `[a-z0-9_]`, unique in the pack: the question's key in the decision request.
    pub id: String,
    /// The article or policy the rule comes from, for the person reading the label.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cite: Option<String>,
    pub question: String,
    /// Fires when P(yes) × 100 ≥ this, 1–100.
    pub threshold: u8,
    pub action: Action,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Pack {
    pub id: String,
    pub version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// The decision model every rule of the pack is asked of.
    pub model: String,
    pub rules: Vec<Rule>,
}

/// `id@version`, as a request or a configuration names a pack.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PackRef {
    pub id: String,
    pub version: u32,
}

impl PackRef {
    pub fn parse(named: &str) -> Result<Self, String> {
        let (id, version) = named.trim().split_once('@').ok_or_else(|| format!("{named:?} is not `id@version`"))?;
        let version: u32 = version.parse().map_err(|_| format!("{named:?}: the version is a whole number"))?;
        if id.is_empty() || version == 0 {
            return Err(format!("{named:?} is not `id@version`"));
        }
        Ok(PackRef { id: id.to_string(), version })
    }

    pub fn name(&self) -> String {
        format!("{}@{}", self.id, self.version)
    }
}

/// A pack as the registry answered it: the bytes' hash, where and when they
/// were read, and the pack parsed from them.
#[derive(Clone, Debug, Serialize)]
pub struct Loaded {
    pub pack: Pack,
    /// SHA-256 of the bytes the chain answered, lowercase hex: what the label names.
    pub sha256: String,
    pub registry: String,
    pub block_height: u64,
    pub publisher: String,
    pub deprecated: bool,
}

/// What the contract's `get` answers.
#[derive(Deserialize)]
struct Stored {
    sha256: String,
    publisher: String,
    deprecated: bool,
    bytes: String,
}

/// The registry's account on this network.
pub fn default_registry() -> String {
    match outlayer::env::var("NEAR_NETWORK_ID").as_deref() {
        Some("mainnet") => REGISTRY_MAINNET.to_string(),
        _ => REGISTRY_TESTNET.to_string(),
    }
}

/// Read `reference` from `registry` at the chain's final block.
pub fn load(registry: &str, reference: &PackRef) -> Result<Loaded, String> {
    let args = json!({ "id": reference.id, "version": reference.version }).to_string();
    let params = json!({
        "request_type": "call_function",
        "account_id": registry,
        "method_name": "get",
        "args_base64": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, args.as_bytes()),
        "finality": "final",
    });
    let (answer, error) = outlayer::raw::rpc::raw("query", &params.to_string());
    if !error.is_empty() {
        return Err(format!("the registry {registry} could not be read for {}: {error}", reference.name()));
    }
    let answer: Value =
        serde_json::from_str(&answer).map_err(|e| format!("the chain's answer for {} does not read: {e}", reference.name()))?;
    let block_height = answer
        .get("block_height")
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("the chain's answer for {} names no block", reference.name()))?;
    let bytes: Vec<u8> = answer
        .get("result")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("the chain's answer for {} carries no result", reference.name()))?
        .iter()
        .filter_map(|v| v.as_u64().map(|n| n as u8))
        .collect();
    let stored: Option<Stored> = serde_json::from_slice(&bytes)
        .map_err(|e| format!("the registry's answer for {} does not read: {e}", reference.name()))?;
    let Some(stored) = stored else {
        return Err(format!("the registry {registry} holds no pack {}", reference.name()));
    };
    let sha256 = sha256_hex(stored.bytes.as_bytes());
    if sha256 != stored.sha256 {
        return Err(format!(
            "the registry's bytes for {} hash to {sha256}, not the {} it states: the chain was not read faithfully",
            reference.name(),
            stored.sha256
        ));
    }
    let pack = Pack::parse(stored.bytes.as_bytes())?;
    if pack.id != reference.id || pack.version != reference.version {
        return Err(format!("the pack stored as {} names itself {}@{}", reference.name(), pack.id, pack.version));
    }
    if stored.deprecated {
        return Err(format!("{} was withdrawn by its publisher {}; name a version that stands", reference.name(), stored.publisher));
    }
    Ok(Loaded { pack, sha256, registry: registry.to_string(), block_height, publisher: stored.publisher, deprecated: false })
}

impl Pack {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        let pack: Pack = serde_json::from_slice(bytes).map_err(|e| format!("the pack does not read: {e}"))?;
        pack.validate()?;
        Ok(pack)
    }

    fn validate(&self) -> Result<(), String> {
        if self.model.trim().is_empty() {
            return Err(format!("pack {}: names no `model`", self.id));
        }
        if self.rules.is_empty() || self.rules.len() > MAX_RULES {
            return Err(format!("pack {}: 1–{MAX_RULES} rules, not {}", self.id, self.rules.len()));
        }
        let mut seen = std::collections::HashSet::new();
        for rule in &self.rules {
            if rule.id.is_empty() || !rule.id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_') {
                return Err(format!("pack {}: rule id {:?} must be [a-z0-9_] and not empty", self.id, rule.id));
            }
            if !seen.insert(rule.id.as_str()) {
                return Err(format!("pack {}: rule id {:?} appears twice", self.id, rule.id));
            }
            if rule.question.trim().is_empty() || rule.question.chars().count() > MAX_QUESTION_CHARS {
                return Err(format!("pack {}: rule {:?}: the question is 1–{MAX_QUESTION_CHARS} characters", self.id, rule.id));
            }
            if !(1..=100).contains(&rule.threshold) {
                return Err(format!("pack {}: rule {:?}: `threshold` is {}; it must be 1–100", self.id, rule.id, rule.threshold));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub const ART5: &str = r#"{"id":"eu-ai-act/art5","version":1,"title":"EU AI Act — prohibited practices (Art. 5)","model":"levanto/sage-1.4","rules":[{"id":"social_scoring","cite":"Art. 5(1)(c)","question":"Does the text ask to score people?","threshold":50,"action":"block"},{"id":"employment","cite":"Annex III(4)","question":"Does the text rank an employee?","threshold":50,"action":"escalate"}]}"#;

    #[test]
    fn a_pack_reads_byte_for_byte_and_is_held_to_its_shape() {
        let pack = Pack::parse(ART5.as_bytes()).unwrap();
        assert_eq!((pack.id.as_str(), pack.version, pack.rules.len()), ("eu-ai-act/art5", 1, 2));
        assert_eq!(pack.rules[1].action, Action::Escalate);
        assert!(Action::Block > Action::Escalate, "block is the stricter action");

        let bad = |edit: &str, replace: &str, why: &str| {
            let err = Pack::parse(ART5.replace(edit, replace).as_bytes()).unwrap_err();
            assert!(err.contains(why), "{edit} -> {replace}: {err}");
        };
        bad(r#""threshold":50,"action":"block"}"#, r#""threshold":0,"action":"block"}"#, "1–100");
        bad(r#""action":"escalate""#, r#""action":"warn""#, "unknown variant");
        bad(r#""id":"employment""#, r#""id":"social_scoring""#, "twice");
        bad(r#""id":"employment""#, r#""id":"Bad-Id""#, "[a-z0-9_]");
        bad(r#""model":"levanto/sage-1.4","#, r#""model":" ","#, "no `model`");
        bad(r#","rules":["#, r#","note":"x","rules":["#, "unknown field");
    }

    #[test]
    fn a_reference_is_id_at_version() {
        assert_eq!(PackRef::parse("eu-ai-act/art5@1").unwrap(), PackRef { id: "eu-ai-act/art5".into(), version: 1 });
        assert_eq!(PackRef::parse(" gdpr/art9@12 ").unwrap().name(), "gdpr/art9@12");
        for bad in ["eu-ai-act/art5", "eu-ai-act/art5@", "@1", "eu-ai-act/art5@0", "eu-ai-act/art5@one"] {
            assert!(PackRef::parse(bad).is_err(), "{bad}");
        }
    }
}
