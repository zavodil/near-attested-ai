//! A registry of policy packs on NEAR.
//!
//! A pack is the JSON a compliance gateway screens prompts with: a framework
//! (`eu-ai-act/art5`), a version, a classifier model and its rules. The
//! gateway reads a pack from here by `id@version`, hashes the bytes it was
//! given, and puts the hash in the signed label of every answer. A verifier
//! asks this contract for the same `id@version` and compares.
//!
//! What the contract adds to the hash: **who** published the pack (the
//! signer of the transaction), **when** (the block), and **whether it still
//! stands** (`deprecated`). It has no `update` and no `delete`: a version
//! once published is the same bytes forever, and a withdrawn version is
//! marked, so a label that names it reads as made under a withdrawn pack.
//!
//! Storage is paid by the publisher: the call attaches the bytes' storage
//! cost and the excess comes back in the same transaction.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};
use schemars::JsonSchema;

/// The most a pack's JSON may hold.
pub const MAX_PACK_BYTES: usize = 16 * 1024;
/// The most characters of a pack id.
pub const MAX_ID_CHARS: usize = 64;
/// The most packs one `list` answers.
pub const MAX_LIST: u64 = 100;

#[derive(BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Packs,
}

/// A published pack, bytes included.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, JsonSchema, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Pack {
    /// `framework/pack`: lowercase letters, digits and `-` on both sides.
    pub id: String,
    /// Starts at 1. A new version is a new pack beside the old one.
    pub version: u32,
    /// SHA-256 of `bytes`, lowercase hex: what a label names.
    pub sha256: String,
    /// The account that signed the publishing transaction.
    #[schemars(with = "String")]
    pub publisher: AccountId,
    /// The block's timestamp, nanoseconds since the epoch.
    pub published_at: u64,
    /// Marked by the publisher; the bytes stay.
    pub deprecated: bool,
    /// The pack's JSON, byte for byte as published.
    pub bytes: String,
}

/// A pack without its bytes: what a listing shows.
#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, JsonSchema, Clone, Debug, PartialEq, Eq)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PackMeta {
    pub id: String,
    pub version: u32,
    pub sha256: String,
    #[schemars(with = "String")]
    pub publisher: AccountId,
    pub published_at: u64,
    pub deprecated: bool,
    /// Length of the pack's JSON in bytes.
    pub size: u32,
}

impl Pack {
    fn meta(&self) -> PackMeta {
        PackMeta {
            id: self.id.clone(),
            version: self.version,
            sha256: self.sha256.clone(),
            publisher: self.publisher.clone(),
            published_at: self.published_at,
            deprecated: self.deprecated,
            size: self.bytes.len() as u32,
        }
    }
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Registry {
    packs: UnorderedMap<String, Pack>,
}

/// `id@version`: how a pack is named everywhere.
fn key(id: &str, version: u32) -> String {
    format!("{id}@{version}")
}

/// `framework/pack`, each side lowercase letters, digits and `-`, starting
/// with a letter or a digit.
fn check_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > MAX_ID_CHARS {
        return Err(format!("the id is empty or over {MAX_ID_CHARS} characters"));
    }
    let Some((framework, pack)) = id.split_once('/') else {
        return Err("the id is `framework/pack`".to_string());
    };
    for side in [framework, pack] {
        let well_formed = !side.is_empty()
            && side.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            && !side.starts_with('-');
        if !well_formed {
            return Err("each side of the id is lowercase letters, digits and `-`, starting with a letter or a digit".to_string());
        }
    }
    Ok(())
}

/// The bytes are a JSON object within the bound; nothing else is read of
/// them here. What the pack means is the gateway's to decide.
fn check_bytes(bytes: &str) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > MAX_PACK_BYTES {
        return Err(format!("a pack is 1 to {MAX_PACK_BYTES} bytes of JSON"));
    }
    match near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(bytes) {
        Ok(near_sdk::serde_json::Value::Object(_)) => Ok(()),
        Ok(_) => Err("a pack is a JSON object".to_string()),
        Err(e) => Err(format!("a pack is JSON: {e}")),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    env::sha256(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

#[near_bindgen]
impl Registry {
    #[init]
    pub fn new() -> Self {
        Self { packs: UnorderedMap::new(StorageKey::Packs) }
    }

    /// Publish `bytes` as `id@version`. Refused when that version exists:
    /// a pack is never changed, a change is the next version. The signer is
    /// the publisher. Attach the storage cost; the excess comes back.
    #[payable]
    pub fn publish(&mut self, id: String, version: u32, bytes: String) -> PackMeta {
        if let Err(why) = check_id(&id) {
            env::panic_str(&why);
        }
        require!(version >= 1, "versions start at 1");
        if let Err(why) = check_bytes(&bytes) {
            env::panic_str(&why);
        }
        let key = key(&id, version);
        require!(self.packs.get(&key).is_none(), "this version is published; a change is the next version");
        let pack = Pack {
            id,
            version,
            sha256: sha256_hex(bytes.as_bytes()),
            publisher: env::predecessor_account_id(),
            published_at: env::block_timestamp(),
            deprecated: false,
            bytes,
        };
        let before = env::storage_usage();
        self.packs.insert(&key, &pack);
        let used = env::storage_usage().saturating_sub(before);
        let cost = env::storage_byte_cost().saturating_mul(used as u128);
        let attached = env::attached_deposit();
        if attached < cost {
            self.packs.remove(&key);
            env::panic_str(&format!("attach {} yoctoNEAR for {used} bytes of storage; {} attached", cost.as_yoctonear(), attached.as_yoctonear()));
        }
        let refund = attached.saturating_sub(cost);
        if refund > NearToken::from_yoctonear(0) {
            Promise::new(env::predecessor_account_id()).transfer(refund);
        }
        pack.meta()
    }

    /// Mark `id@version` withdrawn. The bytes stay, and so does the mark:
    /// only the publisher may call this, and nothing unmarks.
    pub fn deprecate(&mut self, id: String, version: u32) -> PackMeta {
        let key = key(&id, version);
        let Some(mut pack) = self.packs.get(&key) else {
            env::panic_str("no such pack");
        };
        require!(pack.publisher == env::predecessor_account_id(), "only the publisher deprecates a pack");
        require!(!pack.deprecated, "already deprecated");
        pack.deprecated = true;
        self.packs.insert(&key, &pack);
        pack.meta()
    }

    /// The pack, bytes included.
    pub fn get(&self, id: String, version: u32) -> Option<Pack> {
        self.packs.get(&key(&id, version))
    }

    /// The pack without its bytes.
    pub fn get_meta(&self, id: String, version: u32) -> Option<PackMeta> {
        self.packs.get(&key(&id, version)).map(|pack| pack.meta())
    }

    /// Every version of `id`, oldest first.
    pub fn versions(&self, id: String) -> Vec<PackMeta> {
        let mut versions: Vec<PackMeta> =
            self.packs.values().filter(|pack| pack.id == id).map(|pack| pack.meta()).collect();
        versions.sort_by_key(|pack| pack.version);
        versions
    }

    /// A page of every pack, in publishing order.
    pub fn list(&self, from_index: Option<u64>, limit: Option<u64>) -> Vec<PackMeta> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(MAX_LIST).min(MAX_LIST);
        self.packs.values().skip(from as usize).take(limit as usize).map(|pack| pack.meta()).collect()
    }

    pub fn count(&self) -> u64 {
        self.packs.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    const PACK: &str = r#"{"id":"eu-ai-act/art5","version":1,"model":"levanto/sage-1.4","rules":[{"id":"social_scoring","cite":"Art. 5(1)(c)","question":"Does the text ask to score people?","threshold":50,"action":"block"}]}"#;

    fn as_account(account: AccountId, deposit: NearToken) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(account.clone())
            .signer_account_id(account)
            .attached_deposit(deposit)
            .block_timestamp(1_700_000_000_000_000_000)
            .build());
    }

    fn one_near() -> NearToken {
        NearToken::from_near(1)
    }

    #[test]
    fn a_pack_is_published_once_read_back_whole_and_listed() {
        let mut registry = Registry::new();
        as_account(accounts(1), one_near());
        let meta = registry.publish("eu-ai-act/art5".into(), 1, PACK.into());
        assert_eq!((meta.id.as_str(), meta.version, meta.publisher.clone(), meta.deprecated), ("eu-ai-act/art5", 1, accounts(1), false));
        assert_eq!(meta.sha256.len(), 64);
        assert_eq!(meta.published_at, 1_700_000_000_000_000_000);
        assert_eq!(meta.size as usize, PACK.len());

        let pack = registry.get("eu-ai-act/art5".into(), 1).expect("published");
        assert_eq!(pack.bytes, PACK, "byte for byte");
        assert_eq!(pack.sha256, meta.sha256);
        assert_eq!(registry.get_meta("eu-ai-act/art5".into(), 1), Some(meta.clone()));
        assert_eq!(registry.get("eu-ai-act/art5".into(), 2), None);
        assert_eq!(registry.list(None, None), vec![meta.clone()]);
        assert_eq!(registry.count(), 1);

        registry.publish("eu-ai-act/art5".into(), 2, PACK.replace("\"version\":1", "\"version\":2"));
        let versions = registry.versions("eu-ai-act/art5".into());
        assert_eq!(versions.iter().map(|p| p.version).collect::<Vec<_>>(), vec![1, 2]);
        assert_ne!(versions[0].sha256, versions[1].sha256);
        assert_eq!(registry.list(Some(1), Some(1)).len(), 1);
    }

    #[test]
    #[should_panic(expected = "this version is published")]
    fn a_published_version_is_never_replaced() {
        let mut registry = Registry::new();
        as_account(accounts(1), one_near());
        registry.publish("eu-ai-act/art5".into(), 1, PACK.into());
        registry.publish("eu-ai-act/art5".into(), 1, "{\"changed\":true}".into());
    }

    #[test]
    fn only_the_publisher_deprecates_and_the_bytes_stay() {
        let mut registry = Registry::new();
        as_account(accounts(1), one_near());
        registry.publish("eu-ai-act/art5".into(), 1, PACK.into());
        as_account(accounts(2), NearToken::from_yoctonear(0));
        let other = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| registry.deprecate("eu-ai-act/art5".into(), 1)));
        assert!(other.is_err(), "another account's deprecate must panic");
        as_account(accounts(1), NearToken::from_yoctonear(0));
        let meta = registry.deprecate("eu-ai-act/art5".into(), 1);
        assert!(meta.deprecated);
        let pack = registry.get("eu-ai-act/art5".into(), 1).unwrap();
        assert!(pack.deprecated && pack.bytes == PACK);
        let again = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| registry.deprecate("eu-ai-act/art5".into(), 1)));
        assert!(again.is_err(), "deprecating twice must panic");
    }

    #[test]
    fn the_id_the_version_and_the_bytes_are_checked() {
        for (id, why) in [
            ("", "empty"),
            ("eu-ai-act", "`framework/pack`"),
            ("EU/art5", "lowercase"),
            ("-eu/art5", "starting with"),
            ("eu/art 5", "lowercase"),
            (&"a".repeat(70), "over"),
        ] {
            assert!(check_id(id).unwrap_err().contains(why), "{id:?}: {}", check_id(id).unwrap_err());
        }
        assert!(check_id("eu-ai-act/art5").is_ok() && check_id("corporate/baseline-2").is_ok());

        assert!(check_bytes("").unwrap_err().contains("1 to"));
        assert!(check_bytes(&"x".repeat(MAX_PACK_BYTES + 1)).unwrap_err().contains("1 to"));
        assert!(check_bytes("[1]").unwrap_err().contains("object"));
        assert!(check_bytes("{not json").unwrap_err().contains("JSON"));
        assert!(check_bytes("{}").is_ok());

        let mut registry = Registry::new();
        as_account(accounts(1), one_near());
        let zero = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| registry.publish("eu-ai-act/art5".into(), 0, PACK.into())));
        assert!(zero.is_err(), "version 0 must panic");
    }

    #[test]
    #[should_panic(expected = "attach")]
    fn storage_is_paid_by_the_publisher() {
        let mut registry = Registry::new();
        as_account(accounts(1), NearToken::from_yoctonear(1));
        registry.publish("eu-ai-act/art5".into(), 1, PACK.into());
    }
}
