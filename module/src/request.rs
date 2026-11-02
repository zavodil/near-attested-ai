//! What the browser asks, once the enclave has opened it.

use serde::{Deserialize, Serialize};

const MAX_PROMPT_BYTES: usize = 64 * 1024;
const MAX_RULES: usize = 8;
const MAX_QUESTION_CHARS: usize = 1000;
/// The default answer length. Completion is not streamed, and the platform
/// cuts every outbound request at 30 s, so the whole answer must arrive in
/// that: NEAR AI's fast models write about 45 tokens a second.
const DEFAULT_MAX_TOKENS: u32 = 600;
const MAX_TOKENS: u32 = 1200;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub prompt: String,
    /// The answering model: canonical NEAR AI id, served from a NEAR-operated TEE.
    pub model: String,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    /// The optional policy check before the prompt reaches the answering model.
    #[serde(default)]
    pub screening: Option<Policy>,
    /// The browser's key the receipt is sealed to (secp256k1, hex).
    pub reply_pubkey: String,
}

/// A screening policy: yes/no questions a decision model answers about the
/// prompt, and the probability of "yes" at which each one blocks it.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Policy {
    pub model: String,
    pub rules: Vec<Rule>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    /// `[a-z0-9_]`, unique in the policy: the question's key in the decision request.
    pub id: String,
    pub question: String,
    /// Blocks when P(yes) × 100 ≥ this, 1–100. A whole number so the policy's
    /// hash comes out the same in every language that re-serialises it.
    pub block_at: u8,
}

impl Request {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        let request: Request = serde_json::from_slice(bytes).map_err(|e| format!("the sealed request does not read: {e}"))?;
        request.validate()?;
        Ok(request)
    }

    pub fn max_tokens(&self) -> u32 {
        self.max_tokens.unwrap_or(DEFAULT_MAX_TOKENS)
    }

    fn validate(&self) -> Result<(), String> {
        if self.prompt.trim().is_empty() {
            return Err("the prompt is empty".to_string());
        }
        if self.prompt.len() > MAX_PROMPT_BYTES {
            return Err(format!("the prompt is {} bytes; at most {MAX_PROMPT_BYTES}", self.prompt.len()));
        }
        if self.model.trim().is_empty() {
            return Err("no answering `model` named".to_string());
        }
        if let Some(n) = self.max_tokens {
            if n == 0 || n > MAX_TOKENS {
                return Err(format!("`max_tokens` is {n}; it must be 1–{MAX_TOKENS}"));
            }
        }
        if let Some(policy) = &self.screening {
            policy.validate()?;
        }
        Ok(())
    }
}

impl Policy {
    fn validate(&self) -> Result<(), String> {
        if self.model.trim().is_empty() {
            return Err("the screening policy names no `model`".to_string());
        }
        if self.rules.is_empty() || self.rules.len() > MAX_RULES {
            return Err(format!("a screening policy has 1–{MAX_RULES} rules; this one has {}", self.rules.len()));
        }
        let mut seen = std::collections::HashSet::new();
        for rule in &self.rules {
            if rule.id.is_empty() || !rule.id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_') {
                return Err(format!("rule id {:?} must be [a-z0-9_] and not empty", rule.id));
            }
            if !seen.insert(rule.id.as_str()) {
                return Err(format!("rule id {:?} appears twice", rule.id));
            }
            if rule.question.trim().is_empty() || rule.question.chars().count() > MAX_QUESTION_CHARS {
                return Err(format!("rule {:?}: the question must be 1–{MAX_QUESTION_CHARS} characters", rule.id));
            }
            if !(1..=100).contains(&rule.block_at) {
                return Err(format!("rule {:?}: `block_at` is {}; it must be 1–100", rule.id, rule.block_at));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(extra: &str) -> String {
        format!(r#"{{"prompt":"hello","model":"Qwen/Qwen3.8-27B","reply_pubkey":"02aa"{extra}}}"#)
    }

    #[test]
    fn a_plain_request_reads_with_the_default_length() {
        let r = Request::parse(request("").as_bytes()).unwrap();
        assert_eq!(r.max_tokens(), DEFAULT_MAX_TOKENS);
        assert!(r.screening.is_none());
    }

    #[test]
    fn an_unknown_member_is_refused_by_name() {
        let err = Request::parse(request(r#","temprature":1"#).as_bytes()).unwrap_err();
        assert!(err.contains("temprature"), "{err}");
    }

    #[test]
    fn a_policy_is_held_to_its_shape() {
        let rule = |id: &str, block_at: u32| format!(r#"{{"id":"{id}","question":"q?","block_at":{block_at}}}"#);
        let with = |rules: &str| request(&format!(r#","screening":{{"model":"levanto/sage-1.4","rules":[{rules}]}}"#));

        assert!(Request::parse(with(&rule("pii", 50)).as_bytes()).is_ok());
        assert!(Request::parse(with("").as_bytes()).unwrap_err().contains("1–8 rules"));
        assert!(Request::parse(with(&format!("{},{}", rule("a", 50), rule("a", 60))).as_bytes()).unwrap_err().contains("twice"));
        assert!(Request::parse(with(&rule("Bad-Id", 50)).as_bytes()).unwrap_err().contains("[a-z0-9_]"));
        assert!(Request::parse(with(&rule("pii", 0)).as_bytes()).unwrap_err().contains("1–100"));
        assert!(Request::parse(with(&rule("pii", 101)).as_bytes()).is_err());
    }

    #[test]
    fn limits_are_stated() {
        assert!(Request::parse(request(r#","max_tokens":0"#).as_bytes()).unwrap_err().contains("1–1200"));
        assert!(Request::parse(request(r#","max_tokens":1201"#).as_bytes()).is_err());
        let empty = r#"{"prompt":"  ","model":"m","reply_pubkey":"02"}"#;
        assert!(Request::parse(empty.as_bytes()).unwrap_err().contains("empty"));
    }
}
