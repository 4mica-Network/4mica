---
"@4mica/cli": minor
---

The CLI can now sign in to a 4Mica account, the way `gh auth login` does.

```bash
4mica auth login      # shows a one-time code, opens the dashboard to approve it
4mica auth status
4mica wallets link    # link the wallet in use to the account
4mica account
4mica auth logout
```

New commands: `auth login`, `auth status`, `auth logout`, `account`,
`wallets link` and `wallets unlink`.

Signing in uses the OAuth 2.0 device authorization grant (RFC 8628): nothing
is typed into the terminal, and it works over SSH. The token is kept in the
system keychain on macOS and on Linux with `secret-tool`, and otherwise in a
file readable by your user only. In CI, set `FOURMICA_TOKEN` to a token made
in the dashboard under Settings → Developer.

A session may do only what it was given: reading the account, listing,
linking and, if asked for, removing wallets. Tokens made in the dashboard are
read-only by default and expire after 30 days, 90 days or a year.

An account session is separate from a wallet. It cannot move funds, and every
command that worked without an account still does.
