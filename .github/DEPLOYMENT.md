# Deployment

Every service deploys the same way: a workflow SSHes to its server, fast-forwards
a git checkout of the repo, writes `<service_dir>/.env`, and runs
`docker compose up -d --build`. The shared mechanics live in
[`.github/actions/remote-deploy`](actions/remote-deploy/action.yml); each
workflow only supplies the host, the compose file and the env body.

## Topology

**Two servers.** Each service is still its own compose project and its own
workflow. Everything publishes to **loopback only**, with one deliberate
exception noted below; each host's nginx terminates TLS and proxies inward.
Those server blocks live in [`infra/nginx/`](../infra/nginx/) and are installed
on a box by running [`infra/nginx/install.sh`](../infra/nginx/install.sh) there
with sudo — not by CI, which deliberately has no root on the hosts.
`build-react-app.yml` does run `install.sh --check` after each deploy and warns
if Box A's config is missing or has drifted.

**Box A — the `4mica.io` box** (`SERVER_HOST`). Runs `web` and the `edge` nginx
that owns the apex namespace. This is where `4mica.io` DNS points and where its
TLS certificate lives.

| Public host | Host port | Services | Workflow |
| --- | --- | --- | --- |
| `4mica.io`, `www.4mica.io` | 8088 | `edge` nginx → `web` (8080) locally, `playground` across the network | [build-react-app.yml](workflows/build-react-app.yml) |

**Box B — the application box** (`BE_SERVER_HOST`, `DASHBOARD_SERVER_HOST`,
`EMAIL_SERVER_HOST`, and the playground half of `deploy-playground.yml`). Runs
everything else, including Postgres.

| Public host | Host port | Services | Workflow |
| --- | --- | --- | --- |
| `app.4mica.io` | 8082 | `dashboard` | [deploy-dashboard.yml](workflows/deploy-dashboard.yml) |
| `api.app.4mica.io` | 4000 | `be` + one-shot `migrate` | [deploy-be.yml](workflows/deploy-be.yml) |
| *(none)* | *(none)* | `email` | [deploy-email.yml](workflows/deploy-email.yml) |
| *(via Box A's `edge`)* | 8081 on `PLAYGROUND_BIND` | `playground` | [deploy-playground.yml](workflows/deploy-playground.yml) |

`SERVER_HOST` is Box A and is used by `build-react-app.yml` alone. Every other
`*_SERVER_HOST` is Box B. `deploy-playground.yml` deliberately reuses
`BE_SERVER_HOST` rather than taking a secret of its own, because `playground`
cannot be separated from Postgres — see the coupling list below.

**The one non-loopback port.** `edge` sits on Box A and `playground` on Box B,
so `playground` must publish somewhere Box A can reach: `PLAYGROUND_BIND`. Put
it on a **private network address** between the two machines. It defaults to
`127.0.0.1`, which fails closed — the deploy still succeeds and only the apex
domain breaks. Never set it to `0.0.0.0`: `playground` holds Clerk credentials
and a database connection, and there is no authentication in front of it.

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

**`4mica-edge`** joins `web` and `edge` on Box A so the `edge` nginx can
resolve `web` by name. The routing split — `web` keeps its marketing routes,
`playground` owns the bare-handle namespace `4mica.io/<username>` — lives in
[`apps/web/nginx.conf.template`](../apps/web/nginx.conf.template). `playground`
is not on this network: it is on Box B and `edge` reaches it at
`PLAYGROUND_UPSTREAM`.

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

`apps/web/nginx.conf.template`'s marketing regex must stay in sync with
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

Both upstreams come from the environment: the file is a **template**, and the
nginx image runs `envsubst` over `/etc/nginx/templates` at startup.
`NGINX_ENVSUBST_FILTER: ^MICA_` is load-bearing — without it `envsubst`
replaces nginx's own `$host`, `$remote_addr` and `$connection_upgrade` with
empty strings and the config no longer parses. Only `MICA_WEB_UPSTREAM` and
`MICA_PLAYGROUND_UPSTREAM` are substituted.

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

Box B's four share **one** `concurrency` group per environment — `deploy-<env>`,
with no service in the name. They deploy to the same machine and therefore the
same `DEPLOY_PATH` checkout, so a per-service group would let two runs
`git pull` the same working tree at once. The cost is that deploys queue instead
of running in parallel; that is the trade the single-box topology makes.

`build-react-app.yml` is the exception, on `deploy-web-<env>`. It is alone on
Box A with a checkout of its own (`WEB_DEPLOY_PATH`), so there is no shared
working tree for the group to protect — putting it in `deploy-<env>` would only
make a web deploy wait on an unrelated `be` deploy.

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
| var | `DEPLOY_PATH` | Defaults to `~/var/www/4mica`. Set it at **repository** scope, or not at all — a per-environment value splits the checkout in two |

Per service. Every `*_SERVER_HOST` must hold the **same machine address**. They
are separate secrets so that a service *without* network coupling — today only
`dashboard` — can later move to its own box. The others cannot be split by
changing a secret, because a Docker network spans one host and two of them are
load-bearing:

- **`web` + `edge`** — `apps/web/docker-compose.yml` ships the `edge` nginx, and
  `apps/web/nginx.conf.template` resolves `web` by container name over
  `4mica-edge`. `edge` must also be on the box `4mica.io` resolves to, since
  `infra/nginx/4mica.io.conf` proxies the whole domain to `EDGE_PORT` on
  loopback.
- **`be` + `email`** — `be` reaches `http://email:4100` over `4mica-internal`,
  and `apps/email` publishes no host port, so that network is its entire access
  control.
- **`playground` + Postgres** — `playground` reads the database `be` migrates,
  reaching it as `host.docker.internal` or a container on `4mica-data`. Neither
  crosses a machine, which is why `playground` deploys to Box B.

`edge` → `playground` is the one link that *does* cross the boxes, and it is
the exception that proves the rule: it works only because it is a plain
address (`PLAYGROUND_UPSTREAM`) rather than Docker DNS, and it costs a
non-loopback port on Box B.

A mismatch does not fail the deploy. Each stack comes up on whichever box its
secret names and only misbehaves later, so check these values first when a
service deploys green but cannot reach its neighbours.

| Service | Secrets | Variables |
| --- | --- | --- |
| web + edge (Box A) | `SERVER_HOST` | `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `WEB_PORT`, `EDGE_PORT`, **`PLAYGROUND_UPSTREAM`** |
| be | `BE_SERVER_HOST`, `POSTGRES_PASSWORD`, `CLERK_SECRET_KEY`, `CLERK_JWT_KEY` | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_DB`, `BE_PORT`, `LOG_LEVEL`, `CORS_ORIGINS`, `EMAIL_SERVICE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_AUTHORIZED_PARTIES`, `SHUTDOWN_*`, `RATE_LIMIT_*` |
| email | `EMAIL_SERVER_HOST`, `RESEND_API_KEY` | `EMAIL_DRY_RUN`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL` |
| dashboard | `DASHBOARD_SERVER_HOST` | `DASHBOARD_PORT`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_URL`, `VITE_BASE_URL`, `VITE_APP_URL` |
| playground (Box B) | `BE_SERVER_HOST` (same host as be), `POSTGRES_PASSWORD`, `CLERK_SECRET_KEY`, `REVALIDATE_SECRET` | `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_DB`, `PLAYGROUND_PORT`, **`PLAYGROUND_BIND`**, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ASSET_PREFIX` (`/p`), `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` |

Values the single-box layout pins:

| Name | Value |
| --- | --- |
| `CORS_ORIGINS` | `https://app.4mica.io` |
| `CLERK_AUTHORIZED_PARTIES` | `https://app.4mica.io,https://4mica.io` |
| `EMAIL_SERVICE_URL` | `http://email:4100` |
| `VITE_API_URL` | `https://api.app.4mica.io` |
| `VITE_APP_URL` / `NEXT_PUBLIC_APP_URL` | `https://app.4mica.io` |
| `VITE_BASE_URL` / `NEXT_PUBLIC_BASE_URL` | `https://4mica.io` |
| `NEXT_PUBLIC_ASSET_PREFIX` | `/p` |

### Gotchas that will bite on first deploy

- **Paste `*_SERVER_HOST` secrets without a trailing newline.** A trailing
  newline or space becomes part of the hostname, and `ssh` rejects it with
  `hostname contains invalid characters` and exit 255 — from **Prepare remote
  checkout**, not from the step that set it. **Validate deploy target** now
  trims the ends and logs a `::warning::` naming the secret to re-enter, so
  this degrades to a warning rather than a failed deploy. An empty secret, a
  `host:port` pair, and a `https://` prefix each fail there with their own
  message. Note the trimmed value is re-masked with `::add-mask::`, since the
  runner only masks the secret's exact stored value.
- **`DEPLOY_PATH` must be writable by `SERVER_USER`.** The action clones
  unprivileged — there is no `sudo` anywhere in it — so with the bootstrap
  `chown` skipped, **Prepare remote checkout** fails with
  `::error::Cannot create /var/www/4mica as user <user>`. See bootstrap step 3.
- **Set `DEPLOY_PATH` at repository scope, not per environment.** Box B's four
  workflows share one checkout and one concurrency group, so a value present on
  `prod` but absent on `dev` (or added between two runs) silently produces a
  *second* checkout: unset resolves to the default `~/var/www/4mica` →
  `$HOME/var/www/4mica`, while a set value is usually the absolute
  `/var/www/4mica`. The stacks then drift apart, and the concurrency group no
  longer protects anything. **Prepare remote checkout** prints `Deploy path
  resolves to …` on every run — compare it across two workflows when a service
  is stuck on an old commit.
- **`DEPLOY_PATH` describes Box B only.** It is one variable, but the boxes are
  provisioned independently, and a path that exists and is `chown`ed on one is
  not on the other. `build-react-app.yml` (Box A, and the only workflow that
  targets it) therefore reads **`WEB_DEPLOY_PATH`** and **`WEB_SERVER_USER`**
  instead, both optional and both defaulting to the home-relative
  `~/var/www/4mica`, which the deploy user can create with no `sudo` at all.
  Setting `DEPLOY_PATH=/var/www/4mica` for Box B is what broke Box A's deploy
  once already — do not "tidy" the two back into one variable. For the same
  reason Box A has its own `deploy-web-<env>` concurrency group: it does not
  share Box B's checkout, so sharing the group only made it queue.
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
3. Create the checkout directory. **On Box A there is nothing to do** — it
   defaults to `~/var/www/4mica` → `$HOME/var/www/4mica`, which the deploy user
   already owns, and the workflow clones into it on first run. Leave
   `WEB_DEPLOY_PATH` unset.

   On **Box B**, if you want the absolute path, hand it to that user first:
   `sudo mkdir -p /var/www/4mica && sudo chown "$SERVER_USER:$SERVER_USER" /var/www/4mica`,
   then set `DEPLOY_PATH=/var/www/4mica` **at repository scope**. Leaving
   `DEPLOY_PATH` unset is equally valid and needs no `sudo` at all. Pick one
   deliberately and use it for all four of Box B's workflows.

   **Do not skip the `chown` if you set the variable.** The action's clone runs
   as `SERVER_USER` with no `sudo`, so an un-`chown`ed `/var/www/4mica` fails
   the deploy at **Prepare remote checkout** with `Cannot create /var/www/4mica
   as user <user>`. And do not point `WEB_DEPLOY_PATH` at Box B's value: the
   two machines are provisioned separately, and that is exactly the mistake
   that produced this error on Box A.
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

9. Point DNS at the right box for each host — `4mica.io` and `www.4mica.io` at
   Box A, `app.4mica.io` and `api.app.4mica.io` at Box B — then install that
   box's host nginx configs and TLS certificates from a checkout:
   `sudo infra/nginx/install.sh a` on Box A, `… b` on Box B, followed by the
   certbot line it prints. See [`infra/nginx/README.md`](../infra/nginx/README.md).
   A record aimed at the wrong box yields a certificate that cannot be renewed,
   because the HTTP-01 challenge is answered by whichever machine DNS resolves
   to — which is why the script makes you name the box rather than guessing.
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
