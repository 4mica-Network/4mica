import type { Metadata } from "next";
import Link from "next/link";
import CodeTabs from "../CodeTabs";

export const metadata: Metadata = {
  title: "Paying with 4Mica",
  description:
    "A payer-first guide to funding collateral, signing 4Mica payment headers, and settling tabs on-chain with v2 validation-gated guarantees.",
};

export default function PayingWith4MicaPage() {
  const sections = [
    {
      heading: "Executive Summary",
      paragraphs: [
        "This guide is for payers and agents who want to consume paid resources using 4Mica credit.",
        "You fund collateral once, receive 402 requirements, sign a payment header (`X-PAYMENT` for v1, `PAYMENT-SIGNATURE` for v2), and later settle the tab on-chain. Recipients get a certificate immediately, so work can be delivered without waiting on chain.",
        "When a route uses V2 guarantees, default-time remuneration is allowed only after the linked ERC-8004 validation request passes (for example using wachai-validation-sdk status checks).",
      ],
    },
    {
      heading: "V1 vs V2: What Changes for Payers",
      bullets: [
        "V1: sign standard guarantee claims and settle tab on-chain as usual.",
        "V2: sign claims that include validation policy commitments generated from `paymentRequirements.extra`.",
        "Settlement request/response remains the same (`/verify`, `/settle`), but V2 certificates are validation-gated only when default remuneration is attempted.",
        "Both versions stay available; payers do not lose V1 compatibility.",
      ],
    },
    {
      heading: "Switching from x402 Debit to 4Mica Credit",
      paragraphs: [
        "If a resource migrates from an x402 debit facilitator to the 4Mica credit facilitator, the flow changes from immediate on-chain payment to credit-backed guarantees.",
      ],
      steps: [
        'Expect `paymentRequirements.scheme = "4mica-credit"` (or another scheme containing "4mica") plus `extra.tabEndpoint` in the 402 response.',
        "If the endpoint enforces V2, expect validation fields in `paymentRequirements.extra`: `validationRegistryAddress`, `validatorAddress`, `validatorAgentId`, `minValidationScore`, `validationChainId`, and `jobHash` (optional `requiredValidationTag`). `validationChainId` must match `network` (`eip155:<chainId>`).",
        "Deposit collateral before your first credit request; the facilitator refuses tabs for empty balances.",
        "Use the 4Mica SDK X402Flow to sign the guarantee and produce the payment header (`X-PAYMENT` for v1, `PAYMENT-SIGNATURE` for v2).",
        "Retry the request with the payment header, then pay the tab later using the `req_id` from the certificate.",
        "Keep your old debit path as a fallback if the scheme is not 4mica.",
      ],
    },
    {
      heading: "What You Need",
      bullets: [
        "A wallet private key with collateral available (ETH or ERC20).",
        "The recipient endpoint you want to call.",
        "Access to a 4Mica network: Ethereum Sepolia (https://ethereum.sepolia.api.4mica.xyz/) or Base Sepolia (https://base.sepolia.api.4mica.xyz/).",
        'A 402 response that advertises `scheme: "4mica-credit"` and `extra.tabEndpoint`.',
      ],
    },
    {
      heading: "Step 1: Fund Collateral (Payer SDK)",
      paragraphs: [
        "Credit requires collateral in the Core4Mica vault. Deposit once per asset and reuse the same collateral for multiple tabs.",
        "For ERC20 assets, approve first, then deposit.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Deposit collateral (TypeScript SDK)",
          code: `import { Client, ConfigBuilder } from "@4mica/sdk";

const cfg = new ConfigBuilder()
  .network(process.env["4MICA_NETWORK"] ?? "base-sepolia")
  .walletPrivateKey(process.env.PAYER_KEY!)
  .build();

const client = await Client.new(cfg);

// ETH deposit
await client.user.deposit(10_000n);

// ERC20 flow (approve then deposit)
// const token = "0xTokenAddress";
// await client.user.approveErc20(token, 1_000_000n);
// await client.user.deposit(1_000_000n, token);

await client.aclose();`,
        },
        {
          language: "python",
          caption: "Deposit collateral (Python SDK)",
          code: `import asyncio
from fourmica_sdk import Client, ConfigBuilder

PAYER_KEY = "0x..."

async def main():
    cfg = (
        ConfigBuilder()
        .network("base-sepolia")
        .wallet_private_key(PAYER_KEY)
        .build()
    )
    client = await Client.new(cfg)
    try:
        # ETH deposit
        await client.user.deposit(10_000)

        # ERC20 flow (approve then deposit)
        # token = "0xTokenAddress"
        # await client.user.approve_erc20(token, 1_000_000)
        # await client.user.deposit(1_000_000, token)
    finally:
        await client.aclose()

asyncio.run(main())`,
        },
        {
          language: "rust",
          caption: "Deposit collateral (Rust SDK)",
          code: `use alloy::signers::local::PrivateKeySigner;
use sdk_4mica::{Client, ConfigBuilder, U256};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let signer: PrivateKeySigner = std::env::var("PAYER_KEY")?.parse()?;

    let client = Client::new(
        ConfigBuilder::default()
            .rpc_url("https://base.sepolia.api.4mica.xyz/".to_string())
            .signer(signer)
            .build()?,
    )
    .await?;

    // ETH deposit
    client.user.deposit(U256::from(10_000u64), None).await?;

    // ERC20 flow (approve then deposit)
    // let token = "0xTokenAddress".to_string();
    // client.user.approve_erc20(token.clone(), U256::from(1_000_000u64)).await?;
    // client.user.deposit(U256::from(1_000_000u64), Some(token)).await?;

    Ok(())
}`,
        },
      ],
    },
    {
      heading: "Step 2: Parse 402 Requirements & Select 4Mica Credit",
      paragraphs: [
        "Make the request without payment to receive a 402 response. Then parse the requirements and ensure the scheme is 4mica credit.",
        "For V2 accepted payloads, verify the required validation fields are present in `requirements.extra` before signing.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Parse requirements (TypeScript SDK)",
          code: `import type { PaymentRequirementsV1 } from "@4mica/sdk";

const requirements = reqRaw as PaymentRequirementsV1; // from 402 response
if (!requirements.scheme.includes("4mica")) {
  throw new Error("Unsupported scheme; expected 4mica credit.");
}`,
        },
        {
          language: "python",
          caption: "Parse requirements (Python SDK)",
          code: `from fourmica_sdk import PaymentRequirements

requirements = PaymentRequirements.from_raw(req_raw)
if "4mica" not in requirements.scheme:
    raise ValueError("Unsupported scheme; expected 4mica credit.")`,
        },
        {
          language: "rust",
          caption: "Parse requirements (Rust SDK)",
          code: `use sdk_4mica::x402::PaymentRequirements;

let requirements: PaymentRequirements = serde_json::from_value(req_raw)?;
if !requirements.scheme.to_lowercase().contains("4mica") {
    anyhow::bail!("Unsupported scheme; expected 4mica credit.");
}`,
        },
      ],
    },
    {
      heading: "Step 3: Sign the Payment Header (Payer SDK)",
      paragraphs: [
        "Use the SDK to build and sign the payment guarantee. The SDK automatically calls the tabEndpoint to refresh the tab and returns a base64 payment header.",
        "If the V2 validation fields are present, SDKs sign V2 claims and compute canonical `validationSubjectHash` + `validationRequestHash`; otherwise they sign V1.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Sign payment header (TypeScript SDK)",
          code: `import { Client, ConfigBuilder, X402Flow } from "@4mica/sdk";

const cfg = new ConfigBuilder()
  .network(process.env["4MICA_NETWORK"] ?? "base-sepolia")
  .walletPrivateKey(process.env.PAYER_KEY!)
  .build();

const client = await Client.new(cfg);
const flow = X402Flow.fromClient(client);

// requirements from Step 2
const payment = await flow.signPayment(requirements, "0xUserAddress");
const xPaymentHeader = payment.header;

await client.aclose();`,
        },
        {
          language: "python",
          caption: "Sign payment header (Python SDK)",
          code: `import asyncio
from fourmica_sdk import Client, ConfigBuilder, X402Flow

PAYER_KEY = "0x..."
USER_ADDRESS = "0x..."

async def main():
    cfg = (
        ConfigBuilder()
        .network("base-sepolia")
        .wallet_private_key(PAYER_KEY)
        .build()
    )
    client = await Client.new(cfg)
    flow = X402Flow.from_client(client)

    # requirements from Step 2
    payment = await flow.sign_payment(requirements, USER_ADDRESS)
    x_payment_header = payment.header

    await client.aclose()

asyncio.run(main())`,
        },
        {
          language: "rust",
          caption: "Sign payment header (Rust SDK)",
          code: `use alloy::signers::local::PrivateKeySigner;
use sdk_4mica::{Client, ConfigBuilder, X402Flow};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let signer: PrivateKeySigner = std::env::var("PAYER_KEY")?.parse()?;

    let client = Client::new(
        ConfigBuilder::default()
            .rpc_url("https://base.sepolia.api.4mica.xyz/".to_string())
            .signer(signer)
            .build()?,
    )
    .await?;

    let flow = X402Flow::new(client)?;
    // requirements: PaymentRequirements from Step 2
    let signed = flow
        .sign_payment(requirements, std::env::var("USER_ADDRESS")?)
        .await?;

    let x_payment_header = signed.header; // send as X-PAYMENT header
    Ok(())
}`,
        },
      ],
    },
    {
      heading: "Step 4: Retry the Request with the Payment Header",
      paragraphs: [
        "Retry the same request with the payment header. The recipient will call /verify and /settle and then serve the response.",
        "For V2 flows, `/settle` returns a certificate that carries validation policy fields; it does not by itself prove the job result.",
      ],
    },
    {
      heading: "Step 5: Pay the Tab On-Chain (Payer SDK)",
      paragraphs: [
        "After receiving the response, settle the tab on-chain using the req_id in the certificate.",
        "This unlocks collateral and keeps your account healthy for future requests.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Pay the tab (TypeScript SDK)",
          code: `const receipt = await client.user.payTab(
  tabId,
  reqId,          // from certificate
  amountWei,
  recipientAddress,
  undefined       // or ERC20 token address
);`,
        },
        {
          language: "python",
          caption: "Pay the tab (Python SDK)",
          code: `await client.user.pay_tab(
    tab_id=tab_id,
    req_id=req_id,          # from certificate
    amount=amount_wei,
    recipient_address=recipient_address,
    erc20_token=None,
)`,
        },
        {
          language: "rust",
          caption: "Pay the tab (Rust SDK)",
          code: `use sdk_4mica::U256;

// req_id comes from the certificate returned by /settle
client
    .user
    .pay_tab(tab_id, req_id, U256::from(amount_wei), recipient_address, None)
    .await?;`,
        },
      ],
    },
    {
      heading: "Optional: Settle via the Facilitator (SDK helper)",
      paragraphs: [
        "If a recipient delegates settlement to the payer (less common), you can call the facilitator /settle endpoint using the SDK.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Settle with the facilitator (TypeScript SDK)",
          code: `const settled = await flow.settlePayment(
  payment,
  requirements,
  "https://x402.4mica.xyz"
);

const certificate = settled.settlement;`,
        },
        {
          language: "python",
          caption: "Settle with the facilitator (Python SDK)",
          code: `settled = await flow.settle_payment(
    payment,
    requirements,
    facilitator_url="https://x402.4mica.xyz/"
)

certificate = settled.settlement`,
        },
        {
          language: "rust",
          caption: "Settle with the facilitator (Rust SDK)",
          code: `let settled = flow
    .settle_payment(payment, requirements, "https://x402.4mica.xyz")
    .await?;

let certificate = settled.settlement;`,
        },
      ],
    },
    {
      heading: "Handle 402 Responses in Client Code",
      steps: [
        "Call the resource and check for HTTP 402.",
        "Parse paymentRequirements and confirm the scheme is 4mica credit (fallback to debit if not).",
        "Sign the payment header with the SDK (it calls tabEndpoint internally).",
        "Retry the request with that header.",
        "If 402 returns again, surface the error and refresh the tab.",
      ],
    },
    {
      heading: "Operational Tips",
      bullets: [
        "Track tab TTL and settle before expiry (default 21 days) to avoid remuneration.",
        "If unpaid, recipients can remunerate after the grace period (default 14 days). For V2, this only succeeds after matching ERC-8004 validation status exists on-chain.",
        "Always use the req_id from the certificate, not a cached value.",
        "Reuse collateral across tabs, but monitor balances if you issue many guarantees.",
        "If you rotate keys, create fresh tabs to avoid mismatched user addresses.",
      ],
    },
    {
      heading: "Why This Works",
      paragraphs: [
        "Credit lets you access services instantly while keeping settlement on-chain and enforceable. The certificate is the cryptographic bridge between off-chain delivery and on-chain repayment, and V2 adds validation-gated remuneration for “pay only if validated” integrations.",
      ],
    },
  ];

  return (
    <div className="min-h-screen pt-20 pb-24 text-ink-body">
      <div className="container mx-auto max-w-4xl px-6">
        <header className="mb-12 text-center">
          <p className="section-kicker">Payer Guide</p>
          <h1 className="section-title mb-4">
            Paying with 4Mica: Credit, Tabs, and Settlement
          </h1>
          <p className="text-ink-muted text-sm">
            Published January 29, 2026 · 10 min read · By Mairon
          </p>
        </header>

        <article className="glass-panel space-y-10 rounded-2xl p-8">
          {sections.map((section) => (
            <section key={section.heading} className="space-y-4">
              <h2 className="font-bold text-2xl text-ink-strong">
                {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="text-ink-body leading-relaxed">
                  {paragraph}
                </p>
              ))}

              {section.steps && (
                <ol className="list-inside list-decimal space-y-2 text-ink-body">
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}

              {section.bullets && (
                <ul className="list-inside list-disc space-y-2 text-ink-body">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}

              {section.codeBlocks && <CodeTabs blocks={section.codeBlocks} />}
            </section>
          ))}
        </article>

        <footer className="mt-12 flex flex-col items-center justify-between gap-4 text-ink-muted text-sm md:flex-row">
          <Link
            href="/resources/blog"
            className="link-accent cursor-pointer whitespace-nowrap"
          >
            ← Back to Blog
          </Link>
          <span>Last updated: January 29, 2026</span>
        </footer>
      </div>
    </div>
  );
}
