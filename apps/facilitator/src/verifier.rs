use alloy::hex;
use alloy::primitives::Signature;
use alloy::sol_types::Eip712Domain;
use rpc::PaymentRequest;
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

/// Checks that `request` is signed by the payer it names, under the ClearingHouse `domain`.
///
/// Mirrors core's check, including its canonical-form rule (`v` of 27 or 28, low `s`): core
/// refuses anything else at `/settle`, so accepting it here would only move the refusal to after
/// the seller has served the resource.
pub fn verify_payer_signature(
    request: &PaymentRequest,
    domain: &Eip712Domain,
) -> Result<(), String> {
    let payload = &request.payload;
    let payer = payload
        .user_address()
        .parse::<Address>()
        .map_err(|_| format!("invalid payer address {}", payload.user_address()))?;
    let digest = payload
        .signing_digest(domain)
        .map_err(|err| err.to_string())?;

    let bytes = hex::decode(&request.signature).map_err(|_| "signature is not hex".to_string())?;
    let signature = Signature::try_from(bytes.as_slice())
        .map_err(|_| "signature must be 65 bytes".to_string())?;
    if !matches!(bytes[64], 27 | 28) {
        return Err("signature v must be 27 or 28".into());
    }
    if signature.normalize_s().is_some() {
        return Err("signature s must be in the lower half of the curve order".into());
    }

    let signer = signature
        .recover_address_from_prehash(&digest)
        .map_err(|_| "signature does not recover to an address".to_string())?;
    if signer != payer {
        return Err(format!("payment is signed by {signer}, not payer {payer}"));
    }
    Ok(())
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

    fn clearing_house() -> Eip712Domain {
        rpc::clearing_house_domain(11155111, Address::repeat_byte(0x04))
    }

    fn payment_from(payer: Address) -> PaymentRequestPayload {
        payment_for(payer, 10)
    }

    fn payment_for(payer: Address, amount: u32) -> PaymentRequestPayload {
        PaymentRequestPayload::new(
            payer.to_string(),
            "0x0000000000000000000000000000000000000002".into(),
            B256::repeat_byte(0x11),
            U256::from(1u8),
            U256::from(amount),
            1_700_000_000,
            Some("0x0000000000000000000000000000000000000003".into()),
            B256::repeat_byte(0x22),
        )
    }

    fn signed_by(signer: &PrivateKeySigner, payload: PaymentRequestPayload) -> PaymentRequest {
        let digest = payload.signing_digest(&clearing_house()).expect("digest");
        let signature = signer.sign_hash_sync(&digest).expect("sign");
        PaymentRequest::new(payload, hex::encode_prefixed(signature.as_bytes()))
    }

    #[test]
    fn accepts_a_payment_signed_by_its_payer() {
        let payer = PrivateKeySigner::random();
        let request = signed_by(&payer, payment_from(payer.address()));

        verify_payer_signature(&request, &clearing_house()).expect("the payer's signature");
    }

    #[test]
    fn rejects_a_payment_signed_by_someone_else() {
        let payer = PrivateKeySigner::random();
        let request = signed_by(&PrivateKeySigner::random(), payment_from(payer.address()));

        let err = verify_payer_signature(&request, &clearing_house())
            .expect_err("another key's signature must not verify");
        assert!(err.contains("not payer"), "unexpected error: {err}");
    }

    #[test]
    fn rejects_a_payment_signed_for_another_clearing_house() {
        let payer = PrivateKeySigner::random();
        let request = signed_by(&payer, payment_from(payer.address()));
        let elsewhere = rpc::clearing_house_domain(11155111, Address::repeat_byte(0x09));

        verify_payer_signature(&request, &elsewhere)
            .expect_err("another ClearingHouse's domain must not verify");
    }

    #[test]
    fn rejects_a_payment_altered_after_signing() {
        let payer = PrivateKeySigner::random();
        let signed = signed_by(&payer, payment_from(payer.address()));
        let request = PaymentRequest::new(payment_for(payer.address(), 1_000), signed.signature);

        verify_payer_signature(&request, &clearing_house())
            .expect_err("a signature over different terms must not verify");
    }

    #[test]
    fn rejects_junk_signatures() {
        let payer = PrivateKeySigner::random();
        let payload = payment_from(payer.address());
        for junk in ["", "0x1111", "not hex", &format!("0x{}", "11".repeat(65))] {
            let request = PaymentRequest::new(payload.clone(), junk.to_string());
            verify_payer_signature(&request, &clearing_house())
                .expect_err(&format!("{junk:?} must not verify"));
        }
    }

    /// Core only accepts `v` of 27 or 28, so the 0/1 form a valid key can also produce is refused.
    #[test]
    fn rejects_a_non_canonical_recovery_id() {
        let payer = PrivateKeySigner::random();
        let request = signed_by(&payer, payment_from(payer.address()));
        let mut bytes = hex::decode(&request.signature).unwrap();
        bytes[64] -= 27;
        let request = PaymentRequest::new(request.payload, hex::encode_prefixed(bytes));

        let err = verify_payer_signature(&request, &clearing_house())
            .expect_err("v of 0/1 must not verify");
        assert!(
            err.contains("v must be 27 or 28"),
            "unexpected error: {err}"
        );
    }
}
