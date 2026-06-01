import type { Metadata } from "next";
import Link from "next/link";
import CodeTabs from "../CodeTabs";

export const metadata: Metadata = {
  title: "Getting paid using 4Mica",
  description:
    "A deep dive into the 4Mica credit flow, x402 integration, and v2 validation-gated remuneration paths",
};

export default function How4MicaWorksPage() {
  const inlineCodeClass =
    "rounded bg-white/10 px-1.5 py-0.5 font-mono text-sm text-amber-300";
  const getInlinePartKey = (part: string, idx: number) => `${part}-${idx % 2}`;
  const renderInlineCode = (text: string) => {
    const parts = text.split("`");
    if (parts.length === 1) {
      return text;
    }

    return (
      <>
        {parts.map((part, idx) =>
          idx % 2 === 1 ? (
            <code
              key={`code-${getInlinePartKey(part, idx)}`}
              className={inlineCodeClass}
            >
              {part}
            </code>
          ) : (
            <span key={`text-${getInlinePartKey(part, idx)}`}>{part}</span>
          ),
        )}
      </>
    );
  };

  const renderInlineCodeOrNode = (value: React.ReactNode) =>
    typeof value === "string" ? renderInlineCode(value) : value;

  const sections = [
    {
      heading: "Executive Summary",
      paragraphs: [
        "4Mica is a cryptographic credit system for web3. It lets a payer consume a service immediately while settlement happens later. Recipients get a guarantee that is enforceable on-chain if the payer defaults. Payers keep collateral productive in the vault, earning yield and giving credit to the payers; recipients get payout protection.",
        "This post explains how to accept payments using 4Mica, including V2 guarantees where remuneration is gated by ERC-8004 validation status (for example via 8004 ValidationRegistry and wachai-validation-sdk).",
      ],
    },
    {
      heading: "V1 vs V2: Quick Difference",
      bullets: [
        "V1: standard credit guarantee. If payer defaults, recipient can remunerate after grace period and before tab expiry.",
        "V2: same credit flow plus signed validation policy fields (registry, validator, agent, score threshold, optional tag).",
        "V2 enables 8004 verification: remunerate only succeeds when ERC-8004 validation status matches the signed policy.",
        "Both versions are supported; version is derived from the signed claims payload.",
      ],
    },
    {
      heading: "System Map: Who Does What",
      paragraphs: [
        "A 4Mica transaction is a choreography between five actors:",
      ],
      bullets: [
        <>
          <strong>Payer (AI agents, users):</strong> Have collateral in the
          vault which backs their credit, then settle on-chain before the tab
          expires (default 21 days). Earn yield on the collateral.
        </>,
        <>
          <strong>Recipient (resource server):</strong> serves protected APIs
          that require payments. Responsible for configurating the tabs (ttl,
          asset), verify user credit, ask for credit guarantees, and in case of
          defaults, initiate the settlement process.
        </>,
        <>
          <strong>Facilitator:</strong> This is any x402 facilitator, integrated
          with 4Mica. Responsible for providing payment information for the
          4Mica credit flow.
        </>,
        <>
          <strong>4Mica Operators:</strong> Where the magic happens. Minting
          tabs, issuing guarantees, and managing the overall credit flow.
        </>,
        <>
          <strong>Vault:</strong> Where agents deposit collateral to back their
          credit. It holds custody; withdrawals are requested first and can be
          finalized after the withdrawal grace period (default 22 days) once
          outstanding credit is handled.
        </>,
      ],
    },
    {
      heading: "x402 Primer: HTTP 402 + Payment Requirements",
      paragraphs: [
        "x402 is an open, HTTP-native payment standard. It activates HTTP 402 Payment Required so a resource can advertise how it wants to be paid, then lets the client retry the same request with a payment header.",
        "In the 4Mica credit flow, the x402 scheme string is `4mica-credit` and the client sends a versioned payment header: `X-PAYMENT` for v1, `PAYMENT-SIGNATURE` for v2 (both are base64 JSON envelopes). The resource server delegates verification and settlement to the x402-4mica facilitator.",
      ],
      bullets: [
        "402 responses advertise `scheme`, `network`, `payTo`, `asset`, `maxAmountRequired` (v1) or `amount` (v2), and `extra.tabEndpoint`.",
        "For v2, `paymentRequirements.extra` should include `validationRegistryAddress`, `validatorAddress`, `validatorAgentId`, `minValidationScore`, `validationChainId`, and `jobHash` (plus optional `requiredValidationTag`). `validationChainId` must match `network` (`eip155:<chainId>`).",
        "Clients retry with the payment header (`X-PAYMENT` for v1, `PAYMENT-SIGNATURE` for v2); resources call `/verify` for structural checks and `/settle` to obtain a certificate.",
        "If the header is missing or invalid, return 402 again with the same requirements and an actionable error.",
      ],
    },
    {
      heading: "Concept Glossary",
      paragraphs: [
        "Here are the key primitives you will see across the docs and SDKs:",
      ],
      bullets: [
        <>
          <strong>Tab:</strong> Line of credit between payer and recipient for a
          specific asset.
        </>,
        <>
          <strong>paymentRequirements:</strong> the x402 payload the recipient
          advertises in a 402 response (
          <code className={inlineCodeClass}>scheme</code>,{" "}
          <code className={inlineCodeClass}>network</code>,{" "}
          <code className={inlineCodeClass}>payTo</code>,{" "}
          <code className={inlineCodeClass}>asset</code>,{" "}
          <code className={inlineCodeClass}>maxAmountRequired</code>).
        </>,
        <>
          <strong>tabEndpoint:</strong> a recipient-owned endpoint listed in{" "}
          <code className={inlineCodeClass}>
            paymentRequirements.extra.tabEndpoint
          </code>
          . The payer calls it to bind requirements to a wallet and receive a
          tab.
        </>,
        <>
          <strong>PaymentGuaranteeRequestClaims:</strong> the signed request
          from the payer (<code className={inlineCodeClass}>tab_id</code>,{" "}
          <code className={inlineCodeClass}>recipient</code>,{" "}
          <code className={inlineCodeClass}>asset</code>,{" "}
          <code className={inlineCodeClass}>amount</code>,{" "}
          <code className={inlineCodeClass}>timestamp</code>). V2 extends this
          with a validation policy.
        </>,
        <>
          <strong>Payment header:</strong> the base64 header wrapping the signed
          claims (<code className={inlineCodeClass}>X-PAYMENT</code> for v1,{" "}
          <code className={inlineCodeClass}>PAYMENT-SIGNATURE</code> for v2).
          Recipients pass it to <code className={inlineCodeClass}>/verify</code>{" "}
          and <code className={inlineCodeClass}>/settle</code>.
        </>,
        <>
          <strong>PaymentGuaranteeClaims:</strong> the upgraded claims produced
          by core. It adds <code className={inlineCodeClass}>domain</code>,{" "}
          <code className={inlineCodeClass}>version</code>,{" "}
          <code className={inlineCodeClass}>req_id</code>, and{" "}
          <code className={inlineCodeClass}>total_amount</code>.
        </>,
        <>
          <strong>Certificate:</strong> the signature over{" "}
          <code className={inlineCodeClass}>PaymentGuaranteeClaims</code>{" "}
          returned by <code className={inlineCodeClass}>/settle</code>. This is
          the cryptographic proof of the credit. If the user defaults, the
          recipient can remunerate after the grace period (default 14 days) and
          before the tab expires (default 21 days). For V2, remuneration
          additionally requires passing ERC-8004 validation checks on-chain.
        </>,
        <>
          <strong>Validation policy (V2):</strong> signed fields include{" "}
          <code className={inlineCodeClass}>validation_registry_address</code>,{" "}
          <code className={inlineCodeClass}>validation_request_hash</code>,{" "}
          <code className={inlineCodeClass}>validation_chain_id</code>,{" "}
          <code className={inlineCodeClass}>validator_address</code>,{" "}
          <code className={inlineCodeClass}>validator_agent_id</code>,{" "}
          <code className={inlineCodeClass}>min_validation_score</code>,{" "}
          <code className={inlineCodeClass}>validation_subject_hash</code>, and{" "}
          <code className={inlineCodeClass}>required_validation_tag</code>.
        </>,
        <>
          <strong>Grace periods:</strong> By default, tabs expire after 21 days
          and the remuneration grace period is 14 days, leaving a 7-day window
          to remunerate after default. Withdrawal requests finalize after a
          22-day grace period.
        </>,
      ],
    },
    {
      heading: "SDK Installation",
      paragraphs: ["Pick the SDK that matches your stack."],
      codeBlocks: [
        {
          language: "bash",
          label: "Rust",
          code: `cargo add sdk-4mica`,
        },
        {
          language: "bash",
          label: "Python",
          code: "pip install 'sdk-4mica[bls]'",
        },
        {
          language: "bash",
          label: "TypeScript",
          code: "npm i @4mica/sdk",
        },
      ],
    },
    {
      heading: "Return 402 Payment Required",
      paragraphs: [
        "When a request arrives without a valid payment header, respond with HTTP 402 and include `paymentRequirements` so the client can request a tab and retry.",
        "The requirements must match what you will later verify: the amount must equal `maxAmountRequired`, and `scheme`, `network`, `payTo`, and `asset` must match the tab you issue.",
      ],
      codeBlocks: [
        {
          language: "http",
          caption: "402 response (template requirements + tabEndpoint)",
          code: `HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "paymentRequirements": {
    "scheme": "4mica-credit",
    "network": "eip155:84532",
    "maxAmountRequired": "100",
    "resource": "/v1/report",
    "description": "Generate report",
    "mimeType": "application/json",
    "payTo": "0xRecipientAddress",
    "maxTimeoutSeconds": 300,
    "asset": "0xAssetAddress",
    "extra": {
      // recipient-owned endpoint for tab management
      "tabEndpoint": "https://your.api.example.com/x402/tab"
    }
  }
}`,
        },
      ],
    },
    {
      heading: "Handle User Requests (Recipient Logic)",
      steps: [
        "If the payment header is missing, return 402 with `paymentRequirements` and `extra.tabEndpoint`.",
        "If present, call `/verify` with `{ x402Version, paymentPayload, paymentRequirements }` (where `paymentPayload` is the decoded payment header).",
        "If `/verify` returns invalid, return 402 again (optionally with the invalidReason).",
        "If valid, call `/settle` to mint a certificate once you are ready to accept credit.",
        "Persist the certificate, then serve the protected response immediately. You can also fetch all your certificates later if needed.",
      ],
      paragraphsAfter: [
        "Only `/settle` touches the 4Mica operator to issue a BLS certificate. `/verify` is purely structural and is safe to use as a preflight check before doing any expensive work.",
        "For V2, `/settle` does not prove the job outcome; it only issues a certificate with the signed validation policy. The ERC-8004 validation check is enforced later during on-chain remuneration.",
      ],
    },
    {
      heading: "Integrate 4Mica with Code Samples",
      paragraphs: [
        "Below is a step-by-step, SDK-only integration for the 4Mica credit flow. Each step includes Rust, Python, and TypeScript variants.",
        "The snippets focus on the SDK calls; wire them into your existing HTTP 402 responses, tabEndpoint handler, and request retries.",
      ],
    },
    {
      heading: "Step 1: Create or Reuse a Tab (Recipient SDK)",
      paragraphs: [
        "Your resource server creates a tab for the user and chooses the asset + TTL. The recipient signer must match the payTo address you advertise.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Create a tab (TypeScript SDK)",
          code: `import { Client, ConfigBuilder } from "@4mica/sdk";

const cfg = new ConfigBuilder()
  .network(process.env["4MICA_NETWORK"] ?? "base-sepolia")
  .walletPrivateKey(process.env.RECIPIENT_KEY!)
  .build();

const client = await Client.new(cfg);
const userAddress = "0xUserAddress";
const recipientAddress = "0xRecipientAddress"; // must match RECIPIENT_KEY

const tabId = await client.recipient.createTab(
  userAddress,
  recipientAddress,
  null, // ETH tab (use ERC20 address for tokens)
  3600
);

console.log("tabId", tabId.toString());
await client.aclose();`,
        },
        {
          language: "python",
          caption: "Create a tab (Python SDK)",
          code: `import asyncio
from fourmica_sdk import Client, ConfigBuilder

RECIPIENT_KEY = "0x..."
USER_ADDRESS = "0x..."
RECIPIENT_ADDRESS = "0x..."  # must match RECIPIENT_KEY

async def main():
    cfg = ConfigBuilder().network("base-sepolia").wallet_private_key(RECIPIENT_KEY).build()
    client = await Client.new(cfg)
    try:
        tab_id = await client.recipient.create_tab(
            user_address=USER_ADDRESS,
            recipient_address=RECIPIENT_ADDRESS,
            erc20_token=None,  # ETH tab
            ttl=3600,
        )
        print("tab_id", tab_id)
    finally:
        await client.aclose()

asyncio.run(main())`,
        },
        {
          language: "rust",
          caption: "Create a tab (Rust SDK)",
          code: `use alloy::signers::local::PrivateKeySigner;
use sdk_4mica::{Client, ConfigBuilder};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let signer: PrivateKeySigner = std::env::var("RECIPIENT_KEY")?.parse()?;

    let cfg = ConfigBuilder::default()
        .rpc_url("https://base.sepolia.api.4mica.xyz/".to_string())
        .signer(signer)
        .build()?;
    let client = Client::new(cfg).await?;

    let user_address = std::env::var("USER_ADDRESS")?;
    let recipient_address = std::env::var("RECIPIENT_ADDRESS")?;

    let result = client
        .recipient
        .create_tab(user_address, recipient_address, None, Some(3600), 1)
        .await?;

    println!("tab_id={}", result.tab_id);
    Ok(())
}`,
        },
      ],
    },
    {
      heading: "Step 2: Sign the Payment Header (Payer SDK)",
      paragraphs: [
        "The payer consumes the `paymentRequirements` from the 402 response, refreshes the tab if needed, and signs the guarantee to produce the base64 payment header (`X-PAYMENT` for v1 or `PAYMENT-SIGNATURE` for v2).",
        "SDK behavior is automatic: if V2 validation fields are present in `paymentRequirements.extra`, claims are built as V2 with canonical `validation_subject_hash` and `validation_request_hash`; otherwise V1 is used.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Sign payment header (TypeScript SDK)",
          code: `import { Client, ConfigBuilder, X402Flow, PaymentRequirementsV1 } from "@4mica/sdk";

const cfg = new ConfigBuilder()
  .network(process.env["4MICA_NETWORK"] ?? "base-sepolia")
  .walletPrivateKey(process.env.PAYER_KEY!)
  .build();

const client = await Client.new(cfg);
const flow = X402Flow.fromClient(client);

// requirements from the 402 response body
const requirements = reqRaw as PaymentRequirementsV1;
const payment = await flow.signPayment(requirements, "0xUserAddress");
const xPaymentHeader = payment.header;

await client.aclose();`,
        },
        {
          language: "python",
          caption: "Sign payment header (Python SDK)",
          code: `import asyncio
from fourmica_sdk import Client, ConfigBuilder, PaymentRequirements, X402Flow

PAYER_KEY = "0x..."
USER_ADDRESS = "0x..."

async def main():
    cfg = ConfigBuilder().network("base-sepolia").wallet_private_key(PAYER_KEY).build()
    client = await Client.new(cfg)
    flow = X402Flow.from_client(client)

    requirements = PaymentRequirements.from_raw(req_raw)  # from 402 response
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
use sdk_4mica::x402::PaymentRequirements;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let signer: PrivateKeySigner = std::env::var("PAYER_KEY")?.parse()?;

    let cfg = ConfigBuilder::default()
        .rpc_url("https://base.sepolia.api.4mica.xyz/".to_string())
        .signer(signer)
        .build()?;
    let client = Client::new(cfg).await?;
    let flow = X402Flow::new(client)?;

    // req_raw is the JSON object from the 402 response
    let requirements: PaymentRequirements = serde_json::from_value(req_raw)?;
    let payment = flow
        .sign_payment(requirements, std::env::var("USER_ADDRESS")?)
        .await?;
    let x_payment_header = payment.header;
    Ok(())
}`,
        },
      ],
    },
    {
      heading: "Step 3: Settle via the Facilitator (SDK helper)",
      paragraphs: [
        "If you delegate settlement to an SDK helper (for example a backend job or a payer-assisted flow), call `settle_payment` with the signed header and original requirements to obtain the certificate.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Settle a signed payment (TypeScript SDK)",
          code: `// payment + requirements from Step 2
const settled = await flow.settlePayment(
  payment,
  requirements,
  "https://x402.4mica.xyz"
);

const certificate = settled.settlement;`,
        },
        {
          language: "python",
          caption: "Settle a signed payment (Python SDK)",
          code: `# payment and requirements from Step 2
settled = await flow.settle_payment(
    payment,
    requirements,
    facilitator_url="https://x402.4mica.xyz/"
)

certificate = settled.settlement`,
        },
        {
          language: "rust",
          caption: "Settle a signed payment (Rust SDK)",
          code: `// payment + requirements from Step 2
let settled = flow
    .settle_payment(payment, requirements, "https://x402.4mica.xyz")
    .await?;

let certificate = settled.settlement;`,
        },
      ],
    },
    {
      heading: "Step 4: Pay the Tab On-Chain (Payer SDK)",
      paragraphs: [
        "When it is time to settle, the payer uses the `req_id` from the certificate to repay the tab in the same asset that was used when the tab was opened.",
      ],
      codeBlocks: [
        {
          language: "ts",
          caption: "Pay a tab (TypeScript SDK)",
          code: `const receipt = await client.user.payTab(
  tabId,
  reqId,
  amountWei,
  recipientAddress,
  undefined // or ERC20 token address
);`,
        },
        {
          language: "python",
          caption: "Pay a tab (Python SDK)",
          code: `await client.user.pay_tab(
    tab_id=tab_id,
    req_id=req_id,
    amount=amount_wei,
    recipient_address=recipient_address,
    erc20_token=None,
)`,
        },
        {
          language: "rust",
          caption: "Pay a tab (Rust SDK)",
          code: `use alloy::primitives::U256;

let receipt = client
    .user
    .pay_tab(
        U256::from(tab_id),
        U256::from(req_id),
        U256::from(amount_wei),
        recipient_address,
        None,
    )
    .await?;`,
        },
      ],
    },
    {
      heading: "Minimal Flow (x402 Credit)",
      steps: [
        "Recipient returns 402 Payment Required with paymentRequirements and extra.tabEndpoint.",
        "Payer SDK calls the tabEndpoint, which forwards to POST /tabs to open or reuse a tab.",
        "Payer signs a guarantee and retries with the payment header.",
        "Recipient optionally calls /verify (structural checks) and then /settle (issues the certificate).",
        "Recipient delivers the protected response immediately; payer settles on-chain later (payTab or payTabInERC20Token).",
      ],
      paragraphsAfter: [
        "This is the “agent pays with credit” experience: the recipient opens the tab, the agent gets a guarantee via /settle, and the agent settles later on-chain before the tab expires (default 21 days). If unpaid, recipients can remunerate after the grace period (default 14 days). V2 claims add a mandatory ERC-8004 validation gate before remuneration succeeds.",
      ],
    },
    {
      heading: "Sequence Diagram (Minimal Flow)",
      paragraphs: [
        "Below is a compact sequence view of the minimal x402 path with the key handoffs:",
      ],
      sequence: [
        "Payer → Recipient: request protected resource",
        "Recipient → Payer: 402 + paymentRequirements (tabEndpoint)",
        "Payer → Recipient: POST tabEndpoint (wallet + requirements)",
        "Recipient → Facilitator: POST /tabs",
        "Facilitator → Core: create/reuse tab",
        "Facilitator → Recipient: tabId + metadata",
        "Payer → Recipient: retry with payment header",
        "Recipient → Facilitator: POST /verify",
        "Recipient → Facilitator: POST /settle",
        "Facilitator → Core: issue guarantee",
        "Facilitator → Recipient: certificate",
        "Recipient → Payer: serve response",
        "Payer → Contract: payTab / payTabInERC20Token (later)",
      ],
    },
    {
      heading: "What /verify vs /settle Actually Do",
      paragraphs: [
        "/verify is purely structural: it decodes the payment header and ensures the claims match the recipient’s advertised requirements. It does not talk to core and does not issue a certificate.",
        "/settle repeats the same checks and then calls core to request a BLS guarantee. The facilitator verifies the certificate locally and returns it to the recipient.",
      ],
      bullets: [
        "/verify returns { isValid, invalidReason?, certificate: null }.",
        "/settle returns { success, networkId, txHash, certificate }.",
        "Both enforce scheme/network, payTo, asset, and exact amount matching.",
        "For V2, neither endpoint confirms job validity; they only carry and enforce claim structure. Job validity is checked later through ERC-8004 validation status during `remunerate`.",
      ],
    },
    {
      heading: "Happy Path: Payer Settles On-Chain",
      steps: [
        "Recipient receives a certificate from /settle and serves the request.",
        "Payer later calls payTab (ETH) or payTabInERC20Token (ERC20) with tabId, req_id, amount, and recipient.",
        "The contract records the payment and emits events; core unlocks collateral and the tab appears as settled to the recipient.",
      ],
      paragraphsAfter: [
        "The req_id used here is the one embedded in the certificate returned by /settle. This is how the chain ties a specific guarantee to a specific repayment.",
      ],
    },
    {
      heading: "Default Path: Recipient Remunerates",
      steps: [
        "If the payer does not settle before the grace period, the recipient (or a daemon) lists pending remunerations.",
        "For V2, ensure the linked ERC-8004 validation request has a passing status (for example by calling `getValidationStatus` from `wachai-validation-sdk`).",
        "The recipient verifies the certificate and calls Core4Mica.remunerate with the certificate bytes and BLS signature.",
        "The contract validates domain, timestamp + grace window, tab status, and collateral; for V2 it additionally validates ERC-8004 response constraints from the signed policy before transfer.",
      ],
      paragraphsAfter: [
        "This path is deterministic: the same certificate that enabled instant delivery becomes the claim that makes the recipient whole, but V2 only pays out after validated job evidence exists on-chain.",
      ],
    },
    {
      heading: "Tab Lifecycle, TTL, and req_id Rules",
      paragraphs: [
        "Tabs are reused for the same payer/recipient/asset until the TTL expires. Each guarantee increments req_id and updates total_amount in the certificate. The contract rejects out-of-order req_id or asset mismatches. This is how replay and double-spend attempts are prevented.",
      ],
      bullets: [
        "Tabs can be created for ETH or ERC20 assets.",
        "The tab’s startTimestamp is derived from the first valid guarantee.",
        "Claims must fall within the tab’s active time window.",
      ],
    },
    {
      heading: "Two Ways to Integrate",
      bullets: [
        "x402 flow: recipients expose a tabEndpoint and call /verify + /settle. Payers use the SDK to sign the versioned payment header.",
        "Direct core flow: recipients create tabs and request guarantees via the SDK, then remunerate directly. This is useful for closed systems or internal pipelines.",
      ],
    },
    {
      heading: "Optional Exact / Debit Fallback",
      paragraphs: [
        "If operators configure an exact (debit) backend, the facilitator can route /verify and /settle to that path instead. Responses mirror upstream x402 debit flows and may include transaction hashes rather than certificates.",
      ],
    },
    {
      heading: "Why This Design Holds",
      paragraphs: [
        "4Mica keeps the happy path off-chain but preserves enforceability on-chain. Recipients never need to trust a coordinator; they only need a certificate that the contract will accept. Payers keep capital efficient, and the system has a clear and auditable failure mode: either the payer pays, or the recipient remunerates (for V2, only after ERC-8004 validation passes).",
      ],
    },
  ];

  return (
    <div className="min-h-screen pt-20 pb-24 text-ink-body">
      <div className="container mx-auto max-w-4xl px-6">
        <header className="mb-12 text-center">
          <p className="section-kicker">Deep Dive</p>
          <h1 className="section-title mb-4">Getting paid using 4Mica</h1>
          <p className="text-ink-muted text-sm">
            Published January 28, 2026 · Updated January 29, 2026 · 15 min read
            · By Mairon
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
                  {renderInlineCode(paragraph)}
                </p>
              ))}

              {section.steps && (
                <ol className="list-inside list-decimal space-y-2 text-ink-body">
                  {section.steps.map((step) => (
                    <li key={step}>{renderInlineCode(step)}</li>
                  ))}
                </ol>
              )}

              {section.bullets && (
                <ul className="list-inside list-disc space-y-2 text-ink-body">
                  {section.bullets.map((bullet) => (
                    <li key={String(bullet)}>
                      {renderInlineCodeOrNode(bullet)}
                    </li>
                  ))}
                </ul>
              )}

              {section.paragraphsAfter?.map((paragraph) => (
                <p key={paragraph} className="text-ink-body leading-relaxed">
                  {renderInlineCode(paragraph)}
                </p>
              ))}
              {section.codeBlocks && <CodeTabs blocks={section.codeBlocks} />}
              {section.sequence && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-surface-solid p-5 text-ink-body text-sm">
                  {section.sequence.map((line) => (
                    <div key={line} className="flex items-start gap-3">
                      <span className="mt-0.75 h-2 w-2 shrink-0 rounded-full bg-brand-teal"></span>
                      <span className="font-mono">{line}</span>
                    </div>
                  ))}
                </div>
              )}
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
