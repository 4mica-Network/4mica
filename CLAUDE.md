# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm + Turbo monorepo for **4Mica** (credit-layer infrastructure for the agentic economy). Three applications:

- `apps/web` — Next.js 16 marketing + docs site (static export).
- `apps/dashboard` — Vite 8 + React 19 SPA (react-router-dom), dev server on port 4173.
- `apps/be` — Fastify 5 API serving the dashboard, on port 4000.

Shared code and config live in `@4mica/*` workspace packages.

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

Database (all Prisma commands run with cwd `packages/db`):

```bash
pnpm db:up        # start local Postgres (apps/be/docker-compose.yml)
pnpm db:down
pnpm db:generate  # prisma generate
pnpm db:migrate   # prisma migrate dev
pnpm db:reset     # drop, re-apply migrations, re-seed
pnpm db:seed      # @4mica/seed
pnpm db:studio
```

The Husky pre-commit hook runs `pnpm run lint` and `pnpm run test`, so both must pass to commit.

Local env: `cp apps/web/.env.example apps/web/.env.local`, and `cp apps/be/.env.example apps/be/.env` followed by `pnpm db:up`.

## Architecture

- **Monorepo layout**: `apps/*` are the applications; `packages/*` are shared libraries and config consumed as `@4mica/*` workspace deps (`url`, `db`, `seed`, `ui`, `sdk*`, `cli`, `tailwind-config`, `tsconfig`). Turbo orchestrates tasks. **Every third-party version goes in the `pnpm-workspace.yaml` catalog** and packages reference `"catalog:"` — do not run `pnpm add`, which writes a pinned literal (`.npmrc` sets `save-exact`). `biome.json` is the single lint/format source of truth (line width 80, enforced sorted CSS classes in `className`/`cn()`) — not ESLint/Prettier.

- **`apps/web` is a static export**: Next.js 16 App Router, React 19, `output: "export"` with `images.unoptimized` → builds to `apps/web/out`. There is no SSR or server runtime; avoid patterns that require one.

- **Provider nesting** in `app/layout.tsx`: `ThemeProvider` (localStorage + a pre-paint script to avoid FOUC) wraps `GlobalNetworkBackground` and the page content.

- **Reuse these single sources of truth** instead of hardcoding:
  - Routes, links, emails → `@4mica/url` (`LinkConfig`; exports `routes` and `links`).
  - Design tokens / Tailwind preset → `@4mica/tailwind-config`.

- **`packages/db` owns the database**: the Prisma schema plus a `prisma` client singleton exported from `@4mica/db`. This is **Prisma 7** — driver adapters are mandatory (`new PrismaClient()` alone is invalid), the connection URL lives in `packages/db/prisma.config.ts` rather than `schema.prisma`, and `.env` is not auto-loaded. The generated client is TypeScript source under `packages/db/src/generated/prisma` and is gitignored, so run `pnpm db:generate` after pulling a schema change (`turbo build` does it automatically). `apps/be` bundles `@4mica/db` into its output via tsup `noExternal`, while `@prisma/client` stays external — it can never be bundled.

- **`apps/be` structure**: `src/server.ts` exports `initApp(routes)` (no side effects, so tests can `.inject()` against it) and `runServer()`; `src/index.ts` is the only caller. Routes are `FastifyPluginCallback`s registered from the `{ plugin, prefix }[]` list in `src/routes/index.ts`. Env is parsed and validated once by valibot in `src/config/index.ts`; logging is winston (`src/logger/`). Swagger UI is registered at `/docs` in development only.

- **Data-driven content**: solutions/FAQs/team are typed TS data (e.g. `apps/web/i18n/locales/en/solutions.ts` with `getSolution(slug)`); dynamic routes use `generateStaticParams()`. SEO metadata is built from factories in `apps/web/seo/`.

- **Tests**: Vitest (jsdom, v8 coverage), co-located `*.test.ts(x)`, global setup in `vitest.setup.ts`.

## Deployment

`.github/workflows/build-react-app.yml` deploys on push to `main` (or manual dispatch for dev/prod). It SSHes into a remote server, pulls the branch, writes `apps/web/.env` from GitHub vars, and runs `docker compose up -d --build`.
