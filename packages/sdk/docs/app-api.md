# 4Mica App API (`@4mica/sdk/app`)

`@4mica/sdk/app` talks to the 4Mica dashboard API with a **secret key**. It is separate from the
core client: the core client signs and verifies payments on the network, while the App API tells
your service what you configured in the dashboard for one API listing or agent, and lets you record
what happened.

Runtime-neutral: it only uses the global `fetch`, so it works in Node 18+, Bun, Deno and edge
runtimes.

## 1. Create a secret key

1. Open the dashboard and go to the API listing or agent you are integrating.
2. In **Secret keys**, type a name (for example `Production server`) and click **Create key**.
3. Copy the key. It is shown once and stored hashed; create a new one if you lose it.

A key belongs to the listing or agent it was created on. It can only read that resource, and any
payment it reports is attributed to that resource. Revoke it from the same place.

> Keys from **Settings → Developer** are account-wide. They work for reporting payments and
> resolving customers, but `resource()` rejects them because they are not tied to one listing or
> agent.

## 2. Configure the client

```ts
import { createAppClient } from "@4mica/sdk/app";

const app = createAppClient({
  apiKey: process.env.FOURMICA_API_KEY!,
  // baseUrl defaults to https://api.app.4mica.io; set it for a local stack:
  // baseUrl: "http://localhost:4000",
});
```

| Option    | Required | Default                     |
| --------- | -------- | --------------------------- |
| `apiKey`  | yes      |                             |
| `baseUrl` | no       | `https://api.app.4mica.io`  |
| `fetch`   | no       | the global `fetch`          |

`@4mica/sdk-node`, `@4mica/sdk-bun` and `@4mica/sdk-deno` add `createAppClient()` with no
arguments, reading `FOURMICA_API_KEY` and `FOURMICA_API_URL` from the environment.

## 3. What you can do

### Read your listing or agent: `app.resource()`

Returns what the key is tied to, with its pricing and payment wiring, the published policy and the
FAQs. Use it to drive your paywall from the dashboard instead of hard-coding prices.

```ts
const { kind, listing, agent, policy, faqs } = await app.resource();

if (kind === "listing" && listing) {
  console.log(listing.priceAmount, listing.priceCurrency, listing.payToAddress);
  console.log(listing.network); // "BASE" | "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA"
}
console.log(policy?.refundPolicy, policy?.rateLimit);
```

Exactly one of `listing` or `agent` is set, named by `kind`. `policy` is `null` until you fill it in
on the dashboard.

### Check a payer before serving: `app.resolveCustomer()`

Applies the customer rules you set in the dashboard (block or suspend, free allowance, coupons,
discounts, credit, minimum amount, approval threshold) to one payer and one gross amount. It is
read-only, so it is safe to call on every request.

```ts
const decision = await app.resolveCustomer({
  payerAddress: "0x…",
  network: "base-sepolia", // shorthand, CAIP-2 or the API's own name all work
  amount: "0.01",          // decimal string in the asset's display units
  couponCode: "LAUNCH10",  // optional
});

if (!decision.allowed) {
  // decision.deniedReason: "customer_blocked" | "customer_suspended" | "identity_blocked" | "below_minimum"
}
if (decision.needsApproval) {
  // hold the request for manual approval
}
console.log(decision.gross, decision.payable, decision.creditApplied);
```

An unknown payer is allowed at full price.

### Record a payment: `app.reportPayment()`

Writes the payment your service took to your dashboard ledger, so it shows in Payments and
Customers. Idempotent on `reqId`, which the payer mints once per payment: a retry updates the same
row. `created` tells you whether this call made the row.

```ts
const { payment, created } = await app.reportPayment({
  reqId,
  payerAddress,
  recipientAddress: listing.payToAddress!,
  network: listing.network!,
  assetAddress: listing.assetAddress, // null for the chain's native asset
  amount: "0.01",
  status: "SETTLED",                   // default; or "PENDING" | "FAILED"
  resource: request.url,
  description: "One quote",
});
```

With a listing or agent key the payment is attributed automatically. You can still pass
`listingSlug` or `agentSlug`, but it must match the key or the API answers 400.

### Helpers

- `paymentFromHeader(header, decimals = 18)` reads `reqId`, `payerAddress` and the amount from the
  `X-PAYMENT` header the paywall just verified, and converts the amount to a display string.
  Pass `6` for USDC.
- `toAppNetwork(network)` converts `"base"`, `"eip155:8453"` or `"BASE"` to the API's enum. The
  client calls it for you on `network` inputs.
- `fromAppNetwork(network)` goes the other way: `"BASE_SEPOLIA"` from `resource()` becomes
  `"base-sepolia"`, which the core client and the paywall take.
- `toDisplayAmount(raw, decimals)` formats base units as a decimal string.

## 4. Putting it together with a paywall

```ts
import { createPaywall, parsePaymentHeader } from "@4mica/sdk/server";
import { createAppClient, paymentFromHeader } from "@4mica/sdk/app";

const app = createAppClient({ apiKey: process.env.FOURMICA_API_KEY! });
const { listing } = await app.resource();

const paywall = createPaywall(client.rpc, {
  payTo: listing!.payToAddress!,
  asset: listing!.assetAddress ?? "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "10000", // base units
});

export async function handle(request: Request): Promise<Response> {
  const result = await paywall.handle(request);
  if (result instanceof Response) return result; // 402

  const paid = paymentFromHeader(request.headers.get("x-payment")!, 6);

  const decision = await app.resolveCustomer({
    payerAddress: paid.payerAddress,
    network: "base-sepolia",
    amount: paid.amount,
  });
  if (!decision.allowed) {
    return Response.json({ error: decision.deniedReason }, { status: 403 });
  }

  const response = Response.json({ ok: true });
  result.headers.forEach((value, key) => response.headers.set(key, value));

  void app.reportPayment({
    reqId: paid.reqId,
    payerAddress: paid.payerAddress,
    recipientAddress: listing!.payToAddress!,
    network: "base-sepolia",
    assetAddress: listing!.assetAddress,
    amount: paid.amount,
    resource: request.url,
  });

  return response;
}
```

## 5. Errors

Every failed call throws `AppError`:

| Field     | Meaning                                                        |
| --------- | -------------------------------------------------------------- |
| `status`  | HTTP status, `undefined` when the request never reached the API |
| `code`    | The API's error code, for example `unauthorized`, `key_not_scoped`, `invalid_request` |
| `message` | The API's message                                               |
| `issues`  | `{ path, message }[]` for validation failures                    |
| `body`    | The raw response body                                           |

| `status` | `code`                | Cause                                                        |
| -------- | --------------------- | ------------------------------------------------------------ |
| 401      | `unauthorized`        | Missing, revoked or expired key, or its listing/agent was deleted |
| 403      | `key_not_scoped`      | `resource()` called with an account-wide key                 |
| 400      | `invalid_request`     | A field failed validation; see `issues`                      |
| 409      | `conflict`            | A payment report contradicts an earlier one for the same `reqId` |
| 429      | `rate_limit_exceeded` | Slow down                                                    |

A missing `apiKey` throws `ConfigError`, and an unknown `network` throws `InvalidParamsError`,
both from `@4mica/sdk`.
