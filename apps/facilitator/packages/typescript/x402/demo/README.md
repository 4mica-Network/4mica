# @4mica/x402 Demo

A paywalled Express endpoint and a client that pays for it with `4mica-credit` on Base Sepolia,
using `@4mica/x402` and `@x402/fetch`. Plus an Apify-shaped demo: a mock of Apify's Actor run
endpoint and an MCP server with one paid tool, both advertising `4mica-credit` next to `upto`
and `exact`, paid for through [mcpc](https://github.com/apify/mcpc), with the unused part of
each run's cap paid back to the buyer as a guarantee.

## Setup

From the monorepo root:

```bash
pnpm install
pnpm --filter @4mica/sdk build
pnpm --filter @4mica/x402 build
```

Then configure the demo:

```bash
cd apps/facilitator/packages/typescript/x402/demo
cp .env.example .env
```

| Variable | Used by | Meaning |
| --- | --- | --- |
| `NETWORK` | all | CAIP-2 network. `eip155:84532` (Base Sepolia) by default. |
| `PAY_TO_ADDRESS` | server | Recipient of the express demo's payments. |
| `PRIVATE_KEY` | client, deposit, balance | Buyer wallet key, `0x`-prefixed. |
| `SELLER_PRIVATE_KEY` | actor-server, mcp-server, balance | Seller wallet key, `0x`-prefixed. It receives the caps and pays the refunds, so it needs collateral too. |
| `API_URL` | client | Server base URL. `http://localhost:3000` by default. |
| `FACILITATOR_URL` | servers, deposit | Facilitator the servers verify and settle through, and that sponsors the deposit's gas. `https://x402.4mica.xyz` by default; set it empty for the deposit to go self-funded. |
| `DEPOSIT_AMOUNT` | deposit | USDC to deposit. `2` by default. |
| `WALLET` | balance, deposit | `seller` to act as the seller wallet; the buyer wallet otherwise. |
| `PORT` | server | Listen port. `3000` by default. |
| `CORE_URL` | all | A self-hosted core for `NETWORK`. Unset, the hosted deployment for the network is used. |
| `ACTOR_PORT` | actor-server | Listen port of the run endpoint. `3002` by default. |
| `MCP_PORT` | mcp-server | Listen port of the MCP server. `3001` by default. |
| `ACTOR_PRICE` | actor-server, mcp-server | The cap on one run. `$1.00` by default, the figure Apify advertises. |
| `RESULT_PRICE` | actor-server, mcp-server | The price of one result. `$0.02` by default, so a five-result run costs `$0.10` of the cap. |
| `RUN_SECONDS` | actor-server, mcp-server | How long the fake Actor "runs". `3` by default. |

## 1. Fund the payer

A payer needs free collateral in 4mica core before it can sign a guarantee. Hold some Base
Sepolia USDC in the wallet, then:

```bash
pnpm run deposit
```

The script asks core which USDC it accepts on the network, deposits `DEPOSIT_AMOUNT` of it
gaslessly through the facilitator (one signature, no ETH), and prints the collateral before and
after. Without `FACILITATOR_URL` it sends the deposit transaction itself, so the wallet needs gas.

`pnpm run balance` prints the same wallet's position as core sees it: collateral, what is locked
behind the guarantees it signed, what is free, what other wallets have signed to it, and the net
of the two.

## 2. Start the server

```bash
pnpm run server
```

Or from the package root: `pnpm demo:server`. Use `pnpm run`, not bare `pnpm server`: pnpm has a
built-in `server` command that shadows the script and exits silently. You should see:

```
x402 Demo Server running on http://localhost:3000
Protected endpoint: http://localhost:3000/api/premium-data
Payment required: $0.01 (4mica credit on eip155:84532)
```

## 3. Run the client

In a second terminal:

```bash
pnpm run client
```

Or from the package root: `pnpm demo:client`.

## What happens

1. **Server** protects `GET /api/premium-data` for `$0.01`. The middleware resolves the price to
   the USDC core lists for the network and advertises it in the `402` response.
2. **Client** requests the endpoint, gets `402 Payment Required`, signs a `4mica-credit`
   guarantee straight from the advertised requirements (a random `reqId`, no round-trip), retries
   with the `PAYMENT-SIGNATURE` header, and prints the protected data.
3. **Server** verifies the payment with the facilitator before running the handler and settles it
   after, which issues the guarantee in 4mica core and binds it to the open settlement cycle.

```
Client → GET /api/premium-data
       ← 402 Payment Required (payment-required header: accepts[4mica-credit])

Client → signs the guarantee claim (via the 4mica SDK)

Client → GET /api/premium-data (PAYMENT-SIGNATURE header)
Server → POST /verify (facilitator)
Server → POST /settle (facilitator → 4mica core issues the guarantee)
       ← 200 OK (protected data)
```

## Testing without the client

```bash
# Server status
curl http://localhost:3000/

# Protected endpoint: returns 402 with the payment-required header
curl -v http://localhost:3000/api/premium-data
```

## The Apify-shaped demo

Two more servers share one seller (`src/apify/`): a real `4mica-credit` entry built by the
scheme server, with the asset from core's token list and core's EIP-712 domain in `extra`, and
two shape-only entries in front of it so the 402 reads like Apify's.

- `pnpm run actor-server` (or `pnpm demo:actor` from the package root) mocks
  `POST /v2/acts/<actor>/run-sync-get-dataset-items`. Unpaid, it answers with Apify's 402: their
  error body verbatim and a `payment-required` header whose `accepts` are `upto`, `exact`, and
  `4mica-credit`. Paid, it verifies, "runs" for `RUN_SECONDS`, settles, refunds, and returns a
  five-row dataset with a `payment-response` header whose `amount` is what the run cost, and a
  `payment-refund` header for the guarantee that paid the rest back.
- `pnpm run mcp-server` (or `pnpm demo:mcp`) is a Streamable HTTP MCP server at `/mcp` with one
  tool, `run-actor`. The tool carries `_meta.x402` with the same accepts, the way Apify's MCP
  server marks paid tools. An unpaid call gets the challenge back as an error result with the
  `PaymentRequired` in `structuredContent`; a paid call carries the payment in
  `_meta["x402/payment"]` (or the `PAYMENT-SIGNATURE` header), and the result carries one line on
  what the run cost, the dataset, the billing in `structuredContent`, and the netted settlement in
  `_meta["x402/payment-response"]`.

The `upto` and `exact` entries are shape-only. The 4mica facilitator does not serve them, so a
payer that picks one is told so and nothing runs. Only the third entry is real.

### Cap, then refund

The buyer signs the cap (`ACTOR_PRICE`) before the run, the way `upto` authorizes a maximum.
The run is metered per result (`RESULT_PRICE`), and after it the seller pays the unused part of
the cap back as an ordinary `4mica-credit` guarantee from itself to the buyer, signed with
`SELLER_PRIVATE_KEY` under the same domain and settled through the same facilitator. Core nets
the two guarantees when the cycle commits, so one run of five results at `$0.02` settles at
`$0.10` of a `$1.00` cap, with no refund transaction and no new primitive.

Two things follow, and the balance script shows both:

- **The buyer's lock stays at the cap until the cycle commits.** The refund is a credit to the
  buyer, not a release of its collateral; the net position is the cap minus the refund.
- **The seller needs collateral of its own.** A refund guarantee locks that much of the
  seller's collateral until the cycle commits, and core does not count incoming credits toward
  free balance. Fund the seller wallet for the refunds it will issue in a cycle:

```bash
WALLET=seller pnpm run deposit     # deposits DEPOSIT_AMOUNT from SELLER_PRIVATE_KEY
WALLET=seller pnpm run balance
```

A run whose seller has no free collateral still settles at the cap; the refund fails, the log and
the tool result say so, and the cap stands.

### Buyer: mcpc

The buyer is the `4mica-credit` branch of the mcpc fork at
[4mica-Network/mcpc](https://github.com/4mica-Network/mcpc), which signs the scheme with
`--x402 4mica-credit` and signs afresh on every call, since core accepts a request id once.

The fork pins the Core4Mica contract per network and refuses an accept whose
`extra.verifyingContract` differs from the pin. Point the servers at the core the fork pins for
`NETWORK`; for Base Sepolia today that is the staging deployment:

```
CORE_URL=https://staging.api.4mica.io
FACILITATOR_URL=https://staging.facilitator.4mica.io
```

Then, with the fork built and on PATH as `mcpc`:

```bash
mcpc x402 import $PRIVATE_KEY                 # the same wallet the deposit funded
mcpc connect http://localhost:3001/mcp @demo --x402 4mica-credit
mcpc @demo tools-call run-actor query:="x402 isn't good (yet)"
mcpc @demo tools-call run-actor query:="and again"   # a fresh signature, not a reused one
```

Without `--x402`, the same call returns the challenge, which `mcpc @demo tools-get run-actor`
also shows under `_meta.x402`.

### The recording

`bash record.sh` runs the whole script in one command, with both servers up: both wallets before,
the 402 decoded, connect, two paid runs, both wallets after. The buyer's lock rises by two caps and
its incoming by two refunds; the seller's is the mirror image; nothing moves on-chain until the
cycle commits, and then only the net.

Note what verify does and does not check. The facilitator's `/verify` validates the signed
guarantee request; whether the payer holds collateral is only known at `/settle`, when core
issues the guarantee. A run paid by an unfunded wallet therefore verifies, runs, and fails at
settlement with `user not registered`, exactly as the express middleware would.

## Running against a local 4mica-core stack

`deployment/dev_stack.sh up` in 4mica-core starts anvil, deploys mock stablecoins and runs core
on port 3000. Run a facilitator against it (`apps/facilitator`, with `X402_NETWORKS` pointing at
`http://localhost:3000/` and a relayer key for gasless deposits), then point the demo at both:

```
NETWORK=eip155:84532            # whatever CHAIN_ID the stack was started with
CORE_URL=http://localhost:3000
FACILITATOR_URL=http://localhost:8080
PORT=3100                        # core already listens on 3000
API_URL=http://localhost:3100
PRIVATE_KEY=<a funded anvil account>
PAY_TO_ADDRESS=<any other address>
SELLER_PRIVATE_KEY=<another funded anvil account>
```

The server then prices against the local core's token list, advertises `extra.rpcUrl` so the
client signs against the same core, and verifies and settles through the local facilitator. The
same two variables point the demo at any other deployment, for example the develop-branch alpha
at `https://staging.api.4mica.io` and `https://staging.facilitator.4mica.io`. Mint
the payer some mock USDC first (`cast send <usdc> "mint(address,uint256)" <payer> 10000000`); the
address is the first entry of `GET http://localhost:3000/core/tokens`.

## Notes

- Verify and settle go to the hosted facilitator at `https://x402.4mica.xyz`.
- Settlement is per cycle, not per payment: the recipient's net credit becomes claimable on-chain
  when the cycle commits.
- A refund only nets against its cap if both land in the same cycle. A run that crosses the cycle
  boundary refunds into the next one, and the buyer's collateral covers the whole cap in the
  first.
- `pnpm test` runs the unit tests for the Apify-shaped 402, the payment readers, the metering and
  refund shapes, and the MCP result shapes. Nothing in them touches the network.
