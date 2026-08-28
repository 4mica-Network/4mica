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

**Postgres is external to the stacks.** `apps/be/docker-compose.yml` bundles a
`postgres` service, but that file is local-dev only; production uses
`apps/be/docker-compose.prod.yml`, which contains just the one-shot `migrate`
container and the API. Both connect *out* to a Postgres that already exists on
the box — the deploy neither creates nor owns it. Bundling one would put a
second, empty database on the same machine fighting the real one for port 5432.

No `DATABASE_URL` is ever passed in: both compose files **compose** it from the
`POSTGRES_*` parts, so the credentials have exactly one source of truth.
`playground` builds the same string from the same variables and never migrates
the database — set `POSTGRES_HOST` identically in both, or the two apps quietly
read different databases.

**`POSTGRES_HOST` is resolved from inside a container, so it is never
`localhost`.** Two values are valid:

| Where Postgres runs | `POSTGRES_HOST` | Also required |
| --- | --- | --- |
| In another compose project | **that container's name** — preferred | Nothing. Each workflow's `pre_up` attaches it to `4mica-data` for you |
| On the host | `host.docker.internal` (the default) | The `extra_hosts: host-gateway` entry the compose files already carry, plus host-side `listen_addresses` and `pg_hba.conf` — see bootstrap |

**Prefer the container form when you have the choice.** Naming the container
keeps database traffic on the private `4mica-data` bridge; the host form sends
it out of the container, into the host's published port and back, which only
works if Postgres is listening beyond loopback — and a Postgres listening beyond
loopback is one firewall rule away from being on the internet.

The attach is done by `pre_up` in `deploy-be.yml` and `deploy-playground.yml`:

```sh
pg='${{ vars.POSTGRES_HOST }}'
if [ -n "$pg" ] && [ "$pg" != host.docker.internal ]; then
  docker network connect 4mica-data "$pg" 2>/dev/null || true
fi
```

It is idempotent and runs in both workflows because either stack may come up
first. `POSTGRES_HOST` must therefore be the **container name**, not a bare
network alias — `docker network connect` takes a container.

### Three Docker networks, three jobs

All three are `external: true` in the compose files and created idempotently by
the workflows' `pre_up`, because the stacks are separate compose projects and any
of them may come up first.

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

**`4mica-data`** is the database network, joining `be`, `migrate` and
`playground`. It carries a Postgres member only when the database is itself a
container in another compose project attached to it; with a host Postgres the
network is inert and the containers reach the host via `host.docker.internal`
instead. It is deliberately *not* `4mica-internal`: that network is the whole of
the email service's access control, and putting `playground` on it would hand it
the email service too.

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

**Nothing deploys automatically.** Every deploy workflow is `workflow_dispatch`
only — merging to `main` changes nothing on the server. To ship, open the repo's
**Actions** tab, pick the workflow, hit **Run workflow**, and choose the
environment: `dev` deploys the `dev` branch, `prod` deploys `main`.

Because the branch comes from the `environment` input rather than the triggering
push, the ref you launch from in the dropdown only decides which copy of the
*workflow file* runs. `prod` always deploys `main`.

Deploying more than one service means running more than one workflow. That is
deliberate: on a single box a push-triggered fan-out is how you get four
concurrent `git pull`s against one checkout.

All five share **one** `concurrency` group per environment — `deploy-<env>`, with
no service in the name. They deploy to the same machine and therefore the same
`DEPLOY_PATH` checkout, so a per-service group would let two runs `git pull` the
same working tree at once. The cost is that deploys queue instead of running in
parallel; that is the trade the single-box topology makes.

The non-deploy workflows follow the same rule. `release.yml` (SDK publish) and
`facilitator-release.yml` (GHCR image push) are dispatch-only.
`facilitator-ci.yml` is the one exception and keeps its `pull_request` trigger —
it only runs Rust checks and publishes nothing, so it validates a PR *before* a
merge rather than reacting to one.

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
| be | `BE_SERVER_HOST`, `POSTGRES_PASSWORD`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_DB`, `BE_PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `EMAIL_SERVICE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_AUTHORIZED_PARTIES`, `SHUTDOWN_*`, `RATE_LIMIT_*` |
| email | `EMAIL_SERVER_HOST`, `RESEND_API_KEY` | `EMAIL_DRY_RUN`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL` |
| dashboard | `DASHBOARD_SERVER_HOST` | `DASHBOARD_PORT`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_BASE_URL`, `VITE_APP_URL` |
| playground | `SERVER_HOST` (same host as web), `POSTGRES_PASSWORD`, `CLERK_SECRET_KEY`, `REVALIDATE_SECRET` | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_DB`, `PLAYGROUND_PORT`, `EDGE_PORT`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ASSET_PREFIX` (`/p`), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |

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

- **`DEPLOY_PATH`'s parent must be writable by `SERVER_USER`.** The action
  clones unprivileged — there is no `sudo` anywhere in it — so with the
  bootstrap `chown` skipped, `mkdir -p /var/www` succeeds (it already exists,
  owned by root) and the next line fails with
  `fatal: could not create work tree dir '/var/www/4mica': Permission denied`,
  exit 128, on **Prepare remote checkout**. See bootstrap step 3.
- **`POSTGRES_PASSWORD` has no default.** `docker-compose.prod.yml` declares it
  `${POSTGRES_PASSWORD:?…}` on purpose, so a production database can never come
  up on the dev stack's throwaway password — compose refuses to start without
  it. `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER` and `POSTGRES_DB` do
  default (`host.docker.internal`, `5432`, `4mica`, `4mica`) and only need
  setting to override. All of them must match between `be` and `playground`.
- **`POSTGRES_HOST=localhost` never works.** It is resolved inside the
  container, where `localhost` is the container itself. Use
  `host.docker.internal` for a host Postgres, or the container alias for a
  containerised one.
- **A bundled Postgres would collide on 5432.** If you ever add a `postgres`
  service back to `docker-compose.prod.yml`, it will fail to start against an
  existing host instance with
  `Bind for 0.0.0.0:5432 failed: port is already allocated`. That is the symptom
  of two databases, not of a misconfigured port — the stacks connect out to one
  database rather than shipping their own.
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

   **Do not skip this.** The action's clone runs as `SERVER_USER` with no
   `sudo`, so an un-`chown`ed `/var/www/4mica` fails the deploy at **Prepare
   remote checkout** with `could not create work tree dir … Permission denied`.
4. Add that user to the `docker` group —
   `sudo usermod -aG docker "$SERVER_USER"`, then reconnect. The action runs
   bare `docker compose`, `docker image prune` and `docker inspect` over SSH; a
   user outside the group gets `permission denied … /var/run/docker.sock` on
   the compose step.
5. Give that user a deploy key or read access for `git clone` over SSH — the
   workflow clones into `DEPLOY_PATH` on first run, so no manual checkout is
   needed. The clone uses the **server's own** SSH identity; the runner's key is
   never agent-forwarded. Verify with
   `sudo -iu "$SERVER_USER" ssh -T git@github.com` (the "does not provide shell
   access" greeting is success).
6. `docker network create 4mica-edge && docker network create 4mica-internal &&
   docker network create 4mica-data`. The workflows also do this, so it is only
   needed to bring the stacks up by hand.
7. **Create the role and database.** Neither stack ships a database and the
   `migrate` container creates neither — it only applies the schema to one that
   already exists. Match `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD`.
   **Both defaults start with a digit, so they must be double-quoted in SQL** —
   bare `CREATE ROLE 4mica` is a syntax error:

   ```sql
   CREATE ROLE "4mica" LOGIN PASSWORD '<POSTGRES_PASSWORD>';
   CREATE DATABASE "4mica" OWNER "4mica";
   ```

   Run that with `sudo -u postgres psql` for a host Postgres, or
   `docker exec -i <container> psql -U postgres` for a containerised one. You
   can instead point `POSTGRES_USER` / `POSTGRES_DB` at a role and database that
   already exist; Prisma creates tables and its own `_prisma_migrations` table,
   so the role must own the database or hold `CREATE` on its schema.
8. **Make Postgres reachable from the containers.**

   *Containerised Postgres (preferred)* — nothing to do. Set `POSTGRES_HOST` to
   the container's name and each workflow's `pre_up` joins it to `4mica-data`.
   Confirm with `docker inspect -f '{{json .NetworkSettings.Networks}}' <container>`.

   *Host Postgres* — the containers dial `host.docker.internal`, so the server
   must accept connections from the Docker bridge:

   - `listen_addresses` in `postgresql.conf` must cover it. Name it explicitly —
     `listen_addresses = 'localhost,172.17.0.1'` (check with
     `ip -4 addr show docker0`) — rather than `'*'`, which puts the database on
     every interface including the public one and leaves a firewall rule as the
     only thing between it and the internet.
   - `pg_hba.conf` must accept the container subnets:
     `host all all 172.16.0.0/12 scram-sha-256`. That range covers user-defined
     bridges (172.18+), not just `docker0`. Prefer it over `host all all all`,
     which accepts a password attempt from anywhere the port is reachable.
     Reload with `sudo systemctl reload postgresql`.
   - If `ufw` is active it drops this traffic even with Postgres listening,
     because it arrives on the host's INPUT chain from a Docker interface:
     `sudo ufw allow in on docker0 to any port 5432 proto tcp`.

   Verify either form from inside a container, never from the host — a host
   `psql` proves nothing, since it goes over loopback or the unix socket:

   ```sh
   docker run --rm --add-host host.docker.internal:host-gateway postgres:17-alpine \
     psql "postgresql://4mica:<pw>@host.docker.internal:5432/4mica" -c '\conninfo'
   ```

9. Point DNS at the box for `4mica.io`, `www.4mica.io`, `app.4mica.io` and
   `api.4mica.io`, then install the host nginx configs and TLS certificates —
   see [`infra/nginx/README.md`](../infra/nginx/README.md).
10. Open only 80/443 in the firewall. Every service binds loopback, so nothing
    else needs to be reachable. **Check 5432 specifically**: a host Postgres
    widened beyond loopback in step 8, or a container publishing `0.0.0.0:5432`,
    is exposed to the internet behind nothing but a password. Confirm from
    off-box with `nc -vz <host> 5432` — it must fail.
11. Run each workflow via `workflow_dispatch` → `dev` and confirm it ends on the
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
