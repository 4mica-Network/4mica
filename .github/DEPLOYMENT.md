# Deployment

Every service deploys the same way: a workflow SSHes to its server, fast-forwards
a git checkout of the repo, writes `<service_dir>/.env`, and runs
`docker compose up -d --build`. The shared mechanics live in
[`.github/actions/remote-deploy`](actions/remote-deploy/action.yml); each
workflow only supplies the host, the compose file and the env body.

## Topology

**One server runs everything.** Each service is still its own compose project
and its own workflow — they are merely co-located. Everything publishes to
**loopback only**; the host's nginx terminates TLS and proxies inward. Those
server blocks live in [`infra/nginx/`](../infra/nginx/) as reference and are
copied to the box by hand, not by CI.

| Public host | Host port | Services | Workflow |
| --- | --- | --- | --- |
| `4mica.io`, `www.4mica.io` | 8088 | `edge` nginx → `web` (8080) / `playground` (8081) | [build-react-app.yml](workflows/build-react-app.yml), [deploy-playground.yml](workflows/deploy-playground.yml) |
| `app.4mica.io` | 8082 | `dashboard` | [deploy-dashboard.yml](workflows/deploy-dashboard.yml) |
| `api.4mica.io` | 4000 | `be` + one-shot `migrate` | [deploy-be.yml](workflows/deploy-be.yml) |
| *(none)* | *(none)* | `email` | [deploy-email.yml](workflows/deploy-email.yml) |

Set every `*_SERVER_HOST` secret — `SERVER_HOST`, `BE_SERVER_HOST`,
`EMAIL_SERVER_HOST`, `DASHBOARD_SERVER_HOST` — to that one machine.

Postgres is **external/managed**. `apps/be/docker-compose.yml` (with its bundled
`postgres` service) is local-dev only; production uses
`apps/be/docker-compose.prod.yml`, which reads `DATABASE_URL` and still runs the
`migrate` container before `be` starts. `playground` reads the same database
directly and never migrates it.

### Two Docker networks, two jobs

Both are `external: true` in the compose files and created idempotently by the
workflows' `pre_up`, because the stacks are separate compose projects and any of
them may come up first.

**`4mica-edge`** joins `web` and `playground` so the `edge` nginx can resolve
both. The routing split — `web` keeps its marketing routes, `playground` owns
the bare-handle namespace `4mica.io/<username>` — lives in
[`apps/playground/nginx.conf`](../apps/playground/nginx.conf).

**`4mica-internal`** joins `be` and `email`, and is the *entire* access control
for the email service. That service has no authentication of its own — reaching
it is the authorisation — so it publishes **no host port at all**. Docker
isolates user-defined bridges from one another, so a container not on this
network cannot route to it, and neither can anything running on the host.

Consequences worth knowing before you debug it:

- `curl localhost:4100` will not reach a containerised `email`. Use
  `docker exec 4mica-email wget -qO- http://127.0.0.1:4100/health`.
- `be` reaches it at `http://email:4100` — the compose **service** name, not the
  container name (`4mica-email`) and never a host port. That is what
  `EMAIL_SERVICE_URL` must be set to.
- `EMAIL_SERVICE_URL` is optional. Unset disables sending rather than failing
  boot, so a broken email service degrades the API instead of taking it down.

### Its reserved-path regex

`apps/playground/nginx.conf`'s marketing regex must stay in sync with
`reservedSegments` in `packages/url/src/index.ts`;
`apps/playground/src/main.test.ts` fails the build otherwise, because a missing
entry silently turns a marketing route into a claimable handle. A second test
there checks the same thing from the filesystem — every top-level route under
`apps/web/app` must be reserved.

That is separate from `blacklistedUsernames` in the same file, which bars role
and brand names (`admin`, `stripe`, `google`). Those are **not** routes and must
never be added to `reservedSegments` — they have no page to proxy to.

`edge` proxies through `set` variables plus Docker's embedded resolver rather
than `upstream` blocks. Static upstreams resolve once at startup, so a `web`
redeploy would leave nginx pinned to a dead container IP.

## Triggers

Each workflow runs on push to `main` filtered to its own paths (app, the
workspace packages it depends on, root manifests, and the workflow/action
files), or on `workflow_dispatch` with a `dev` / `prod` choice. `dev` deploys the
`dev` branch, `prod` deploys `main`.

All five share **one** `concurrency` group per environment — `deploy-<env>`, with
no service in the name. They deploy to the same machine and therefore the same
`DEPLOY_PATH` checkout, so a per-service group would let two runs `git pull` the
same working tree at once. The cost is that deploys queue instead of running in
parallel; that is the trade the single-box topology makes.

None of them `docker compose down` first — compose recreates only what changed.
Each then polls the container's healthcheck and fails the job (after dumping
`docker compose logs --tail=200`) if it never goes healthy, so a broken deploy
shows up red in CI rather than only on the box.

## Secrets and variables

Set per **environment** (`dev`, `prod`) in repository settings. Clerk
*publishable* keys ship in browser bundles and belong in variables, not secrets.

Shared across every workflow:

| Kind | Name | Notes |
| --- | --- | --- |
| secret | `SSH_PRIVATE_KEY` | Authorised on the deploy user |
| var | `SERVER_USER` | Defaults to `mo` |
| var | `DEPLOY_PATH` | Defaults to `~/var/www/4mica` |

Per service. Every `*_SERVER_HOST` is the **same machine** — they stay separate
secrets only so a service can later be moved to its own box without a code
change.

| Service | Secrets | Variables |
| --- | --- | --- |
| web | `SERVER_HOST` | `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `WEB_PORT` |
| be | `BE_SERVER_HOST`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` | `BE_PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `EMAIL_SERVICE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_AUTHORIZED_PARTIES`, `SHUTDOWN_*`, `RATE_LIMIT_*` |
| email | `EMAIL_SERVER_HOST`, `RESEND_API_KEY` | `EMAIL_DRY_RUN`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL` |
| dashboard | `DASHBOARD_SERVER_HOST` | `DASHBOARD_PORT`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_BASE_URL`, `VITE_APP_URL` |
| playground | `SERVER_HOST` (same host as web), `DATABASE_URL`, `CLERK_SECRET_KEY`, `REVALIDATE_SECRET` | `PLAYGROUND_PORT`, `EDGE_PORT`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ASSET_PREFIX` (`/p`), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |

Values the single-box layout pins:

| Name | Value |
| --- | --- |
| `CORS_ORIGINS` | `https://app.4mica.io` |
| `CLERK_AUTHORIZED_PARTIES` | `https://app.4mica.io,https://4mica.io` |
| `EMAIL_SERVICE_URL` | `http://email:4100` |
| `VITE_API_URL` | `https://api.4mica.io` |
| `VITE_APP_URL` / `NEXT_PUBLIC_APP_URL` | `https://app.4mica.io` |
| `VITE_BASE_URL` / `NEXT_PUBLIC_BASE_URL` | `https://4mica.io` |
| `NEXT_PUBLIC_ASSET_PREFIX` | `/p` |

### Gotchas that will bite on first deploy

- **`CLERK_JWT_KEY` is a PEM.** Store it with literal `\n` escapes. The `.env`
  file is line-based, so a real newline truncates it; `apps/be/src/config/index.ts`
  already unescapes `\n` on read.
- **`EMAIL_DRY_RUN` defaults to `false` under `NODE_ENV=production`**, which makes
  `RESEND_API_KEY` required. Without a valid `re_…` key the email container fails
  at boot rather than degrading.
- **`EMAIL_SERVICE_URL` is `http://email:4100`, not a host port.** The email
  service publishes nothing; `email` is a compose service name resolved over
  `4mica-internal`. `http://127.0.0.1:4100` will not connect, and neither will
  the container name. Never give this service a published port or an nginx
  server block — the network *is* its access control.
- **`NEXT_PUBLIC_ASSET_PREFIX` is required for playground in production.** Two
  Next apps cannot share `/_next` on one origin; without `/p` every profile page
  loads unstyled and the server logs nothing.
- **Build-time vs runtime.** All `VITE_*` and `NEXT_PUBLIC_*` values are inlined
  during `docker build`. Changing one requires a rebuild, not a restart —
  `up -d --build` handles it, but a manual `docker compose restart` will not.

## Bootstrapping the server

1. Install Docker Engine, the Compose plugin, and nginx.
2. Create the deploy user (matching `SERVER_USER`) and add the CI public key to
   its `~/.ssh/authorized_keys`.
3. Create the checkout directory and give it to that user:
   `sudo mkdir -p /var/www/4mica && sudo chown "$SERVER_USER:$SERVER_USER" /var/www/4mica`,
   then set the `DEPLOY_PATH` variable to `/var/www/4mica`. Note the default is
   `~/var/www/4mica`, which expands to `$HOME/var/www/4mica` — a different
   directory. Pick one deliberately.
4. Give that user a deploy key or read access for `git clone` over SSH — the
   workflow clones into `DEPLOY_PATH` on first run, so no manual checkout is
   needed.
5. `docker network create 4mica-edge && docker network create 4mica-internal`.
   The workflows also do this, so it is only needed to bring the stacks up by
   hand.
6. Point DNS at the box for `4mica.io`, `www.4mica.io`, `app.4mica.io` and
   `api.4mica.io`, then install the host nginx configs and TLS certificates —
   see [`infra/nginx/README.md`](../infra/nginx/README.md).
7. Open only 80/443 in the firewall. Every service binds loopback, so nothing
   else needs to be reachable.
8. Run each workflow via `workflow_dispatch` → `dev` and confirm it ends on the
   health-wait step. They share a concurrency group, so they queue rather than
   run together.

## Running the stacks locally

```bash
pnpm db:up            # just Postgres
pnpm be:up            # postgres + migrate + be
pnpm email:up         # creates 4mica-internal, then email
pnpm web:up           # creates 4mica-edge, then web
pnpm playground:up    # creates 4mica-edge, then playground + edge nginx
pnpm dashboard:up
```

Each has a matching `:down`. They read the app's `.env`, seeded from the
`.env.example` next to it.

`web`, `playground` and `email` declare their networks as external, so a bare
`docker compose up` in those directories fails until the network exists — the
`:up` scripts above create it for you, as do the workflows.

The local `be` stack (`apps/be/docker-compose.yml`) does **not** join
`4mica-internal`; only the prod file does. To exercise the `be` → `email` path
locally, run `apps/be` with `pnpm dev` and point `EMAIL_SERVICE_URL` at a
`pnpm --filter @4mica/email dev` on `http://127.0.0.1:4100`.

`apps/be/docker-compose.prod.yml` sets its own compose project name
(`4mica-be-prod`). Without it the prod stack would share the `be` project with
the dev compose file, and the `--remove-orphans` the deploy action passes would
delete a locally running `4mica-be-postgres`.
