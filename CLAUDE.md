# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

pnpm + Turbo monorepo for **4Mica** (credit-layer infrastructure for the agentic economy). Four applications:

- `apps/web` — Next.js 16 marketing + docs site (static export).
- `apps/dashboard` — Vite 8 + React 19 SPA (react-router-dom), dev server on port 4173.
- `apps/be` — Fastify 5 API serving the dashboard, on port 4000.
- `apps/email` — Fastify 5 service rendering React Email templates and sending them via Resend, on port 4100.

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
pnpm db:up        # start only Postgres (apps/be/docker-compose.yml)
pnpm db:down
pnpm db:generate  # prisma generate
pnpm db:migrate   # prisma migrate dev
pnpm db:reset     # drop, re-apply migrations, re-seed
pnpm db:seed      # @4mica/seed
pnpm db:studio
```

Full containerised stack (`apps/be/docker-compose.yml` defines `postgres`, a one-shot `migrate`, and `be`):

```bash
pnpm be:up        # build + start all three; be gates on migrate exiting 0
pnpm be:down
```

The `be` container runs `NODE_ENV=production`, so Swagger is off and the CORS allowlist excludes localhost — use `pnpm --filter @4mica/be dev` for dashboard work, or add origins via `CORS_ORIGINS`.

The Husky pre-commit hook runs `pnpm run lint` and `pnpm run test`, so both must pass to commit.

Local env: `cp apps/web/.env.example apps/web/.env.local`, and `cp apps/be/.env.example apps/be/.env` followed by `pnpm db:up`.

## Architecture

- **Monorepo layout**: `apps/*` are the applications; `packages/*` are shared libraries and config consumed as `@4mica/*` workspace deps (`url`, `db`, `seed`, `ui`, `http`, `auth`, `email-client`, `sdk*`, `cli`, `tailwind-config`, `tsconfig`). Turbo orchestrates tasks. **Every third-party version goes in the `pnpm-workspace.yaml` catalog** and packages reference `"catalog:"` — do not run `pnpm add`, which writes a pinned literal (`.npmrc` sets `save-exact`). `biome.json` is the single lint/format source of truth (line width 80, enforced sorted CSS classes in `className`/`cn()`) — not ESLint/Prettier.

- **`apps/web` is a static export**: Next.js 16 App Router, React 19, `output: "export"` with `images.unoptimized` → builds to `apps/web/out`. There is no SSR or server runtime; avoid patterns that require one.

- **Provider nesting** in `app/layout.tsx`: `ThemeProvider` (localStorage + a pre-paint script to avoid FOUC) wraps `GlobalNetworkBackground` and the page content.

- **Reuse these single sources of truth** instead of hardcoding:
  - Routes, links, emails → `@4mica/url` (`LinkConfig`; exports `routes` and `links`).
  - Design tokens / Tailwind preset → `@4mica/tailwind-config`.

- **`packages/db` owns the database**: the Prisma schema plus a `prisma` client singleton exported from `@4mica/db`. This is **Prisma 7** — driver adapters are mandatory (`new PrismaClient()` alone is invalid), the connection URL lives in `packages/db/prisma.config.ts` rather than `schema.prisma`, and `.env` is not auto-loaded. The generated client is TypeScript source under `packages/db/src/generated/prisma` and is gitignored, so run `pnpm db:generate` after pulling a schema change (`turbo build` does it automatically). `apps/be` bundles `@4mica/db` into its output via tsup `noExternal`, while `@prisma/client` stays external — it can never be bundled.

- **`apps/be` structure**: `src/server.ts` exports `initApp(routes)` (no side effects, so tests can `.inject()` against it) and `runServer()`; `src/index.ts` is the only caller. Routes are `FastifyPluginCallback`s registered from the `{ plugin, prefix }[]` list in `src/routes/index.ts`. Env is parsed and validated once by valibot in `src/config/index.ts`; logging is winston (`src/logger/`). Swagger UI is registered at `/docs` in development only. Cross-directory imports go through the path aliases declared in `apps/be/tsconfig.json` (`@/*`, `@auth/*`, `@config/*`, `@controllers/*`, `@lifecycle/*`, `@logger/*`, `@plugins/*`, `@routes/*`, `@services/*`, mirrored as `resolve.alias` in `vitest.config.ts`) — parent-relative `../` specifiers are a Biome error here; sibling `./` imports are fine.

- **`apps/be` lifecycle**: `src/lifecycle/` owns graceful degradation. A module-level `ServiceState` (`ready` → `draining` → `closing`) is the single source of truth for "am I taking traffic". On SIGTERM/SIGINT, `installShutdownHandlers` flips to `draining` — `/health` immediately answers 503 and an `onRequest` guard in `initApp` refuses new requests with 503 + `Retry-After` + `Connection: close` — waits `SHUTDOWN_DRAIN_MS` for in-flight work, then closes Fastify (whose `onClose` hook disconnects Prisma) and flushes the loggers, all capped by `SHUTDOWN_TIMEOUT_MS`. Keep the container's `stop_grace_period` above that cap.

- **`apps/be` rate limiting**: `src/plugins/rate-limit.ts`, in-memory (no Redis). Two layers, because one hook can't do both jobs — an IP-keyed shield on `onRequest` ahead of Clerk verification, and a per-user limit on `preHandler` (where `request.auth` exists) keyed by Clerk user id with an IP fallback. `sensitiveRateLimit(app)` adds a tighter budget to credential-minting routes. Health and preflights are allowlisted; the whole thing is off under `NODE_ENV=test`.

- **`apps/email` is registry-driven**: `packages/email-client` owns the contract — one valibot schema per template in `src/payloads.ts`, collected into the `templateSchemas` map in `src/templates.ts`. The service derives *everything* from that map: `src/routes/emails.ts` generates one `POST /emails/<template-id>` per entry, the OpenAPI body schema comes from the same valibot schema via `@valibot/to-json-schema`, and `src/controllers/emails/index.ts` has a single `makeSendHandler(id)` for all of them. `src/templates/registry.ts` supplies only what differs per email — subject, React component, optional reply-to — and its `satisfies { [K in TemplateId]: … }` clause makes a missing entry a type error. **Adding a template is one schema, one map entry, one `.tsx`, one registry entry — never a new route or handler.** Fastify's validator compiler is replaced with a pass-through in `src/server.ts`: the JSON Schema is documentation only, and valibot is the sole validator so callers always get the `{ error, message, issues[] }` envelope. `EMAIL_DRY_RUN=true` (the default outside production) renders and logs without calling Resend, so the service and its tests run with no API key.

- **Data-driven content**: solutions/FAQs/team are typed TS data (e.g. `apps/web/i18n/locales/en/solutions.ts` with `getSolution(slug)`); dynamic routes use `generateStaticParams()`. SEO metadata is built from factories in `apps/web/seo/`.

- **Tests**: Vitest (jsdom, v8 coverage), co-located `*.test.ts(x)`, global setup in `vitest.setup.ts`.

## Deployment

`.github/DEPLOYMENT.md` is the authoritative reference — read it before touching anything here.

The five services run on **two machines**: `web` + the `edge` nginx on the `4mica.io` box (`SERVER_HOST`), and `be`, `dashboard`, `email`, `playground` and Postgres on the application box (`BE_SERVER_HOST`, which `deploy-playground.yml` also uses). Each is its own compose project, published to loopback — the sole exception is `playground`, which publishes on `PLAYGROUND_BIND` so the remote `edge` can reach it — and fronted by the host's nginx (`infra/nginx/`, installed on a box by running `infra/nginx/install.sh <a|b>` there with sudo; CI has no root on the hosts and never writes `/etc/nginx`). Five workflows — `build-react-app.yml` (web), `deploy-{be,dashboard,email,playground}.yml` — all delegate to the `.github/actions/remote-deploy` composite action, which SSHes in, fast-forwards the checkout, writes `<service_dir>/.env`, runs `docker compose up -d --build`, polls the healthcheck, and finally runs the optional `post_up` whose exit status is ignored (it warns about things the deploy does not own, like the host nginx).

**The two boxes do not share deploy variables.** Box B's four workflows use `DEPLOY_PATH` + `SERVER_USER` and share **one** concurrency group because they share one checkout. `build-react-app.yml` is alone on Box A and uses `WEB_DEPLOY_PATH` + `WEB_SERVER_USER` (both optional, defaulting to `~/var/www/4mica`, which needs no `sudo`) on its own `deploy-web-<env>` group. Do not merge them back: `DEPLOY_PATH=/var/www/4mica` is root-owned-then-`chown`ed on Box B only, and applying it to Box A fails the deploy at *Prepare remote checkout* with `mkdir: Permission denied`.

**Every deploy workflow is `workflow_dispatch` only — merging to `main` deploys nothing.** A human runs it from the Actions tab and picks `dev` or `prod`; the environment input, not the triggering ref, decides which branch is deployed. Do not add a `push:` trigger back: on a single box that turns one merge into several concurrent `git pull`s against the same checkout. `release.yml` and `facilitator-release.yml` are dispatch-only for the same reason; `facilitator-ci.yml` keeps `pull_request` because it only runs checks and publishes nothing.

Two external Docker networks, created idempotently by each workflow's `pre_up`:

- **`4mica-edge`** joins `web` + `edge` on the `4mica.io` box so the `edge` nginx can resolve `web` by name while splitting `4mica.io` between marketing routes and the bare-handle namespace. `playground` is on the other box and is reached at `PLAYGROUND_UPSTREAM`, a plain address rather than Docker DNS. The split lives in `apps/web/nginx.conf.template`, an envsubst template — `NGINX_ENVSUBST_FILTER: ^MICA_` is load-bearing, since an unfiltered pass blanks nginx's own `$host`/`$connection_upgrade`.
- **`4mica-internal`** joins `be` + `email`. `apps/email` publishes **no host port** — it has no authentication of its own, so network membership is the entire access control. `be` reaches it at `http://email:4100` (the compose service name) via `EMAIL_SERVICE_URL`, which is optional: unset disables sending rather than failing boot.

Postgres is external/managed; `apps/be/docker-compose.prod.yml` (not `docker-compose.yml`, which is local-dev only) runs the one-shot `migrate` container against `DATABASE_URL` before `be` starts.

- **Username policy lives in `packages/url`** and has two distinct halves that must not be merged. `reservedSegments` is about *path collisions* — every entry is a real page on 4mica.io with a matching proxy rule in `apps/web/nginx.conf.template`; two tests in `apps/playground/src/main.test.ts` fail the build if it drifts from either nginx or the filesystem. `blacklistedUsernames` bars role and brand names (`admin`, `stripe`) that are **not** routes and have no page to proxy to. `usernameUnavailableReason()` is the single entry point both `apps/be` and the dashboard call.
