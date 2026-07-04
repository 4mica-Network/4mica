[![npm](https://img.shields.io/npm/v/@4mica/sdk.svg)](https://www.npmjs.com/package/@4mica/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

# 4Mica TypeScript SDK

The official TypeScript SDK for interacting with the 4Mica payment network.

## Overview

4Mica is a payment network that enables cryptographically-enforced lines of credit for autonomous
payments. This SDK provides:

- **User Client**: deposit collateral, sign payments, and manage withdrawals in ETH or ERC20 tokens
- **Recipient Client**: create payment tabs, verify payment guarantees, and claim from user collateral
- **X402 Flow Helper**: generate X-PAYMENT headers for 402-protected HTTP resources via an X402-compatible service
- **Server paywall** (`@4mica/sdk/server`): a runtime-neutral, edge-safe primitive for gating a route behind an x402 payment
- **Admin RPCs**: manage user suspension and admin API keys (when authorized)

## Universal: runtime-neutral core + thin adapters

`@4mica/sdk` is runtime-neutral (Node, Bun, Deno, edge). HTTP uses the global `fetch`, and the
`@4mica/sdk/server` subpath is `Buffer`-free so it runs on edge runtimes.

- **Runtime adapters** — env-driven client/paywall factories: `@4mica/sdk-node`, `@4mica/sdk-bun`, `@4mica/sdk-deno`
- **Framework adapters** — thin x402 paywall middleware: `@4mica/sdk-next`, `@4mica/sdk-express`, `@4mica/sdk-hono` (Nuxt / SvelteKit / Remix coming soon)

### Server paywall

Gate any route behind a payment. When no valid `X-PAYMENT` header is present, the paywall returns a
`402` with the x402 payment requirements; otherwise it verifies the payment and lets the request
through, adding an `X-PAYMENT-RESPONSE` header.

```ts
import { createPaywall } from "@4mica/sdk/server";

const paywall = createPaywall(client.rpc, {
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
  tabEndpoint: "https://your-recipient.example/tab",
});

// Web-standard (Hono, Next route handlers, SvelteKit, Remix, Deno, Bun.serve):
const result = await paywall.handle(request);
if (result instanceof Response) return result; // 402
// ...run your handler, then merge result.headers onto the response

// Or the low-level, framework-agnostic primitive:
const decision = await paywall.protect({ method, url, header: (n) => headers.get(n) });
```

Prefer a framework adapter (`@4mica/sdk-express`, `@4mica/sdk-hono`, `@4mica/sdk-next`) for
idiomatic middleware. The paywall only **verifies** payment; on-chain settlement (`remunerate`)
remains an out-of-band recipient operation.

## Installation

```bash
npm install @4mica/sdk
# or
yarn add @4mica/sdk
```

Node.js 18+ is required.

## Networks

| Shorthand          | CAIP-2            | Core API URL                              |
| ------------------ | ----------------- | ----------------------------------------- |
| `base`             | `eip155:8453`     | `https://base.api.4mica.xyz/`             |
| `ethereum-sepolia` | `eip155:11155111` | `https://ethereum.sepolia.api.4mica.xyz/` |
| `base-sepolia`     | `eip155:84532`    | `https://base.sepolia.api.4mica.xyz/`     |

The default network is Ethereum Sepolia. Use `.network()` or the `4MICA_NETWORK` environment
variable to switch networks.

```ts
import { NETWORKS } from '@4mica/sdk';

console.log(NETWORKS['base'].caip2); // "eip155:8453"
console.log(NETWORKS['base'].rpcUrl); // "https://base.api.4mica.xyz/"
```

## Initialization and Configuration

The SDK requires a signing key and can use sensible defaults for the rest:

- `walletPrivateKey` (**required** unless `signer` is provided): private key used for signing
- `network` (optional): select a network by shorthand or CAIP-2 id. Defaults to `ethereum-sepolia`.
- `rpcUrl` (optional): override the core API URL directly (for self-hosted deployments).
- `ethereumHttpRpcUrl` (optional): Ethereum JSON-RPC endpoint; fetched from core if omitted
- `contractAddress` (optional): Core4Mica contract address; fetched from core if omitted
- `adminApiKey` (optional): API key for admin RPCs
- `bearerToken` (optional): static bearer token for auth
- `authUrl` and `authRefreshMarginSecs` (optional): SIWE auth config. Only used when auth is
  enabled via `enableAuth()` or by setting either value (defaults to `rpcUrl` and 60 seconds).

> Note: `ethereumHttpRpcUrl` and `contractAddress` are fetched from the core service by default.
> The SDK validates the connected chain ID but does not verify the contract address or code. Only
> override these if you need to use different values than the server defaults.

### 1) Using ConfigBuilder

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';

async function main() {
  const cfg = new ConfigBuilder()
    .network('base') // or "ethereum-sepolia" (default)
    .walletPrivateKey('0x...')
    .build();

  const client = await Client.new(cfg);
  try {
    // use client.user, client.recipient, client.rpc
  } finally {
    await client.aclose();
  }
}
```

### 2) Using Environment Variables

Set environment variables (example `.env`):

```bash
4MICA_WALLET_PRIVATE_KEY="0x..."
4MICA_NETWORK="base"                   # shorthand or CAIP-2 id
# or override URL directly:
# 4MICA_RPC_URL="https://base.sepolia.api.4mica.xyz/"
4MICA_ETHEREUM_HTTP_RPC_URL="http://localhost:8545"
4MICA_CONTRACT_ADDRESS="0x..."
4MICA_ADMIN_API_KEY="ak_..."
4MICA_BEARER_TOKEN="Bearer <access_token>"
4MICA_AUTH_URL="https://ethereum.sepolia.api.4mica.xyz/"
4MICA_AUTH_REFRESH_MARGIN_SECS="60"
```

If you want to set them inline for a single command, use `env` since most shells do not allow
variable names that start with a digit:

```bash
env 4MICA_WALLET_PRIVATE_KEY="0x..." 4MICA_NETWORK="base" node app.js
```

Then in code:

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';

const cfg = new ConfigBuilder().fromEnv().build();
const client = await Client.new(cfg);
```

### 3) Using a Custom Signer

If you want to integrate with a custom signer (hardware wallet, remote signer, etc.), provide a
`viem` `Account` implementation. It must expose `address`, `signTypedData`, and `signMessage` for
SIWE auth.

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const signer = privateKeyToAccount(process.env.PAYER_KEY as `0x${string}`);
const cfg = new ConfigBuilder().signer(signer).build();
const client = await Client.new(cfg);
```

### SIWE Auth (Optional)

Enable automatic SIWE auth refresh, or pass a static bearer token:

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';

const cfg = new ConfigBuilder()
  .walletPrivateKey('0x...')
  .rpcUrl('https://api.4mica.xyz/')
  .enableAuth()
  .build();

const client = await Client.new(cfg);
await client.login(); // optional: first RPC call also triggers auth
```

Or use a static token:

```ts
const cfg = new ConfigBuilder()
  .walletPrivateKey('0x...')
  .bearerToken('Bearer <access_token>')
  .build();
```

Env vars: `4MICA_BEARER_TOKEN`, `4MICA_AUTH_URL`, `4MICA_AUTH_REFRESH_MARGIN_SECS`.

## Usage

The SDK exposes three main entry points:

- `client.user`: payer-side operations (collateral, signing, withdrawals)
- `client.recipient`: recipient-side operations (tabs, guarantees, remuneration)
- `X402Flow`: helper for 402-protected HTTP resources

### End-to-end Example (Base Sepolia + x402 v2)

See `examples/base-sepolia-x402-facilitator-e2e.ts` for a full flow in the `examples` folder:

- deposit collateral
- create/get a tab via facilitator
- issue and verify V1 + V2 guarantees
- `payTab` in ERC20 for V1
- remunerate V2 only after `wachai-validation-sdk` returns a passing ERC-8004 validation
- submit + finalize withdrawal

Run it with:

```bash
cp examples/.env.x402-facilitator-e2e.example examples/.env.x402-facilitator-e2e
npx dotenv-cli -e examples/.env.x402-facilitator-e2e -- npm run example:base-sepolia:x402-v2
```

### X402 flow (HTTP 402)

The X402 helper turns `paymentRequirements` from a `402 Payment Required` response into an
X-PAYMENT header (and optional `/settle` call) that the facilitator will accept.

#### What the SDK expects from `paymentRequirements`

At minimum you need:

- `scheme` and `network` (scheme must include `4mica`, e.g. `4mica-credit`)
- `payTo` (recipient address), `asset`, and `maxAmountRequired` (v1) or `amount` (v2)
- `extra.tabEndpoint` for tab resolution

`X402Flow` will refresh the tab by calling `extra.tabEndpoint` before signing.

#### X402 Version 1

Version 1 returns payment requirements in the JSON response body:

```ts
import { Client, ConfigBuilder, X402Flow } from '@4mica/sdk';
import type { PaymentRequirementsV1 } from '@4mica/sdk';

type ResourceResponse = {
  x402Version: number;
  accepts: PaymentRequirementsV1[];
  error?: string;
};

const cfg = new ConfigBuilder().walletPrivateKey('0x...').build();
const client = await Client.new(cfg);
const flow = X402Flow.fromClient(client);

// 1) GET the protected endpoint and parse JSON body
const res = await fetch('https://resource-url/resource');
const body = (await res.json()) as ResourceResponse;

// 2) Select a payment option
const requirements = body.accepts[0];

// 3) Build the X-PAYMENT header with the SDK
const payment = await flow.signPayment(requirements, '0xUser');

// 4) Call the protected resource with the header
await fetch('https://resource-url/resource', {
  headers: { 'X-PAYMENT': payment.header },
});

await client.aclose();
```

#### X402 Version 2

Version 2 uses the `payment-required` header (base64-encoded) instead of a JSON response body:

```ts
import { Client, ConfigBuilder, X402Flow } from '@4mica/sdk';
import type { X402PaymentRequired, PaymentRequirementsV2 } from '@4mica/sdk';

const cfg = new ConfigBuilder().walletPrivateKey('0x...').build();
const client = await Client.new(cfg);
const flow = X402Flow.fromClient(client);

// 1) GET the protected endpoint and extract payment-required header
const res = await fetch('https://resource-url/resource');
const header = res.headers.get('payment-required');
if (!header) throw new Error('Missing payment-required header');

// 2) Decode the header
const decoded = Buffer.from(header, 'base64').toString('utf8');
const paymentRequired = JSON.parse(decoded) as X402PaymentRequired;

// 3) Select a payment option
const accepted = paymentRequired.accepts[0] as PaymentRequirementsV2;

// 4) Build the PAYMENT-SIGNATURE header with the SDK
const signed = await flow.signPaymentV2(paymentRequired, accepted, '0xUser');

// 5) Call the protected resource with the header
await fetch('https://resource-url/resource', {
  headers: { 'PAYMENT-SIGNATURE': signed.header },
});

await client.aclose();
```

#### Resource server / facilitator side

If your resource server proxies to the facilitator, you can reuse the SDK to settle after
verifying:

```ts
import { Client, ConfigBuilder, X402Flow } from '@4mica/sdk';
import type { PaymentRequirementsV1, X402SignedPayment } from '@4mica/sdk';

async function settle(
  facilitatorUrl: string,
  paymentRequirements: PaymentRequirementsV1,
  payment: X402SignedPayment
) {
  const core = await Client.new(
    new ConfigBuilder().walletPrivateKey(process.env.RESOURCE_SIGNER_KEY!).build()
  );
  const flow = X402Flow.fromClient(core);

  const settled = await flow.settlePayment(payment, paymentRequirements, facilitatorUrl);
  console.log('settlement result:', settled.settlement);

  await core.aclose();
}
```

Notes:

- `signPayment` and `signPaymentV2` always use EIP-712 signing and will error if the scheme is not 4mica.
- `UserClient.signPayment` supports `SigningScheme.EIP712` (default) and `SigningScheme.EIP191`.
- `settlePayment` only hits `/settle`; resource servers should still call `/verify` first when enforcing access.
- `RecipientClient.remunerate` requires the optional `@noble/curves` dependency for BLS decoding.

### API Methods Summary

#### UserClient Methods

- `approveErc20(token, amount)`
- `deposit(amount, erc20Token?)`
- `getUser()`
- `getTabPaymentStatus(tabId)`
- `signPayment(claims, scheme?)`
- `payTab(tabId, reqId, amount, recipientAddress, erc20Token?)`
- `requestWithdrawal(amount, erc20Token?)`
- `cancelWithdrawal(erc20Token?)`
- `finalizeWithdrawal(erc20Token?)`

ERC20 approval behavior:

- `deposit(amount, erc20Token)` requires a prior `approveErc20(token, amount)` call.
- `payTab(...)` auto-approves the Core4Mica contract when paying an ERC20 tab and the current
  allowance is below the payment amount.
- `approveErc20` returns `undefined` when the existing allowance is already sufficient.

#### RecipientClient Methods

- `createTab(userAddress, recipientAddress, erc20Token?, ttl?, guaranteeVersion?)`
- `getTabPaymentStatus(tabId)`
- `issuePaymentGuarantee(claims, signature, scheme)` — accepts V1 or V2 claims
- `verifyPaymentGuarantee(cert)`
- `remunerate(cert)` — requires `@noble/curves` peer dependency
- `listSettledTabs()`
- `listPendingRemunerations()`
- `getTab(tabId)`
- `listRecipientTabs(settlementStatuses?)`
- `getTabGuarantees(tabId)`
- `getLatestGuarantee(tabId)`
- `getGuarantee(tabId, reqId)`
- `listRecipientPayments()`
- `getCollateralEventsForTab(tabId)`
- `getUserAssetBalance(userAddress, assetAddress)`

#### Admin / RPC Methods

Available under `client.rpc` (requires an admin API key):

- `updateUserSuspension(userAddress, suspended)`
- `createAdminApiKey({ name, scopes })`
- `listAdminApiKeys()`
- `revokeAdminApiKey(keyId)`

### V2 Payment Guarantees (on-chain validation policy)

V2 guarantees attach an on-chain validation policy that lets a validator agent attest to the
quality/validity of a payment before it is remunerated. Use `PaymentGuaranteeRequestClaimsV2`
and the canonical hash helpers:

```ts
import {
  PaymentGuaranteeRequestClaimsV2,
  computeValidationSubjectHash,
  computeValidationRequestHash,
  SigningScheme,
} from '@4mica/sdk';

// 1) Build base V1 claims first
const baseClaims = PaymentGuaranteeRequestClaims.new(
  userAddress,
  recipientAddress,
  tabId,
  amount,
  timestamp,
  erc20Token,
  reqId
);

// 2) Compute canonical hashes
const validationSubjectHash = computeValidationSubjectHash(baseClaims);

const partialV2 = new PaymentGuaranteeRequestClaimsV2({
  ...baseClaims,
  validationRegistryAddress: '0x...',
  validationRequestHash: '0x' + '00'.repeat(32), // placeholder
  validationChainId: 1,
  validatorAddress: '0x...',
  validatorAgentId: 1n,
  minValidationScore: 80, // 1–100
  validationSubjectHash,
  requiredValidationTag: 'my-tag',
});

const validationRequestHash = computeValidationRequestHash(partialV2);
const claimsV2 = new PaymentGuaranteeRequestClaimsV2({ ...partialV2, validationRequestHash });

// 3) Sign and issue
const { signature, scheme } = await client.user.signPayment(claimsV2, SigningScheme.EIP712);
const cert = await client.recipient.issuePaymentGuarantee(claimsV2, signature, scheme);
```

## Error Handling

All SDK errors extend `FourMicaError`. Import individual error classes to distinguish them:

```ts
import {
  ConfigError, // invalid ConfigBuilder input
  RpcError, // 4Mica core service error (has .status and .body)
  SigningError, // signing scheme unsupported or address mismatch
  ContractError, // on-chain call failed or unexpected result
  VerificationError, // BLS certificate decode/domain mismatch
  X402Error, // x402 flow error (bad scheme, tab resolution, settlement)
  AuthError, // base class for all auth errors
  AuthMissingConfigError, // auth not configured when login() is called
} from '@4mica/sdk';

try {
  await client.recipient.remunerate(cert);
} catch (err) {
  if (err instanceof VerificationError) {
    /* bad cert */
  }
  if (err instanceof ContractError) {
    /* on-chain failure */
  }
}
```

## License

MIT
