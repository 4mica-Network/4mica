use std::str::FromStr;
use std::sync::Arc;

use alloy::primitives::B256;
use rpc::{
    PaymentGuaranteeClaims, PaymentGuaranteeRequest, PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV1, PaymentGuaranteeRequestClaimsV2,
};
use sdk_4mica::{Address, U256};
use serde_json::Map;
use thiserror::Error;

use crate::server::model::{
    PaymentRequirements, SettleRequest, SettleResponse, SupportedKind, VerifyRequest,
    VerifyResponse, X402PaymentPayload,
};
use crate::verifier::CertificateValidator;
use crate::{exact::ExactService, issuer::GuaranteeIssuer};

pub(super) type SharedState = Arc<AppState>;

pub(crate) struct AppState {
    four_mica: Vec<FourMicaHandler>,
    exact: Option<Arc<dyn ExactService>>,
}

impl AppState {
    pub fn new(four_mica: Vec<FourMicaHandler>, exact: Option<Arc<dyn ExactService>>) -> Self {
        Self { four_mica, exact }
    }

    pub fn network(&self) -> &str {
        self.four_mica
            .first()
            .map(|handler| handler.network())
            .unwrap_or("unknown")
    }

    pub fn validate_version(&self, version: u8) -> Result<(), ValidationError> {
        let four_mica_supports = self
            .four_mica
            .iter()
            .any(|handler| handler.supports_version(version));
        if !four_mica_supports && self.exact.is_none() {
            return Err(ValidationError::UnsupportedVersion(version));
        }
        Ok(())
    }

    fn handler_for(&self, scheme: &str, network: &str) -> Option<&FourMicaHandler> {
        self.four_mica
            .iter()
            .find(|handler| handler.matches(scheme, network))
    }

    pub async fn supported(&self) -> Vec<SupportedKind> {
        let mut kinds = Vec::new();
        for handler in &self.four_mica {
            kinds.extend(handler.supported_kinds());
        }
        if let Some(exact) = &self.exact {
            match exact.supported().await {
                Ok(list) => kinds.extend(list),
                Err(err) => tracing::warn!(reason = %err, "failed to fetch exact supported kinds"),
            }
        }
        kinds
    }

    pub async fn verify(
        &self,
        request: &VerifyRequest,
        x402_version: u8,
    ) -> Result<VerifyResponse, ValidationError> {
        let scheme = &request.payment_requirements.scheme;
        let network = &request.payment_requirements.network;

        if let Some(handler) = self.handler_for(scheme, network) {
            return handler.verify(request, x402_version).await;
        }

        if let Some(exact) = &self.exact {
            match exact.supported().await {
                Ok(kinds) => {
                    let matches_scheme = kinds.iter().any(|kind| &kind.scheme == scheme);
                    if kinds
                        .iter()
                        .any(|kind| &kind.scheme == scheme && &kind.network == network)
                    {
                        return exact.verify(request).await;
                    }
                    if matches_scheme {
                        return Err(ValidationError::UnsupportedNetwork(network.clone()));
                    }
                }
                Err(err) => tracing::warn!(reason = %err, "failed to fetch exact supported kinds"),
            }
        }

        if self
            .four_mica
            .iter()
            .any(|handler| &handler.scheme == scheme)
        {
            return Err(ValidationError::UnsupportedNetwork(network.clone()));
        }

        Err(ValidationError::UnsupportedScheme(scheme.clone()))
    }

    pub async fn settle(
        &self,
        request: &SettleRequest,
        x402_version: u8,
    ) -> Result<SettleResponse, ValidationError> {
        let scheme = &request.payment_requirements.scheme;
        let network = &request.payment_requirements.network;

        if let Some(handler) = self.handler_for(scheme, network) {
            return handler.settle(request, x402_version).await;
        }

        if let Some(exact) = &self.exact {
            match exact.supported().await {
                Ok(kinds) => {
                    let matches_scheme = kinds.iter().any(|kind| &kind.scheme == scheme);
                    if kinds
                        .iter()
                        .any(|kind| &kind.scheme == scheme && &kind.network == network)
                    {
                        return exact.settle(request).await;
                    }
                    if matches_scheme {
                        return Err(ValidationError::UnsupportedNetwork(network.clone()));
                    }
                }
                Err(err) => tracing::warn!(reason = %err, "failed to fetch exact supported kinds"),
            }
        }

        if self
            .four_mica
            .iter()
            .any(|handler| &handler.scheme == scheme)
        {
            return Err(ValidationError::UnsupportedNetwork(network.clone()));
        }

        Err(ValidationError::UnsupportedScheme(scheme.clone()))
    }
}

pub(crate) struct FourMicaHandler {
    scheme: String,
    network: String,
    verifier: Arc<dyn CertificateValidator>,
    issuer: Arc<dyn GuaranteeIssuer>,
    supported_versions: Vec<u8>,
    trusted_validation_registries: Vec<Address>,
}

impl FourMicaHandler {
    pub(crate) fn new(
        scheme: String,
        network: String,
        verifier: Arc<dyn CertificateValidator>,
        issuer: Arc<dyn GuaranteeIssuer>,
        supported_versions: Vec<u8>,
        trusted_validation_registries: Vec<String>,
    ) -> Self {
        Self {
            scheme,
            network,
            verifier,
            issuer,
            supported_versions,
            trusted_validation_registries: trusted_validation_registries
                .into_iter()
                .filter_map(|value| Address::from_str(&value).ok())
                .collect(),
        }
    }

    pub(crate) fn network(&self) -> &str {
        &self.network
    }

    fn matches(&self, scheme: &str, network: &str) -> bool {
        self.scheme == scheme && self.network == network
    }

    fn supports_version(&self, version: u8) -> bool {
        self.supported_versions.contains(&version)
    }

    fn supported_kinds(&self) -> Vec<SupportedKind> {
        self.supported_versions
            .iter()
            .copied()
            .map(|version| SupportedKind {
                scheme: self.scheme.clone(),
                network: self.network.clone(),
                x402_version: Some(version),
                extra: None,
            })
            .collect()
    }

    fn ensure_version_supported(&self, version: u8) -> Result<(), ValidationError> {
        if self.supports_version(version) {
            Ok(())
        } else {
            Err(ValidationError::UnsupportedVersion(version))
        }
    }

    async fn verify(
        &self,
        request: &VerifyRequest,
        x402_version: u8,
    ) -> Result<VerifyResponse, ValidationError> {
        self.ensure_version_supported(x402_version)?;
        let payload = self.decode_payment_payload(
            request.payment_payload.clone(),
            &request.payment_requirements,
        )?;
        self.validate_payment_payload(&payload, &request.payment_requirements, x402_version)?;

        Ok(VerifyResponse {
            is_valid: true,
            invalid_reason: None,
            certificate: None,
        })
    }

    async fn settle(
        &self,
        request: &SettleRequest,
        x402_version: u8,
    ) -> Result<SettleResponse, ValidationError> {
        self.ensure_version_supported(x402_version)?;
        let payload = self.decode_payment_payload(
            request.payment_payload.clone(),
            &request.payment_requirements,
        )?;
        self.validate_payment_payload(&payload, &request.payment_requirements, x402_version)?;

        let certificate: sdk_4mica::BLSCert = self
            .issuer
            .issue(payload.claims.clone(), payload.signature, payload.scheme)
            .await
            .map_err(ValidationError::IssueGuarantee)?;

        let claims = self
            .verifier
            .verify_certificate(&certificate)
            .map_err(ValidationError::InvalidCertificate)?;

        match &payload.claims {
            PaymentGuaranteeRequestClaims::V1(claims_request) => {
                self.ensure_certificate_matches_claims_v1(claims_request, &claims)?;
            }
            PaymentGuaranteeRequestClaims::V2(claims_request) => {
                self.ensure_certificate_matches_claims_v2(claims_request, &claims)?;
            }
        }

        tracing::info!(
            cycle_id = format!("{:#x}", claims.cycle_id),
            req_id = format!("{:#x}", claims.req_id),
            amount = format!("{:#x}", claims.amount),
            "4mica guarantee issued during settlement"
        );

        Ok(SettleResponse::four_mica_success(
            &self.network,
            certificate.into(),
        ))
    }

    fn decode_payment_payload(
        &self,
        payload: X402PaymentPayload,
        reqs: &PaymentRequirements,
    ) -> Result<PaymentGuaranteeRequest, ValidationError> {
        match payload {
            X402PaymentPayload::V1(envelope) => {
                if envelope.scheme != self.scheme {
                    return Err(ValidationError::UnsupportedScheme(envelope.scheme));
                }
                if reqs.scheme != self.scheme {
                    return Err(ValidationError::UnsupportedScheme(reqs.scheme.clone()));
                }
                if envelope.network != self.network {
                    return Err(ValidationError::UnsupportedNetwork(envelope.network));
                }
                if reqs.network != self.network {
                    return Err(ValidationError::UnsupportedNetwork(reqs.network.clone()));
                }

                let signature = envelope.payload.signature.trim();
                if signature.is_empty() {
                    return Err(ValidationError::InvalidHeader(
                        "signature cannot be empty".into(),
                    ));
                }

                Ok(envelope.payload)
            }
            X402PaymentPayload::V2(envelope) => {
                if envelope.accepted.scheme != self.scheme {
                    return Err(ValidationError::UnsupportedScheme(envelope.accepted.scheme));
                }
                if reqs.scheme != self.scheme {
                    return Err(ValidationError::UnsupportedScheme(reqs.scheme.clone()));
                }
                if envelope.accepted.network != self.network {
                    return Err(ValidationError::UnsupportedNetwork(
                        envelope.accepted.network,
                    ));
                }
                if reqs.network != self.network {
                    return Err(ValidationError::UnsupportedNetwork(reqs.network.clone()));
                }
                if envelope.payload.signature.trim().is_empty() {
                    return Err(ValidationError::InvalidHeader(
                        "signature cannot be empty".into(),
                    ));
                }

                Ok(envelope.payload)
            }
        }
    }

    fn validate_payment_payload(
        &self,
        payload: &PaymentGuaranteeRequest,
        reqs: &PaymentRequirements,
        version: u8,
    ) -> Result<(), ValidationError> {
        match &payload.claims {
            PaymentGuaranteeRequestClaims::V1(claims) => {
                tracing::debug!(
                    req_id = format!("{:#x}", claims.req_id),
                    amount = format!("{:#x}", claims.amount),
                    "Decoded 4mica claims"
                );
                self.ensure_claims_v1_match_requirements(claims, reqs, version)?;
            }
            PaymentGuaranteeRequestClaims::V2(claims) => {
                tracing::debug!(
                    req_id = format!("{:#x}", claims.req_id),
                    amount = format!("{:#x}", claims.amount),
                    validation_request_hash = %claims.validation_policy.validation_request_hash,
                    "Decoded 4mica V2 claims"
                );
                self.ensure_claims_v2_match_requirements(claims, reqs, version)?;
            }
        }
        Ok(())
    }

    fn ensure_claims_v1_match_requirements(
        &self,
        claims: &PaymentGuaranteeRequestClaimsV1,
        reqs: &PaymentRequirements,
        version: u8,
    ) -> Result<(), ValidationError> {
        let required_pay_to = Address::from_str(&reqs.pay_to)
            .map_err(|_| ValidationError::InvalidRequirements("invalid payTo address".into()))?;
        let claim_recipient = Address::from_str(&claims.recipient_address).map_err(|_| {
            ValidationError::InvalidClaims("invalid recipient address in claims".into())
        })?;

        if claim_recipient != required_pay_to {
            return Err(ValidationError::Mismatch(format!(
                "claim recipient {} does not match payTo {}",
                claim_recipient, required_pay_to
            )));
        }

        let required_asset = Address::from_str(&reqs.asset)
            .map_err(|_| ValidationError::InvalidRequirements("invalid asset address".into()))?;
        let claim_asset = Address::from_str(&claims.asset_address).map_err(|_| {
            ValidationError::InvalidClaims("invalid asset address in claims".into())
        })?;

        if claim_asset != required_asset {
            return Err(ValidationError::Mismatch(format!(
                "claim asset {} does not match requirement {}",
                claim_asset, required_asset
            )));
        }

        let amount_required = required_amount(reqs, version)?;
        if claims.amount.is_zero() {
            return Err(ValidationError::InvalidClaims(
                "claim amount is zero".into(),
            ));
        }
        if claims.amount != amount_required {
            let amount_label = if version == 2 {
                "amount"
            } else {
                "maxAmountRequired"
            };
            return Err(ValidationError::Mismatch(format!(
                "claim amount {} does not match {} {}",
                claims.amount, amount_label, amount_required
            )));
        }

        Ok(())
    }

    fn ensure_certificate_matches_claims_v1(
        &self,
        request: &PaymentGuaranteeRequestClaimsV1,
        issued: &PaymentGuaranteeClaims,
    ) -> Result<(), ValidationError> {
        let request_recipient = Address::from_str(&request.recipient_address).map_err(|_| {
            ValidationError::InvalidClaims("invalid recipient address in requested claims".into())
        })?;
        let issued_recipient = Address::from_str(&issued.recipient_address).map_err(|_| {
            ValidationError::InvalidCertificate(
                "invalid recipient address in issued certificate".into(),
            )
        })?;
        let request_asset = Address::from_str(&request.asset_address).map_err(|_| {
            ValidationError::InvalidClaims("invalid asset address in requested claims".into())
        })?;
        let issued_asset = Address::from_str(&issued.asset_address).map_err(|_| {
            ValidationError::InvalidCertificate(
                "invalid asset address in issued certificate".into(),
            )
        })?;
        let request_user = Address::from_str(&request.user_address).map_err(|_| {
            ValidationError::InvalidClaims("invalid user address in requested claims".into())
        })?;
        let issued_user = Address::from_str(&issued.user_address).map_err(|_| {
            ValidationError::InvalidCertificate("invalid user address in issued certificate".into())
        })?;

        if issued.req_id != request.req_id
            || issued.amount != request.amount
            || issued_recipient != request_recipient
            || issued_asset != request_asset
            || issued_user != request_user
        {
            return Err(ValidationError::Mismatch(
                "certificate values differ from requested claims".into(),
            ));
        }
        Ok(())
    }

    fn ensure_claims_v2_match_requirements(
        &self,
        claims: &PaymentGuaranteeRequestClaimsV2,
        reqs: &PaymentRequirements,
        version: u8,
    ) -> Result<(), ValidationError> {
        claims
            .validate()
            .map_err(|err| ValidationError::InvalidClaims(err.to_string()))?;

        let base = PaymentGuaranteeRequestClaimsV1 {
            user_address: claims.user_address.clone(),
            recipient_address: claims.recipient_address.clone(),
            req_id: claims.req_id,
            amount: claims.amount,
            asset_address: claims.asset_address.clone(),
            timestamp: claims.timestamp,
        };
        self.ensure_claims_v1_match_requirements(&base, reqs, version)?;

        let reqs_extra = requirements_extra(reqs)?;
        let validation_registry = parse_required_address_field(
            reqs_extra,
            "validationRegistryAddress",
            "validation_registry_address",
        )?;
        if claims.validation_policy.validation_registry_address != validation_registry {
            return Err(ValidationError::Mismatch(format!(
                "validation registry {} does not match requirement {}",
                claims.validation_policy.validation_registry_address, validation_registry
            )));
        }
        if !self
            .trusted_validation_registries
            .contains(&claims.validation_policy.validation_registry_address)
        {
            return Err(ValidationError::Mismatch(format!(
                "validation registry {} is not trusted by core metadata",
                claims.validation_policy.validation_registry_address
            )));
        }

        let expected_network_chain_id =
            caip2_chain_id(&reqs.network).map_err(ValidationError::InvalidRequirements)?;
        if claims.validation_policy.validation_chain_id != expected_network_chain_id {
            return Err(ValidationError::Mismatch(format!(
                "validation chain id {} does not match payment network {}",
                claims.validation_policy.validation_chain_id, reqs.network
            )));
        }

        let validator_address =
            parse_required_address_field(reqs_extra, "validatorAddress", "validator_address")?;
        if claims.validation_policy.validator_address != validator_address {
            return Err(ValidationError::Mismatch(format!(
                "validator address {} does not match requirement {}",
                claims.validation_policy.validator_address, validator_address
            )));
        }

        let validator_agent_id =
            parse_required_u256_field(reqs_extra, "validatorAgentId", "validator_agent_id")?;
        if claims.validation_policy.validator_agent_id != validator_agent_id {
            return Err(ValidationError::Mismatch(format!(
                "validator agent id {} does not match requirement {}",
                claims.validation_policy.validator_agent_id, validator_agent_id
            )));
        }

        let min_validation_score =
            parse_required_u8_field(reqs_extra, "minValidationScore", "min_validation_score")?;
        if claims.validation_policy.min_validation_score != min_validation_score {
            return Err(ValidationError::Mismatch(format!(
                "min validation score {} does not match requirement {}",
                claims.validation_policy.min_validation_score, min_validation_score
            )));
        }

        let job_hash = parse_required_b256_field(reqs_extra, "jobHash", "job_hash")?;
        if claims.validation_policy.job_hash != job_hash {
            return Err(ValidationError::Mismatch(format!(
                "job hash '{}' does not match requirement '{}'",
                claims.validation_policy.job_hash, job_hash
            )));
        }

        let required_validation_tag = parse_optional_string_field(
            reqs_extra,
            "requiredValidationTag",
            "required_validation_tag",
        )
        .unwrap_or_default();
        if claims.validation_policy.required_validation_tag != required_validation_tag {
            return Err(ValidationError::Mismatch(format!(
                "required validation tag '{}' does not match requirement '{}'",
                claims.validation_policy.required_validation_tag, required_validation_tag
            )));
        }

        Ok(())
    }

    fn ensure_certificate_matches_claims_v2(
        &self,
        request: &PaymentGuaranteeRequestClaimsV2,
        issued: &PaymentGuaranteeClaims,
    ) -> Result<(), ValidationError> {
        self.ensure_certificate_matches_claims_v1(
            &PaymentGuaranteeRequestClaimsV1 {
                user_address: request.user_address.clone(),
                recipient_address: request.recipient_address.clone(),
                req_id: request.req_id,
                amount: request.amount,
                asset_address: request.asset_address.clone(),
                timestamp: request.timestamp,
            },
            issued,
        )?;

        let issued_policy = issued.validation_policy.as_ref().ok_or_else(|| {
            ValidationError::Mismatch("issued certificate is missing V2 validation policy".into())
        })?;

        if issued_policy != &request.validation_policy {
            return Err(ValidationError::Mismatch(
                "certificate validation policy differs from requested claims".into(),
            ));
        }

        Ok(())
    }
}

pub fn resolve_x402_version(
    payment_payload: &X402PaymentPayload,
    request_version: Option<u8>,
) -> Result<u8, ValidationError> {
    let payload_version = payment_payload.x402_version();

    if let Some(request_version) = request_version
        && request_version != payload_version
    {
        return Err(ValidationError::InvalidHeader(format!(
            "x402Version {} does not match paymentPayload x402Version {}",
            request_version, payload_version
        )));
    }

    Ok(payload_version)
}

fn parse_u256_field(value: &str, field: &str) -> Result<U256, String> {
    if value.is_empty() {
        return Err(format!("{field} cannot be empty"));
    }
    if let Some(rest) = value.strip_prefix("0x") {
        U256::from_str_radix(rest, 16).map_err(|err| format!("invalid hex amount: {err}"))
    } else {
        U256::from_str_radix(value, 10).map_err(|err| format!("invalid decimal amount: {err}"))
    }
}

fn parse_u256(value: &str) -> Result<U256, String> {
    parse_u256_field(value, "maxAmountRequired")
}

fn required_amount(reqs: &PaymentRequirements, version: u8) -> Result<U256, ValidationError> {
    match version {
        1 => parse_u256(&reqs.max_amount_required).map_err(ValidationError::InvalidRequirements),
        2 => {
            let amount = reqs.amount.as_deref().ok_or_else(|| {
                ValidationError::InvalidRequirements("amount is required for x402Version 2".into())
            })?;
            parse_u256_field(amount, "amount").map_err(ValidationError::InvalidRequirements)
        }
        _ => Err(ValidationError::UnsupportedVersion(version)),
    }
}

fn requirements_extra(
    reqs: &PaymentRequirements,
) -> Result<&Map<String, serde_json::Value>, ValidationError> {
    reqs.extra
        .as_ref()
        .and_then(serde_json::Value::as_object)
        .ok_or_else(|| {
            ValidationError::InvalidRequirements(
                "extra is required and must be an object for x402Version 2".into(),
            )
        })
}

fn extra_value<'a>(
    extra: &'a Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Option<&'a serde_json::Value> {
    extra.get(camel).or_else(|| extra.get(snake))
}

fn parse_required_address_field(
    extra: &Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Result<Address, ValidationError> {
    let value = extra_value(extra, camel, snake)
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            ValidationError::InvalidRequirements(format!("{camel} is required for x402Version 2"))
        })?;
    Address::from_str(value)
        .map_err(|_| ValidationError::InvalidRequirements(format!("invalid {camel} address")))
}

fn parse_required_u64_field(
    extra: &Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Result<u64, ValidationError> {
    let value = extra_value(extra, camel, snake).ok_or_else(|| {
        ValidationError::InvalidRequirements(format!("{camel} is required for x402Version 2"))
    })?;
    if let Some(number) = value.as_u64() {
        return Ok(number);
    }
    let raw = value
        .as_str()
        .ok_or_else(|| ValidationError::InvalidRequirements(format!("invalid {camel}")))?;
    raw.parse::<u64>()
        .map_err(|_| ValidationError::InvalidRequirements(format!("invalid {camel}")))
}

fn parse_required_u8_field(
    extra: &Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Result<u8, ValidationError> {
    let value = parse_required_u64_field(extra, camel, snake)?;
    u8::try_from(value)
        .map_err(|_| ValidationError::InvalidRequirements(format!("invalid {camel}")))
}

fn parse_required_u256_field(
    extra: &Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Result<U256, ValidationError> {
    let value = extra_value(extra, camel, snake).ok_or_else(|| {
        ValidationError::InvalidRequirements(format!("{camel} is required for x402Version 2"))
    })?;
    if let Some(raw) = value.as_str() {
        return parse_u256_field(raw, camel).map_err(ValidationError::InvalidRequirements);
    }
    if let Some(number) = value.as_u64() {
        return Ok(U256::from(number));
    }
    Err(ValidationError::InvalidRequirements(format!(
        "invalid {camel}"
    )))
}

fn parse_required_b256_field(
    extra: &Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Result<B256, ValidationError> {
    let value = extra_value(extra, camel, snake)
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| {
            ValidationError::InvalidRequirements(format!("{camel} is required for x402Version 2"))
        })?;
    B256::from_str(value)
        .map_err(|_| ValidationError::InvalidRequirements(format!("invalid {camel}")))
}

fn parse_optional_string_field(
    extra: &Map<String, serde_json::Value>,
    camel: &str,
    snake: &str,
) -> Option<String> {
    extra_value(extra, camel, snake)
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
}

fn caip2_chain_id(network: &str) -> Result<u64, String> {
    let (_, chain_id) = network
        .split_once(':')
        .ok_or_else(|| format!("invalid CAIP-2 network identifier: {network}"))?;
    chain_id
        .parse::<u64>()
        .map_err(|_| format!("invalid CAIP-2 chain id in network {network}"))
}

#[derive(Debug, Error)]
pub enum ValidationError {
    #[error("{0}")]
    InvalidHeader(String),
    #[error("{0}")]
    InvalidRequirements(String),
    #[error("{0}")]
    InvalidClaims(String),
    #[error("{0}")]
    InvalidCertificate(String),
    #[error("{0}")]
    IssueGuarantee(String),
    #[error("{0}")]
    Mismatch(String),
    #[error("unsupported scheme {0}")]
    UnsupportedScheme(String),
    #[error("unsupported network {0}")]
    UnsupportedNetwork(String),
    #[error("unsupported x402Version {0}")]
    UnsupportedVersion(u8),
    #[error("exact flow error: {0}")]
    Exact(String),

    #[error(transparent)]
    Other(anyhow::Error),
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn payment_payload_v1() -> X402PaymentPayload {
        serde_json::from_value(json!({
            "x402Version": 1,
            "scheme": "4mica-credit",
            "network": "eip155:11155111",
            "payload": {
                "claims": {
                    "version": "v1",
                    "user_address": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    "recipient_address": "0x1111111111111111111111111111111111111111",
                    "tab_id": "0x1",
                    "req_id": "0x0",
                    "amount": "0xa",
                    "asset_address": "0x2222222222222222222222222222222222222222",
                    "timestamp": 1
                },
                "signature": "0x1111",
                "scheme": "eip712"
            }
        }))
        .expect("deserialize payload")
    }

    fn sample_requirements() -> PaymentRequirements {
        PaymentRequirements {
            scheme: "4mica-credit".into(),
            network: "eip155:11155111".into(),
            max_amount_required: "10".into(),
            amount: None,
            resource: None,
            description: None,
            mime_type: None,
            output_schema: None,
            pay_to: "0x1111111111111111111111111111111111111111".into(),
            max_timeout_seconds: None,
            asset: "0x2222222222222222222222222222222222222222".into(),
            extra: None,
        }
    }

    #[test]
    fn resolve_x402_version_accepts_payload_version_when_absent() {
        let payload = payment_payload_v1();
        let version = resolve_x402_version(&payload, None).expect("version");
        assert_eq!(version, 1);
    }

    #[test]
    fn resolve_x402_version_rejects_mismatch() {
        let payload = payment_payload_v1();
        let err = resolve_x402_version(&payload, Some(2)).expect_err("expected mismatch");
        assert!(
            err.to_string()
                .contains("does not match paymentPayload x402Version"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn required_amount_uses_max_amount_for_v1() {
        let mut req = sample_requirements();
        req.max_amount_required = "0x0a".into();
        let amount = required_amount(&req, 1).expect("amount");
        assert_eq!(amount, U256::from(10u8));
    }

    #[test]
    fn required_amount_requires_amount_for_v2() {
        let mut req = sample_requirements();
        req.amount = None;
        let err = required_amount(&req, 2).expect_err("expected missing amount");
        assert!(
            err.to_string()
                .contains("amount is required for x402Version 2"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn required_amount_parses_decimal_for_v2() {
        let mut req = sample_requirements();
        req.amount = Some("12".into());
        let amount = required_amount(&req, 2).expect("amount");
        assert_eq!(amount, U256::from(12u8));
    }

    #[test]
    fn parse_u256_field_rejects_empty_values() {
        let err = parse_u256_field("", "amount").expect_err("expected empty value failure");
        assert_eq!(err, "amount cannot be empty");
    }
}
