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
| `FACILITATOR_URL` | deposit | Facilitator that sponsors the deposit's gas. `https://x402.4mica.xyz` by default; set it empty to deposit self-funded. |
| `DEPOSIT_AMOUNT` | deposit | USDC to deposit. `2` by default. |
| `PORT` | server | Listen port. `3000` by default. |

## 1. Fund the payer

A payer needs free collateral in 4mica core before it can sign a guarantee. Hold some Base
Sepolia USDC in the wallet, then:

```bash
pnpm deposit
```

The script asks core which USDC it accepts on the network, deposits `DEPOSIT_AMOUNT` of it
gaslessly through the facilitator (one signature, no ETH), and prints the collateral before and
after. Without `FACILITATOR_URL` it sends the deposit transaction itself, so the wallet needs gas.

## 2. Start the server

```bash
pnpm server
```

Or from the package root: `pnpm demo:server`. You should see:

```
x402 Demo Server running on http://localhost:3000
Protected endpoint: http://localhost:3000/api/premium-data
Payment required: $0.01 (4mica credit on eip155:84532)
```

## 3. Run the client

In a second terminal:

```bash
pnpm client
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

## Notes

- Verify and settle go to the hosted facilitator at `https://x402.4mica.xyz`.
- Settlement is per cycle, not per payment: the recipient's net credit becomes claimable on-chain
  when the cycle commits.
