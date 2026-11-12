# Box B firewall

`apps/playground` is the one container that publishes on a non-loopback
address (`PLAYGROUND_BIND`, port `PLAYGROUND_PORT`, default `8081`), because the
`edge` nginx that fronts 4mica.io runs on Box A. It has no authentication of
its own, so only Box A should ever reach that port.

`ufw` cannot enforce that. Docker publishes ports with its own iptables DNAT
rules, and forwarded container traffic never reaches ufw's `INPUT` chain, so
`ufw deny 8081` is silently ignored. Docker evaluates the `DOCKER-USER` chain
first for forwarded traffic and never rewrites it, which is where
[`playground-edge-only.sh`](playground-edge-only.sh) puts two rules:

1. `RETURN` (let Docker's own rules continue) for TCP from the edge address
2. `DROP` for every other TCP connection

Both match on the **original** destination port via conntrack, i.e. the host
port a client dialled, not the container's `3100` that DNAT rewrites it to.
Every rule is tagged with the comment `4mica-playground-edge-only`, so re-running
replaces exactly these rules and leaves anything else in the chain alone.

## Install

On Box B, from the checkout, with Docker running:

```bash
sudo sh infra/firewall/playground-edge-only.sh <box-a-private-ip> [port]
```

It prints `ok: port 8081 is reachable only from <ip>` on success.

| Command | Use |
| --- | --- |
| `sh playground-edge-only.sh <edge-ip> [port]` | Apply (idempotent) |
| `sh playground-edge-only.sh --check <edge-ip> [port]` | Read-only; exits non-zero on drift |
| `sh playground-edge-only.sh --remove` | Delete only this script's rules |

The edge address is the IP Box A uses on the private network, the same network
`PLAYGROUND_BIND` sits on. A CIDR such as `10.0.0.0/24` works too.

## Surviving a reboot

Docker keeps existing `DOCKER-USER` rules when it starts, but the kernel forgets
everything on reboot. Persist them once after applying:

```bash
sudo apt-get install -y iptables-persistent
sudo netfilter-persistent save
```

Re-run `save` after any re-apply. Without it, the port is open to the whole
private network again after a reboot until the script is run.

## What it does not cover

- IPv6. `PLAYGROUND_BIND` is an IPv4 address, and Docker only publishes on IPv6
  when bound to `::`.
- Traffic from processes on Box B itself. Locally originated connections go
  through `OUTPUT`, not `FORWARD`, and the container's own healthcheck runs
  inside the container.
