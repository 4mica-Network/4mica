# @4mica/x402

Express middleware and client integration for the x402 Payment Protocol with 4mica credit flow support. This package provides batteries-included middleware for adding 4mica payment requirements to your Express.js applications, with automatic facilitator and scheme registration.

## Installation

```bash
pnpm install @4mica/x402
```

## Quick Start (Server)

```typescript
import express from "express";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";

const app = express();
app.use(express.json());

// Apply the payment middleware - facilitator and scheme are automatically configured
app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /premium-content": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.10",
          network: "eip155:11155111", // Ethereum Sepolia
          payTo: "0xYourAddress",
        },
        description: "Access to premium content",
      },
    },
    // Payment tab config
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
    }
  )
);

// Implement your protected route
app.get("/premium-content", (req, res) => {
  res.json({ message: "This is premium content behind a paywall" });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

## Quick Start (Client)

### Using with Fetch

Use with `@x402/fetch` for automatic payment handling:

```typescript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

// Create an EVM account
const account = privateKeyToAccount("0xYourPrivateKey");

// Create the 4mica scheme client
const scheme = await FourMicaEvmScheme.create(account);

// Wrap fetch with payment handling
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: "eip155:11155111", // Ethereum Sepolia
      client: scheme,
    },
  ],
});

// Make requests - payments are handled automatically
const response = await fetchWithPayment("https://api.example.com/premium-content");
const data = await response.json();
console.log(data);
```

### Using with Axios

Use with `@x402/axios` for Axios-based applications:

```typescript
import axios from "axios";
import { wrapAxiosWithPaymentFromConfig } from "@x402/axios";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

// Create an EVM account
const account = privateKeyToAccount("0xYourPrivateKey");

// Create the 4mica scheme client
const scheme = await FourMicaEvmScheme.create(account);

// Wrap axios instance with payment handling
const api = wrapAxiosWithPaymentFromConfig(axios.create(), {
  schemes: [
    {
      network: "eip155:11155111", // Ethereum Sepolia
      client: scheme,
    },
  ],
});

// Make requests - payments are handled automatically
const response = await api.get("https://api.example.com/premium-content");
const data = response.data;
console.log(data);
```

## Server Configuration

### `paymentMiddlewareFromConfig(routes, tabConfig, ...options)`

The recommended middleware factory for most use cases. Automatically configures the 4mica facilitator and registers the `FourMicaEvmScheme` for all supported networks.

#### Parameters

1. **`routes`** (required): Route configurations for protected endpoints

```typescript
{
  "GET /path": {
    accepts: {
      scheme: "4mica-credit",
      price: "$0.10",
      network: "eip155:11155111", // or "eip155:80002" for Polygon Amoy
      payTo: "0xRecipientAddress",
    },
    description: "What the user is paying for",
  }
}
```

2. **`tabConfig`** (required): Payment tab configuration

```typescript
{
  // Full URL endpoint for opening payment tabs
  // This is injected into paymentRequirements.extra and clients use it to open tabs
  advertisedEndpoint: "https://api.example.com/tabs/open",
  
  // Lifetime of payment tabs in seconds
  ttlSeconds: 3600, // optional, defaults to facilitator's default
}
```

3. **`facilitatorClients`** (optional): Additional facilitator client(s) for other payment schemes
4. **`schemes`** (optional): Additional scheme registrations for other networks/schemes
5. **`paywallConfig`** (optional): Configuration for the built-in paywall UI
6. **`paywall`** (optional): Custom paywall provider
7. **`syncFacilitatorOnStart`** (optional): Whether to sync with facilitator on startup (defaults to true)

#### V2 Requirements Extra

When using x402 V2, `paymentRequirements.extra` must include the validation policy fields expected by the 4mica SDKs and facilitator:

```typescript
const extra = {
  validationRegistryAddress: '0x3333333333333333333333333333333333333333',
  validatorAddress: '0x4444444444444444444444444444444444444444',
  validatorAgentId: '7',
  minValidationScore: 80,
  jobHash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  requiredValidationTag: 'hard-finality', // optional
  tabEndpoint: 'https://api.example.com/tabs/open',
}
```

#### Supported Networks

- `eip155:11155111` - Ethereum Sepolia
- `eip155:80002` - Polygon Amoy

### Advanced Server Usage

For advanced scenarios where you need additional payment schemes or custom configuration:

#### Using `paymentMiddleware` with Custom Server

```typescript
import { paymentMiddleware } from "@4mica/x402/server/express";
import { 
  x402ResourceServer,
  FourMicaFacilitatorClient,
} from "@4mica/x402/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

// Create 4mica facilitator
const fourMicaFacilitator = new FourMicaFacilitatorClient();

// Optionally add other facilitators/schemes for additional payment methods
const otherFacilitator = new HTTPFacilitatorClient({ 
  url: "https://other-facilitator.example.com" 
});

// Create resource server with facilitators and additional schemes
// The middleware will auto-register FourMicaEvmScheme
const resourceServer = new x402ResourceServer([
  fourMicaFacilitator,
  otherFacilitator,
])
  .register("eip155:8453", new ExactEvmScheme()); // Add Base mainnet with exact scheme

app.use(
  paymentMiddleware(
    routes,
    resourceServer,
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
      ttlSeconds: 3600,
    },
    paywallConfig
  )
);
```

#### Using `paymentMiddlewareFromHTTPServer` with HTTP Hooks

```typescript
import { paymentMiddlewareFromHTTPServer } from "@4mica/x402/server/express";
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  FourMicaFacilitatorClient,
} from "@4mica/x402/server";

// Create 4mica facilitator
const fourMicaFacilitator = new FourMicaFacilitatorClient();

// The middleware will auto-register FourMicaEvmScheme
const resourceServer = new x402ResourceServer(fourMicaFacilitator);

const httpServer = new x402HTTPResourceServer(resourceServer, routes)
  .onProtectedRequest((context) => {
    console.log("Protected request:", context.path);
  });

app.use(
  paymentMiddlewareFromHTTPServer(
    httpServer,
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
      ttlSeconds: 3600,
    },
    paywallConfig
  )
);
```

## Client Configuration

### Multi-Network Client Setup

```typescript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";

const sepoliaScheme = await FourMicaEvmScheme.create(sepoliaAccount);
const amoyScheme = await FourMicaEvmScheme.create(amoyAccount);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [
    {
      network: "eip155:11155111", // Ethereum Sepolia
      client: sepoliaScheme,
    },
    {
      network: "eip155:80002", // Polygon Amoy
      client: amoyScheme,
    },
  ],
});
```

### Using Builder Pattern

```typescript
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";

const scheme = await FourMicaEvmScheme.create(account);

const client = new x402Client()
  .register("eip155:11155111", scheme);

const fetchWithPayment = wrapFetchWithPayment(fetch, client);
```

## Complete Example

### Server

```typescript
import express from "express";
import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";

const app = express();
app.use(express.json());

app.use(
  paymentMiddlewareFromConfig(
    {
      "GET /api/data": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.05",
          network: "eip155:11155111",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        },
        description: "API data access",
      },
      "POST /api/compute": {
        accepts: {
          scheme: "4mica-credit",
          price: "$0.20",
          network: "eip155:11155111",
          payTo: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
        },
        description: "Computation service",
      },
    },
    {
      advertisedEndpoint: "https://api.example.com/tabs/open",
      ttlSeconds: 7200, // 2 hours
    }
  )
);

app.get("/api/data", (req, res) => {
  res.json({ data: "Premium data content" });
});

app.post("/api/compute", (req, res) => {
  res.json({ result: "Computation complete" });
});

app.listen(3000);
```

### Client

```typescript
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const scheme = await FourMicaEvmScheme.create(account);

  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [
      {
        network: "eip155:11155111",
        client: scheme,
      },
    ],
  });

  // Fetch premium data - payment handled automatically
  const dataResponse = await fetchWithPayment("https://api.example.com/api/data");
  const data = await dataResponse.json();
  console.log("Data:", data);

  // Make computation request - payment handled automatically
  const computeResponse = await fetchWithPayment("https://api.example.com/api/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: "some data" }),
  });
  const result = await computeResponse.json();
  console.log("Result:", result);
}

main();
```

## How It Works

1. **Server Setup**: The middleware automatically registers the `FourMicaEvmScheme` and injects the 4mica facilitator client, so you don't need to configure them manually.

2. **Tab Management**: When a client requests a protected resource, the middleware handles the tab lifecycle:
   - The `advertisedEndpoint` is injected into `paymentRequirements.extra.tabEndpoint`
   - Clients use this endpoint to open payment tabs
   - The middleware automatically processes tab opening requests when they arrive at the advertised endpoint

3. **Payment Flow**:
   - Client makes initial request to protected resource
   - Server responds with `402 Payment Required` including payment requirements
   - Client requests a tab from the advertised endpoint
   - Client signs a payment guarantee using the 4mica SDK
   - Client retries the request with the payment payload
   - Server verifies and settles the payment via the 4mica facilitator
   - Server returns the protected resource

## License

MIT
