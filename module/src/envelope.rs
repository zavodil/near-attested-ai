//! The two envelopes of a run: the request the browser sealed to the enclave,
//! and the receipt the enclave seals back to the browser.
//!
//! Both are ECIES over secp256k1 — `ecies` here, `eciesjs` in the browser —
//! so neither the coordinator that relays them nor the database that keeps
//! the call can read either.
//!
//! The enclave's key pair is derived, never stored: its secret is the `mac`
//! of a fixed label under the `inbox` encryption key, which the keystore
//! derives inside the TEE for this project and this caller (the payment-key
//! owner). Every run of the project for the same caller gets the same key;
//! no other caller, and no other project, can open what was sealed to it.

use outlayer::encryption_keys;

const KEY_PATH: &str = "inbox";
const KEY_LABEL: &[u8] = b"compliance-gateway/ecies-secp256k1/v1";

fn enclave_secret() -> Result<libsecp256k1::SecretKey, String> {
    let seed = encryption_keys::mac(KEY_PATH, None, KEY_LABEL)
        .map_err(|e| format!("the enclave key is not available to this run: {e}"))?;
    let seed: [u8; 32] = seed.try_into().map_err(|_| "the enclave key seed is not 32 bytes".to_string())?;
    // A seed that is not a valid scalar has probability ~2^-128; refusing is
    // the honest answer if it ever happens.
    libsecp256k1::SecretKey::parse(&seed).map_err(|_| "the enclave key seed is not a valid secp256k1 scalar".to_string())
}

/// The enclave's public key, compressed, in hex — what `enclave_key` answers.
pub fn enclave_public_key() -> Result<String, String> {
    let secret = enclave_secret()?;
    Ok(hex::encode(libsecp256k1::PublicKey::from_secret_key(&secret).serialize_compressed()))
}

/// Open what the browser sealed to the enclave's key.
pub fn open(sealed: &[u8]) -> Result<Vec<u8>, String> {
    let secret = enclave_secret()?;
    ecies::decrypt(&secret.serialize(), sealed).map_err(|_| {
        "the request does not open with this enclave's key: it was sealed to another key \
         (another project, another payment-key owner) or changed on the way"
            .to_string()
    })
}

/// Seal `plaintext` to the browser's reply key.
pub fn seal(reply_pubkey: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    ecies::encrypt(reply_pubkey, plaintext).map_err(|e| format!("sealing the receipt failed: {e:?}"))
}

/// The browser's reply key, as the request carries it: a secp256k1 public key
/// in hex, 33 bytes compressed (as `eciesjs` gives it) or 65 uncompressed.
pub fn parse_pubkey(hex_key: &str) -> Result<Vec<u8>, String> {
    let bytes = hex::decode(hex_key.trim().trim_start_matches("0x"))
        .map_err(|_| "`reply_pubkey` is not hex".to_string())?;
    if bytes.len() != 33 && bytes.len() != 65 {
        return Err(format!("`reply_pubkey` must be 33 or 65 bytes; got {}", bytes.len()));
    }
    libsecp256k1::PublicKey::parse_slice(&bytes, None)
        .map_err(|_| "`reply_pubkey` is not a point on secp256k1".to_string())?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reply_key_is_a_point_on_the_curve() {
        let (_, public) = ecies::utils::generate_keypair();
        let compressed = hex::encode(public.serialize_compressed());
        assert_eq!(parse_pubkey(&compressed).unwrap().len(), 33);
        assert_eq!(parse_pubkey(&format!("0x{compressed}")).unwrap().len(), 33);
        assert!(parse_pubkey("abcd").unwrap_err().contains("33 or 65"));
        assert!(parse_pubkey("zz").unwrap_err().contains("not hex"));
        let mut off = public.serialize_compressed();
        off[0] = 0x05;
        assert!(parse_pubkey(&hex::encode(off)).unwrap_err().contains("not a point"));
    }

    /// The secret both golden vectors are made with: bytes 1..=32.
    fn golden_secret() -> [u8; 32] {
        core::array::from_fn(|i| (i as u8) + 1)
    }

    /// A request `eciesjs` sealed in the browser opens here.
    /// `web/test/envelope.test.ts` opens the reverse vector, `GOLDEN_RECEIPT`.
    #[test]
    fn a_request_the_browser_sealed_opens_here() {
        let blob = hex::decode(BROWSER_BLOB).unwrap();
        assert_eq!(ecies::decrypt(&golden_secret(), &blob).unwrap(), br#"{"prompt":"from the browser"}"#);
    }

    /// `cargo test -- --ignored --nocapture print_a_golden_receipt` when the
    /// format changes; paste the output into `web/test/envelope.test.ts`.
    #[test]
    #[ignore]
    fn print_a_golden_receipt() {
        let secret = libsecp256k1::SecretKey::parse(&golden_secret()).unwrap();
        let public = libsecp256k1::PublicKey::from_secret_key(&secret).serialize_compressed();
        println!("GOLDEN_RECEIPT = {}", hex::encode(seal(&public, br#"{"receipt":"from the enclave"}"#).unwrap()));
    }

    const BROWSER_BLOB: &str = "0489219fc637d8a1518baec6b0690c9def2feac3cd016fbdcc66e1e91307645f1f5cb56e238b8ac5b8ae79103d1c1df79d8ea5c967b68a36c71761fda0f770ae50c25b3bed261b03f491636df0ceb5c6e3f1f5f54c44ef40911c41a36b1faec45360ff66ad2867d1dc032ed35f86b95613a111a8fac40aec44691beb531f";

    #[test]
    fn what_is_sealed_to_the_reply_key_opens_with_its_secret_only() {
        let (secret, public) = ecies::utils::generate_keypair();
        let (other, _) = ecies::utils::generate_keypair();
        let blob = seal(&public.serialize_compressed(), b"receipt").unwrap();
        assert_eq!(ecies::decrypt(&secret.serialize(), &blob).unwrap(), b"receipt");
        assert!(ecies::decrypt(&other.serialize(), &blob).is_err());
    }
}
