---
"@4mica/sdk": minor
---

`FourMica`: a short way in. Connect once, then deposit, pay and withdraw with
amounts written the way people write them.

```ts
await using client = await FourMica.connect({ privateKey, network: "base-sepolia" });
await client.deposit("5 USDC");
const res = await client.fetch("https://api.example.com/data");
```

- `FourMica.connect({ privateKey | signer | env, network?, rpcUrl?,
  facilitatorUrl?, spend?, protocols? })`. Each network the session touches gets
  its own `Client`, connected on first use; `close()` (or `await using`) closes
  them all. `await client.lowLevel(network?)` hands over the `Client` for
  anything the facade does not cover.
- `deposit("5 USDC")` resolves the asset against core's token list, checks the
  wallet before anything is signed, goes gasless where it can, and resolves once
  core counts the collateral. After `timeoutMs` it returns `status: "pending"`
  rather than throwing, since the money has moved; `wait: "mined"` skips the
  wait, `gas: "self"` approves and sends the wallet's own transaction.
- `balance()`, `withdraw()`, `withdrawals()`, `finalizeWithdrawal()` (checked
  against the grace period first) and `cancelWithdrawal()`.
- `fetch()` pays a 4Mica x402 402 within spend limits (default `perPayment:
  "1 USDC"`; a payment is only allowed in an asset a `perPayment` entry names)
  and retries once. `paymentFor(response)` says what was paid.
- Amounts are decimal strings only, `"5 USDC"` or `{ amount, asset }`: numbers
  and bigints are refused, and more decimals than the token has is an error,
  never rounded.

Shared pieces, also usable without the facade:

- `@4mica/sdk/amounts` (`parseAmount`, `toBaseUnits`, `formatUnits`,
  `resolveToken`) and `@4mica/sdk/networks` (`NETWORKS`, `resolveNetwork`,
  `DEFAULT_NETWORK`) import nothing, so they can be used without bundling viem.
  `networks.json` is the single network list; `NetworkInfo` gains `chainId`,
  `label`, `facilitatorUrl`, `explorerUrl`, `nativeSymbol` and `testnet`.
- New errors: `TokenNotSupportedError`, `AmbiguousTokenError`,
  `AmountPrecisionError`, `InsufficientBalanceError`, `GasRequiredError`,
  `SpendLimitError`.
- `ContractGateway` gains `erc20Balance`, `nativeBalance` and
  `withdrawalGracePeriod`.

Behaviour changes:

- `ConfigBuilder.network(...)` now also selects the network's hosted
  facilitator (Base Sepolia's `https://testnet.payment.4mica.io/`) unless
  `facilitatorUrl(...)` sets one, so deposits and withdrawals on Base Sepolia go
  gasless by default. `rpcUrl(...)` drops it again; a builder that never calls
  `network(...)` is unchanged.
- `fromEnv` also reads `FOURMICA_*` (a shell cannot `export` a name starting
  with a digit). The `4MICA_*` names still work; setting both prefixes of one
  variable to different values is a `ConfigError`.
- `SupportedTokenInfo.decimals` is required, and a token list missing a token's
  `symbol` or `decimals` is an `InvalidParamsError` instead of being passed on
  half-filled. Core always sends both.
- The build now splits shared code into chunks, so an error thrown through one
  entry point (`@4mica/sdk/amounts`) is `instanceof` the class exported by
  another (`@4mica/sdk`).
