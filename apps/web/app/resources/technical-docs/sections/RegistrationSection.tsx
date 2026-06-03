import CodeBlock from "../../../../components/CodeBlock";
import type { Language } from "../navigation";

interface RegistrationSectionProps {
  language: Language;
}

const NETWORKS = (
  <div className="space-y-1 rounded-lg border border-white/10 bg-white/5 p-4 text-ink-body text-sm">
    <p className="font-semibold text-ink-strong">Supported networks</p>
    <ul className="mt-2 list-inside list-disc space-y-1">
      <li>
        <code className="font-mono">eip155:8453</code> - Base (
        <code className="font-mono">https://base.api.4mica.xyz/</code>)
      </li>
      <li>
        <code className="font-mono">eip155:11155111</code> - Ethereum Sepolia (
        <code className="font-mono">
          https://ethereum.sepolia.api.4mica.xyz/
        </code>
        )
      </li>
      <li>
        <code className="font-mono">eip155:84532</code> - Base Sepolia (
        <code className="font-mono">https://base.sepolia.api.4mica.xyz/</code>)
      </li>
    </ul>
  </div>
);

function TypeScriptRegistration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Before a wallet can make payments on 4Mica, it must deposit collateral
        into the Core4Mica contract. Depositing is the only registration step -
        there is no separate sign-up. Once the deposit confirms, the 4Mica core
        service picks up the collateral event and the wallet is immediately
        eligible to sign payment guarantees.
      </p>
      {NETWORKS}
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Install the SDK
        </h3>
        <CodeBlock
          code={`npm install @4mica/sdk\n# or\npnpm install @4mica/sdk`}
          language="bash"
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Deposit USDC on Base Sepolia
        </h3>
        <p className="text-ink-body text-sm">
          For ERC-20 tokens (e.g. USDC), use{" "}
          <code className="font-mono">getSupportedTokens</code> to resolve the
          token address from the network, then approve the Core4Mica contract
          and call <code className="font-mono">deposit</code>. The SDK fetches
          the contract address automatically from the network URL - you do not
          need to supply it manually.
        </p>
        <CodeBlock
          language="ts"
          code={`import { Client, ConfigBuilder } from "@4mica/sdk";

// 1 USDC = 1_000_000 (6 decimals)
const AMOUNT = 1_000_000n;

const cfg = new ConfigBuilder()
  .network("base-sepolia")          // or "ethereum-sepolia"
  .walletPrivateKey("0xYourPrivateKey")
  .build();

const client = await Client.new(cfg);

try {
  // Resolve a token supported by the 4Mica core on this network
  const { tokens } = await client.rpc.getSupportedTokens();
  const usdc =
    tokens.find((t) => t.symbol.toUpperCase() === "USDC" && t.address) ??
    tokens.find((t) => t.address);
  if (!usdc?.address) {
    throw new Error("No supported ERC20 token found for deposit");
  }

  // Step 1 - approve the Core4Mica contract to spend the token
  await client.user.approveErc20(usdc.address, AMOUNT);
  console.log(\`Approved \${usdc.symbol} (\${usdc.address})\`);

  // Step 2 - deposit into the vault (this is your registration)
  const receipt = await client.user.deposit(AMOUNT, usdc.address);
  console.log("Deposited. tx:", receipt.transactionHash);
} finally {
  await client.aclose();
}`}
        />
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 text-ink-body text-sm">
          <strong className="text-ink-strong">
            Your deposit won't appear instantly.
          </strong>{" "}
          The 4Mica core only records a deposit after the block containing your
          transaction has been <em>finalized</em> on the underlying chain - not
          just confirmed by the sequencer. On Base this means waiting for the
          batch to be submitted to Ethereum L1 and reach Ethereum&apos;s
          finality, which typically takes <strong>10 to 30 minutes</strong>.
          Once finalized, your balance will update automatically and you can
          start making payments.
        </div>
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Depositing native ETH
        </h3>
        <p className="text-ink-body text-sm">
          Omit the token address and pass the amount in wei. No approval step is
          needed for ETH.
        </p>
        <CodeBlock
          language="ts"
          code={`// 0.001 ETH in wei
const receipt = await client.user.deposit(1_000_000_000_000_000n);
console.log("Deposited ETH. tx:", receipt.transactionHash);`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Verify your collateral balance
        </h3>
        <CodeBlock
          language="ts"
          code={`const positions = await client.user.getUser();
for (const pos of positions) {
  console.log("asset:", pos.asset, "collateral:", pos.collateral.toString());
}`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Load config from environment variables
        </h3>
        <p className="text-ink-body text-sm">
          Use <code className="font-mono">fromEnv()</code> to configure the
          client from environment variables - useful in CI, Docker, or any
          deployment where secrets are injected at runtime.
        </p>
        <CodeBlock
          language="bash"
          code={`# .env
4MICA_NETWORK=base
4MICA_WALLET_PRIVATE_KEY=0xYourPrivateKey
# Optional overrides
4MICA_ETHEREUM_HTTP_RPC_URL=https://...
4MICA_BEARER_TOKEN=...
4MICA_AUTH_URL=https://...`}
        />
        <CodeBlock
          language="ts"
          code={`const cfg = new ConfigBuilder().fromEnv().build();
const client = await Client.new(cfg);`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Coinbase CDP wallet (no private key)
        </h3>
        <p className="text-ink-body text-sm">
          Use a Coinbase Developer Platform MPC wallet - the private key never
          leaves CDP&apos;s HSM. Install the peer dependency, then pass the
          resulting account to <code className="font-mono">.signer()</code>{" "}
          instead of <code className="font-mono">.walletPrivateKey()</code>.
        </p>
        <CodeBlock language="bash" code={`npm install @coinbase/cdp-sdk`} />
        <CodeBlock
          language="ts"
          code={`import { createCdpAccount, Client, ConfigBuilder } from "@4mica/sdk";

// 1 USDC = 1_000_000 (6 decimals)
const AMOUNT = 1_000_000n;

// Create (or retrieve) a CDP MPC wallet - private key never leaves CDP's HSM.
// Using the same name always returns the same wallet.
const account = await createCdpAccount({
  apiKeyId: process.env.CDP_API_KEY_ID!,
  apiKeySecret: process.env.CDP_API_KEY_SECRET!,
  walletSecret: process.env.CDP_WALLET_SECRET!,
  name: "my-agent",
});

const cfg = new ConfigBuilder()
  .network("base")
  .signer(account)
  .build();

const client = await Client.new(cfg);

try {
  console.log("Wallet address:", account.address);

  const { tokens } = await client.rpc.getSupportedTokens();
  const token = tokens.find((t) => t.symbol.toUpperCase() === "USDC") ?? tokens[0];
  if (!token?.address) throw new Error("No supported token found for deposit");

  await client.user.approveErc20(token.address, AMOUNT);
  const receipt = await client.user.deposit(AMOUNT, token.address);
  console.log("Deposited. tx:", receipt.transactionHash);
  console.log("Wait 10–30 min for the deposit to be recorded after finalization.");
} finally {
  await client.aclose();
}`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Register via the website
        </h3>
        <p className="text-ink-body text-sm">
          Prefer a guided UI? The{" "}
          <a
            href="/agents/register"
            className="text-ink-strong underline hover:opacity-80"
          >
            Agent Registration page
          </a>{" "}
          lets you connect a wallet, choose a network, select an asset, and
          complete the approve + deposit flow in a few clicks - no code
          required.
        </p>
      </div>
    </div>
  );
}

function PythonRegistration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Before a wallet can make payments on 4Mica, it must deposit collateral
        into the Core4Mica contract. Depositing is the only registration step -
        no separate sign-up needed. Once the deposit confirms, the 4Mica core
        service picks up the collateral event and the wallet is immediately
        eligible to sign payment guarantees.
      </p>
      {NETWORKS}
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Install the SDK
        </h3>
        <CodeBlock code={`pip install sdk-4mica`} language="bash" />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Deposit USDC on Base Sepolia
        </h3>
        <p className="text-ink-body text-sm">
          For ERC-20 tokens (e.g. USDC), use{" "}
          <code className="font-mono">get_supported_tokens()</code> to resolve
          the token address from the network, then approve the Core4Mica
          contract and call <code className="font-mono">deposit</code>. The SDK
          resolves the contract address automatically from the configured
          network.
        </p>
        <CodeBlock
          language="python"
          code={`import asyncio
from fourmica_sdk import Client, ConfigBuilder

# 1 USDC = 1_000_000 (6 decimals)
AMOUNT = 1_000_000

async def main():
    cfg = (
        ConfigBuilder()
        .network("base-sepolia")          # or "ethereum-sepolia"
        .wallet_private_key("0xYourPrivateKey")
        .build()
    )

    async with await Client.new(cfg) as client:
        # Resolve a token supported by the 4Mica core on this network
        response = await client.rpc.get_supported_tokens()
        token = next(
            (t for t in response.tokens if t.symbol.upper() == "USDC"),
            next((t for t in response.tokens if t.address), None),
        )
        if not token:
            raise RuntimeError("No supported ERC20 token found for deposit")

        # Step 1 - approve the Core4Mica contract to spend the token
        await client.user.approve_erc20(token.address, AMOUNT)
        print(f"Approved {token.symbol} ({token.address})")

        # Step 2 - deposit into the vault (this is your registration)
        receipt = await client.user.deposit(AMOUNT, erc20_token=token.address)
        print("Deposited. tx:", receipt["transactionHash"])

asyncio.run(main())`}
        />
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4 text-ink-body text-sm">
          <strong className="text-ink-strong">
            Your deposit won't appear instantly.
          </strong>{" "}
          The 4Mica core only records a deposit after the block containing your
          transaction has been <em>finalized</em> on the underlying chain - not
          just confirmed by the sequencer. On Base this means waiting for the
          batch to be submitted to Ethereum L1 and reach Ethereum&apos;s
          finality, which typically takes <strong>10 to 30 minutes</strong>.
          Once finalized, your balance will update automatically and you can
          start making payments.
        </div>
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Depositing native ETH
        </h3>
        <p className="text-ink-body text-sm">
          Omit the token address and pass the amount in wei. No approval step is
          needed for ETH.
        </p>
        <CodeBlock
          language="python"
          code={`# 0.001 ETH in wei
receipt = await client.user.deposit(1_000_000_000_000_000)
print("Deposited ETH. tx:", receipt["transactionHash"])`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Verify your collateral balance
        </h3>
        <CodeBlock
          language="python"
          code={`positions = await client.user.get_user()
for pos in positions:
    print("asset:", pos.asset, "collateral:", pos.collateral)`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Load config from environment variables
        </h3>
        <p className="text-ink-body text-sm">
          Use <code className="font-mono">from_env()</code> to configure the
          client from environment variables - useful in CI, Docker, or any
          deployment where secrets are injected at runtime.
        </p>
        <CodeBlock
          language="bash"
          code={`# .env
4MICA_NETWORK=base
4MICA_WALLET_PRIVATE_KEY=0xYourPrivateKey
# Optional overrides
4MICA_ETHEREUM_HTTP_RPC_URL=https://...
4MICA_BEARER_TOKEN=...
4MICA_AUTH_URL=https://...`}
        />
        <CodeBlock
          language="python"
          code={`from fourmica_sdk import Client, ConfigBuilder
import asyncio

async def main():
    cfg = ConfigBuilder().from_env().build()
    async with await Client.new(cfg) as client:
        ...

asyncio.run(main())`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Coinbase CDP wallet (no private key)
        </h3>
        <p className="text-ink-body text-sm">
          Use a Coinbase Developer Platform MPC wallet - the private key never
          leaves CDP&apos;s HSM. Install the peer dependency, then pass the
          signer to <code className="font-mono">.signer()</code> instead of{" "}
          <code className="font-mono">.wallet_private_key()</code>.
        </p>
        <CodeBlock language="bash" code={`pip install sdk-4mica "cdp-sdk"`} />
        <CodeBlock
          language="python"
          code={`import asyncio, os
from fourmica_sdk import create_cdp_account, CdpAccountConfig, Client, ConfigBuilder

# 1 USDC = 1_000_000 (6 decimals)
AMOUNT = 1_000_000

async def main():
    # Create (or retrieve) a CDP MPC wallet - private key never leaves CDP's HSM.
    # Using the same name always returns the same wallet.
    signer = await create_cdp_account(CdpAccountConfig(
        api_key_id=os.environ["CDP_API_KEY_ID"],
        api_key_secret=os.environ["CDP_API_KEY_SECRET"],
        wallet_secret=os.environ["CDP_WALLET_SECRET"],
        name="my-agent",
    ))

    cfg = (
        ConfigBuilder()
        .network("base")
        .signer(signer)
        .build()
    )
    async with await Client.new(cfg) as client:
        print(f"Wallet address: {signer.address}")

        response = await client.rpc.get_supported_tokens()
        token = next(
            (t for t in response.tokens if t.symbol.upper() == "USDC"),
            next((t for t in response.tokens if t.address), None),
        )
        if not token:
            raise RuntimeError("No supported ERC20 token found for deposit")

        await client.user.approve_erc20(token.address, AMOUNT)
        receipt = await client.user.deposit(AMOUNT, erc20_token=token.address)
        print("Deposited. tx:", receipt["transactionHash"])
        print("Wait 10–30 min for the deposit to be recorded after finalization.")

asyncio.run(main())`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Register via the website
        </h3>
        <p className="text-ink-body text-sm">
          Prefer a guided UI? The{" "}
          <a
            href="/agents/register"
            className="text-ink-strong underline hover:opacity-80"
          >
            Agent Registration page
          </a>{" "}
          lets you connect a wallet, choose a network, select an asset, and
          complete the approve + deposit flow in a few clicks - no code
          required.
        </p>
      </div>
    </div>
  );
}

function RustRegistration() {
  return (
    <div className="space-y-8">
      <p className="text-ink-body leading-relaxed">
        Before a wallet can make payments on 4Mica, it must deposit collateral
        into the Core4Mica contract. The Rust SDK communicates directly with the
        network RPC URL - no separate facilitator package is needed for
        registration. Once the deposit confirms, the wallet is immediately
        eligible to sign payment guarantees.
      </p>
      {NETWORKS}
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Add the SDK crate
        </h3>
        <CodeBlock
          code={`cargo add sdk-4mica alloy\ncargo add tokio --features macros,rt-multi-thread`}
          language="bash"
        />
        <p className="mt-2 text-ink-body text-sm">
          Pass the RPC URL directly - e.g.{" "}
          <code className="font-mono">https://base.sepolia.api.4mica.xyz/</code>{" "}
          for Base Sepolia or{" "}
          <code className="font-mono">
            https://ethereum.sepolia.api.4mica.xyz/
          </code>{" "}
          for Ethereum Sepolia.
        </p>
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Deposit USDC on Base Sepolia
        </h3>
        <p className="text-ink-body text-sm">
          For ERC-20 tokens (e.g. USDC), approve the Core4Mica contract first,
          then deposit. The SDK resolves the contract address automatically from
          the RPC URL.
        </p>
        <CodeBlock
          language="rust"
          code={`use alloy::{primitives::U256, signers::local::PrivateKeySigner};
use sdk_4mica::{Client, ConfigBuilder};

// USDC on Base Sepolia
const USDC: &str = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1 USDC = 1_000_000 (6 decimals)
    let amount = U256::from(1_000_000u64);
    let signer: PrivateKeySigner = "0xYourPrivateKey".parse()?;

    let cfg = ConfigBuilder::default()
        .rpc_url("https://base.sepolia.api.4mica.xyz/".to_string())
        .signer(signer)
        .build()?;

    let client = Client::new(cfg).await?;

    // Step 1 - approve the Core4Mica contract to spend USDC
    client.user.approve_erc20(USDC.to_string(), amount).await?;
    println!("Approved");

    // Step 2 - deposit into the vault (this is your registration)
    let receipt = client
        .user
        .deposit(amount, Some(USDC.to_string()))
        .await?;
    println!("Deposited. tx: {:?}", receipt.transaction_hash);

    Ok(())
}`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Depositing native ETH
        </h3>
        <p className="text-ink-body text-sm">
          Pass <code className="font-mono">None</code> for the token address to
          deposit ETH. No approval step is needed.
        </p>
        <CodeBlock
          language="rust"
          code={`// 0.001 ETH in wei
let receipt = client
    .user
    .deposit(U256::from(1_000_000_000_000_000u64), None)
    .await?;
println!("Deposited ETH. tx: {:?}", receipt.transaction_hash);`}
        />
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-ink-strong text-xl">
          Verify your collateral balance
        </h3>
        <CodeBlock
          language="rust"
          code={`let positions = client.user.get_user().await?;
for pos in positions {
    println!("asset: {}, collateral: {}", pos.asset, pos.collateral);
}`}
        />
      </div>
      <div className="space-y-3">
        <h3 className="font-semibold text-ink-strong text-xl">
          Register via the website
        </h3>
        <p className="text-ink-body text-sm">
          Prefer a guided UI? The{" "}
          <a
            href="/agents/register"
            className="text-ink-strong underline hover:opacity-80"
          >
            Agent Registration page
          </a>{" "}
          lets you connect a wallet, choose a network, select an asset, and
          complete the approve + deposit flow in a few clicks - no code
          required.
        </p>
      </div>
    </div>
  );
}

export default function RegistrationSection({
  language,
}: RegistrationSectionProps) {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl text-ink-strong">Registration</h2>
      {language === "typescript" && <TypeScriptRegistration />}
      {language === "python" && <PythonRegistration />}
      {language === "rust" && <RustRegistration />}
    </div>
  );
}
