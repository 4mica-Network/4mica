# Running 4Mica locally, end to end

How to bring up every moving part on one machine, publish a paywalled API, and
watch a real payment settle against it.

There are two repositories and seven processes. That sounds like a lot until
you see what each one is for, so start with the model.

---

## 1. What the pieces are

4Mica is a **credit layer**. A buyer does not transfer tokens per request.
Instead they deposit collateral once, then *sign a promise* for each request;
those promises net into one settlement per cycle. That is the whole reason the
system has the shape it does.

```text
┌─ 4mica-core (Rust, :3000) ──────────────────────────────────────────────┐
│  The ledger and the authority. Holds collateral accounting, issues BLS  │
│  guarantee certificates, runs settlement cycles. Talks to the chain.    │
└────────────────────────────────────────────────────────────────────────┘
        ▲ /core/guarantees, /core/public-params, /core/tokens
        │
┌─ facilitator (Rust, :8080) ─────────────────────────────────────────────┐
│  The thing sellers integrate with. Verifies a signed payment against    │
│  the requirements the seller advertised, then settles it through core.  │
└────────────────────────────────────────────────────────────────────────┘
        ▲ POST /verify, POST /settle
        │
┌─ a seller's own API (examples/example-seller-live, :3010) ──────────────┐
│  Ordinary Express. One middleware turns a route into a paid route.      │
└────────────────────────────────────────────────────────────────────────┘

┌─ anvil (:8545) ── local chain. Core4Mica + ClearingHouse + mock tokens ─┐
┌─ core's postgres (:5432) ── collateral, guarantees, cycles, wallet roles┐
```

And separately, the product that sits on top:

```text
┌─ apps/be (:4000) ── the dashboard's API. CRUD for wallets, APIs, agents.┐
┌─ apps/dashboard (:4173) ── where a seller publishes an API.            ┐
┌─ apps/playground (:3100) ── the public profile the buyer reads.        ┐
┌─ 4Mica's postgres (:5433) ── users, wallets, listings. NOT core's DB.  ┐
```

**Two databases, and they never touch.** Core's postgres is the money ledger.
4Mica's postgres is the product catalogue. A listing row is a *description of a
price*; nothing in it moves value.

### The one paragraph that explains the protocol

> A payer signs a payment guarantee claim straight from the recipient's
> `paymentRequirements`; the recipient hands the signed payload to the
> facilitator, which verifies it and settles by issuing a BLS certificate
> through 4mica core. There is no tab, no token allowance and no per-payment
> on-chain transaction: the payer's collateral backs the guarantee, and
> guarantees net into one settlement per cycle.

One paid request on the wire:

```text
buyer  GET /quote                       → 402  + `payment-required` header
                                               (base64 JSON: scheme, network,
                                                payTo, asset, amount)
buyer  signs EIP-712 claims, random reqId
buyer  GET /quote  PAYMENT-SIGNATURE    → seller POSTs facilitator /verify
                                          seller does the work only if valid
                                          seller POSTs facilitator /settle
                                        → 200  + `X-PAYMENT-RESPONSE`
                                               (the BLS certificate)
```

**A published listing is a stored `paymentRequirements`.** That is why the
dashboard form asks for a title, a description, a price and a wallet, and
nothing more exotic — those five fields *are* the 402 response.

---

## 2. Prerequisites

| Tool | Why |
| --- | --- |
| Docker | both postgres instances |
| Rust (stable) | core and the facilitator |
| Foundry (`anvil`, `forge`, `cast`) | the local chain and the contracts |
| Node ≥ 22, pnpm 10 | everything else |

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

### The core checkout must match the facilitator

`apps/facilitator/Cargo.toml` pins `rpc-4mica`, `sdk-4mica` and `crypto-4mica`
at `=2.0.0-alpha.3`. A core on an older tag speaks the **tab-based** protocol
that 2.0 removed, and the mismatch surfaces at `/settle` as an error that reads
like an auth failure. Pin it explicitly:

```bash
git clone git@github.com:4mica-Network/4mica-core.git ../4mica-core
cd ../4mica-core && git fetch --tags origin && git checkout v2.0.0-alpha.3
```

Put it beside this repo, or point `FOURMICA_CORE_DIR` at it.

---

## 3. Bring it up

```bash
scripts/dev-stack.sh up
```

That does five things, in order:

1. **`make dev-up` in 4mica-core.** Postgres, anvil (`--hardfork prague`), the
   `Core4MicaFullStack` forge deploy, migrations, then `core-service`. Core's
   own script owns this because it is careful in ways worth not re-deriving:
   it reads the chain id back off anvil rather than assuming, derives the
   on-chain verification key from the BLS signing key so remuneration
   verifies, and pre-checks core's solvency invariant
   (`cycle + resolution_cutoff + commit_delay + finality_window + seizure_margin
   < withdrawalGracePeriod`) — which core otherwise refuses to boot over, with
   an error that names five variables and no fix.

2. **Grants the facilitator its role.** Issuing a guarantee needs the
   `guarantee:issue` scope; `DEFAULT_SCOPES` is only `payment:read`. Roles live
   in core's `WalletRole` table and there is no admin endpoint, so the row goes
   in with SQL. Skip this and every `/settle` returns 401.

3. **Starts the facilitator** on `:8080`, pointed at the local core, with a
   relayer key so the gasless `POST /deposit` route works. The auth key and the
   relayer key are deliberately different accounts: the first is an identity
   and needs no balance, the second pays gas.

4. **Starts 4Mica's postgres** on `:5433`, migrates and seeds it.

5. **Writes `.dev/stack.env`** with the values core actually deployed, read
   back from core's generated `.env` and `GET /core/tokens` rather than
   restated — the contract address changes on every redeploy.

Then start the Node apps, each in its own terminal so you keep its logs:

```bash
pnpm --filter @4mica/be dev          # :4000
pnpm --filter @4mica/dashboard dev   # :4173
pnpm --filter @4mica/playground dev  # :3100
```

### Check it

```bash
curl localhost:3000/core/health
curl localhost:3000/core/tokens        # the assets core accepts
curl localhost:8080/supported          # must list ("4mica-credit", "eip155:31337")
scripts/dev-stack.sh status
```

If `/supported` is empty, the facilitator could not load core's public
parameters — look at `.dev/facilitator.log`.

---

## 4. Publish a paywalled API

### a. Link a wallet

Dashboard → **Wallet** → *Link wallet*. You sign an EIP-4361 message to prove
you control the address. This matters for what comes next: a listing may only
advertise an address that has been proved this way, which is why the listing
form asks you to *pick* a wallet rather than type an address.

Give it the role **Recipient** or **Both**, and put it on the chain your stack
is running (`eip155:31337` locally — see the note in §8 if the network picker
does not offer it).

### b. Create the API

Dashboard → **APIs** → *New API*. Three steps:

1. **Name, address, summary.** The address is the slug in its public URL.
2. **Wallet and price.** Pick the wallet from (a). The chips underneath show
   the chain and address you are committing to — both are derived server-side
   and cannot be typed. Set a price and, optionally, a token from
   `/core/tokens`; leave the token empty for the chain's native asset.
3. **Base URL, docs, tags, visibility.**

Then *Edit endpoints* to add `GET /quote`. The first endpoint is the one the
public integration guide demonstrates, so put your most representative route at
the top.

### c. Publish it

Row menu → *Publish to profile*. This is refused when there is no receiving
wallet, because the published guide would have no address to generate code
against — the menu item says so before you click it.

Your profile must also be public: `User.private` defaults to **true**, so a new
account's profile 404s until you opt in. The *Integration guide* link on the row
tells you which of these is in the way.

### d. Read it back

Open the guide link. The public page carries the price, the chain, the token
and working TypeScript, Python and cURL — all built from your row. Every
address in it is yours.

---

## 5. Take a real payment

```bash
cp examples/example-seller-live/.env.example examples/example-seller-live/.env
cp examples/example-buyer-live/.env.example  examples/example-buyer-live/.env
```

Fill in:

- **seller** — `4MICA_WALLET_PRIVATE_KEY` (any anvil key; it needs no balance),
  `PAY_TO` (the wallet address from §4a), `NETWORK=eip155:31337`.
- **buyer** — `4MICA_WALLET_PRIVATE_KEY` for a *different* anvil account, and
  `RESOURCE_URL=http://localhost:3010/quote`.

```bash
pnpm --filter @4mica/example-seller-live dev
```

On boot it prints the exact values to paste into the dashboard form, which is
the loop back to §4.

The buyer needs collateral — that is what its guarantees are backed by:

```ts
await client.deposit.of(null, 1_000_000_000_000_000n).send();
```

or use the facilitator's gasless route, `POST /deposit`. Then:

```bash
pnpm --filter @4mica/example-buyer-live start
```

You should see `402` → `200`, a body, and an `X-PAYMENT-RESPONSE` carrying real
claims and a BLS signature. Compare that with `example-buyer-express`, where
the same field is the literal string `0xdemoSignature` — that is the whole
difference between demo mode and live mode.

The facilitator log shows `/verify` then `/settle`, in that order. Always that
order: verify gates the work, settle takes the credit.

### Make it show up in the dashboard

4Mica is **not in the payment path** — your service calls the facilitator
directly — so nothing appears in anyone's history until your service says so.
That is one extra call, and the example already makes it:

```bash
# Dashboard → Settings → Developer → new key
FOURMICA_API_KEY=4mica_sk_…
FOURMICA_API_URL=http://localhost:4000
LISTING_SLUG=live-quotes        # attributes the payment to that listing
ASSET_DECIMALS=18               # 6 for USDC
```

Restart the seller, pay again, and the payment appears under **Payments** for
*both* sides. It is reported once, by the seller, and the buyer sees the same
row because their wallet is the payer on it — visibility is by proved wallet
address, not by who filed it.

The report is idempotent on `reqId`, which the payer mints once per payment, so
a retry after a timeout updates the row rather than double-counting. It is also
fire-and-forget: the buyer has already been served, and a reporting failure
must never turn a successful payment into an error.

Without a key the paywall still works. The payments are simply invisible, and
the seller boots with a warning saying so.

---

## 6. Following your own progress

The dashboard home page carries two checklists — one for getting paid, one for
paying — and both read real state rather than a stored "step" counter:

| Step | Considered done when |
| --- | --- |
| Link a wallet | any wallet exists |
| Let it receive / pay | one is ACTIVE with the matching role |
| Publish an API or agent | one is PUBLIC |
| Make your profile public | `isProfileRenderable` passes |
| First payment | a settled payment exists in that direction |

A checklist that tracked its own state would drift from reality the first time
someone deleted a wallet. This one cannot.

The public listing page carries the mirror image: a **Pay for this with 4Mica**
panel aimed at whoever is reading it, which changes with what they are missing
— no account, no paying wallet, a wallet on the wrong chain, or ready. It is
hidden from the owner, who is not the person who needs it.

## 7. Agents

An agent has **two halves that are not interchangeable**, and conflating them
is the mistake the schema, the API and the UI are all shaped to prevent:

| | Payer half | Seller half |
| --- | --- | --- |
| Fields | `walletAddress`, `payerWalletId`, `creditLimit` | `walletId`, `payToAddress`, price, `endpointUrl` |
| Means | how it spends | how it gets paid |
| Public? | **no** — it would let anyone correlate a profile with its on-chain spending | **yes** — x402 hands `payTo` to any anonymous caller anyway |

So an agent's public page has two sections: *Call this agent* (built from the
seller half) and *Run this agent* (built from the payer half, and shown with
real values only to you).

Both of its wallets must be on the agent's own chain. The API locks `network`
once either is attached — a wallet proved on one chain cannot receive on
another, and 4Mica settles per chain.

---

## 8. Things that will bite you

**A bare anvil chain is `eip155:31337`, which is not a `PaymentNetwork`.** The
enum in `packages/db` has `BASE`, `BASE_SEPOLIA` and `ETHEREUM_SEPOLIA` only —
deliberately, so a typo cannot reach a payment snippet. The dashboard's wallet
picker therefore offers those three, and a wallet on 31337 cannot be linked.

**Fork Base Sepolia instead.** The forked chain keeps its own id, 84532, which
*is* `BASE_SEPOLIA`, so the whole product works unchanged:

```bash
cd ../4mica-core
FORK_RPC_URL=https://sepolia.base.org \
STABLECOINS_COUNT=1 \
STABLECOIN_0=0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  make dev-up
```

Core reads the chain id back off the fork rather than assuming, so everything
downstream follows. A forked deploy registers the chain's existing tokens
rather than deploying mocks, which is why the token address is named
explicitly. Then run `scripts/dev-stack.sh` from `role` onwards.

The alternative — adding a `LOCAL` member to the enum — is possible but it
would put a "Local" option in the production network picker, so it is not the
default. If you do it, it is deliberately a type error in
`apps/playground/src/lib/snippets/networks.ts`,
`apps/dashboard/src/lib/networks.ts` and `apps/be/src/services/siwe.ts` — fix
all three or it will not compile.

**The agent network default is `ETHEREUM_SEPOLIA`.** Omitting `network` on
create does not mean "whatever chain the wallet is on"; a `BASE_SEPOLIA` wallet
is then a mismatch. Correct, but surprising.

**Prices are strings everywhere.** `Decimal(38,18)` does not survive an
IEEE-754 double, so the wire format is a string from the form through to
Prisma. A JSON number is rejected with a 400.

**Addresses are stored lower-cased** and guarded by CHECK constraints. The API
requires a valid EIP-55 checksum on input and lower-cases on the way in; a
fixture or script that writes a checksummed address directly will fail the
constraint.

**Two postgres instances.** `4mica-pg` on 5432 is core's. `4mica-be-postgres`
on 5433 is the product's. `pnpm db:*` only ever means the second one.

**`scripts/dev-stack.sh down` leaves both postgres containers up**, so your
data survives. `make -C ../4mica-core dev-down-all` stops core's.
