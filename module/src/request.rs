//! What the browser asks, once the enclave has opened it.

use crate::config::Mode;
use crate::pack::{PackRef, MAX_PACKS};
use serde::{Deserialize, Serialize};

const MAX_PROMPT_BYTES: usize = 64 * 1024;
/// The default answer length. Completion is not streamed; the manifest gives
/// NEAR AI 120 s a request, and its fast models write about 45 tokens a
/// second.
const DEFAULT_MAX_TOKENS: u32 = 900;
const MAX_TOKENS: u32 = 1200;

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub prompt: String,
    /// The answering model: canonical NEAR AI id, served from a NEAR-operated TEE.
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// The packs the prompt is screened with, `id@version` each, in
    /// personal mode. In company mode the configuration decides, and a
    /// request that names packs is refused.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub packs: Vec<String>,
    /// The browser's key the receipt is sealed to (secp256k1, hex).
    pub reply_pubkey: String,
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

    /// The packs this run screens with: the company's, or the request's.
    pub fn packs_under(&self, mode: &Mode) -> Result<Vec<PackRef>, String> {
        match mode {
            Mode::Company(company) => {
                if !self.packs.is_empty() {
                    return Err(format!(
                        "this call runs under {}'s configuration, which decides the packs; the request names its own",
                        company.org
                    ));
                }
                if let Some(models) = &company.config.models {
                    if !models.iter().any(|m| m == &self.model) {
                        return Err(format!(
                            "{}'s configuration allows the models {}; the request names {}",
                            company.org,
                            models.join(", "),
                            self.model
                        ));
                    }
                }
                Ok(company.config.packs())
            }
            Mode::Personal => self.packs.iter().map(|named| PackRef::parse(named)).collect(),
        }
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
        if self.packs.len() > MAX_PACKS {
            return Err(format!("a request names at most {MAX_PACKS} packs; this one names {}", self.packs.len()));
        }
        for named in &self.packs {
            PackRef::parse(named)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Company, Config};

    fn request(extra: &str) -> String {
        format!(r#"{{"prompt":"hello","model":"deepseek-ai/DeepSeek-V4.1-Flash-1017","reply_pubkey":"02aa"{extra}}}"#)
    }

    fn company(models: &str) -> Mode {
        Mode::Company(Company {
            org: "compliance.acme.testnet".into(),
            config: Config::parse(format!(r#"{{"frameworks":["eu-ai-act/art5@1"]{models}}}"#).as_bytes()).unwrap(),
            config_sha256: "00".into(),
        })
    }

    #[test]
    fn a_plain_request_reads_with_the_default_length_and_no_packs() {
        let r = Request::parse(request("").as_bytes()).unwrap();
        assert_eq!(r.max_tokens(), DEFAULT_MAX_TOKENS);
        assert!(r.packs_under(&Mode::Personal).unwrap().is_empty());
    }

    #[test]
    fn an_unknown_member_is_refused_by_name() {
        let err = Request::parse(request(r#","temprature":1"#).as_bytes()).unwrap_err();
        assert!(err.contains("temprature"), "{err}");
    }

    #[test]
    fn in_personal_mode_the_request_names_its_packs() {
        let r = Request::parse(request(r#","packs":["eu-ai-act/art5@1","gdpr/art9@2"]"#).as_bytes()).unwrap();
        let packs = r.packs_under(&Mode::Personal).unwrap();
        assert_eq!(packs.iter().map(PackRef::name).collect::<Vec<_>>(), vec!["eu-ai-act/art5@1", "gdpr/art9@2"]);
        assert!(Request::parse(request(r#","packs":["eu-ai-act/art5"]"#).as_bytes()).unwrap_err().contains("id@version"));
        let many = (0..7).map(|n| format!("\"p/{n}@1\"")).collect::<Vec<_>>().join(",");
        assert!(Request::parse(request(&format!(r#","packs":[{many}]"#)).as_bytes()).unwrap_err().contains("at most 6"));
    }

    #[test]
    fn in_company_mode_the_configuration_decides() {
        let plain = Request::parse(request("").as_bytes()).unwrap();
        assert_eq!(plain.packs_under(&company("")).unwrap().iter().map(PackRef::name).collect::<Vec<_>>(), vec!["eu-ai-act/art5@1"]);
        let own = Request::parse(request(r#","packs":["gdpr/art9@1"]"#).as_bytes()).unwrap();
        assert!(own.packs_under(&company("")).unwrap_err().contains("names its own"));
        let other_model = plain.packs_under(&company(r#","models":["Qwen/Qwen3.8-27B"]"#)).unwrap_err();
        assert!(other_model.contains("allows the models"), "{other_model}");
        assert!(plain.packs_under(&company(r#","models":["deepseek-ai/DeepSeek-V4.1-Flash-1017"]"#)).is_ok());
    }

    #[test]
    fn limits_are_stated() {
        assert!(Request::parse(request(r#","max_tokens":0"#).as_bytes()).unwrap_err().contains("1–1200"));
        assert!(Request::parse(request(r#","max_tokens":1201"#).as_bytes()).is_err());
        let empty = r#"{"prompt":"  ","model":"m","reply_pubkey":"02"}"#;
        assert!(Request::parse(empty.as_bytes()).unwrap_err().contains("empty"));
    }
}
