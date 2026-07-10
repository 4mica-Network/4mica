# 4Mica SDK examples

Runnable buyer/seller demos for the 4Mica x402 payment flow, one per supported
framework. They double as the **local test harness for developing the SDK** —
edit `packages/sdk` (or an adapter) and watch the change flow into a running
example in real time.

| Example | Role | Framework | Port |
| --- | --- | --- | --- |
| [`example-seller-express`](./example-seller-express) | Seller (recipient) | Express | 3000 |
| [`example-seller-hono`](./example-seller-hono) | Seller (recipient) | Hono | 3001 |
| [`example-seller-next`](./example-seller-next) | Seller (recipient) | Next.js | 3002 |
| [`example-buyer-express`](./example-buyer-express) | Buyer (payer) | — | targets 3000 |
| [`example-buyer-hono`](./example-buyer-hono) | Buyer (payer) | — | targets 3001 |
| [`example-buyer-next`](./example-buyer-next) | Buyer (payer) | — | targets 3002 |

A **seller** gates a route (e.g. `GET /premium`) behind the paywall; a **buyer**
performs the x402 handshake (`402` → sign `X-PAYMENT` → `200`). Out of the box
they run in **demo mode** with a mock verifier and a locally-built payment
header — no live credentials required. For the real flow, wire `@4mica/sdk-node`'s
`createClient()` (reads `4MICA_*` env) as shown in each file's header comment.

Each example is a workspace package and depends on the SDK via `"@4mica/sdk":
"workspace:*"`, so pnpm symlinks it to the local `packages/sdk` — you're always
running your working copy, never a published version.

---

## Quick start — run a buyer/seller pair

From the repo root (`pnpm install` once first):

```bash
# Terminal 1 — start the seller (Express, port 3000)
pnpm --filter @4mica/example-seller-express dev

# Terminal 2 — run the buyer once against it
pnpm --filter @4mica/example-buyer-express start
```

The buyer prints the `402`, the payment requirement, then the paid `200` and the
`X-PAYMENT-RESPONSE` header. Swap `express` → `hono` / `next` for the other
frameworks (the Next seller runs on 3002, Hono on 3001; buyers target their
matching seller, overridable with `SELLER_URL`).

---

## Developing the SDK in real time

The examples import the SDK's **built output** (`packages/sdk/dist`), not its
source — same as a real consumer. So the live-dev loop is: **rebuild `dist` on
save, and let the example restart against it.** Every SDK package exposes
`dev` (`tsup --watch`) for exactly this.

### One command (recommended)

`turbo`'s `...` selector expands a package to itself **plus its dependencies**,
so this runs the SDK + adapter watchers *and* the example together:

```bash
# Build once so dist/ exists, then start every watcher in the dep graph
pnpm turbo build --filter=@4mica/example-seller-express...
pnpm turbo dev   --filter=@4mica/example-seller-express...
```

Now edit `packages/sdk/src/**` → `tsup --watch` rebuilds `packages/sdk/dist` →
the example's `tsx watch` sees the changed dependency and restarts. Editing an
adapter (`packages/sdk-express`, `sdk-node`, …) flows through the same way. Fire
the buyer whenever you want to exercise the change:

```bash
pnpm --filter @4mica/example-buyer-express start
```

### Two terminals (equivalent, more explicit)

```bash
# Terminal 1 — SDK (and any adapter you're touching) in watch mode
pnpm --filter @4mica/sdk --filter @4mica/sdk-express dev

# Terminal 2 — the seller, restarts on dist changes
pnpm --filter @4mica/example-seller-express dev
```

> First run only: if you see a module-not-found for `@4mica/sdk`, the `dist`
> hasn't been built yet — run `pnpm --filter @4mica/sdk build` once (or the
> `turbo build` line above) and the watchers take over from there.

### Faster inner loop (optional): consume SDK source directly

The watch-rebuild loop adds a ~100–500 ms `tsup` step per save. To skip it and
run the SDK's TypeScript source directly, add a path map to the example's
`tsconfig.json` (`tsx` honours `paths`):

```jsonc
"compilerOptions": {
  "paths": {
    "@4mica/sdk": ["../../packages/sdk/src/index.ts"],
    "@4mica/sdk/server": ["../../packages/sdk/src/server/index.ts"]
  }
}
```

Edits to `packages/sdk/src` then take effect on the next `tsx watch` restart with
no build at all. Trade-off: you're no longer exercising the packaged `dist`
(bundling, `exports` map, `.d.ts`), so keep the default watch-rebuild loop for
anything that must match real consumer resolution, and run
`pnpm --filter @4mica/sdk check:exports` before publishing.
