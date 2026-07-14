# example-agent-comedian

An **autonomous seller agent** — a joke merchant that trades information for money
over the 4Mica x402 protocol. It's the counterpart to
[`example-agent-critic`](../example-agent-critic).

It is not "an endpoint behind a paywall." It makes its own decisions:

- **Generates** an original joke per request with Claude (theme + comedic style),
  tailored to what the buyer asks for.
- **Gives the setup away free**, and **paywalls the punchline** — the payload the
  buyer actually values.
- **Prices dynamically.** Each category has a base price that rises with demand
  (every sale bumps it) and with its rolling quality rating. Popular, well-rated
  styles get more expensive — the agent maximizes revenue.
- **Learns from feedback.** The buyer posts a rating after each purchase; the
  comedian folds it into its pricing/quality signal.

## The trade (x402)

```
buyer  GET /setup?theme=…&category=…      → 200  free setup + this punchline's price
buyer  GET /punchline?jokeId=…            → 402  payment requirements (the price)
buyer  GET /punchline?jokeId=…  X-PAYMENT → 200  the punchline  (+ X-PAYMENT-RESPONSE)
buyer  POST /rating {category, score}     → 200  feedback the comedian learns from
```

The `402 → sign → 200` handshake is the standard 4Mica x402 flow, using the core
`createPaywall` from `@4mica/sdk/server` with a **per-request amount** so each joke
is individually priced.

## Run

From the repo root:

```bash
pnpm install
pnpm turbo build --filter=@4mica/example-agent-comedian...   # build @4mica/sdk once
pnpm --filter @4mica/example-agent-comedian dev              # tsx watch
```

You'll see:

```
[comedian] 🎭 open for business on http://localhost:4100
[comedian]    brain: offline joke bank
```

Then run the critic in another terminal to watch them trade:

```bash
pnpm --filter @4mica/example-agent-critic start
```

## Environment variables

Runs out of the box — **no variables required.**

| Variable | Default | Effect |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | If set, the comedian writes **real jokes with Claude**. Unset → a small built-in joke bank (fully offline). |
| `AGENT_MODEL` | `claude-opus-4-8` | Claude model for joke generation. Set to `claude-haiku-4-5` for cheaper/faster runs. |
| `PORT` | `4100` | Preferred port; auto-increments if busy. The chosen URL is published to `<tmpdir>/4mica-agent-comedian.url` so the critic finds it automatically. |

## Going live (real payments)

The default verifier is a mock that issues a demo guarantee. To verify real
payments, build a recipient client and pass its RPC proxy:

```ts
import { createClient } from "@4mica/sdk-node";
const client = await createClient();          // reads 4MICA_* env
const paywall = createPaywall(client.rpc, config);
```

See [`example-seller-express`](../example-seller-express) for the full `4MICA_*`
list.
