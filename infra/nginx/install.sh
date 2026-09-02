#!/usr/bin/env bash
#
# Install this repo's host nginx server blocks on a box.
#
#   sudo ./install.sh a        # Box A — the 4mica.io box (SERVER_HOST)
#   sudo ./install.sh b        # Box B — the application box (BE_SERVER_HOST)
#   ./install.sh --check a     # read-only drift report, no sudo, used by CI
#   sudo ./install.sh --force a
#
# Idempotent: a second run with nothing to do changes nothing and says so.
#
# It will NOT overwrite a config that is already installed. `certbot --nginx`
# rewrites these files in place to add the TLS server block and the :80
# redirect, so the live copy legitimately diverges from the one in this repo
# after the first run — see README.md. Copying over it would silently delete
# the HTTPS block. --force does it anyway, for when you have changed the
# proxy rules on purpose, and then reminds you to re-run certbot.
#
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AVAILABLE=/etc/nginx/sites-available
ENABLED=/etc/nginx/sites-enabled

MODE=install
BOX=""

usage() {
  sed -n '3,17p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,\} \{0,1\}//'
  exit "${1:-2}"
}

for arg in "$@"; do
  case "$arg" in
    --check) MODE=check ;;
    --force) MODE=force ;;
    -h|--help) usage 0 ;;
    a|A|box-a) BOX=a ;;
    b|B|box-b) BOX=b ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage
      ;;
  esac
done

# No default. Each box gets only the server blocks for the hosts that resolve
# to it: a block installed on the wrong box yields a certificate that can never
# renew, because the HTTP-01 challenge is answered by whichever machine DNS
# points at. Guessing here would produce exactly that, silently.
if [ -z "$BOX" ]; then
  echo "Which box? Pass 'a' (the 4mica.io box) or 'b' (the application box)." >&2
  usage
fi

if [ "$BOX" = a ]; then
  CONFS=(4mica.io.conf)
  CERTBOT="certbot --nginx -d 4mica.io -d www.4mica.io"
else
  CONFS=(app.4mica.io.conf api.app.4mica.io.conf)
  CERTBOT="certbot --nginx -d app.4mica.io -d api.app.4mica.io"
fi

# --check is the CI path and runs as the unprivileged deploy user. Everything
# it touches is world-readable, so it must never reach for sudo.
if [ "$MODE" != check ] && [ "$(id -u)" -ne 0 ]; then
  echo "This writes to $AVAILABLE and reloads nginx — re-run with sudo." >&2
  echo "(For a read-only report, use: $0 --check $BOX)" >&2
  exit 1
fi

if [ ! -d "$AVAILABLE" ]; then
  echo "nginx is not installed on this machine: $AVAILABLE does not exist." >&2
  [ "$MODE" = check ] && exit 1
  echo "Install nginx first — see README.md." >&2
  exit 1
fi

installed=0
skipped=0
drift=0

for conf in "${CONFS[@]}"; do
  src="$SRC_DIR/$conf"
  dst="$AVAILABLE/$conf"

  if [ ! -f "$src" ]; then
    echo "::warning::$conf is missing from $SRC_DIR" >&2
    drift=1
    continue
  fi

  if [ ! -e "$dst" ]; then
    if [ "$MODE" = check ]; then
      echo "MISSING  $conf — not installed on this box."
      drift=1
      continue
    fi
    install -m 644 "$src" "$dst"
    echo "INSTALLED $conf"
    installed=1
  elif cmp -s "$src" "$dst"; then
    [ "$MODE" = check ] && echo "OK       $conf" || echo "UNCHANGED $conf"
  else
    # Expected on any box where certbot has run. Report it, do not act on it.
    if [ "$MODE" = force ]; then
      cp -a "$dst" "$dst.bak-$(date +%Y%m%d%H%M%S)"
      install -m 644 "$src" "$dst"
      echo "OVERWRITTEN $conf (previous copy kept alongside as .bak-*)"
      installed=1
    elif [ "$MODE" = check ]; then
      echo "DIVERGED $conf — live copy differs from the repo. Expected if certbot has run."
      drift=1
    else
      echo "SKIPPED  $conf — already installed and modified (certbot adds the TLS block)."
      echo "         Re-run with --force to replace it, then re-run: $CERTBOT"
      skipped=1
    fi
  fi

  # The symlink is independent of the file: a conf can be present in
  # sites-available and never enabled, which looks installed but serves nothing.
  if [ ! -e "$ENABLED/$conf" ]; then
    if [ "$MODE" = check ]; then
      echo "DISABLED $conf — present but not symlinked into $ENABLED."
      drift=1
    else
      ln -sfn "$dst" "$ENABLED/$conf"
      echo "ENABLED  $conf"
      installed=1
    fi
  fi
done

if [ "$MODE" = check ]; then
  [ "$drift" -eq 0 ] && echo "Host nginx matches infra/nginx for box $BOX."
  exit "$drift"
fi

if [ "$installed" -eq 0 ]; then
  echo "Nothing to do."
  [ "$skipped" -eq 1 ] && exit 0
  exit 0
fi

# Test before reload, always. A reload of a broken config leaves the running
# nginx serving the old one but fails the next restart — including a reboot.
if ! nginx -t; then
  echo "::error::nginx -t failed; NOT reloading. Fix the config above." >&2
  exit 1
fi
systemctl reload nginx
echo "nginx reloaded."

echo
echo "Next: issue or renew the certificate for this box —"
echo "  sudo $CERTBOT"
