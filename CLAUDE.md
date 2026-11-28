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

- **Monorepo layout**: `apps/*` are the applications; `packages/*` are shared libraries and config consumed as `@4mica/*` workspace deps (`url`, `db`, `seed`, `ui`, `http`, `auth`, `email-client`, `i18n`, `sdk*`, `cli`, `tailwind-config`, `tsconfig`). Turbo orchestrates tasks. **Every third-party version goes in the `pnpm-workspace.yaml` catalog** and packages reference `"catalog:"` — do not run `pnpm add`, which writes a pinned literal (`.npmrc` sets `save-exact`). `biome.json` is the single lint/format source of truth (line width 80, enforced sorted CSS classes in `className`/`cn()`) — not ESLint/Prettier.

  **`turbo.json`'s `test` task depends on `^build` as well as `^test` — do not drop the `^build`.** Most workspace packages ship raw TS (their `exports` point at `src/`), but `@4mica/sdk` publishes a built `dist/` and its `exports` field points there, so the `apps/facilitator/**` tests import the *build*, not the source. `dist/` is gitignored, so without `^build` a fresh clone or any `pnpm clean` makes `pnpm test` fail inside `@4mica/x402` with `TypeError: Cannot read properties of undefined` — whatever the missing or stale build happened not to export. The failure names the consumer, not the stale package, so it reads as a bug in the wrong place.

- **`apps/web` is a static export**: Next.js 16 App Router, React 19, `output: "export"` with `images.unoptimized` → builds to `apps/web/out`. There is no SSR or server runtime; avoid patterns that require one.

- **Provider nesting** in `app/layout.tsx`: `ThemeProvider` (localStorage + a pre-paint script to avoid FOUC) wraps `GlobalNetworkBackground` and the page content.

- **Reuse these single sources of truth** instead of hardcoding:
  - Routes, links, emails → `@4mica/url` (`LinkConfig`; exports `routes` and `links`). The one exception is `packages/cli/src/core/links.ts`: `@4mica/url` is private and cannot be a dependency of the published CLI, so that file keeps its own copy and `links.test.ts` fails when the two disagree.
  - Design tokens / Tailwind preset → `@4mica/tailwind-config`.

- **`packages/db` owns the database**: the Prisma schema plus a `prisma` client singleton exported from `@4mica/db`. This is **Prisma 7** — driver adapters are mandatory (`new PrismaClient()` alone is invalid), the connection URL lives in `packages/db/prisma.config.ts` rather than `schema.prisma`, and `.env` is not auto-loaded. The generated client is TypeScript source under `packages/db/src/generated/prisma` and is gitignored, so run `pnpm db:generate` after pulling a schema change (`turbo build` does it automatically). `apps/be` bundles `@4mica/db` into its output via tsup `noExternal`, while `@prisma/client` stays external — it can never be bundled.

- **`apps/be` structure**: `src/server.ts` exports `initApp(routes)` (no side effects, so tests can `.inject()` against it) and `runServer()`; `src/index.ts` is the only caller. Routes are `FastifyPluginCallback`s registered from the `{ plugin, prefix }[]` list in `src/routes/index.ts`. Env is parsed and validated once by valibot in `src/config/index.ts`; logging is winston (`src/logger/`). Swagger UI is registered at `/docs` in development only. Cross-directory imports go through the path aliases declared in `apps/be/tsconfig.json` (`@/*`, `@auth/*`, `@config/*`, `@controllers/*`, `@lifecycle/*`, `@logger/*`, `@plugins/*`, `@routes/*`, `@services/*`, `@utils/*`, mirrored as `resolve.alias` in `vitest.config.ts`) — parent-relative `../` specifiers are a Biome error here; sibling `./` imports are fine. `src/services/` is only for modules that initialise a client or connection (the email client, Valkey); pure helpers go in `src/utils/`, and database queries go in a `repository.ts` next to their caller.

- **`apps/be` tenancy**: the **Organization** is the tenant and owns every business row (`organizationId`; `createdById` only records who made it). Each user has a personal organization whose `handle` is their username — `Organization.handle` is the single public namespace for `4mica.io/<handle>`, so a username change must update the personal org's handle in the same transaction. Every org has a default **Project**, and each project has exactly two **Environments**, `SANDBOX` (testnets only) and `PRODUCTION` (mainnet only) — `environmentForNetwork`/`networksForEnvironment` in `@4mica/rules` are the only mapping. Agents, listings (and their trust data and resource keys), account keys, webhooks and service accounts are scoped to org + project + environment; customers to org + project; wallets, payments, balances, business/KYB, support, members and audit stay org-level (payments, balances and wallet lists are filtered to the active environment's networks). Context comes from headers: `X-Org-Id` (default: default/personal org), `X-Project-Id` (default: the org's default project), `X-Environment` (`sandbox`|`production`, default sandbox); anything unknown or inaccessible answers 404. Org-level handlers call `requireTenant(request, reply, permission)`; project-scoped ones call `requireProject(request, reply, projectPermission)` and filter with `scopeWhere(scope)` from `src/utils/scope.ts`. Roles: org OWNER/ADMIN/DEVELOPER/VIEWER, project ADMIN/DEVELOPER/VIEWER; `effectiveProjectRole` and `projectPermissionsFor` in `src/auth/permissions.ts` are the single source (org owners/admins administer every project; a restricted project is invisible without a ProjectMembership; `restrictProduction` limits production writes to project admins; archived projects are read-only). Org-wide finance views (spend authorizations, finance summary/usage/reconciliation and their CSV exports, approvals, finance alerts) filter in the query itself by `accessibleProjectIds(tenant)` from `src/auth/project.ts` (`null` for owners and plain admins), so a restricted project's rows stay hidden from non-members while rows with no project stay visible; a sent payment is attributed to the project of its matching spend authorization. Default deny; wallet and KYB writes are their own permissions. API keys belong to one project + environment, carry `ApiKeyScope`s checked with `requireApiKeyScope`, may belong to a ServiceAccount (suspending it kills its keys), and `/v1/payments` rejects a network outside the key's environment. Repositories take the scope first; never take an org or project id from a path, query or body except where a route explicitly validates it. Record mutations with `audit()`/`auditProject()` — `audit_logs` is append-only (a DB trigger rejects UPDATE/DELETE). `requireUserId` remains correct only for routes about the person (profile, notifications, email verification, SIWE nonce). `src/security/route-matrix.test.ts` fails if a foreign `X-Org-Id` reaches tenant tables.

- **`apps/be` financial governance**: 4mica's backend is **not in the payment path** — agents sign payments locally, only core can refuse one at guarantee-issue time, and apps/be learns of a payment when the seller reports it to `POST /v1/payments`. Buyer-side spending policies (`SpendingPolicy`, scoped to org/project/agent/API key, one network + asset each, no FX) are therefore enforced cooperatively: the paying SDK calls `POST /v1/spend/authorize` before signing, which reserves the amount under a Postgres advisory lock, and reported payments are reconciled by `reqId` afterwards — an unmatched one raises an `UNAUTHORIZED_SPEND` alert and still counts toward limits. A payment (verified against its core guarantee receipt in `POST /v1/payments` when core is configured) consumes an authorization only if reqId, network, asset, payer and recipient all match and the authorized amount covers it, and the authorization is then cut down to the paid amount so the remainder is released. Never describe this as hard enforcement. Approvals (`ApprovalRequest`) cover payments over a policy's threshold, sellers' `needsApproval` holds, and governed admin actions: `requireApproval()` in `src/controllers/approvals/gate.ts` answers 202 until enough *other* people approve, and the requester then repeats the exact request with `X-Approval-Id` (single use, hashed payload). Which actions are governed is per-org `GovernanceSettings`, changeable only by owners. `audit_logs` deletes are allowed solely inside a transaction that sets `fourmica.audit_retention = 'on'`, which only the retention job does.

- **`apps/be` enterprise controls**: identity stays Clerk. SSO is a Clerk SAML connection per **DNS-verified** `OrganizationDomain` (one org per verified domain); "enforced" means members on that domain must have signed in through it. Every session and CLI request passes `enforceAccessPolicy` (`src/auth/security.ts`, called by `requireTenant`/`requireProject`) — suspension, IP allowlist, MFA and session age from the Clerk `fva` claim (missing claim fails closed when a rule needs it), SSO enforcement; API keys get the IP rules in `src/auth/api-key.ts`. Sensitive owner actions call `requireRecentAuth`, which answers 403 `reauth_required` so the dashboard can run Clerk reverification. Custom roles are org-level permission sets (`OWNER_ONLY_PERMISSIONS` can never be granted) plus a project role; always resolve permissions through `can(tenant, …)`/`permissionsFor(tenant)`, never the built-in role alone. SCIM 2.0 lives under `/scim/v2` with its own bearer tokens. Audit streams POST signed batches (`X-4mica-Signature`, HMAC secret derived from `AUDIT_STREAM_SIGNING_KEY`, never stored) to public HTTPS endpoints only.

- **`apps/be` lifecycle**: `src/lifecycle/` owns graceful degradation. A module-level `ServiceState` (`ready` → `draining` → `closing`) is the single source of truth for "am I taking traffic". On SIGTERM/SIGINT, `installShutdownHandlers` flips to `draining` — `/health` immediately answers 503 and an `onRequest` guard in `initApp` refuses new requests with 503 + `Retry-After` + `Connection: close` — waits `SHUTDOWN_DRAIN_MS` for in-flight work, then closes Fastify (whose `onClose` hook disconnects Prisma) and flushes the loggers, all capped by `SHUTDOWN_TIMEOUT_MS`. Keep the container's `stop_grace_period` above that cap.

- **`apps/be` rate limiting**: `src/plugins/rate-limit.ts`, in-memory (no Redis). Two layers, because one hook can't do both jobs — an IP-keyed shield on `onRequest` ahead of Clerk verification, and a per-user limit on `preHandler` (where `request.auth` exists) keyed by Clerk user id with an IP fallback. `sensitiveRateLimit(app)` adds a tighter budget to credential-minting routes. Health and preflights are allowlisted; the whole thing is off under `NODE_ENV=test`.

- **`apps/be` audit events** are classified in `src/controllers/audit/classification.ts`: a `MANDATORY_AUDIT_ACTIONS` event (security, access or money) is written by `withAudit`/`withProjectAudit` in the same Prisma transaction as its change (or by `recordAudit` when there is no local write), so a failed audit write rolls the change back and answers 500, while the never-throwing `audit()`/`auditProject()` is only for `BEST_EFFORT_AUDIT_ACTIONS`; audit streams read `audit_logs` by cursor, so that table is the outbox.

- **CLI sign-in (`4mica auth login`)** is the OAuth device grant (RFC 8628), in `apps/be/src/{routes,controllers}/cli`. `POST /v1/cli/device/code` and `/v1/cli/device/token` are public; the request grants nothing until a Clerk-signed-in user approves its user code at the dashboard's `/cli/authorize` (`POST /me/cli/device/approve`). The CLI then holds a `4mica_cli_…` token (`CliSession`, stored hashed, scoped, expiring, revocable from Settings → Developer). Scopes are `account:read` (always), `wallets:read`, `wallets:link` and `wallets:unlink`; unlinking is not in the default set because deleting a wallet also detaches it from listings and agents. **A CLI token is not a session token**: only routes built with `cliGuards(app, scope)` in `src/routes/guards.ts` look one up, and `security/route-matrix.test.ts` pins that list — opening another route to the CLI means adding it there on purpose. Platform identity stays separate from wallet signing: no scope moves funds, and `wallets link` reuses the existing SIWE challenge, signed locally by the CLI.

- **`apps/email` is registry-driven**: `packages/email-client` owns the contract — one valibot schema per template in `src/payloads.ts`, collected into the `templateSchemas` map in `src/templates.ts`. The service derives *everything* from that map: `src/routes/emails.ts` generates one `POST /emails/<template-id>` per entry, the OpenAPI body schema comes from the same valibot schema via `@valibot/to-json-schema`, and `src/controllers/emails/index.ts` has a single `makeSendHandler(id)` for all of them. `src/templates/registry.ts` supplies only what differs per email — subject, React component, optional reply-to — and its `satisfies { [K in TemplateId]: … }` clause makes a missing entry a type error. **Adding a template is one schema, one map entry, one `.tsx`, one registry entry — never a new route or handler.** Fastify's validator compiler is replaced with a pass-through in `src/server.ts`: the JSON Schema is documentation only, and valibot is the sole validator so callers always get the `{ error, message, issues[] }` envelope. `EMAIL_DRY_RUN=true` (the default outside production) renders and logs without calling Resend, so the service and its tests run with no API key.

- **Data-driven content**: solutions/FAQs/team are typed TS data (e.g. `apps/web/i18n/locales/en/solutions.ts` with `getSolution(slug)`); dynamic routes use `generateStaticParams()`. SEO metadata is built from factories in `apps/web/seo/`.

- **Tests**: Vitest (jsdom, v8 coverage), co-located `*.test.ts(x)`, global setup in `vitest.setup.ts`. Browser tests for `apps/dashboard` and `apps/playground` are Playwright, kept in each app's `playwright/` folder with the config at `playwright.config.ts`, run with `test:e2e` (never part of `test`, which the pre-commit hook runs). Both apps are Google-only Clerk apps, so the `setup` project signs in with `@clerk/testing` and needs `CLERK_SECRET_KEY`, `E2E_CLERK_USER_EMAIL` and a seed run with `SEED_CLERK_USER_ID` — see the "End-to-end tests" section of `apps/playground/README.md`. `packages/ui` has the same layout: its suite starts Storybook, reads `index.json`, renders every story and docs entry, and drives each component in `playwright/components/`. `apps/web` runs its suite against the static export (`pnpm build` then `serve out`, reusing anything already on port 3200 or `E2E_PORT`) on Chromium, Firefox, WebKit, a phone, and a tablet; the page list comes from `out/sitemap.xml`, and the fixtures fail a test on any console error, uncaught exception, or same-origin 4xx/5xx. The Playwright agent skill is checked in at `.agents/skills/playwright-cli/`.

## Pull requests

Feature branches merge into `dev`; `main` only accepts PRs from `dev` — the `Promotion source` job in `ci.yml` fails anything else, hotfix branches and a changesets PR opened on `main` included. Neither branch has an admin bypass. The rulesets are mirrored in `.github/rulesets/`.

- **Into `dev`**: `.github/CODEOWNERS` decides who approves. Docs and copy (`*.md`, `*.mdx`, `docs/`, `apps/web/content/`) have no owner and merge on green CI; everything else needs one code owner who is not the author.
- **Into `main`**: green CI only, because the review already happened on the way into `dev`. So `dev` must stay promotable — unfinished work stays on its feature branch, and something in `dev` that cannot ship is reverted from `dev`, not worked around.
- **Hotfix**: PR into `dev`, promote `dev`, then dispatch only the affected service's deploy workflow. Only the service you dispatch is rebuilt, though it is built from all of `main`, shared packages included.
- **Required checks** are the gate jobs `Checks`, `Facilitator CI` and `Python SDK CI`. The last two filter on changed paths in a `changes` job rather than a workflow-level `paths:` — do not move the filter back to `on:`. A workflow that never starts leaves its required check pending forever and blocks every unrelated PR.
- **Emergency merge**: an admin sets the ruleset's enforcement to Disabled (Settings → Rules → Rulesets), merges, re-enables it, and says so on the PR.

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
