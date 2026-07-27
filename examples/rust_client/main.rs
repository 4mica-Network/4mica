use std::env;
use std::io::ErrorKind;

use alloy::signers::local::PrivateKeySigner;
use anyhow::{Context, Result};
use dotenvy::from_filename;
use reqwest::StatusCode;
use rpc::PaymentGuaranteeRequestClaims as RpcPaymentGuaranteeRequestClaims;
use sdk_4mica::{ConfigBuilder, U256, X402Flow, x402::PaymentRequirements};
use serde::Deserialize;

fn load_env_files() {
    for path in ["examples/.env", ".env"] {
        if let Err(err) = from_filename(path)
            && !matches!(&err, dotenvy::Error::Io(io_err) if io_err.kind() == ErrorKind::NotFound)
        {
            eprintln!("warning: failed to load {path}: {err}");
        };
    }
}

fn env_var(key: &str) -> Result<String> {
    env::var(key).with_context(|| format!("missing env {key}"))
}

async fn request_server_and_fetch_payment_requirements(
    resource_url: &str,
) -> anyhow::Result<PaymentRequirements> {
    #[derive(Debug, Clone, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ResourceResponse {
        pub accepts: Vec<PaymentRequirements>,
    }

    let response = reqwest::get(resource_url).await?;

    if response.status() == StatusCode::PAYMENT_REQUIRED {
        let body: ResourceResponse = response.json().await?;
        body.accepts
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No payment requirements found"))
    } else {
        Err(anyhow::anyhow!(
            "Expected 402 status, got {}",
            response.status()
        ))
    }
}

async fn request_server_with_payment_header(
    resource_url: &str,
    payment_header: &str,
) -> anyhow::Result<serde_json::Value> {
    let client = reqwest::Client::new();
    let response = client
        .get(resource_url)
        .header("X-PAYMENT", payment_header)
        .send()
        .await
        .context("failed to send request")?;
    response
        .json()
        .await
        .context("failed to parse JSON response")
}

#[tokio::main]
async fn main() -> Result<()> {
    load_env_files();

    let payer_key = env_var("PAYER_KEY")?;
    let user_address = env_var("USER_ADDRESS")?;
    let resource_url = env_var("RESOURCE_URL")?;
    let asset_address = env_var("ASSET_ADDRESS")?;

    println!("--- x402 / 4mica flow ---");
    println!("1) Discover 402 + accepted requirements from the resource");
    println!("2) Sign payment claims locally");
    println!(
        "3) Retry the resource with X-PAYMENT using the header below (server will handle verify/settle)\n"
    );

    let signer: PrivateKeySigner = payer_key.parse().context("invalid payer private key")?;
    let config = ConfigBuilder::default()
        .signer(signer)
        .build()
        .context("invalid SDK config")?;
    let core = sdk_4mica::Client::new(config)
        .await
        .context("failed to init 4mica core client")?;

    // If you need to prime collateral on-chain, uncomment the block below:
    // let one_unit = U256::from(1_000_000u64);
    // println!("Approving allowance for the 4mica contract...");
    // let approve_receipt = core
    //     .user
    //     .approve_erc20(asset_address.clone(), one_unit)
    //     .await
    //     .context("failed to approve asset")?;
    // println!(
    //     "Approval tx hash: 0x{}",
    //     hex::encode(approve_receipt.transaction_hash)
    // );
    //
    // println!("Depositing collateral...");
    // let deposit_receipt = core
    //     .user
    //     .deposit(one_unit, Some(asset_address.clone()))
    //     .await
    //     .context("failed to deposit asset")?;
    // println!(
    //     "Deposit tx hash: 0x{}",
    //     hex::encode(deposit_receipt.transaction_hash)
    // );

    // Request payment requirements from the resource server
    let payment_requirements = request_server_and_fetch_payment_requirements(&resource_url).await?;

    let flow = X402Flow::new(core)?;

    // Prepare the payment requirements and signature. The resource server will call
    // /verify and /settle; the client only needs to attach the X-PAYMENT header.
    let payment: sdk_4mica::x402::X402SignedPayment = flow
        .sign_payment(payment_requirements, user_address)
        .await
        .context("failed to prepare payment")?;

    let (payment_asset, payment_req_id, actual_amount) = match &payment.payload.claims {
        RpcPaymentGuaranteeRequestClaims::V1(claims) => {
            (claims.asset_address.as_str(), claims.req_id, claims.amount)
        }
        RpcPaymentGuaranteeRequestClaims::V2(claims) => {
            (claims.asset_address.as_str(), claims.req_id, claims.amount)
        }
    };
    println!("Payment asset address: {payment_asset}");
    println!("Payment reqId: {:#x}", payment_req_id);

    // Sanity checks against the desired USDC flow.
    if !payment_asset.eq_ignore_ascii_case(&asset_address) {
        eprintln!(
            "warning: claims.asset_address ({payment_asset}) does not match ASSET_ADDRESS ({asset_address})"
        );
    }

    // Expect 0.0001 units (100 base units) if your resource advertises that price.
    let expected_amount = U256::from(100u64);
    if actual_amount != expected_amount {
        eprintln!(
            "warning: claims.amount is {} (expected 100 base units)",
            actual_amount
        );
    }

    println!("X-PAYMENT header:\n{}\n", payment.header);

    println!("Requesting resource server with X-PAYMENT header...");
    let response = request_server_with_payment_header(&resource_url, &payment.header).await?;
    println!("Response from resource server:\n{:#?}", response);

    Ok(())
}
