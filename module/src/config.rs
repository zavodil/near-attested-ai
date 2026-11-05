//! Whose rules apply: the company's, or the caller's own.
//!
//! A company runs this build as a project of its own account. Its row, stored
//! under the accessor of that project with the profile the manifest names
//! (`author_secrets`), holds the NEAR AI key and `COMPLIANCE_CONFIG`; the worker
//! opens it on every run, whatever the call names, and judges its access
//! condition against the caller, so the row's whitelist is who may run the
//! project. A name a call's own row also holds refuses the run. So the project
//! is the company: its `label` key is the company's and no other project's, and
//! its owner, the one account that could store that row, is the organisation.
//!
//! A project whose row holds no configuration is in personal mode: the caller's
//! row holds the key, the request names its packs, and the label says so.
//!
//! Which row supplied which variable is the worker's word
//! (`OUTLAYER_SECRETS_ROWS`, which lists the rows the call named and never the
//! project's own): a configuration from a row the call named is refused, here
//! and on every project.

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
    /// Every pack's decision model must run in a NEAR-operated TEE: a pack
    /// whose model does not is refused before the prompt is sent to it.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub screening_tee: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum Mode {
    Personal,
    Company(Company),
}

#[derive(Clone, Debug, Serialize)]
pub struct Company {
    /// The project's owner, the account that stored its row: the organisation.
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
    let config = env::var(CONFIG_VAR);
    let owner = env::var("OUTLAYER_PROJECT_OWNER");
    resolve(&rows, config.as_deref(), owner.as_deref())
}

/// `rows` are the rows the call named, `config` the variable as the run holds
/// it: from one of those rows, or else from the project's own.
fn resolve(rows: &[env::SecretsRow], config: Option<&str>, project_owner: Option<&str>) -> Result<Mode, String> {
    let holds = |name: &str| rows.iter().find(|row| row.keys.iter().any(|k| k == name));
    if let Some(row) = holds(CONFIG_VAR) {
        return Err(format!(
            "{CONFIG_VAR} comes from {}/{}, a row this call names: a company's configuration is the row its project's owner stores \
             under the project. To run your own rules, publish this build as a project of your own",
            row.owner, row.profile
        ));
    }
    let Some(config) = config else { return Ok(Mode::Personal) };
    if let Some(row) = holds(KEY_VAR) {
        return Err(format!(
            "{KEY_VAR} comes from {}/{}, a row this call names: under a company's configuration the key is the company's",
            row.owner, row.profile
        ));
    }
    let org = project_owner.filter(|o| !o.is_empty()).ok_or_else(|| format!("{CONFIG_VAR} is here and this run names no project owner"))?;
    Ok(Mode::Company(Company { org: org.to_string(), config: Config::parse(config.as_bytes())?, config_sha256: sha256_hex(config.as_bytes()) }))
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

    fn row(owner: &str, keys: &[&str]) -> env::SecretsRow {
        env::SecretsRow { owner: owner.into(), profile: "default".into(), keys: keys.iter().map(|k| k.to_string()).collect() }
    }

    #[test]
    fn the_organisation_is_the_project_owner_and_nothing_a_row_says() {
        let officer = row("hr.acme.testnet", &[]);
        let Mode::Company(company) = resolve(&[officer], Some(CONFIG), Some("acme.testnet")).unwrap() else { panic!("company") };
        assert_eq!(company.org, "acme.testnet");
        assert_eq!(company.config_sha256, sha256_hex(CONFIG.as_bytes()));
        assert!(matches!(resolve(&[], Some(CONFIG), Some("acme.testnet")), Ok(Mode::Company(_))), "no row named at all");
    }

    #[test]
    fn a_configuration_from_a_row_the_call_names_is_nobodys() {
        for rows in [vec![row("carol.testnet", &[CONFIG_VAR])], vec![row("carol.testnet", &[KEY_VAR, CONFIG_VAR])]] {
            for project_config in [None, Some(CONFIG)] {
                let err = resolve(&rows, project_config, Some("acme.testnet")).unwrap_err();
                assert!(err.contains("carol.testnet/default") && err.contains("project of your own"), "{err}");
            }
        }
    }

    #[test]
    fn a_company_runs_on_its_own_key() {
        let err = resolve(&[row("carol.testnet", &[KEY_VAR])], Some(CONFIG), Some("acme.testnet")).unwrap_err();
        assert!(err.contains("the key is the company's"), "{err}");
    }

    #[test]
    fn a_project_with_no_configuration_is_personal() {
        assert!(matches!(resolve(&[row("carol.testnet", &[KEY_VAR])], None, Some("zavodil2.testnet")), Ok(Mode::Personal)));
        assert!(matches!(resolve(&[], None, None), Ok(Mode::Personal)));
    }

    #[test]
    fn a_configuration_may_ask_for_a_screen_in_a_tee() {
        assert!(!Config::parse(CONFIG.as_bytes()).unwrap().screening_tee);
        let strict = Config::parse(br#"{"frameworks":["eu-ai-act/art5@1"],"screening_tee":true}"#).unwrap();
        assert!(strict.screening_tee);
    }
}
