# Contributing to 4Mica

Thanks for your interest in improving 4Mica! This guide covers how to set up the
repo and how to develop and test each part of it — the website, the SDK, the
`4mica` CLI, and the dashboard.

We want this project to feel good to contribute to: clear setup, small focused
pull requests, and respectful review.

## Code of Conduct

This project and everyone participating in it is governed by our
[Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to
uphold it. Please report unacceptable behavior to
[engineering@4mica.io](mailto:engineering@4mica.io).

## Prerequisites

- **Node.js** 22 or newer.
- **pnpm** 10.28.2 or newer.

Enable pnpm with Corepack if needed:

```bash
corepack enable
corepack prepare pnpm@10.28.2 --activate
```

Install dependencies from the repo root:

```bash
pnpm install
```

## Repository structure

This is a pnpm + Turbo monorepo.

```txt
.
├── apps
│   ├── web                  # Next.js marketing + docs site (static export)
│   └── dashboard            # Vite + React dashboard (manage agents, txns, whitelist)
├── packages
│   ├── sdk                  # @4mica/sdk — universal x402 payment SDK
│   ├── sdk-node             # Node adapter (createClient, reads 4MICA_* env)
│   ├── sdk-express          # Express paywall middleware
│   ├── sdk-hono             # Hono paywall middleware
│   ├── sdk-next             # Next.js App Router paywall helper
│   ├── sdk-bun / sdk-deno   # Runtime adapters
│   ├── sdk-nuxt / -remix / -sveltekit  # Framework adapters (coming soon)
│   ├── cli                  # @4mica/cli — the `4mica` scaffolding CLI
│   ├── ui                   # @4mica/ui — shared React component library
│   ├── tailwind-config      # Shared Tailwind v4 preset + tokens
│   ├── tsconfig             # Shared TypeScript configs
│   └── url                  # Shared routes/links helpers
├── examples                 # Runnable buyer/seller/agent demos (SDK test harness)
├── scripts                  # Workspace utility scripts
├── biome.json               # Lint + format configuration (source of truth)
├── pnpm-workspace.yaml       # Workspace packages + dependency catalog
└── turbo.json               # Turbo task pipeline
```

## Common commands

Run from the repo root (delegated to Turbo):

```bash
pnpm dev          # Start dev tasks across the workspace
pnpm build        # Build the workspace
pnpm lint         # Run Biome checks
pnpm lint:write   # Apply safe Biome fixes
pnpm typecheck    # Run TypeScript checks
pnpm test         # Run tests
pnpm clean        # Clean generated files and root node_modules
```

Scope any command to a single package with `--filter`:

```bash
pnpm --filter @4mica/cli build
pnpm --filter @4mica/dashboard dev
pnpm --filter @4mica/sdk test
```

## Developing the SDK

The `examples/` apps double as the SDK's local test harness — edit
`packages/sdk` (or an adapter) and watch the change flow into a running example.
`turbo`'s `...` selector runs a package **plus its dependencies**:

```bash
# Build once so dist/ exists, then start every watcher in the dep graph
pnpm turbo build --filter=@4mica/example-seller-express...
pnpm turbo dev   --filter=@4mica/example-seller-express...

# In another terminal, fire the buyer to exercise your change
pnpm --filter @4mica/example-buyer-express start
```

See [examples/README.md](./examples/README.md) for the full harness guide and the
"going live" recipe.

## Developing & testing the CLI (`@4mica/cli`)

Build it, then run the compiled binary:

```bash
pnpm --filter @4mica/cli build
node packages/cli/dist/index.js            # interactive prompt flow
node packages/cli/dist/index.js --help
```

Or link it globally so you can use the real `4mica` command:

```bash
cd packages/cli && pnpm link --global
4mica                                       # interactive
4mica init my-app --type seller --framework hono --yes --no-install
# later: pnpm uninstall --global @4mica/cli
```

If you change CLI source, rebuild (`pnpm --filter @4mica/cli build`). The build
regenerates `snapshot.json` (the frozen catalog + `@4mica/*` versions used to
rewrite scaffolded dependencies) via a `prebuild` step.

### Testing a scaffolded project end-to-end

A **standalone** scaffold rewrites deps to published semver (`^1.3.0`). Until the
SDK adapters are published to npm, install those standalone projects only after a
release — for local testing, scaffold **inside the repo** so `workspace:*` links
the local packages:

```bash
# Seller (terminal 1)
node packages/cli/dist/index.js init examples/tmp-seller \
  --type seller --framework express --no-install --no-run
pnpm install
pnpm --filter tmp-seller dev

# Buyer (terminal 2)
node packages/cli/dist/index.js init examples/tmp-buyer \
  --type buyer --framework express --no-install --no-run
pnpm install
pnpm --filter tmp-buyer start
```

You should see the x402 handshake: `402 → sign X-PAYMENT → 200 🔓 premium
market data unlocked`. Clean up afterwards by deleting the `examples/tmp-*`
folders and running `pnpm install` again.

## Developing & testing the dashboard (`@4mica/dashboard`)

```bash
pnpm --filter @4mica/dashboard dev          # → http://localhost:4173
# or, via the CLI:
node packages/cli/dist/index.js dashboard
```

The dashboard runs in **Sandbox mode** on in-memory mock data (no backend
required) — a full page reload resets the data. Click-through checklist:

- **Agents** → *Add agent* (fill the form); it appears in the list **and** in
  Whitelist (blocked by default). *Remove* an agent.
- **Agent profile** (click a name) → *Publish* / *Unpublish* toggles the badge.
- **Transactions** → stat tiles + table.
- **Whitelist** → *Allow* / *Block* flips the agent's `suspended` state.

## Quality gates

Before opening a pull request, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Biome is the single source of truth for linting and formatting (80-char width,
sorted `className`/`cn()` classes). The Husky pre-commit hook runs `pnpm lint`
and `pnpm test`, so both must pass to commit. For editor setup, see the
[Biome Editor Setup](./README.md#biome-editor-setup) section in the README.

## Changesets & releases

For any change to a published package (SDK, adapters, or the CLI), add a
changeset describing the change:

```bash
pnpm changeset
```

- The SDK packages (`@4mica/sdk`, `sdk-node`, `sdk-express`, `sdk-hono`,
  `sdk-next`, …) version together as a **fixed** group.
- `@4mica/cli` versions **independently**.
- `apps/dashboard` and other `private` packages are not published, so they don't
  need a changeset.

## Pull requests

1. Fork the repository (or branch, if you have write access).
2. Create a focused feature branch:

   ```bash
   git checkout -b feat/your-change
   ```

3. Make your change and add a changeset if it touches a published package.
4. Run the quality gates above.
5. Open a pull request with a concise description, screenshots for UI changes,
   and any environment/deployment notes.

Good first contributions include documentation fixes, new SDK examples,
accessibility improvements, test coverage, and small UI polish.
