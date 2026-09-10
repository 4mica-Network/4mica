# @4mica/x402 Demo

A paywalled Express endpoint and a client that pays for it with `4mica-credit` on Base Sepolia,
using `@4mica/x402` and `@x402/fetch`.

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
| `PAY_TO_ADDRESS` | server | Recipient of the payments. |
| `PRIVATE_KEY` | client, deposit | Payer wallet key, `0x`-prefixed. |
| `API_URL` | client | Server base URL. `http://localhost:3000` by default. |
| `FACILITATOR_URL` | server, deposit | Facilitator the server verifies and settles through, and that sponsors the deposit's gas. `https://x402.4mica.xyz` by default; set it empty for the deposit to go self-funded. |
| `DEPOSIT_AMOUNT` | deposit | USDC to deposit. `2` by default. |
| `PORT` | server | Listen port. `3000` by default. |
| `CORE_URL` | all | A self-hosted core for `NETWORK`. Unset, the hosted deployment for the network is used. |

## 1. Fund the payer

A payer needs free collateral in 4mica core before it can sign a guarantee. Hold some Base
Sepolia USDC in the wallet, then:

```bash
pnpm run deposit
```

The script asks core which USDC it accepts on the network, deposits `DEPOSIT_AMOUNT` of it
gaslessly through the facilitator (one signature, no ETH), and prints the collateral before and
after. Without `FACILITATOR_URL` it sends the deposit transaction itself, so the wallet needs gas.

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
