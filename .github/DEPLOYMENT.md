# Deployment

Every service deploys the same way: a workflow SSHes to its server, fast-forwards
a git checkout of the repo, writes `<service_dir>/.env`, and runs
`docker compose up -d --build`. The shared mechanics live in
[`.github/actions/remote-deploy`](actions/remote-deploy/action.yml); each
workflow only supplies the host, the compose file and the env body.

## Topology

One server per service. Everything publishes to **loopback only** — each host
needs its own TLS reverse proxy (nginx/Caddy) in front, which is not managed by
this repo.

| Server | Services | Host port | Workflow |
| --- | --- | --- | --- |
| A — `4mica.io` | `web`, `playground`, `edge` nginx | 8080 / 8081 / 8088 | [build-react-app.yml](workflows/build-react-app.yml), [deploy-playground.yml](workflows/deploy-playground.yml) |
| B — `api.4mica.io` | `be` + one-shot `migrate` | 4000 | [deploy-be.yml](workflows/deploy-be.yml) |
| C — internal | `email` | 4100 | [deploy-email.yml](workflows/deploy-email.yml) |
| D — `app.4mica.io` | `dashboard` | 8082 | [deploy-dashboard.yml](workflows/deploy-dashboard.yml) |

Postgres is **external/managed**. `apps/be/docker-compose.yml` (with its bundled
`postgres` service) is local-dev only; production uses
`apps/be/docker-compose.prod.yml`, which reads `DATABASE_URL` and still runs the
`migrate` container before `be` starts. `playground` reads the same database
directly and never migrates it.

### Server A: the shared edge

`web` and `playground` are separate compose projects on one box. The `edge`
nginx in the playground stack fronts both, so they join an external Docker
network named `4mica-edge`; both deploy workflows create it idempotently before
`compose up`. The routing split — `web` keeps its marketing routes, `playground`
owns the bare-handle namespace `4mica.io/<username>` — lives in
[`apps/playground/nginx.conf`](../apps/playground/nginx.conf).

Its reserved-path regex must stay in sync with `reservedSegments` in
`packages/url/src/index.ts`; `apps/playground/src/main.test.ts` fails the build
otherwise, because a missing entry silently turns a marketing route into a
claimable handle.

`edge` proxies through `set` variables plus Docker's embedded resolver rather
than `upstream` blocks. Static upstreams resolve once at startup, so a `web`
redeploy would leave nginx pinned to a dead container IP.

## Triggers

Each workflow runs on push to `main` filtered to its own paths (app, the
workspace packages it depends on, root manifests, and the workflow/action
files), or on `workflow_dispatch` with a `dev` / `prod` choice. `dev` deploys the
`dev` branch, `prod` deploys `main` — the same mapping the web workflow uses.

A `concurrency` group per service+environment prevents two runs racing the same
`git pull`.

Unlike the web workflow, the new ones do **not** `docker compose down` first —
compose recreates only what changed. Each then polls the container's healthcheck
and fails the job (after dumping `docker compose logs --tail=200`) if it never
goes healthy, so a broken deploy shows up red in CI rather than only on the box.

## Secrets and variables

Set per **environment** (`dev`, `prod`) in repository settings. Clerk
*publishable* keys ship in browser bundles and belong in variables, not secrets.

Shared across every workflow:

| Kind | Name | Notes |
| --- | --- | --- |
| secret | `SSH_PRIVATE_KEY` | Authorised on all four servers |
| var | `SERVER_USER` | Defaults to `mo` |
| var | `DEPLOY_PATH` | Defaults to `~/var/www/4mica` |

Per service:

| Service | Secrets | Variables |
| --- | --- | --- |
| web | `SERVER_HOST` | `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `WEB_PORT` |
| be | `BE_SERVER_HOST`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` | `BE_PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `CLERK_PUBLISHABLE_KEY`, `CLERK_AUTHORIZED_PARTIES`, `SHUTDOWN_*`, `RATE_LIMIT_*` |
| email | `EMAIL_SERVER_HOST`, `RESEND_API_KEY` | `EMAIL_PORT`, `EMAIL_BIND_ADDR`, `EMAIL_DRY_RUN`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL` |
| dashboard | `DASHBOARD_SERVER_HOST` | `DASHBOARD_PORT`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_BASE_URL`, `VITE_APP_URL` |
| playground | `SERVER_HOST` (same host as web), `DATABASE_URL`, `CLERK_SECRET_KEY`, `REVALIDATE_SECRET` | `PLAYGROUND_PORT`, `EDGE_PORT`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ASSET_PREFIX` (`/p`), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |

### Gotchas that will bite on first deploy

- **`CLERK_JWT_KEY` is a PEM.** Store it with literal `\n` escapes. The `.env`
  file is line-based, so a real newline truncates it; `apps/be/src/config/index.ts`
  already unescapes `\n` on read.
- **`EMAIL_DRY_RUN` defaults to `false` under `NODE_ENV=production`**, which makes
  `RESEND_API_KEY` required. Without a valid `re_…` key the email container fails
  at boot rather than degrading.
- **`EMAIL_BIND_ADDR` must never be `0.0.0.0`.** The email service has no
  authentication of its own — reaching it *is* the authorisation. Leave it on
  loopback, or set it to the host's private-network address once a caller exists.
- **`NEXT_PUBLIC_ASSET_PREFIX` is required for playground in production.** Two
  Next apps cannot share `/_next` on one origin; without `/p` every profile page
  loads unstyled and the server logs nothing.
- **Build-time vs runtime.** All `VITE_*` and `NEXT_PUBLIC_*` values are inlined
  during `docker build`. Changing one requires a rebuild, not a restart —
  `up -d --build` handles it, but a manual `docker compose restart` will not.

## Bootstrapping a new server

1. Install Docker Engine and the Compose plugin.
2. Create the deploy user (matching `SERVER_USER`) and add the CI public key to
   its `~/.ssh/authorized_keys`.
3. Give that user a deploy key or read access for `git clone` over SSH — the
   workflow clones into `DEPLOY_PATH` on first run, so no manual checkout is
   needed.
4. Point a TLS reverse proxy at the service's loopback port and open only 80/443
   in the firewall.
5. On server A only: `docker network create 4mica-edge` (the workflows also do
   this, so it is only needed if you bring the stacks up by hand).
6. Run the workflow via `workflow_dispatch` → `dev` first and confirm it ends on
   the health-wait step.

## Running the stacks locally

```bash
pnpm db:up            # just Postgres
pnpm be:up            # postgres + migrate + be
pnpm email:up
pnpm web:up           # creates 4mica-edge, then web
pnpm playground:up    # creates 4mica-edge, then playground + edge nginx
pnpm dashboard:up
```

Each has a matching `:down`. They read the app's `.env`, seeded from the
`.env.example` next to it.

`web` and `playground` declare `4mica-edge` as an external network, so a bare
`docker compose up` in either directory fails until it exists — the `:up`
scripts above create it for you, as do the workflows.

`apps/be/docker-compose.prod.yml` sets its own compose project name
(`4mica-be-prod`). Without it the prod stack would share the `be` project with
the dev compose file, and the `--remove-orphans` the deploy action passes would
delete a locally running `4mica-be-postgres`.
