# Box B egress policy for `be`

`be` makes outbound connections to a short, fixed list of dependencies plus one
open-ended one: audit streams POST to any customer-supplied public HTTPS URL.
The application already refuses non-public destinations for those streams
(`apps/be/src/utils/safe-outbound.ts` resolves once, rejects private answers,
pins the connection to the validated address and bounds DNS, connect, TLS and
response headers with one deadline). This policy is the second, independent
layer: if that code is bypassed or a dependency misbehaves, the kernel still
refuses anything that is not on the list below.

**It is not applied by any workflow.** Review it, then apply it by hand on Box B
as described under [Install](#install).

## What `be` may reach

| Dependency | How it is reached | Rule |
| --- | --- | --- |
| Valkey | `valkey:6379` on the stack's own network | same-subnet `RETURN` |
| Email service | `email:4100` on `4mica-internal` | same-subnet `RETURN` |
| Postgres (container on `4mica-data`) | `POSTGRES_HOST:5432` | same-subnet `RETURN` |
| Postgres (managed, private address) | `POSTGRES_HOST:5432` | `EGRESS_ALLOW="<cidr>:5432"` |
| Playground revalidation (`PLAYGROUND_URL`) | private address or `4mica-data` | same-subnet `RETURN`, or `EGRESS_ALLOW` |
| Clerk API (`api.clerk.com`) | public HTTPS | public `tcp/443` |
| Core (`CORE_URL`) | public HTTPS | public `tcp/443`; add its port to `EGRESS_HTTPS_PORTS` if it is not 443 |
| Audit streams | public HTTPS via the pinned path | public `tcp/443`; add any non-default port customers use to `EGRESS_HTTPS_PORTS` |
| DNS | Docker's embedded resolver (`127.0.0.11`), forwarded by `dockerd` on the host | never crosses `FORWARD`, unaffected |

Everything else is dropped: every private, loopback, link-local (including the
cloud metadata address `169.254.169.254`), CGNAT, benchmarking, documentation,
multicast and reserved IPv4 range, and every public port other than the HTTPS
ports. A container connecting to `host.docker.internal` reaches the host through
`INPUT`, not `FORWARD`, so a host Postgres is governed by the host firewall, not
by this script.

The IP layer cannot tell Clerk from a customer's SIEM: both are public
`tcp/443`. Destination checks for audit streams stay in the application; this
policy guarantees that nothing reaches internal networks or non-HTTPS ports.

## How it works

[`be-egress.sh`](be-egress.sh) writes rules into `DOCKER-USER`, the chain Docker
evaluates first for forwarded container traffic and never rewrites. For each
IPv4 address the `4mica-be` container has, in order:

1. `RETURN` for `ESTABLISHED,RELATED` (replies to requests made to `be`)
2. `RETURN` to every subnet of every Docker network `be` is attached to
3. `RETURN` to each `EGRESS_ALLOW` entry (`<cidr>:<tcp port>`)
4. `DROP` to each non-public IPv4 range
5. `RETURN` for `tcp` to each port in `EGRESS_HTTPS_PORTS` (default `443`)
6. `DROP` everything else

Every rule carries the comment `4mica-be-egress`, so a re-run replaces exactly
these rules and leaves the playground rules from `infra/firewall/` alone.

Rules match the container's **current** addresses. Recreating `be` can give it
a new address, which leaves the old rules matching nothing and the new
container unrestricted until the script runs again. Re-apply after every `be`
deploy, and use `--check` to detect drift.

## Install

On Box B, from the checkout, with the `be` stack running:

```bash
sudo EGRESS_ALLOW="10.0.0.5/32:5432" sh infra/egress/be-egress.sh --print
sudo EGRESS_ALLOW="10.0.0.5/32:5432" sh infra/egress/be-egress.sh
```

`--print` shows the exact rules without touching the kernel. Applying prints
`ok: 4mica-be egress is restricted (N rules)`.

| Command | Use |
| --- | --- |
| `sh be-egress.sh --print` | Show the rules it would write |
| `sh be-egress.sh` | Apply (idempotent) |
| `sh be-egress.sh --check` | Read-only; exits non-zero on drift or a changed container address |
| `sh be-egress.sh --remove` | Delete only this script's rules |

To keep it applied across deploys, add both lines to `deploy-be.yml`'s
`post_up`, which runs after `compose up`. `post_up`'s exit status is ignored,
so the `--check` line is a warning, not a gate:

```yaml
          post_up: |
            sudo -n sh ../../infra/egress/be-egress.sh || echo "::warning::be egress policy not applied"
            sudo -n sh ../../infra/egress/be-egress.sh --check || echo "::warning::be egress policy drifted"
```

That needs a `sudoers` entry for the deploy user limited to this script.

Persist across reboots the same way as the playground rules:

```bash
sudo netfilter-persistent save
```

## Verify after applying

```bash
docker exec 4mica-be wget -q -T 5 -O- https://api.clerk.com/v1/jwks >/dev/null; echo "clerk: $?"
docker exec 4mica-be wget -q -T 5 -O- http://169.254.169.254/ ; echo "metadata (expect non-zero): $?"
docker exec 4mica-be wget -q -T 5 -O- http://example.com/ ; echo "plain http (expect non-zero): $?"
docker exec 4mica-be wget -q -T 5 -O- http://email:4100/health; echo "email: $?"
```

## What it does not cover

- IPv6. The Docker networks are IPv4-only; if IPv6 is enabled on them, mirror
  the rules with `ip6tables` before relying on this.
- `email`, `playground`, `valkey` and `migrate`. Each has its own dependency
  list (Resend for `email`); extend the script with a container argument
  rather than widening these rules.
- Processes on the host itself, whose traffic goes through `OUTPUT`.
