#!/usr/bin/env bash
set -uo pipefail

MIN_HSTS_AGE=15552000

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <host> [host...]" >&2
  exit 2
fi

failed=0

fail() {
  echo "::error::$1"
  failed=1
}

for host in "$@"; do
  read -r code target < <(
    curl -sS -o /dev/null --max-time 10 \
      -w '%{http_code} %{redirect_url}' "http://$host/probe-tls" 2>/dev/null ||
      echo "000 -"
  )

  case "$code" in
  301 | 308)
    case "$target" in
    "https://$host/"*) echo "ok: http://$host redirects to HTTPS ($code)" ;;
    *) fail "http://$host redirects to '$target', not to https://$host" ;;
    esac
    ;;
  *) fail "http://$host answered $code, not a 301/308 redirect to HTTPS" ;;
  esac

  hsts="$(
    curl -sS -o /dev/null -D - --max-time 10 "https://$host/" 2>/dev/null |
      tr -d '\r' |
      awk -F': ' 'tolower($1) == "strict-transport-security" { print $2 }'
  )"
  age="$(printf '%s' "$hsts" | sed -nE 's/.*max-age=([0-9]+).*/\1/ip')"

  if [ -z "$hsts" ]; then
    fail "https://$host sends no Strict-Transport-Security header"
  elif [ -z "$age" ] || [ "$age" -lt "$MIN_HSTS_AGE" ]; then
    fail "https://$host sends Strict-Transport-Security '$hsts', below max-age=$MIN_HSTS_AGE"
  else
    echo "ok: https://$host sends Strict-Transport-Security: $hsts"
  fi
done

exit "$failed"
