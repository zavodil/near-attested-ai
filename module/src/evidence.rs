//! What the enclave establishes about one model exchange, from NEAR AI's
//! attestation report and response signature.
//!
//! Four checks, each recorded with its reason when it fails, none of them
//! stopping the run: the receipt is a statement of what was and was not
//! proven, and the browser runs every check again from the same material.
//!
//! | check | holds when |
//! |---|---|
//! | `quote` | the model's TDX quote verifies against Intel's collateral |
//! | `binding` | its report_data is `signing_address ‖ zero pad ‖ nonce`, the nonce being sha256 of the exact request bytes |
//! | `gpu` | NVIDIA's attestation service accepts the GPU evidence taken for that nonce |
//! | `signature` | `signature_kind` is `provider_tee`, the signed text is `model:sha256(request):sha256(response)`, and its EIP-191 signer is the attested address |

use crate::intel::{self, Collateral, QuoteCheck};
use crate::nearai::{Exchange, ModelAttestation, ResponseSignature};
use crate::nvidia::{self, GpuCheck};
use crate::{eip191, sha256_hex};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Check {
    pub ok: bool,
    pub error: Option<String>,
}

impl Check {
    fn from(result: Result<(), String>) -> Self {
        match result {
            Ok(()) => Check { ok: true, error: None },
            Err(e) => Check { ok: false, error: Some(e) },
        }
    }
}

#[derive(Debug, Serialize)]
pub struct Checks {
    pub quote: QuoteCheck,
    pub binding: Check,
    pub gpu: GpuCheck,
    pub signature: Check,
}

#[derive(Debug, Serialize)]
pub struct Evidence {
    /// The instance whose key signed the exchange.
    pub attestation: ModelAttestation,
    /// What the quote was verified against; absent when Intel could not be
    /// reached, and `collateral_error` says why.
    pub collateral: Option<Collateral>,
    pub collateral_error: Option<String>,
    pub checks: Checks,
}

pub fn collect(
    model: &str,
    nonce: &str,
    reports: Vec<ModelAttestation>,
    signature: Option<&ResponseSignature>,
    exchange: &Exchange,
    now: u64,
) -> Result<Evidence, String> {
    let attestation = pick(reports, signature)?;
    let quote = hex::decode(&attestation.intel_quote).map_err(|_| "the model's TDX quote is not hex".to_string())?;

    let (collateral, collateral_error, quote_check) = match intel::collateral_for(&quote) {
        Ok(c) => {
            let check = intel::verify(&quote, &c, now);
            (Some(c), None, check)
        }
        Err(e) => {
            let check = QuoteCheck {
                ok: false,
                tcb_status: None,
                advisory_ids: Vec::new(),
                report_data: None,
                error: Some(format!("not verified: {e}")),
            };
            (None, Some(e), check)
        }
    };
    let binding = Check::from(binding(&quote_check, &attestation, nonce));
    let gpu = nvidia::attest(&attestation.nvidia_payload, nonce);
    let signature = Check::from(signed(model, signature, &attestation, exchange));

    Ok(Evidence { attestation, collateral, collateral_error, checks: Checks { quote: quote_check, binding, gpu, signature } })
}

/// The instance whose signing key signed this exchange. Instances of a model
/// share a key, so this names the key, not the machine.
fn pick(reports: Vec<ModelAttestation>, signature: Option<&ResponseSignature>) -> Result<ModelAttestation, String> {
    let Some(signature) = signature else {
        return reports.into_iter().next().ok_or_else(|| "the attestation report names no instance".to_string());
    };
    let signer = signature.signing_address.to_ascii_lowercase();
    reports
        .into_iter()
        .find(|a| a.signing_address.to_ascii_lowercase() == signer && a.signing_algo == signature.signing_algo)
        .ok_or_else(|| format!("no attested instance holds the key that signed the answer ({signer})"))
}

fn binding(quote: &QuoteCheck, attestation: &ModelAttestation, nonce: &str) -> Result<(), String> {
    let Some(report_data) = quote.report_data.as_deref().filter(|_| quote.ok) else {
        return Err("not checked: the quote did not verify".to_string());
    };
    if attestation.request_nonce != nonce {
        return Err("the report was produced for another nonce".to_string());
    }
    let address = hex::decode(attestation.signing_address.trim_start_matches("0x"))
        .map_err(|_| "the attested signing address is not hex".to_string())?;
    if address.len() > 32 {
        return Err("the attested signing address is longer than 32 bytes".to_string());
    }
    let mut expected = address;
    expected.resize(32, 0);
    expected.extend(hex::decode(nonce).map_err(|_| "the nonce is not hex".to_string())?);
    if hex::encode(expected) != report_data {
        return Err("the quote's report_data is not the signing address and this request's nonce".to_string());
    }
    Ok(())
}

fn signed(
    model: &str,
    signature: Option<&ResponseSignature>,
    attestation: &ModelAttestation,
    exchange: &Exchange,
) -> Result<(), String> {
    let signature = signature.ok_or("the answer carries no signature")?;
    if signature.signature_kind.as_deref() != Some("provider_tee") {
        return Err(format!(
            "the signature is `{}`, not one made in the model's TEE",
            signature.signature_kind.as_deref().unwrap_or("of no stated kind")
        ));
    }
    let expected = format!("{model}:{}:{}", sha256_hex(&exchange.request), sha256_hex(&exchange.response));
    if signature.text != expected {
        return Err("the signed text is not this model and these exact request and response bytes".to_string());
    }
    let signer = eip191::recover(&signature.text, &signature.signature)?;
    if signer != attestation.signing_address.to_ascii_lowercase() {
        return Err(format!("the signature recovers to {signer}, not the attested {}", attestation.signing_address));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn attestation(address: &str, nonce: &str) -> ModelAttestation {
        ModelAttestation {
            model_name: "m".into(),
            signing_address: address.into(),
            signing_algo: "ecdsa".into(),
            request_nonce: nonce.into(),
            intel_quote: String::new(),
            nvidia_payload: String::new(),
            info: serde_json::Value::Null,
        }
    }

    fn verified(report_data: &str) -> QuoteCheck {
        QuoteCheck { ok: true, tcb_status: Some("UpToDate".into()), advisory_ids: vec![], report_data: Some(report_data.into()), error: None }
    }

    const ADDRESS: &str = "0x835ab53d20294ef795906dff21ae4c045336aa26";
    const NONCE: &str = "628e157108d4706845681bdc3a8d79f6d1aac921d45fd686bade9b7d44669f4d";

    /// The layout NEAR AI documents and a live report showed:
    /// address (20 bytes) ‖ 12 zero bytes ‖ nonce (32 bytes).
    #[test]
    fn report_data_binds_the_signing_address_and_the_nonce() {
        let report_data = format!("{}{}{NONCE}", &ADDRESS[2..], "0".repeat(24));
        assert!(binding(&verified(&report_data), &attestation(ADDRESS, NONCE), NONCE).is_ok());

        let other_nonce = "00".repeat(32);
        assert!(binding(&verified(&report_data), &attestation(ADDRESS, NONCE), &other_nonce).is_err());
        let other_address = "0x0000000000000000000000000000000000000001";
        assert!(binding(&verified(&report_data), &attestation(other_address, NONCE), NONCE).is_err());

        let unverified = QuoteCheck { ok: false, ..verified(&report_data) };
        assert!(binding(&unverified, &attestation(ADDRESS, NONCE), NONCE).unwrap_err().contains("not checked"));
    }

    #[test]
    fn the_instance_is_the_one_holding_the_signing_key() {
        let signature = ResponseSignature {
            text: String::new(),
            signature: String::new(),
            signing_address: ADDRESS.to_uppercase().replace("0X", "0x"),
            signing_algo: "ecdsa".into(),
            signature_kind: Some("provider_tee".into()),
        };
        let reports = vec![attestation("0x01", NONCE), attestation(ADDRESS, NONCE)];
        assert_eq!(pick(reports, Some(&signature)).unwrap().signing_address, ADDRESS);
        assert!(pick(vec![attestation("0x01", NONCE)], Some(&signature)).is_err());
    }

    #[test]
    fn a_gateway_signature_is_not_a_model_signature() {
        let exchange = Exchange { request: b"{}".to_vec(), response: b"{}".to_vec(), id: "x".into() };
        let signature = ResponseSignature {
            text: format!("{}:{}", sha256_hex(b"{}"), sha256_hex(b"{}")),
            signature: String::new(),
            signing_address: ADDRESS.into(),
            signing_algo: "ecdsa".into(),
            signature_kind: Some("gateway".into()),
        };
        let err = signed("m", Some(&signature), &attestation(ADDRESS, NONCE), &exchange).unwrap_err();
        assert!(err.contains("`gateway`"), "{err}");
    }
}
