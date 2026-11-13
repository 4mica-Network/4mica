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

## Deploy-time checks

Two scripts make the deploy check this rather than leave it to convention.

- [`check-bind.sh`](check-bind.sh) `<PLAYGROUND_BIND>` runs on Box B before
  `compose up`. It exits non-zero unless the value is an IPv4 address in
  10/8, 172.16/12 or 192.168/16 that is assigned to an interface on the box.
  `127.0.0.1` passes with a warning, because the edge can't reach it. `0.0.0.0`
  and public addresses fail.
- [`probe-closed.sh`](probe-closed.sh) `<public-host> [port]` runs on the
  GitHub runner after the deploy. The runner is on the public internet, so a
  successful TCP connect to the port means the firewall above is missing, and
  the script fails. It needs `timeout`, which Ubuntu runners have; without it
  the script stops rather than report a false "closed".

`deploy-playground.yml` calls both. The `|| exit 1` is load-bearing:
remote-deploy runs `pre_up` through `bash -c` without `errexit`, so a bare
failing line would be ignored.

```yaml
          pre_up: |
            sh ../../infra/firewall/check-bind.sh '${{ vars.PLAYGROUND_BIND || '127.0.0.1' }}' || exit 1
            # …the existing pre_up lines…

      - name: Confirm the playground port is closed to the internet
        shell: bash
        run: bash infra/firewall/probe-closed.sh "$SERVER_HOST" "$PORT"
        env:
          SERVER_HOST: ${{ secrets.BE_SERVER_HOST }}
          PORT: ${{ vars.PLAYGROUND_PORT || '8081' }}
```

## What it does not cover

- IPv6. `PLAYGROUND_BIND` is an IPv4 address, and Docker only publishes on IPv6
  when bound to `::`.
- Traffic from processes on Box B itself. Locally originated connections go
  through `OUTPUT`, not `FORWARD`, and the container's own healthcheck runs
  inside the container.
