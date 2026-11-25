---
"@4mica/cli": minor
---

The CLI now manages a wallet's collateral, pays for 402-protected URLs and
settles clearing cycles, as well as scaffolding projects. It is rebuilt on
[oclif](https://oclif.io).

```bash
4mica wallets create
4mica deposit 5 --asset USDC
4mica balance
4mica fetch https://api.example.com/report
4mica withdraw 5 --asset USDC
```

New commands: `fetch`, `cycles` (`checkpoint`, `pay`, `claim`), `payments`,
`guarantees verify`, `wallets` (`create`, `import`, `use`, `remove`), `whoami`, `balance`, `deposit`, `withdraw`, `withdrawals`
(`request`, `finalize`, `cancel`), `networks`, `tokens`, `status` and `config`
(`get`, `set`, `unset`) and `help`.

The wallet key comes from a key file (`--key-file <path>`, or
`4mica config set key-file <path>`; `-` reads stdin), from a `.env` file in
the current directory, or from an exported `FOURMICA_WALLET_PRIVATE_KEY`. No
flag takes the key itself.

`deposit`, the `withdrawals` actions and the `cycles` actions show what they
will sign (token and its address, base units, gas, contract) and ask first;
`--yes` skips the question and `--dry-run` (`-n`) checks that the command
would work and sends nothing. With no network named, the CLI uses the
`base-sepolia` testnet; mainnet has to be asked for, and on mainnet, or a
core given by URL that is not on this machine, the confirmation wants the
network's name typed. `fetch` pays without asking, within `--max`; where
funds may be real it needs `--max` or `--yes`.

Once a transaction or payment has left, a failure or Ctrl-C is reported as
`OUTCOME_UNKNOWN`, with the transaction hash and where to check, and never
as "try again".

Every command takes `--json`, `--quiet`, `--no-input` and `--debug`, writes
its result to stdout and everything else to stderr, and reports every error
with a code; under `--json` each failure is one JSON document on stdout.
Requests time out after 30 seconds without an answer, or without more of one
(`--request-timeout`), and go through `HTTPS_PROXY`/`HTTP_PROXY`. Exit codes
are 1 for a failed operation, 2 for a usage error, 3 for a configuration
error and 130 for a cancel. `4mica autocomplete` sets up shell completion.

Scaffolded projects go live by configuration instead of a code edit: a seller
when its `.env` sets `PAY_TO`, a buyer when it sets
`FOURMICA_WALLET_PRIVATE_KEY`. They now load `.env` themselves; before, the
file the READMEs told you to create was never read. Buyer templates pay
through `@4mica/sdk`.

**Changed**

- Scaffolding is `4mica init`. `4mica` with no command still starts it in a
  terminal, and init's flags with no command (`4mica --yes`) still scaffold,
  each with a notice that 0.5.0 prints help instead; without a terminal a
  bare `4mica` prints help now. A directory with no command
  (`4mica my-app --no-install`) no longer scaffolds: an unknown word is an
  unknown command, exit 2. Use `npx @4mica/cli init my-app`.
- `init` takes `--template <id>` in place of `--type`, `--role` and
  `--framework`. The three old flags still work and print a deprecation
  warning.
- `init` ends with a checklist of what a real payment still needs, in place
  of the "next steps" note; with `--json` it is `nextSteps`.
- `init` no longer starts the project unless asked: it asks in a terminal, and
  elsewhere starts it only with `--run`. Previously `--yes` turned starting
  off without saying so.
- `init` without a terminal no longer reaches a prompt. It needs `--template`
  (or `--yes`) and fails with exit code 2 otherwise.
- Cancelling `init` at a prompt exits 130, not 0. Answering no to "from
  scratch?" still exits 0.
- The package manager's install no longer sees an exported
  `FOURMICA_WALLET_PRIVATE_KEY`, and a failed install says how to finish.
- `dashboard` opens the hosted dashboard at app.4mica.io. `dashboard --local`
  starts the dev server from a checkout of the monorepo, which is what
  `dashboard` did before; outside the monorepo it printed a notice and exited
  0.
