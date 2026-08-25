use std::{
    sync::{Arc, Mutex},
    time::{Duration, SystemTime},
};

use alloy::signers::{Signer, local::PrivateKeySigner};
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::Mutex as AsyncMutex;

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("invalid auth URL: {0}")]
    InvalidUrl(String),
    #[error("invalid wallet private key: {0}")]
    InvalidKey(String),
    #[error("auth request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("failed to decode auth response: {0}")]
    Decode(#[from] serde_json::Error),
    #[error("auth server returned {status}: {message}")]
    Api { status: StatusCode, message: String },
    #[error("auth state error: {0}")]
    Internal(String),
    #[error("signing error: {0}")]
    Signing(String),
}

#[derive(Debug, Clone)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthNonceResponse {
    pub nonce: String,
    pub siwe: SiweTemplate,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiweTemplate {
    pub domain: String,
    pub uri: String,
    pub chain_id: u64,
    pub statement: String,
    pub expiration: String,
    pub issued_at: String,
}

#[derive(Clone, Debug)]
pub struct AuthClient {
    client: Client,
    base_url: Url,
}

impl AuthClient {
    pub fn new(base_url: Url) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    pub async fn get_nonce(&self, address: &str) -> Result<AuthNonceResponse, AuthError> {
        let body = AuthNonceRequest {
            address: address.to_string(),
        };
        self.post_json("/auth/nonce", &body).await
    }

    pub async fn verify(
        &self,
        address: &str,
        message: &str,
        signature: &str,
    ) -> Result<AuthTokens, AuthError> {
        let body = AuthVerifyRequest {
            address: address.to_string(),
            message: message.to_string(),
            signature: signature.to_string(),
        };
        let res: AuthTokenResponse = self.post_json("/auth/verify", &body).await?;
        Ok(res.into())
    }

    pub async fn refresh(&self, refresh_token: &str) -> Result<AuthTokens, AuthError> {
        let body = AuthRefreshRequest {
            refresh_token: refresh_token.to_string(),
        };
        let res: AuthTokenResponse = self.post_json("/auth/refresh", &body).await?;
        Ok(res.into())
    }

    fn url(&self, path: &str) -> Result<Url, AuthError> {
        self.base_url
            .join(path)
            .map_err(|err| AuthError::InvalidUrl(err.to_string()))
    }

    async fn post_json<Req, Resp>(&self, path: &str, body: &Req) -> Result<Resp, AuthError>
    where
        Req: Serialize + ?Sized,
        Resp: for<'de> Deserialize<'de>,
    {
        let url = self.url(path)?;
        let response = self.client.post(url).json(body).send().await?;
        let status = response.status();
        let bytes = response.bytes().await?;
        if status.is_success() {
            let value = serde_json::from_slice(&bytes)?;
            Ok(value)
        } else {
            let message = parse_error_message(&bytes);
            Err(AuthError::Api { status, message })
        }
    }
}

#[derive(Clone)]
pub struct AuthSession {
    client: AuthClient,
    signer: PrivateKeySigner,
    address: String,
    refresh_margin: Duration,
    state: Arc<Mutex<Option<AuthState>>>,
    refresh_lock: Arc<AsyncMutex<()>>,
}

impl AuthSession {
    pub fn try_new(
        auth_url: Url,
        wallet_private_key: &str,
        refresh_margin_secs: u64,
    ) -> Result<Self, AuthError> {
        let signer = wallet_private_key
            .parse::<PrivateKeySigner>()
            .map_err(|err| AuthError::InvalidKey(err.to_string()))?;
        let address = signer.address().to_string();
        Ok(Self {
            client: AuthClient::new(auth_url),
            signer,
            address,
            refresh_margin: Duration::from_secs(refresh_margin_secs),
            state: Arc::new(Mutex::new(None)),
            refresh_lock: Arc::new(AsyncMutex::new(())),
        })
    }

    pub async fn access_token(&self) -> Result<String, AuthError> {
        if let Some(token) = self.cached_access_token()? {
            return Ok(token);
        }

        let _guard = self.refresh_lock.lock().await;

        if let Some(token) = self.cached_access_token()? {
            return Ok(token);
        }

        let refresh_token = self.refresh_token()?;
        let tokens = if let Some(refresh_token) = refresh_token {
            match self.refresh_with_token(&refresh_token).await {
                Ok(tokens) => tokens,
                Err(AuthError::Api { status, .. }) if status == StatusCode::UNAUTHORIZED => {
                    self.login_locked().await?
                }
                Err(err) => return Err(err),
            }
        } else {
            self.login_locked().await?
        };
        Ok(tokens.access_token)
    }

    fn cached_access_token(&self) -> Result<Option<String>, AuthError> {
        let state = self.lock_state()?;
        if let Some(state) = state.as_ref()
            && !state.is_expiring(self.refresh_margin)
        {
            return Ok(Some(state.access_token.clone()));
        }
        Ok(None)
    }

    fn refresh_token(&self) -> Result<Option<String>, AuthError> {
        let state = self.lock_state()?;
        Ok(state.as_ref().map(|state| state.refresh_token.clone()))
    }

    fn store_tokens(&self, tokens: &AuthTokens) -> Result<(), AuthError> {
        let mut state = self.lock_state()?;
        let expires_at = compute_expires_at(tokens.expires_in)?;
        *state = Some(AuthState {
            access_token: tokens.access_token.clone(),
            refresh_token: tokens.refresh_token.clone(),
            expires_at,
        });
        Ok(())
    }

    fn lock_state(&self) -> Result<std::sync::MutexGuard<'_, Option<AuthState>>, AuthError> {
        self.state
            .lock()
            .map_err(|_| AuthError::Internal("auth state lock poisoned".into()))
    }

    async fn perform_login(&self) -> Result<AuthTokens, AuthError> {
        let nonce = self.client.get_nonce(&self.address).await?;
        let message = build_siwe_message(&nonce.siwe, &self.address, &nonce.nonce);
        let signature = self
            .signer
            .sign_message(message.as_bytes())
            .await
            .map_err(|err| AuthError::Signing(err.to_string()))?;
        let signature_hex = format!("0x{}", hex::encode(Vec::<u8>::from(signature)));
        self.client
            .verify(&self.address, &message, &signature_hex)
            .await
    }

    async fn login_locked(&self) -> Result<AuthTokens, AuthError> {
        let tokens = self.perform_login().await?;
        self.store_tokens(&tokens)?;
        Ok(tokens)
    }

    async fn refresh_with_token(&self, refresh_token: &str) -> Result<AuthTokens, AuthError> {
        let tokens = self.client.refresh(refresh_token).await?;
        self.store_tokens(&tokens)?;
        Ok(tokens)
    }
}

#[derive(Debug, Clone)]
struct AuthState {
    access_token: String,
    refresh_token: String,
    expires_at: SystemTime,
}

impl AuthState {
    fn is_expiring(&self, margin: Duration) -> bool {
        let now = SystemTime::now();
        match now.checked_add(margin) {
            Some(deadline) => self.expires_at <= deadline,
            None => true,
        }
    }
}

fn compute_expires_at(expires_in: u64) -> Result<SystemTime, AuthError> {
    let now = SystemTime::now();
    let ttl = Duration::from_secs(expires_in);
    now.checked_add(ttl)
        .ok_or_else(|| AuthError::Internal("token expires_at overflow".into()))
}

fn build_siwe_message(template: &SiweTemplate, address: &str, nonce: &str) -> String {
    format!(
        "{domain} wants you to sign in with your Ethereum account:\n{address}\n\n{statement}\n\nURI: {uri}\nVersion: 1\nChain ID: {chain_id}\nNonce: {nonce}\nIssued At: {issued_at}\nExpiration Time: {expiration}",
        domain = template.domain,
        address = address,
        statement = template.statement,
        uri = template.uri,
        chain_id = template.chain_id,
        nonce = nonce,
        issued_at = template.issued_at,
        expiration = template.expiration,
    )
}

fn parse_error_message(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return "unknown error".to_string();
    }

    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) {
        if let Some(msg) = value.get("error").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
        if let Some(msg) = value.get("message").and_then(|v| v.as_str()) {
            return msg.to_string();
        }
    }

    match std::str::from_utf8(bytes) {
        Ok(text) if !text.trim().is_empty() => text.trim().to_string(),
        _ => "unknown error".to_string(),
    }
}

#[derive(Debug, Serialize)]
struct AuthNonceRequest {
    address: String,
}

#[derive(Debug, Serialize)]
struct AuthVerifyRequest {
    address: String,
    message: String,
    signature: String,
}

#[derive(Debug, Serialize)]
struct AuthRefreshRequest {
    refresh_token: String,
}

#[derive(Debug, Deserialize)]
struct AuthTokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

impl From<AuthTokenResponse> for AuthTokens {
    fn from(value: AuthTokenResponse) -> Self {
        Self {
            access_token: value.access_token,
            refresh_token: value.refresh_token,
            expires_in: value.expires_in,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_error_message_prefers_error() {
        let message =
            parse_error_message(json!({ "error": "invalid nonce" }).to_string().as_bytes());
        assert_eq!(message, "invalid nonce");
    }

    #[test]
    fn parse_error_message_uses_message_fallback() {
        let message = parse_error_message(
            json!({ "message": "signature invalid" })
                .to_string()
                .as_bytes(),
        );
        assert_eq!(message, "signature invalid");
    }

    #[test]
    fn build_siwe_message_includes_critical_fields() {
        let template = SiweTemplate {
            domain: "api.4mica.xyz".into(),
            uri: "https://api.4mica.xyz".into(),
            chain_id: 11155111,
            statement: "Sign this message".into(),
            expiration: "2030-01-01T00:00:00Z".into(),
            issued_at: "2026-01-01T00:00:00Z".into(),
        };
        let message = build_siwe_message(&template, "0xabc", "nonce-1");

        assert!(message.contains("api.4mica.xyz wants you to sign in"));
        assert!(message.contains("0xabc"));
        assert!(message.contains("URI: https://api.4mica.xyz"));
        assert!(message.contains("Chain ID: 11155111"));
        assert!(message.contains("Nonce: nonce-1"));
        assert!(message.contains("Expiration Time: 2030-01-01T00:00:00Z"));
    }

    #[test]
    fn compute_expires_at_rejects_overflow() {
        let err = compute_expires_at(u64::MAX).expect_err("should overflow");
        assert!(
            matches!(err, AuthError::Internal(_)),
            "unexpected error: {err}"
        );
    }
}
