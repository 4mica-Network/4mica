# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm + Turbo monorepo for **4Mica** (credit-layer infrastructure for the agentic economy). The only application is `apps/web` — a Next.js 16 marketing + docs site. Shared config lives in `@4mica/*` workspace packages.

Package manager: **pnpm 10.28.2**, Node **>= 22**. Install with `pnpm install`.

## Commands

Root (run through Turbo):

```bash
pnpm dev          # dev server(s)
pnpm build        # build workspace
pnpm test         # run all tests
pnpm typecheck    # tsc across workspace
pnpm lint         # biome check .
pnpm lint:write   # apply safe Biome fixes
```

Scoped to the web app (`pnpm --filter @4mica/web <script>`): `dev`, `build` (`next build`), `test` (`TEST=1 vitest run`), `test:watch`, `test:ui`, `test:coverage`, `typecheck`, `knip`.

Run a single test:

```bash
pnpm --filter @4mica/web test -- path/to/file.test.ts
pnpm --filter @4mica/web test -- -t "test name"
```

The Husky pre-commit hook runs `pnpm run lint` and `pnpm run test`, so both must pass to commit.

Local env: `cp apps/web/.env.example apps/web/.env.local`. Wallet features need `NEXT_PUBLIC_PROJECT_ID` (Reown).

## Architecture

- **Monorepo layout**: `apps/web` is the app; `packages/url`, `packages/tailwind-config`, and `packages/tsconfig` are shared config consumed as `@4mica/*` workspace deps. Turbo orchestrates tasks. `biome.json` is the single lint/format source of truth (line width 80, enforced sorted CSS classes in `className`/`cn()`) — not ESLint/Prettier.

- **`apps/web` is a static export**: Next.js 16 App Router, React 19, `output: "export"` with `images.unoptimized` → builds to `apps/web/out`. There is no SSR or server runtime; avoid patterns that require one.

- **Provider nesting** in `app/layout.tsx`: `GlobalNetworkBackground` → `ThemeProvider` (localStorage + a pre-paint script to avoid FOUC) → `I18nProvider` (i18next) → `AppKitProvider` (Reown AppKit + Wagmi/Viem + TanStack Query).

- **Web3**: Wagmi/Viem/Reown. Chain and contract config is centralized in `apps/web/lib/registrationConfig.ts` and `apps/web/config/appkit.ts` (Ethereum Sepolia / Base Sepolia); the Reown project ID resolves from several env-var aliases.

- **Reuse these single sources of truth** instead of hardcoding:
  - Routes, links, emails → `@4mica/url` (`LinkConfig`; exports `routes` and `links`).
  - Design tokens / Tailwind preset → `@4mica/tailwind-config`.

- **Data-driven content**: solutions/FAQs/team are typed TS data (e.g. `apps/web/i18n/locales/en/solutions.ts` with `getSolution(slug)`); dynamic routes use `generateStaticParams()`. SEO metadata is built from factories in `apps/web/seo/`.

- **Tests**: Vitest (jsdom, v8 coverage), co-located `*.test.ts(x)`, global setup in `vitest.setup.ts`.

## Deployment

`.github/workflows/build-react-app.yml` deploys on push to `main` (or manual dispatch for dev/prod). It SSHes into a remote server, pulls the branch, writes `apps/web/.env` from GitHub vars, and runs `docker compose up -d --build`.
