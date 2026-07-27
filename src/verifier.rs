use std::fmt::Write;

use crypto::bls::BlsPublicKey;
use sdk_4mica::{BLSCert, PaymentGuaranteeClaims};

pub trait CertificateValidator: Send + Sync {
    fn verify_certificate(&self, cert: &BLSCert) -> Result<PaymentGuaranteeClaims, String>;
}

pub struct CertificateVerifier {
    operator_public_key: BlsPublicKey,
    guarantee_domain: Option<[u8; 32]>,
    legacy_v1_guarantee_domain: Option<[u8; 32]>,
}

impl CertificateVerifier {
    pub fn new(
        operator_public_key: [u8; 48],
        guarantee_domain: Option<[u8; 32]>,
        legacy_v1_guarantee_domain: Option<[u8; 32]>,
    ) -> Self {
        Self {
            operator_public_key: BlsPublicKey::from_bytes(&operator_public_key)
                .expect("validated operator public key"),
            guarantee_domain,
            legacy_v1_guarantee_domain,
        }
    }

    fn expected_domain_for_version(&self, version: u64) -> Option<[u8; 32]> {
        if version == 1 {
            return self.legacy_v1_guarantee_domain;
        }
        self.guarantee_domain
    }
}

impl CertificateValidator for CertificateVerifier {
    fn verify_certificate(&self, cert: &BLSCert) -> Result<PaymentGuaranteeClaims, String> {
        cert.verify(&self.operator_public_key)
            .map_err(|err| err.to_string())?;

        let claims = PaymentGuaranteeClaims::try_from(cert.claims().as_bytes())
            .map_err(|err| err.to_string())?;

        if let Some(expected_domain) = self.expected_domain_for_version(claims.version)
            && claims.domain != expected_domain
        {
            let got = format_domain_hex(claims.domain);
            let expected = format_domain_hex(expected_domain);
            return Err(format!(
                "guarantee domain mismatch: got {got}, expected {expected} for version {}",
                claims.version
            ));
        }

        Ok(claims)
    }
}

fn format_domain_hex(domain: [u8; 32]) -> String {
    let mut domain_hex = String::from("0x");
    for byte in domain {
        write!(&mut domain_hex, "{byte:02x}").unwrap();
    }
    domain_hex
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{Address, B256};
    use crypto::bls::KeyMaterial;
    use rpc::{
        PaymentGuaranteeValidationPolicyV2, compute_validation_request_hash,
        compute_validation_subject_hash,
    };
    use sdk_4mica::{PaymentGuaranteeClaims, U256};

    fn build_claims(domain: [u8; 32], version: u64) -> PaymentGuaranteeClaims {
        let user_address = "0x0000000000000000000000000000000000000001";
        let recipient_address = "0x0000000000000000000000000000000000000002";
        let asset_address = "0x0000000000000000000000000000000000000003";
        let req_id = U256::from(1u8);
        let amount = U256::from(10u8);
        let timestamp = 123;

        let validation_policy = if version >= 2 {
            let subject_hash = compute_validation_subject_hash(
                user_address,
                recipient_address,
                req_id,
                amount,
                asset_address,
                timestamp,
            )
            .expect("subject hash");

            let mut policy = PaymentGuaranteeValidationPolicyV2 {
                validation_registry_address: Address::from_slice(&[0x11; 20]),
                validation_request_hash: B256::ZERO,
                validation_chain_id: 84532,
                validator_address: Address::from_slice(&[0x22; 20]),
                validator_agent_id: U256::from(1u8),
                min_validation_score: 80,
                validation_subject_hash: B256::from(subject_hash),
                required_validation_tag: String::new(),
                job_hash: B256::repeat_byte(0xAA),
            };
            policy.validation_request_hash =
                B256::from(compute_validation_request_hash(&policy).expect("request hash"));
            Some(policy)
        } else {
            None
        };

        PaymentGuaranteeClaims {
            domain,
            user_address: user_address.into(),
            recipient_address: recipient_address.into(),
            cycle_id: U256::from(1u8),
            req_id,
            amount,
            asset_address: asset_address.into(),
            timestamp,
            version,
            validation_policy,
        }
    }

    fn build_cert(domain: [u8; 32], version: u64) -> (BLSCert, [u8; 48]) {
        let claims = build_claims(domain, version);
        let claims_bytes: Vec<u8> = claims.try_into().expect("encode claims");
        let key = KeyMaterial::from_bytes(&[1u8; 32]).expect("secret key");
        let cert = BLSCert::sign(&key, claims_bytes.into()).expect("build cert");
        let pubkey: [u8; 48] = key
            .public_key()
            .as_bytes()
            .to_vec()
            .try_into()
            .expect("48-byte key");
        (cert, pubkey)
    }

    #[test]
    fn accepts_v1_matching_legacy_domain() {
        let (cert, pubkey) = build_cert([0u8; 32], 1);
        let verifier = CertificateVerifier::new(pubkey, Some([1u8; 32]), Some([0u8; 32]));
        let claims = verifier.verify_certificate(&cert).expect("valid cert");
        assert_eq!(claims.version, 1);
    }

    #[test]
    fn accepts_v1_when_legacy_domain_is_unavailable() {
        let (cert, pubkey) = build_cert([0u8; 32], 1);
        let verifier = CertificateVerifier::new(pubkey, Some([1u8; 32]), None);
        let claims = verifier.verify_certificate(&cert).expect("valid cert");
        assert_eq!(claims.version, 1);
    }

    #[test]
    fn accepts_v2_matching_active_domain() {
        let (cert, pubkey) = build_cert([2u8; 32], 2);
        let verifier = CertificateVerifier::new(pubkey, Some([2u8; 32]), Some([1u8; 32]));
        let claims = verifier.verify_certificate(&cert).expect("valid cert");
        assert_eq!(claims.version, 2);
    }

    #[test]
    fn rejects_v2_domain_mismatch() {
        let (cert, pubkey) = build_cert([0u8; 32], 2);
        let verifier = CertificateVerifier::new(pubkey, Some([1u8; 32]), Some([0u8; 32]));
        let err = verifier
            .verify_certificate(&cert)
            .expect_err("expected mismatch");
        assert!(
            err.contains("guarantee domain mismatch"),
            "unexpected error: {err}"
        );
    }
}
