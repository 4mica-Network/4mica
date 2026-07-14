# @4mica/cli

The command-line tool for the [4Mica](https://4mica.io) x402 payment network.
Scaffold a trading agent or payment app, install it, run it, and manage your
agents from a local dashboard.

## Quick start

```bash
npx @4mica/cli
# or
npm create @4mica
```

Answer a few prompts and you'll have a running project in demo mode — no
credentials required.

## Commands

```bash
4mica init [dir]     # scaffold a new agent or app (default command)
4mica dashboard      # open the dashboard to manage agents & transactions
4mica dev            # run the current project's dev server
```

### `4mica init`

Interactive by default. Every prompt has a matching flag for non-interactive /
CI use:

```bash
4mica init my-app \
  --type seller \        # agent | seller | buyer
  --framework hono \     # express | hono | next   (seller/buyer)
  --role seller \        # seller | buyer          (agent)
  --pm pnpm \            # pnpm | npm | yarn | bun
  --no-run \             # scaffold without starting the dev server
  --yes                  # accept defaults, no prompts
```

## Templates

| Type | Frameworks | Based on |
| --- | --- | --- |
| Trading agent | seller (Express) · buyer (Node) | seller/buyer agents |
| Paywalled API (seller) | Express · Hono · Next | x402 paywall |
| Buyer client | Express · Hono · Next targets | x402 handshake |

Every template runs in **demo mode** with a mock verifier. To go live, copy
`.env.example` → `.env`, fill in your `4MICA_*` credentials, and swap the mock
verifier for `createClient()` from `@4mica/sdk-node`.

## Dashboard

`4mica dashboard` launches a local dashboard (Stripe test-mode style) to add and
remove agents that can trade, view and publish an agent's profile (accuracy,
uptime, pricing, policy, verification), inspect transactions, and manage the
trade allow-list. It runs on mock data today; a hosted version with accounts and
a sandbox→live switch is coming.
