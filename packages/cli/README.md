# @4mica/cli

The command-line tool for the [4Mica](https://4mica.io) x402 payment network.
Scaffold a paid API or an agent, and manage a wallet's collateral: check the
balance, deposit, and withdraw.

```bash
npx @4mica/cli init                  # scaffold a project
npx @4mica/cli deposit 5 --asset USDC
```

Installed globally (`npm i -g @4mica/cli`) the command is `4mica`.

## Commands

```
PROJECT
  init         scaffold a new agent or payment app
  dev          run the current project's dev server
  dashboard    open the 4mica dashboard

WALLET
  whoami       show the wallet and network the cli will use
  balance      show collateral: total, locked and available
  deposit      deposit collateral
  withdraw     request a withdrawal of available collateral
  withdrawals  list pending withdrawals and when each can be finalized

NETWORK
  networks     list supported networks
  tokens       list tokens accepted as collateral
  status       check core and facilitator health

SETTINGS
  config       show the settings in effect and where each comes from
```

`4mica <command> --help` lists a command's flags with examples.

## Scaffolding

```bash
4mica init
```

`init` asks for whatever is not given as a flag. Every question has a flag,
so it also runs unattended:

```bash
4mica init my-api \
  --template seller-express \  # see the table below
  --pm pnpm \                  # pnpm | npm | yarn | bun
  --no-install \               # skip installing dependencies
  --run                        # start it once scaffolded
```

Without a terminal (CI, a pipe) `init` never asks. `--template` is then
required, and the other answers take their defaults; `--yes` does the same in
a terminal and scaffolds `agent-seller-express` when no template is named.

| `--template` | What you get |
| --- | --- |
| `agent-seller-express` | a trading agent that sells, on Express |
| `agent-buyer-node` | a trading agent that buys, on Node |
| `seller-express` | a paid API using `@4mica/x402`'s Express middleware |
| `buyer-express` | a client that pays the Express seller |

Every template runs in **demo mode** and needs no credentials: sellers use a
stand-in facilitator and buyers send a hand-built payment. To go live, a
seller passes `new FourMicaFacilitatorClient()` from `@4mica/x402/server`, and
a buyer fills in its wallet key and pays through `@x402/fetch` with the
`FourMicaEvmScheme` from `@4mica/x402/client`.

## Wallet

The wallet commands need a private key. It is read from
`FOURMICA_WALLET_PRIVATE_KEY`, either exported or in a file passed with
`--env-file`:

```bash
4mica whoami --env-file .env
4mica balance --env-file .env
4mica deposit 5 --asset USDC --env-file .env
```

There is no flag that takes the key itself, because flag values end up in
shell history and in the process list. The key is never printed or stored.

A scaffolded project's `.env` works as it is: the `4MICA_` spelling its
variables use is read as well.

### Depositing

```bash
4mica deposit 5 --asset USDC
4mica deposit "0.01 ETH" --network base-sepolia
```

The amount is in whole units. `deposit` shows the network, the wallet and the
amount, and asks before sending; `--yes` skips the question. Without a
terminal and without `--yes` it exits instead of waiting.

After the transaction is mined, `deposit` waits up to `--timeout` seconds
(default 60) for core to count it. If that wait runs out, the deposit is
reported as `pending` and the command exits 0. The money has moved and will
become spendable; do not send it again.

### Withdrawing

A withdrawal takes two steps, with a grace period between them:

```bash
4mica withdraw 5 --asset USDC          # same as: withdrawals request
4mica withdrawals                      # shows when it can be finalized
4mica withdrawals finalize --asset USDC
4mica withdrawals cancel --asset USDC  # instead of finalizing
```

## Settings

Each setting is taken from the first of these that has it:

1. a flag: `--network`, `--rpc-url`, `--asset`
2. an environment variable: `FOURMICA_NETWORK`, `FOURMICA_RPC_URL`, …
3. the file given by `--env-file`
4. the config file, `~/.config/4mica/config.json`
   (`%LOCALAPPDATA%\4mica\config.json` on Windows)
5. the built-in default

`4mica config` prints the result and where each value came from.

```bash
4mica config set network base
4mica config set asset USDC     # then `4mica deposit 5` needs no --asset
4mica config unset asset
```

The config file holds `network`, `rpc-url`, `facilitator-url` and `asset`.

## Scripting

- **stdout has the result and nothing else.** Progress, confirmations,
  warnings and errors go to stderr.
- **`--json`** prints the result as one JSON document. For wallet commands
  the fields are the ones `@4mica/sdk` returns; amounts in base units are
  strings.
- **Errors** carry a code. With `--json` they are printed as
  `{ "error": { "code", "message", "suggestions" } }`.
- **`--no-color`** or `NO_COLOR=1` turns color off; it is off anyway when
  the output is not a terminal.

| Exit code | Meaning |
| --- | --- |
| 0 | done, including a deposit that is mined but still `pending` |
| 1 | the operation failed: a network error, a refusal by core, a reverted transaction |
| 2 | usage: an unknown command or flag, a bad value, or a confirmation needed with no terminal and no `--yes` |
| 3 | configuration: no wallet key, an unknown network in the environment or config file |

```bash
if ! 4mica status --network base >/dev/null; then echo "4mica is down"; fi
available=$(4mica balance USDC --json | jq -r .available)
```
