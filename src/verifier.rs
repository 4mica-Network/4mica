use crypto::bls::BlsPublicKey;
use sdk_4mica::{BLSCert, PaymentGuaranteeClaims};

pub trait CertificateValidator: Send + Sync {
    fn verify_certificate(&self, cert: &BLSCert) -> Result<PaymentGuaranteeClaims, String>;
}

pub struct CertificateVerifier {
    operator_public_key: BlsPublicKey,
    guarantee_domain: Option<[u8; 32]>,
}

impl CertificateVerifier {
    /// Fails if core's advertised operator key is not a valid BLS public key.
    ///
    /// Config only checks that the key is 48 bytes long; 48 bytes of the wrong thing is still not
    /// a curve point. Returning an error keeps a malformed public-params response a startup
    /// failure with a readable message rather than a panic in a constructor.
    pub fn try_new(
        operator_public_key: [u8; 48],
        guarantee_domain: Option<[u8; 32]>,
    ) -> Result<Self, String> {
        let operator_public_key = BlsPublicKey::from_bytes(&operator_public_key)
            .map_err(|err| format!("core advertised an invalid operator public key: {err}"))?;
        Ok(Self {
            operator_public_key,
            guarantee_domain,
        })
    }
}

impl CertificateValidator for CertificateVerifier {
    fn verify_certificate(&self, cert: &BLSCert) -> Result<PaymentGuaranteeClaims, String> {
        cert.verify(&self.operator_public_key)
            .map_err(|err| err.to_string())?;

        let claims = PaymentGuaranteeClaims::try_from(cert.claims().as_bytes())
            .map_err(|err| err.to_string())?;

        if let Some(expected_domain) = self.guarantee_domain
            && claims.domain != expected_domain
        {
            return Err(format!(
                "guarantee domain mismatch: got 0x{}, expected 0x{} for version {}",
                hex::encode(claims.domain),
                hex::encode(expected_domain),
                claims.version
            ));
        }

        Ok(claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crypto::bls::{KeyMaterial, Zeroizing};
    use rpc::GUARANTEE_CLAIMS_VERSION;
    use sdk_4mica::{PaymentGuaranteeClaims, U256};

    fn build_claims(domain: [u8; 32]) -> PaymentGuaranteeClaims {
        PaymentGuaranteeClaims {
            domain,
            user_address: "0x0000000000000000000000000000000000000001".into(),
            recipient_address: "0x0000000000000000000000000000000000000002".into(),
            cycle_id: U256::from(1u8),
            req_id: U256::from(1u8),
            amount: U256::from(10u8),
            asset_address: "0x0000000000000000000000000000000000000003".into(),
            timestamp: 123,
            version: GUARANTEE_CLAIMS_VERSION,
        }
    }

    fn build_cert(domain: [u8; 32]) -> (BLSCert, [u8; 48]) {
        let claims = build_claims(domain);
        let claims_bytes: Vec<u8> = claims.try_into().expect("encode claims");
        let key = KeyMaterial::from_bytes(Zeroizing::new(vec![1u8; 32])).expect("secret key");
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
    fn accepts_certificate_matching_the_active_domain() {
        let (cert, pubkey) = build_cert([2u8; 32]);
        let verifier = CertificateVerifier::try_new(pubkey, Some([2u8; 32])).expect("valid key");
        let claims = verifier.verify_certificate(&cert).expect("valid cert");
        assert_eq!(claims.version, GUARANTEE_CLAIMS_VERSION);
    }

    /// An unconfigured domain means "accept whatever core signed" — the BLS signature is still
    /// checked, only the domain binding is skipped.
    #[test]
    fn accepts_certificate_when_no_domain_is_configured() {
        let (cert, pubkey) = build_cert([0u8; 32]);
        let verifier = CertificateVerifier::try_new(pubkey, None).expect("valid key");
        let claims = verifier.verify_certificate(&cert).expect("valid cert");
        assert_eq!(claims.version, GUARANTEE_CLAIMS_VERSION);
    }

    /// Config only length-checks the operator key, so a core serving 48 bytes of anything reaches
    /// this constructor. It must surface as a startup error, not a panic.
    #[test]
    fn rejects_a_key_that_is_48_bytes_of_garbage() {
        let Err(err) = CertificateVerifier::try_new([0xAB; 48], None) else {
            panic!("0xAB repeated is not a curve point, so this must not construct");
        };
        assert!(
            err.contains("invalid operator public key"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn rejects_domain_mismatch() {
        let (cert, pubkey) = build_cert([0u8; 32]);
        let verifier = CertificateVerifier::try_new(pubkey, Some([1u8; 32])).expect("valid key");
        let err = verifier
            .verify_certificate(&cert)
            .expect_err("expected mismatch");
        assert!(
            err.contains("guarantee domain mismatch"),
            "unexpected error: {err}"
        );
    }
}
