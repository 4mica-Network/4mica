# Host nginx

Reference config for the machines that run the stacks. **Not written by CI** —
the workflows only bring the containers up on loopback ports. `install.sh` puts
these blocks on a box; run it there, with sudo, from a checkout.

These configs split across the two boxes, and each box gets only the server
blocks for the hosts that resolve to it. Installing a block on the wrong box
gives you a certificate you cannot renew, because the HTTP-01 challenge is
answered by whichever machine DNS points at. `install.sh` therefore has no
default box — you name it.

**Box A — the `4mica.io` box** (`SERVER_HOST`):

```bash
sudo infra/nginx/install.sh a
sudo certbot --nginx -d 4mica.io -d www.4mica.io   # the script prints this too
```

**Box B — the application box** (`BE_SERVER_HOST`):

```bash
sudo infra/nginx/install.sh b
sudo certbot --nginx -d app.4mica.io -d api.app.4mica.io
```

The script copies into `sites-available/`, symlinks into `sites-enabled/`, runs
`nginx -t` **before** reloading, and prints the box's certbot line. It is
idempotent — re-running it when nothing has changed does nothing.

Certbot edits these files in place to add the TLS block and the :80 redirect, so
after the first run the copies on the boxes diverge from the ones here. Treat
this directory as the starting point, not the source of truth for what is live.

**That divergence is why `install.sh` never overwrites an installed config.** It
reports the difference and stops, because copying over it would delete the HTTPS
block. Two flags cover the rest:

| Flag | Use |
| --- | --- |
| `--force` | You changed the proxy rules here on purpose. Overwrites, keeps the old copy as `.bak-<timestamp>`, and tells you to re-run certbot |
| `--check` | Read-only, **needs no sudo**. Reports missing, un-symlinked or diverged configs and exits non-zero. `build-react-app.yml` runs this after each deploy and turns a non-zero result into a warning |

## What goes where

| Host | Box | Proxies to | Container |
| --- | --- | --- | --- |
| `4mica.io`, `www.4mica.io` | A | `127.0.0.1:8088` | `4mica-edge` |
| `app.4mica.io` | B | `127.0.0.1:8082` | `4mica-dashboard` |
| `api.app.4mica.io` | B | `127.0.0.1:4000` | `4mica-be` |

There is deliberately **no** entry for `apps/email`. It publishes no host port
and is reachable only over the private `4mica-internal` Docker network, which is
the whole of its access control — it has no authentication of its own. Adding a
server block for it would undo that.

## Two things not to "fix"

**`4mica.io` does no path routing here.** It hands everything to `4mica-edge`,
which is the nginx inside `apps/web/docker-compose.yml`. That container
owns the split between the marketing site and the bare-handle namespace
(`4mica.io/<username>`), and its rules are kept in sync with `reservedSegments`
by a test that fails the build. Duplicating any of that logic at this layer
gives you two lists to keep in step instead of one.

**Do not rewrite `Host`.** `proxy_set_header Host $host` is load-bearing:
`@4mica/url` derives absolute URLs from the request host, and Clerk validates
its authorized parties against it. Setting it to the upstream address logs
people out and generates links pointing at `127.0.0.1`.

## Firewall

Every service binds loopback, so only nginx needs to be reachable:

```bash
sudo ufw allow 80,443/tcp
sudo ufw enable
```
