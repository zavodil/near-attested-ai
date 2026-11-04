//! Whose rules apply: the company's, or the caller's own.
//!
//! A call names secret rows (`secrets_refs`). The row that holds both the
//! NEAR AI key and `COMPLIANCE_CONFIG` is the company's: only its owner's
//! account could have stored it, so that account is the organisation, and
//! the configuration is applied whatever the request asks. A call whose rows
//! hold a key and no configuration runs in personal mode: the request names
//! its packs, and the label says so.
//!
//! Which row supplied which variable is the worker's word
//! (`OUTLAYER_SECRETS_ROWS`), never the configuration's: a row of the
//! caller's own, named beside the company's, cannot pass its configuration
//! off as the company's.

use crate::pack::{PackRef, MAX_PACKS};
use crate::sha256_hex;
use outlayer::env;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const KEY_VAR: &str = "NEARAI_API_KEY";
pub const CONFIG_VAR: &str = "COMPLIANCE_CONFIG";

/// `COMPLIANCE_CONFIG`, as the company stores it.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// A name for the label and the page; the organisation itself is the
    /// row's owner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub org_name: Option<String>,
    /// The packs every prompt is screened with, `id@version` each.
    pub frameworks: Vec<String>,
    /// The answering models an employee may choose; any model NEAR AI
    /// serves from its TEEs when absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<String>>,
    /// Who approves an escalation: by `pack-id/rule-id`, or by `pack-id` for
    /// every rule of a pack. The account must own a row the call names.
    #[serde(default)]
    pub escalate: BTreeMap<String, String>,
    /// The registry the packs are read from; the network's default when absent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub registry: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum Mode {
    Personal,
    Company(Company),
}

#[derive(Clone, Debug, Serialize)]
pub struct Company {
    /// The account that stored the row: the organisation.
    pub org: String,
    pub config: Config,
    /// SHA-256 of `COMPLIANCE_CONFIG` as stored, lowercase hex.
    pub config_sha256: String,
}

impl Config {
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        let config: Config = serde_json::from_slice(bytes).map_err(|e| format!("{CONFIG_VAR} does not read: {e}"))?;
        if config.frameworks.is_empty() || config.frameworks.len() > MAX_PACKS {
            return Err(format!("{CONFIG_VAR}: `frameworks` names 1–{MAX_PACKS} packs, not {}", config.frameworks.len()));
        }
        for named in &config.frameworks {
            PackRef::parse(named).map_err(|e| format!("{CONFIG_VAR}: `frameworks`: {e}"))?;
        }
        for (rule, officer) in &config.escalate {
            if rule.trim().is_empty() || officer.trim().is_empty() || officer.contains(char::is_whitespace) {
                return Err(format!("{CONFIG_VAR}: `escalate` maps `pack-id/rule-id` or `pack-id` to an account; {rule:?} -> {officer:?} is not that"));
            }
        }
        if config.models.as_ref().is_some_and(|m| m.is_empty()) {
            return Err(format!("{CONFIG_VAR}: `models` is empty; leave it out to allow every TEE model"));
        }
        Ok(config)
    }

    pub fn packs(&self) -> Vec<PackRef> {
        self.frameworks.iter().filter_map(|named| PackRef::parse(named).ok()).collect()
    }

    /// The officer for a fired rule: the rule's own entry, or the pack's.
    pub fn officer_for(&self, pack_id: &str, rule_id: &str) -> Option<&str> {
        self.escalate
            .get(&format!("{pack_id}/{rule_id}"))
            .or_else(|| self.escalate.get(pack_id))
            .map(String::as_str)
    }
}

/// The mode this run is in, from the rows the worker opened.
pub fn detect() -> Result<Mode, String> {
    let rows = env::secrets_rows()?;
    let holds = |row: &env::SecretsRow, name: &str| row.keys.iter().any(|k| k == name);
    let key_row = rows.iter().find(|row| holds(row, KEY_VAR));
    let config_row = rows.iter().find(|row| holds(row, CONFIG_VAR));
    match (key_row, config_row) {
        (_, None) => Ok(Mode::Personal),
        (Some(key), Some(config)) if key.owner == config.owner && key.profile == config.profile => {
            let bytes = env::var(CONFIG_VAR).unwrap_or_default();
            let parsed = Config::parse(bytes.as_bytes())?;
            Ok(Mode::Company(Company { org: config.owner.clone(), config: parsed, config_sha256: sha256_hex(bytes.as_bytes()) }))
        }
        (_, Some(config)) => Err(format!(
            "{CONFIG_VAR} comes from {}/{}, which holds no {KEY_VAR}: a company's configuration is applied from the row \
             that also holds the company's key",
            config.owner, config.profile
        )),
    }
}

/// The company's configuration as stored: what an escalation's task is made
/// under, so a task made under another is void.
pub fn stored_config() -> Vec<u8> {
    env::var(CONFIG_VAR).unwrap_or_default().into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = r#"{"org_name":"Acme Demo","frameworks":["eu-ai-act/art5@1","eu-ai-act/annex3@1"],"models":["deepseek-ai/DeepSeek-V4.1-Flash-1017"],"escalate":{"eu-ai-act/annex3/employment_decision":"hr.acme.testnet","eu-ai-act/annex3":"compliance.acme.testnet"}}"#;

    #[test]
    fn a_configuration_names_its_packs_and_officers() {
        let config = Config::parse(CONFIG.as_bytes()).unwrap();
        assert_eq!(config.packs().iter().map(PackRef::name).collect::<Vec<_>>(), vec!["eu-ai-act/art5@1", "eu-ai-act/annex3@1"]);
        assert_eq!(config.officer_for("eu-ai-act/annex3", "employment_decision"), Some("hr.acme.testnet"), "the rule's own entry");
        assert_eq!(config.officer_for("eu-ai-act/annex3", "credit_insurance"), Some("compliance.acme.testnet"), "the pack's entry");
        assert_eq!(config.officer_for("eu-ai-act/art5", "social_scoring"), None);

        for (edit, replace, why) in [
            (r#"["eu-ai-act/art5@1","eu-ai-act/annex3@1"]"#, "[]", "1–6"),
            (r#""eu-ai-act/art5@1""#, r#""eu-ai-act/art5""#, "id@version"),
            (r#""hr.acme.testnet""#, r#""""#, "an account"),
            (r#""models":["deepseek-ai/DeepSeek-V4.1-Flash-1017"]"#, r#""models":[]"#, "empty"),
            (r#""org_name""#, r#""organisation""#, "unknown field"),
        ] {
            let err = Config::parse(CONFIG.replace(edit, replace).as_bytes()).unwrap_err();
            assert!(err.contains(why), "{edit}: {err}");
        }
    }
}
