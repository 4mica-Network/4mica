# @4mica/cli

The command-line tool for the [4Mica](https://4mica.io) x402 payment network.
Scaffold a paid API or an agent, manage a wallet's collateral, pay for a
402-protected URL, and settle a clearing cycle.

```bash
npx @4mica/cli init                  # scaffold a project
npx @4mica/cli wallets create        # a wallet for it
npx @4mica/cli deposit 5 --asset USDC
npx @4mica/cli fetch https://api.example.com/report
```

Installed globally (`npm i -g @4mica/cli`) the command is `4mica`.

## Commands

```
PROJECT
  init         scaffold a new agent or payment app
  dev          run the current project's dev server
  dashboard    open the 4mica dashboard

WALLET
  wallets      list the wallets this cli has created
  whoami       show the wallet and network the cli will use
  balance      show collateral: total, locked and available
  deposit      deposit collateral
  withdraw     request a withdrawal of available collateral
  withdrawals  list pending withdrawals and when each can be finalized

PAY
  fetch        request a url, paying it if it asks for payment
  cycles       show the open settlement cycle for each asset

SELL
  payments     list payments guaranteed to this wallet
  guarantees   check guarantee receipts

NETWORK
  networks     list supported networks
  tokens       list tokens accepted as collateral
  status       check core and facilitator health

SETTINGS
  config       show the settings in effect and where each comes from
```

`4mica help <command>` or `4mica <command> --help` shows a command's examples
and flags.

`4mica` with no command still starts `4mica init` in a terminal, with a notice:
a later release will print help there instead. The old forms with flags or a
directory, `4mica --yes` and `4mica my-app`, still scaffold too, with the same
notice.

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

`init` only creates files. It makes no wallet and sends nothing, and ends
with a checklist of what a real payment still needs:

```
✔ project created                    my-buyer
✔ dependencies installed
○ run it in demo mode                cd my-buyer && pnpm run start
○ wallet to pay from                 4mica wallets create
○ fund the wallet                    test USDC: https://docs.4mica.io/getting-started/quickstart
○ deposit collateral                 4mica deposit 10 --asset USDC
○ take the project live              set FOURMICA_WALLET_PRIVATE_KEY in my-buyer/.env
```

A project that sells needs only a wallet to be paid at. With `--json` the same
list is in `nextSteps`.

Every template runs in **demo mode** and needs no credentials: sellers use a
stand-in facilitator and buyers send a hand-built payment. Going live is
configuration, not a code change:

- **A project that sells** goes live when its `.env` sets `PAY_TO`, the wallet
  to be paid at. Payments are then checked by the 4mica facilitator.
- **A project that buys** goes live when its `.env` sets
  `FOURMICA_WALLET_PRIVATE_KEY`. Payments are then signed through
  `@4mica/sdk`, against the collateral that wallet has deposited.

## Wallet

### A new wallet

```bash
4mica wallets create            # named "default"; the cli now uses it
4mica wallets create buyer-1    # another; --use switches to it
4mica wallets                   # name, address, which one is in use
4mica wallets use buyer-1
4mica wallets import seller --key-file ./seller.key   # a key you already have
4mica wallets remove buyer-1    # asks for the name again; there is no undo
```

A wallet is a new private key in a file only you can read, under the cli's
config directory. The key is never printed, and an existing wallet is never
overwritten. Creating one sends nothing: it exists on a network once it is
funded, and `wallets create` ends by saying how.

### A key you already have

Give it in one of three ways:

- **A key file.** A file holding nothing but the key. This is the safest of
  the three: the key is not handed to every program the shell starts.
  ```bash
  4mica whoami --key-file ~/.4mica/key
  4mica config set key-file ~/.4mica/key   # then no flag is needed
  ```
  `--key-file -` reads the key from stdin, for a secret manager:
  `op read op://vault/4mica/key | 4mica balance --key-file -`.
- **A `.env` file in the current directory**, setting
  `FOURMICA_WALLET_PRIVATE_KEY`. It is read automatically, so inside a
  scaffolded project `4mica balance` works as it is; the `4MICA_` spelling
  those projects use is read too. `--env-file <path>` reads another file
  instead.
- **An exported `FOURMICA_WALLET_PRIVATE_KEY`.**

When more than one is present, `--key-file` wins, then the exported variable,
then the `.env` file, then the key file named in the config file. `4mica
whoami` prints the address and where the key came from.

There is no flag that takes the key itself, because flag values end up in
shell history and in the process list. The key is never printed, and only a
key file's path is ever stored.

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

### Trying it first

`--dry-run` (`-n`) on `deposit` and the three `withdrawals` actions checks
what the real command would and sends nothing:

```
$ 4mica deposit 5 --asset USDC --dry-run
would: deposit 5 USDC
network: base-sepolia
wallet: 0xaC6C…2930
token: 0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f
base units: 5000000
wallet holds: 0 USDC
gas: sponsored, if the facilitator accepts the request
ready: no
problem: the wallet holds 0 USDC; this needs 5
```

It exits 1 when something blocks the command, so a script can branch on it.

On mainnet the confirmation asks for the network's name, not `y`.

### Withdrawing

A withdrawal takes two steps, with a grace period between them:

```bash
4mica withdraw 5 --asset USDC          # same as: withdrawals request
4mica withdrawals                      # shows when it can be finalized
4mica withdrawals finalize --asset USDC
4mica withdrawals cancel --asset USDC  # instead of finalizing
```

## Paying

```bash
4mica fetch https://api.example.com/report --dry-run   # what does it charge?
4mica fetch https://api.example.com/report --max "0.50 USDC"
4mica fetch https://api.example.com/run -d @body.json -H "content-type: application/json" -o out.json
```

`fetch` makes the request and, if the answer is a 402 asking for 4mica
credit, signs a payment and repeats it once. The response body goes to
stdout and what was paid to stderr. It does not ask before paying: `--max` is
the consent, and defaults to 1 USDC a payment. `--pay-to <address>` limits
who may be paid. It exits 1 when the final answer is an HTTP error.

### Cycles

Payments are netted per asset and per cycle. When a cycle closes, whoever
owes pays once and whoever is owed collects once.

```bash
4mica cycles                        # the open cycle for each asset
4mica cycles checkpoint --asset USDC
4mica cycles pay <cycle> --dry-run  # what this wallet owes, without paying
4mica cycles pay <cycle>
4mica cycles claim <cycle>
```

`cycles checkpoint` signs a confirmation of the payments made so far; core
asks for one (`CHECKPOINT_REQUIRED`) after enough payments. It moves no
money.

## Selling

```bash
4mica payments                           # payments guaranteed to this wallet
4mica guarantees verify receipt.json     # was this receipt signed by 4mica?
```

`guarantees verify` needs no wallet. It exits 1 when the receipt is not
genuine.

## Settings

Each setting is taken from the first of these that has it:

1. a flag: `--network`, `--rpc-url`, `--asset`
2. an environment variable: `FOURMICA_NETWORK`, `FOURMICA_RPC_URL`, …
3. `.env` in the current directory, or the file given by `--env-file`
4. the config file, `~/.config/4mica/config.json`
   (`%LOCALAPPDATA%\4mica\config.json` on Windows)
5. the built-in default: the `base-sepolia` testnet

`4mica config` prints the result and where each value came from. `4mica
status` adds whether the wallet in use is funded and has collateral.

The cli never reaches mainnet by default. Real funds move only after
`--network base` or `4mica config set network base`, and the confirmation
before sending then says `base (mainnet, real funds)`.

A `.env` in the current directory can name a mainnet too, but only for the
wallet key that same file holds. With a key from the config file or the
shell, the command stops with `MAINNET_NOT_CHOSEN` until you name the network
with `--network` or the file with `--env-file`, so that running a command
inside someone else's project cannot move your wallet onto real funds.

```bash
4mica config set network base
4mica config set asset USDC     # then `4mica deposit 5` needs no --asset
4mica config unset asset
```

The config file holds `network`, `rpc-url`, `facilitator-url`, `asset` and
`key-file`.

A request that gets no response is given up on after 30 seconds;
`--request-timeout <seconds>` changes that.

## Scripting

- **stdout has the result and nothing else.** Progress, confirmations,
  warnings and errors go to stderr. `--quiet` drops the progress.
- **`--no-input`** makes sure no question is asked: a command that would need
  one fails and names the flag to pass. Without a terminal this is already
  the case.
- **`--json`** prints the result as one JSON document. For wallet commands
  the fields are the ones `@4mica/sdk` returns; amounts in base units are
  strings.
- **Errors** carry a code. With `--json` they are printed as
  `{ "error": { "code", "message", "suggestions" } }`.
- **`--no-color`** or `NO_COLOR=1` turns color off. Each of stdout and
  stderr is also plain whenever it is not a terminal.
- **Flags can go before or after the command:** `4mica --json balance` and
  `4mica balance --json` are the same.

| Exit code | Meaning |
| --- | --- |
| 0 | done, including a deposit that is mined but still `pending` |
| 1 | the operation failed: no response (`UNREACHABLE`, `TIMEOUT`), a refusal by core, a reverted transaction. `OUTCOME_UNKNOWN` means a sponsored transaction may have been sent: check `4mica balance` before running it again |
| 2 | usage: an unknown command or flag, a bad value, or a confirmation that could not be asked for and no `--yes` |
| 3 | configuration: no wallet key, an unknown network in the environment or config file |

```bash
if ! 4mica status --network base >/dev/null; then echo "4mica is down"; fi
available=$(4mica balance USDC --json | jq -r .available)
```
