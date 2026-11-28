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
FAQs. Use it to price your routes from the dashboard instead of hard-coding them.

```ts
const { kind, listing, agent, policy, faqs } = await app.resource();

if (kind === "listing" && listing) {
  console.log(listing.priceAmount, listing.priceCurrency, listing.payToAddress);
  console.log(listing.network); // "BASE" | "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA"
  console.log(listing.assetDecimals); // 18 for ETH, 6 for USDC
}
console.log(policy?.refundPolicy, policy?.rateLimit);
```

Exactly one of `listing` or `agent` is set, named by `kind`. `priceAmount` is in the asset's display
units (`"0.01"` ETH); `assetDecimals` converts it to the base units x402 prices in, and is `null`
until the listing has a network. `policy` is `null` until you fill it in
on the dashboard.

### Check a payer before serving: `app.resolveCustomer()`

Applies the customer rules you set in the dashboard (block or suspend, free allowance, coupons,
discounts, credit, minimum amount, daily and monthly limits, approval threshold) to one payer and
one gross amount. It is read-only, so it is safe to call on every request: a coupon use and the
credit it draws are only consumed when you report the payment as settled (see below).

```ts
const decision = await app.resolveCustomer({
  payerAddress: "0x…",
  network: "base-sepolia", // shorthand, CAIP-2 or the API's own name all work
  amount: "0.01",          // decimal string in the asset's display units
  couponCode: "LAUNCH10",  // optional
});

if (!decision.allowed) {
  // decision.deniedReason: "customer_blocked" | "customer_suspended" | "identity_blocked"
  //   | "below_minimum" | "daily_limit_exceeded" | "monthly_limit_exceeded"
}
if (decision.needsApproval) {
  // hold the request for manual approval
}
console.log(decision.gross, decision.payable, decision.creditApplied);
```

An unknown payer is allowed at full price.

When `needsApproval` is `true`, ask your organization for a one-off approval with
`app.createApproval()` (below), and once it is `APPROVED` call `resolveCustomer()` again with the
same `payerAddress`, `network` and `amount` plus `approvalRequestId`. A matching approved request
clears `needsApproval` and is used up.

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

If `resolveCustomer()` applied a coupon or credit, pass `couponCode` and `creditApplied` (the
decision's `creditApplied`, when it is above zero) with the report. The first time the payment is
`SETTLED`, 4Mica counts the coupon use against its usage limit and draws the credit down, once per
`reqId`, however many times you retry. A coupon that ran out in the meantime is not counted, and
credit is never drawn below zero.

With a listing or agent key the payment is attributed automatically. You can still pass
`listingSlug` or `agentSlug`, but it must match the key or the API answers 400.

### Ask for an approval: `app.createApproval()` and `app.getApproval()`

Needs a key with the `APPROVALS_WRITE` scope. The request shows up in the dashboard under
Approvals, where people with the approver role decide it.

```ts
const { id } = await app.createApproval({
  payerAddress: "0x…",
  network: "base",
  assetAddress: listing.assetAddress, // null for the chain's native asset
  amount: "250",
  customerId: decision.customerId ?? undefined,
  resource: request.url,
  reason: "Order above the approval threshold",
});

const { status } = await app.getApproval(id);
// "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED"
if (status === "APPROVED") {
  await app.resolveCustomer({ payerAddress, network: "base", amount: "250", approvalRequestId: id });
}
```

### Check a payment against your spending policies: `app.authorizeSpend()`

The paying side of governance. Needs a key with the `SPEND_AUTHORIZE` scope. `FourMica.connect({
governance })` calls these for you around every payment `client.fetch` makes; call them directly
when you sign payments yourself.

```ts
const auth = await app.authorizeSpend({
  network: "base-sepolia",
  assetAddress: "0x…",       // null for the chain's native asset
  amount: "2.5",             // decimal string in the asset's display units
  payerAddress: "0x…",       // one of your organization's payer wallets
  recipientAddress: "0x…",
  agentId: "…",              // optional, when the key is not an agent's key
});

switch (auth.status) {
  case "RESERVED":
    // sign and send, then, unless the seller answered 402:
    await app.consumeSpendAuthorization(auth.id, { reqId });
    // or, if signing failed or the seller answered 402:
    await app.releaseSpendAuthorization(auth.id);
    break;
  case "PENDING_APPROVAL":
    // poll app.getSpendAuthorization(auth.id) until RESERVED or DENIED
    break;
  case "DENIED":
    console.log(auth.deniedReason); // "frozen" | "recipient_not_allowed" | "per_payment_limit"
    break;                          //   | "daily_limit" | "monthly_limit" | ...
}
```

Release only when the payment was definitively not taken: signing failed before anything was
sent, or the seller answered the signed request with a fresh 402. Once the signed payment has left
your process, a seller error, a timeout, a network failure or an aborted request leaves the outcome
unknown, since the seller holds a payment it may still redeem; consume with the `reqId` in that
case, so the spend is over-counted rather than under-counted. 4mica reconciles by `reqId` when the
seller reports the payment.

Both calls are idempotent: consuming again with the same `reqId`, or releasing again, answers 200.
Retry a network error, a 5xx or a 429 with backoff; another 4xx will not succeed on retry. A failure
here is bookkeeping, not a failed payment: never sign the payment again because of it.
`FourMica.connect({ governance })` retries up to three attempts, reports what is left through
`onAccountingError`, and exposes the result as `governanceOutcome(response)`.

A reservation expires 10 minutes after it is granted. Release one you will not use, so it stops
counting toward your limits.

Each of these methods takes an optional last argument `{ signal }`, passed to `fetch`, so you can
cancel or time-bound a single call. Before you send the payment, cancel freely and release what you
were granted; after you send it, finish the consume or release on a signal of its own rather than the
caller's, because the seller may still redeem the payment.

**This is a cooperative check, not hard enforcement.** 4mica's API is not in the payment path:
the payer signs locally, so anyone holding the wallet key can pay without asking. Such payments are
detected afterwards, when the seller reports them with `reportPayment()`: they raise an
unauthorized-spend alert in the dashboard and still count toward your limits.

### Helpers

- `paymentFromHeader(header, decimals = 18)` reads `reqId`, `payerAddress` and the amount from the
  payment header a seller's middleware just verified (`PAYMENT-SIGNATURE` in x402 v2), and
  converts the amount to a display string. Pass the listing's `assetDecimals`.
- `parseSettlement(settlement)` reads an x402 `onAfterSettle` context into what `reportPayment`
  takes: `reqId`, `payerAddress`, the amount in the asset's base units, and the guarantee receipt
  as `guaranteeClaims` and `guaranteeSignature` (`null` when the facilitator returned none).
- `toAppNetwork(network)` converts `"base"`, `"eip155:8453"` or `"BASE"` to the API's enum. The
  client calls it for you on `network` inputs.
- `fromAppNetwork(network)` goes the other way: `"BASE_SEPOLIA"` from `resource()` becomes
  `"base-sepolia"`, which the core client takes.
- `toCaip2(network)` from `@4mica/sdk` gives the CAIP-2 id x402 middleware wants, from any of
  those forms: `toCaip2("BASE_SEPOLIA")` is `"eip155:84532"`.
- `toDisplayAmount(raw, decimals)` formats base units as a decimal string, and `toBaseUnits(amount,
  decimals)` from `@4mica/sdk` goes the other way: `toBaseUnits("0.01", 18)` is
  `10000000000000000n`.

## 4. Putting it together with x402 middleware

`@4mica/x402`'s Express middleware answers the `402` and verifies the payment; the app API decides
whether to serve the payer and records what was paid. Settlement runs after the route answers, so
the guarantee receipt arrives in the resource server's `onAfterSettle` hook. A route that answers
with an error is not settled, so a refused payer is not charged.

```ts
import { toBaseUnits, toCaip2, ZERO_ADDRESS } from "@4mica/sdk";
import {
  createAppClient,
  parseSettlement,
  paymentFromHeader,
} from "@4mica/sdk/app";
import { FourMicaFacilitatorClient, x402ResourceServer } from "@4mica/x402/server";
import { paymentMiddleware } from "@4mica/x402/server/express";
import express from "express";

const app = createAppClient({ apiKey: process.env.FOURMICA_API_KEY! });
const { listing } = await app.resource();

if (!listing) {
  throw new Error("This key is not tied to a listing.");
}

const {
  payToAddress: payTo,
  assetAddress: asset,
  assetDecimals: decimals,
  network,
  priceAmount: price,
} = listing;

if (!payTo || !network || !price || decimals === null) {
  throw new Error("Finish payment setup for this listing in the dashboard.");
}

const facilitator = new FourMicaFacilitatorClient();
const server = new x402ResourceServer(facilitator);

server.onAfterSettle(async (settlement) => {
  const { reqId, payerAddress, amount, guaranteeClaims, guaranteeSignature } =
    parseSettlement(settlement);

  try {
    await app.reportPayment({
      reqId,
      payerAddress,
      amount,
      guaranteeClaims,
      guaranteeSignature,
      recipientAddress: payTo,
      network,
      assetAddress: asset,
    });
  } catch (error) {
    console.error("Payment report failed:", error);
  }
});

const http = express();

http.use(
  paymentMiddleware(
    {
      "GET /data": {
        accepts: {
          scheme: "4mica-credit",
          price: {
            amount: toBaseUnits(price, decimals).toString(),
            asset: asset ?? ZERO_ADDRESS,
          },
          network: toCaip2(network),
          payTo,
        },
      },
    },
    server,
  ),
);

http.get("/data", async (req, res) => {
  const paid = paymentFromHeader(
    req.get("payment-signature") ?? "",
    decimals,
  );
  const decision = await app.resolveCustomer({
    payerAddress: paid.payerAddress,
    network,
    amount: paid.amount,
    couponCode: typeof req.query.coupon === "string" ? req.query.coupon : null,
  });
  if (!decision.allowed) {
    res.status(403).json({ error: decision.deniedReason });
    return;
  }
  res.json({ ok: true });
});
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
| 403      | `payer_not_owned`     | `authorizeSpend()` with a payer that is not one of your organization's wallets on that network |
| 403      | `environment_mismatch` | `authorizeSpend()` on a network outside the key's environment |
| 404      | `not_found`           | An authorization or approval of another organization, or an unknown id |
| 409      |                       | Consuming an authorization that is not `RESERVED`            |
| 403      | `insufficient_scope`  | The key lacks `SPEND_AUTHORIZE` or `APPROVALS_WRITE`         |
| 400      | `invalid_request`     | A field failed validation; see `issues`                      |
| 409      | `conflict`            | A payment report contradicts an earlier one for the same `reqId` |
| 429      | `rate_limit_exceeded` | Slow down                                                    |

A missing `apiKey` throws `ConfigError`, and an unknown `network` throws `InvalidParamsError`,
both from `@4mica/sdk`.
