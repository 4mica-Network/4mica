# @4mica/x402 Demo

This demo shows how to use `@4mica/x402` to protect an API endpoint with 4mica payments.

## Setup

1. **Install dependencies**:

First, build the parent package:

```bash
cd ..
yarn install
yarn build
```

Then install demo dependencies:

```bash
cd demo
yarn install
```

2. **Configure environment variables**:

Copy the example file and edit it:

```bash
cp .env.example .env
# Edit .env with your private key and settings
```

Required variables:
- `PRIVATE_KEY`: Your Ethereum private key (with 0x prefix) for Sepolia testnet
- `PAY_TO_ADDRESS`: Address that will receive payments

## Running the Demo

### Terminal 1: Start the server

From the demo directory:

```bash
yarn server
```

Or from the package root:

```bash
yarn demo:server
```

You should see:
```
x402 Demo Server running on http://localhost:3000
Protected endpoint: http://localhost:3000/api/premium-data
Payment required: $0.01 (4mica credit on Sepolia)
```

### Terminal 2: Run the client

The client will automatically load environment variables from `.env`:

From the demo directory:

```bash
yarn client
```

Or from the package root:

```bash
yarn demo:client
```

You can also set PRIVATE_KEY inline:

```bash
PRIVATE_KEY=0xYourPrivateKey yarn client
```

## What Happens

1. **Server** starts with one protected endpoint: `GET /api/premium-data`
   - Requires a payment of $0.01 in 4mica credits on Sepolia
   - Uses x402 payment protocol

2. **Client** makes a request to the protected endpoint:
   - First receives `402 Payment Required` response
   - Automatically opens a payment tab via the 4mica facilitator
   - Signs and submits the payment
   - Retries the request with payment proof
   - Receives the protected data

3. **Payment Flow**:
   ```
   Client → GET /api/premium-data
          ← 402 Payment Required (with payment requirements)
   
   Client → POST /payment/tab (open payment tab)
          ← 200 OK (tab details)
   
   Client → Signs payment guarantee (via 4mica SDK)
   
   Client → GET /api/premium-data (with payment proof)
          ← 200 OK (protected data)
   ```

## Testing Without Running the Client

You can also test the server manually using curl:

```bash
# Check server status
curl http://localhost:3000/

# Try to access protected endpoint (will return 402)
curl -v http://localhost:3000/api/premium-data
```

## Notes

- Make sure your account has sufficient balance on Sepolia testnet
- The demo uses the default 4mica facilitator configuration
- Tab TTL is set to 1 hour (3600 seconds)
