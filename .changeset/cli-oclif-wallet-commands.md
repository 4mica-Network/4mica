---
"@4mica/cli": minor
---

The CLI now manages a wallet's collateral as well as scaffolding projects, and
is rebuilt on [oclif](https://oclif.io).

```bash
4mica deposit 5 --asset USDC
4mica balance
4mica withdraw 5 --asset USDC
```

New commands: `whoami`, `balance`, `deposit`, `withdraw`, `withdrawals`
(`request`, `finalize`, `cancel`), `networks`, `tokens`, `status` and `config`
(`get`, `set`, `unset`). The wallet key is read from
`FOURMICA_WALLET_PRIVATE_KEY`, exported or in a file given by `--env-file`.

Every command takes `--json`, writes its result to stdout and everything else
to stderr, and reports errors with a code. Exit codes are 1 for a failed
operation, 2 for a usage error and 3 for a configuration error.

**Changed**

- `4mica` with no command prints help. Scaffolding is `4mica init`, so
  `npx @4mica/cli` becomes `npx @4mica/cli init`.
- `init` takes `--template <id>` in place of `--type`, `--role` and
  `--framework`. The three old flags still work and print a deprecation
  warning.
- `init` no longer starts the project unless asked: it asks in a terminal, and
  elsewhere starts it only with `--run`. Previously `--yes` turned starting
  off without saying so.
- `init` without a terminal no longer reaches a prompt. It needs `--template`
  (or `--yes`) and fails with exit code 2 otherwise.
- `dashboard` opens the hosted dashboard at app.4mica.io. `dashboard --local`
  starts the dev server from a checkout of the monorepo, which is what
  `dashboard` did before; outside the monorepo it printed a notice and exited
  0.
