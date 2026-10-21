use alloy::sol_types::Eip712Domain;
use sdk_4mica::{Address, Guarantee, GuaranteeReceipt, verify_guarantee_receipt};

pub trait ReceiptValidator: Send + Sync {
    fn verify_receipt(&self, receipt: &GuaranteeReceipt) -> Result<Guarantee, String>;
}

/// Accepts receipts signed by the guarantee signer core names, under the GuaranteeRegistry domain.
pub struct ReceiptVerifier {
    domain: Eip712Domain,
    signer: Address,
}

impl ReceiptVerifier {
    pub fn new(domain: Eip712Domain, signer: Address) -> Self {
        Self { domain, signer }
    }
}

impl ReceiptValidator for ReceiptVerifier {
    fn verify_receipt(&self, receipt: &GuaranteeReceipt) -> Result<Guarantee, String> {
        verify_guarantee_receipt(receipt, &self.domain, self.signer).map_err(|err| err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{B256, U256};
    use alloy::signers::SignerSync;
    use alloy::signers::local::PrivateKeySigner;
    use rpc::{PaymentRequestPayload, guarantee_registry_domain};

    fn domain() -> Eip712Domain {
        guarantee_registry_domain(11155111, Address::repeat_byte(0x02))
    }

    fn receipt_signed_by(signer: &PrivateKeySigner) -> GuaranteeReceipt {
        let payload = PaymentRequestPayload::new(
            "0x0000000000000000000000000000000000000001".into(),
            "0x0000000000000000000000000000000000000002".into(),
            B256::repeat_byte(0x11),
            U256::from(1u8),
            U256::from(10u8),
            1_700_000_000,
            Some("0x0000000000000000000000000000000000000003".into()),
            B256::repeat_byte(0x22),
        );
        let guarantee = Guarantee::from_payment(&payload, U256::from(0x11u8)).expect("guarantee");
        let signature = signer
            .sign_hash_sync(&guarantee.signing_digest(&domain()))
            .expect("sign");
        GuaranteeReceipt::new(
            &guarantee,
            alloy::hex::encode_prefixed(signature.as_bytes()),
        )
    }

    #[test]
    fn accepts_a_receipt_from_the_guarantee_signer() {
        let operator = PrivateKeySigner::random();
        let verifier = ReceiptVerifier::new(domain(), operator.address());

        let guarantee = verifier
            .verify_receipt(&receipt_signed_by(&operator))
            .expect("the operator's receipt must verify");
        assert_eq!(guarantee.version(), 1);
    }

    #[test]
    fn rejects_a_receipt_from_anyone_else() {
        let verifier = ReceiptVerifier::new(domain(), PrivateKeySigner::random().address());

        let err = verifier
            .verify_receipt(&receipt_signed_by(&PrivateKeySigner::random()))
            .expect_err("a receipt from another key must not verify");
        assert!(err.contains("signed by"), "unexpected error: {err}");
    }

    #[test]
    fn rejects_a_receipt_signed_for_another_registry() {
        let operator = PrivateKeySigner::random();
        let elsewhere = guarantee_registry_domain(11155111, Address::repeat_byte(0x09));
        let verifier = ReceiptVerifier::new(elsewhere, operator.address());

        verifier
            .verify_receipt(&receipt_signed_by(&operator))
            .expect_err("another registry's domain must not verify");
    }
}
