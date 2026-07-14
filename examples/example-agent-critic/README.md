# example-agent-critic

An **autonomous buyer agent** — a comedy curator that spends real money (over
4Mica x402) to assemble the best joke set it can within a budget. It's the
counterpart to [`example-agent-comedian`](../example-agent-comedian).

This is where the "agentic, not just an endpoint" part lives. The critic has a
**goal**, a **budget**, and a **strategy**, and it runs a perceive → decide → act
→ evaluate → adapt loop:

1. **Goal** — curate `GOAL` jokes on a theme scoring ≥ `THRESHOLD`/10, under `BUDGET` credits.
2. **Plan** — pick which comedic category to probe next using a multi-armed-bandit
   strategy: exploit the highest-rated category, but explore others ~30% of the
   time (unseen categories get an optimistic prior so each gets tried).
3. **Probe** — fetch the seller's **free setup** for that category (and its price).
4. **Decide** — judge the setup with Claude: predict how funny it'll be and whether
   it's worth the punchline's price *given the remaining budget and slots*. Weak or
   unaffordable setups are **passed over** — no money spent.
5. **Pay** — for setups worth buying, run the x402 handshake and pay for the punchline.
6. **Evaluate** — rate the full joke with Claude; keep it only if it clears the bar.
7. **Adapt** — update the per-category rating (steering future picks) and send the
   rating back to the comedian (which reprices).
8. **Stop** — when the set is full, the budget is spent, or it runs out of rounds,
   then print the curated set, total spend, and the winning category.

It's a one-shot run: it works until done, prints the outcome, and exits.

## Run

- From the repo root: `pnpm install`, then
  `pnpm turbo build --filter=@4mica/example-agent-critic...`.
- **Start the comedian first** ([`example-agent-comedian`](../example-agent-comedian)):
  `pnpm --filter @4mica/example-agent-comedian dev`
- Then run the critic:

```bash
pnpm --filter @4mica/example-agent-critic start
```

Sample trace:

```
🎯 Critic goal: curate 3 jokes on "programming" scoring ≥7/10, budget 900 credits.
[round 2] 🎰 probing "puns" (avg 8.5) → free setup: "I told my computer I needed a break,"
           🤔 predicted 9/10 → BUY the punchline for 113 credits
           💸 paid 113 credits via x402 (budget: 787 left) → punchline: "…KitKats."
           😂 rated 8/10 → ⭐ KEEP
🏁 Kept 3/3 · spent 376 of 900 credits · best category: meta (9.0/10)
```

## Environment variables

Runs out of the box — **no variables required.**

| Variable | Default | Effect |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | If set, the critic **judges and rates jokes with Claude**. Unset → offline heuristics. |
| `AGENT_MODEL` | `claude-opus-4-8` | Claude model for judging. `claude-haiku-4-5` is cheaper/faster. |
| `THEME` | `programming` | The theme it curates jokes about. |
| `GOAL` / `BUDGET` / `THRESHOLD` / `MAX_ROUNDS` | `4` / `1200` / `7` / `16` | Curation target, spend cap, keep bar, and loop bound. |
| `COMEDIAN_URL` | auto-discovered | Seller base URL. Resolved as env → the running comedian's published URL (`<tmpdir>/4mica-agent-comedian.url`) → `http://localhost:4100`. |

## Going live (real payments)

By default the critic builds the `X-PAYMENT` header locally (demo). To sign real
payments, use the SDK's `X402Flow`:

```ts
import { createClient } from "@4mica/sdk-node";
import { X402Flow } from "@4mica/sdk";
const client = await createClient();          // reads 4MICA_* env
const flow = X402Flow.fromClient(client);
const payment = await flow.signPayment(requirement, client.signer.signer.address);
// use payment.header as the X-PAYMENT header
```
