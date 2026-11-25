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

Installed globally (`npm i -g @4mica/cli`) the command is `4mica`. It needs
Node 22 or later. It is distributed through npm only, for the people who
already have Node; there is no standalone binary.

To remove it: `npm uninstall -g @4mica/cli`. That leaves the settings and the
wallet keys in `~/.config/4mica` (`%LOCALAPPDATA%\4mica` on Windows). Those
keys are the only copies: withdraw what they hold, or back them up, before
deleting that directory.

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
  config        show the settings in effect and where each comes from
  autocomplete  set up tab completion for bash, zsh or PowerShell
  version       show the cli's version, and the Node and platform it runs on
```

`4mica help <command>` or `4mica <command> --help` shows a command's examples
and flags.

`4mica autocomplete` prints the steps to turn on tab completion of commands,
flags and their values in your shell.

`4mica` with no command still starts `4mica init` in a terminal, and init's
flags with no command (`4mica --yes`) still scaffold anywhere, each with a
notice: from 0.5.0 both print help instead. A word that is not a command is
an unknown command (exit 2): `4mica my-app` no longer scaffolds into
`my-app`; write `4mica init my-app`.

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

A file in that directory that does not hold a key is listed as `unusable`
next to the wallets that work. `wallets use` refuses it; `wallets remove`
deletes it.

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
  Typed at a terminal instead of piped, it is masked as you type.
- **A `.env` file in the current directory**, setting
  `FOURMICA_WALLET_PRIVATE_KEY`. It is read automatically, so inside a
  scaffolded project `4mica balance` works as it is; the `4MICA_` spelling
  projects made before 0.3 use is read too. `--dotenv <path>` reads another
  file instead. (Not `--env-file`: Node takes that name for itself.)
- **An exported `FOURMICA_WALLET_PRIVATE_KEY`.** This one is for CI and
  containers, which hand secrets over as variables. It is a deliberate
  departure from the usual advice: an exported key is visible to every
  program the shell starts, and to anything that reads a process's
  environment. The cli keeps it out of the package manager's install
  scripts, which `init` runs, but a project started with `4mica dev` sees it,
  as it would without the cli. In an interactive shell prefer a key file.

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

The amount is in whole units. Before sending, `deposit` shows what the dry
run below shows (network, wallet, token and its address, base units, how gas
is paid, the contract it calls) and asks; `--yes` skips the question. It does
not ask at all when that check found a problem: it stops with `NOT_READY` and
names it. Without a terminal and without `--yes` it exits instead of
waiting.

Once the transaction is out its hash is printed, before the wait for it to be
mined. A failure or Ctrl-C after that point says the transaction may still
land (`OUTCOME_UNKNOWN`), never "try again".

After the transaction is mined, `deposit` waits up to `--timeout` seconds
(default 60) for core to count it. If that wait runs out, the deposit is
reported as `pending` and the command exits 0. The money has moved and will
become spendable; do not send it again.

### Trying it first

`--dry-run` (`-n`) on `deposit`, the three `withdrawals` actions and `cycles
pay` and `cycles claim` checks what the real command would and sends nothing:

```
$ 4mica deposit 5 --asset USDC --dry-run
would: deposit 5 USDC
network: base-sepolia
wallet: 0xaC6C…2930
token: USDC (0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f)
base units: 5000000
wallet holds: 0 USDC
gas: sponsored, if the facilitator accepts the request
contract: 0x…
ready: no
problem: the wallet holds 0 USDC; this needs 5
```

With `--json` the same facts are under `details`, with camelCase keys
(`baseUnits`, `walletHolds`).

It exits 1 when something blocks the command, so a script can branch on it.

On mainnet the confirmation asks for the network's name, not `y`. So does a
core given by URL that is not on this machine, which asks for its host:
nothing about a URL shows that it is not a mainnet.

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
stdout and what was paid to stderr. A url that charges nothing needs no
wallet and no core: the cli signs in only once a url asks to be paid. It
exits 1 when the final answer is an HTTP error.

It does not ask before paying: `--max` is the consent. On a testnet it
defaults to 1 USDC a payment. Anywhere that may be real funds (a mainnet, or
a core given by URL that is not on this machine) it stops with `MAX_REQUIRED`
before sending anything, unless `--max` names a limit or `--yes` accepts the
1 USDC default. `--pay-to <address>` limits who may be paid; an entry that
is not an address is refused.

With `--json` the response is in `body` and the payment in `payment`, with
`settled: true`. A payment that was sent for an answer that then failed is
reported too, with `settled: false`: the seller holds it and may redeem it,
so it is not something to pay again. If the answer itself is lost after a
payment was sent, the error is `OUTCOME_UNKNOWN`.

A response that is not text, such as an image, is in `body` as base64 and
`"bodyEncoding": "base64"` says so; `-o <file>` writes the bytes as they came,
and `-o -` writes them to stdout. The `-o` path is checked before anything is
sent, so a paid answer is never lost to a typo. The body is passed on as it
arrives, so a large download takes no more memory than a small one; only
`--json` without `-o` holds it whole, since the body is a field of the
document.

`fetch --dry-run` pays nothing, but it is not a dry run of the request: the
request is sent once, unpaid, with its method, headers and `--data`, because
that is how a url says what it charges. A url that charges nothing carries
the request out, and its answer is printed as it would be without
`--dry-run`. For anything but a GET it warns before sending.

### Cycles

Payments are netted per asset and per cycle. When a cycle closes, whoever
owes pays once and whoever is owed collects once.

```bash
4mica cycles                                   # the open cycle for each asset
4mica cycles checkpoint --asset USDC --dry-run # what it would sign
4mica cycles checkpoint --asset USDC
4mica cycles pay 0x8335…2913:1767225600 --dry-run   # what this wallet owes
4mica cycles pay 0x8335…2913:1767225600
4mica cycles claim 0x8335…2913:1767225600
```

A cycle is named as `4mica cycles` prints it: the asset's address and the
cycle's start, `0x…:1767225600`.

`cycles checkpoint` signs a confirmation of the payments made so far; core
asks for one (`CHECKPOINT_REQUIRED`) after enough payments. It moves no
money, but it is a signed statement of what the wallet has paid, so it is
shown and confirmed like a payment: `--yes` skips the question, `--dry-run`
shows it and signs nothing.

## Selling

```bash
4mica payments                           # payments guaranteed to this wallet
4mica payments --state finalized --limit 20
4mica guarantees verify receipt.json     # was this receipt signed by 4mica?
```

`guarantees verify` needs no wallet. It exits 1 when the receipt is not
genuine.

## Settings

Each setting is taken from the first of these that has it:

1. a flag: `--network`, `--rpc-url`, `--asset`
2. an environment variable: `FOURMICA_NETWORK`, `FOURMICA_RPC_URL`,
   `FOURMICA_ASSET`, … (see [Environment variables](#environment-variables))
3. `.env` in the current directory, or the file given by `--dotenv`
4. the config file, `~/.config/4mica/config.json`
   (`%LOCALAPPDATA%\4mica\config.json` on Windows)
5. the built-in default: the `base-sepolia` testnet

`4mica config` prints the result and where each value came from. `4mica
status` adds whether the wallet in use is funded and has collateral, and
checks this machine: the Node version, a key file others can read, a `.env`
that changes where the wallet signs in.

`--rpc-url` (also `--core-url`) is the address of a 4mica core, not an
Ethereum RPC endpoint. It has to be `https`, or plain `http` to this machine
(`localhost`, `127.0.0.1`): the wallet signs in and sends payments over it.
The facilitator URL is held to the same rule wherever it is set, since the
wallet sends it signed authorizations.

The cli never reaches mainnet by default. Real funds move only after
`--network base` or `4mica config set network base`, and the confirmation
before sending then says `base (mainnet, real funds)`.

A `.env` in the current directory can name a mainnet too, but only for the
wallet key that same file holds. With a key from the config file or the
shell, the command stops with `MAINNET_NOT_CHOSEN` until you name the network
with `--network` or the file with `--dotenv`, so that running a command
inside someone else's project cannot move your wallet onto real funds.

The same holds when that `.env` gives a core by `FOURMICA_RPC_URL`. A hosted
network's own URL counts as its name, here and in the confirmation. Any other
URL stops with `CORE_NOT_CHOSEN` unless it is a hosted testnet's or on this
machine (`localhost`), since nothing else shows that it is not a mainnet.

Nor can that `.env` change where a mainnet you chose yourself leads. If it
sets `FOURMICA_CONTRACT_ADDRESS`, `FOURMICA_ETHEREUM_HTTP_RPC_URL`,
`FOURMICA_FACILITATOR_URL`, `FOURMICA_AUTH_URL` or `FOURMICA_BEARER_TOKEN`
for a wallet key it does not hold, the command stops with
`ENDPOINT_NOT_CHOSEN` until you name the file with `--dotenv`. On a testnet
or a core on this machine they apply as before.

```bash
4mica config set network base
4mica config set asset USDC     # then `4mica deposit 5` needs no --asset
4mica config unset asset
4mica config reset              # every setting back to its default
```

The config file holds `network`, `rpc-url`, `facilitator-url`, `asset` and
`key-file`. It is readable by you only, and is replaced in one step, so an
interrupted write never leaves half a file. Settings it does not know, from a
newer version of the cli, are kept. `config reset` empties it and keeps the
wallet keys.

A request is given up on when it waits 30 seconds for an answer, or for more
of one; `--request-timeout <seconds>` (or `FOURMICA_REQUEST_TIMEOUT`) changes
that. A download that keeps arriving is never cut off. `deposit` waits up to
60 seconds more for its transaction to be mined, then `--timeout` for core
to count it.

Requests go through the proxy that `HTTPS_PROXY` or `HTTP_PROXY` names,
except to the hosts `NO_PROXY` lists.

## Scripting

- **stdout has the result and nothing else.** Progress, confirmations,
  warnings and errors go to stderr. `--quiet` drops the progress.
- **`--no-input`** makes sure no question is asked: a command that would need
  one fails and names the flag to pass. Without a terminal this is already
  the case: questions are written to stderr and answered on stdin, and both
  have to be one.
- **`--json`** prints the result as one JSON document. Field names are
  camelCase, also where the terminal shows another name: `config` prints
  `rpc-url` and its JSON has `settings.rpcUrl`. An amount is a number in a
  string with its unit beside it, never inside it: `"amount": "2.5"`,
  `"asset": "USDC"`, and `"amountRaw": "2500000"` for the base units.
  `balance` is always a list. Tests pin every command's fields, so a rename
  cannot slip out unnoticed.
- **The commands themselves are data too.** The published package has an
  `oclif.manifest.json` beside its `package.json`: every command with its
  arguments, flags, allowed values and help text, for a script or an agent
  that would otherwise read `--help`.
- **Errors** carry a code, always. With `--json` every failure, a typo in the
  command included, is one document on stdout:
  `{ "error": { "code", "message", "suggestions"?, "retryable"?, "details"? } }`.
  `retryable` is true when the same command may simply be run again (a read
  that timed out) and false when it must not be (`OUTCOME_UNKNOWN`).
  `details` carries what a refusal names, such as the cycle of a
  `CHECKPOINT_REQUIRED`.
- **`--debug`** (or `DEBUG=4mica`) prints each request (method, host and
  path, status, time) and the stack of a failure to stderr. No header, body,
  query string or key is ever printed.
- **`--no-color`**, `NO_COLOR=1` or `FORCE_COLOR=0` turns color off. Each of
  stdout and stderr is also plain whenever it is not a terminal, unless
  `--color` or `FORCE_COLOR=1` asks for it.
- **Flags can go before or after the command:** `4mica --json balance` and
  `4mica balance --json` are the same.

| Exit code | Meaning |
| --- | --- |
| 0 | done, including a deposit that is mined but still `pending` |
| 1 | the operation failed: no response (`UNREACHABLE`, `TIMEOUT`), a refusal by core, a reverted transaction, a dry run that found a problem. `OUTCOME_UNKNOWN` means something may already have been sent: check before running it again |
| 2 | usage: an unknown command or flag, a bad value, or a confirmation that could not be asked for and no `--yes` |
| 3 | configuration: no wallet key, an unknown network in the environment or config file |
| 130 | cancelled: Ctrl-C, or a question answered no. If anything had been sent, stderr says what and how to check |

One exit code is not the cli's. `--env-file` was this flag's name before 0.3,
and Node reads that name itself, before the cli starts: with a file that does
not exist, Node prints `node: <path>: not found` and exits 9. The flag is
`--dotenv`.

```bash
if ! 4mica status --network base >/dev/null; then echo "4mica is down"; fi
available=$(4mica balance USDC --json | jq -r '.[0].available')
```

### Running unattended

For an agent or a CI job: the key from a secret manager, no questions, JSON
both ways, and a branch on the error code rather than on the text.

```bash
out=$(op read op://vault/agent/key |
  4mica deposit 5 --asset USDC --key-file - --yes --no-input --json)
case $? in
  0) echo "$out" | jq -r .txHash ;;
  *)
    case $(echo "$out" | jq -r .error.code) in
      OUTCOME_UNKNOWN) echo "may have been sent: check 4mica balance" ;;
      CHECKPOINT_REQUIRED) 4mica cycles checkpoint --asset USDC --yes ;;
      TIMEOUT | UNREACHABLE) echo "nothing was sent; safe to retry" ;;
      *) echo "$out" | jq -r .error.message ;;
    esac
    ;;
esac
```

The codes most worth handling:

| Code | Meaning |
| --- | --- |
| `OUTCOME_UNKNOWN` | something was sent and no answer came back: do not repeat it until `balance`, `withdrawals` or `cycles` shows what happened |
| `TIMEOUT`, `UNREACHABLE` | a request got no answer before anything was sent; `retryable: true` |
| `CONFIRMATION_REQUIRED` | it would have asked; pass `--yes` |
| `MAX_REQUIRED` | `fetch` where funds may be real; pass `--max` |
| `NOT_READY` | the checks before sending found a problem; nothing was asked or sent |
| `CHECKPOINT_REQUIRED` | core wants a checkpoint first: `4mica cycles checkpoint` |
| `INSUFFICIENT_BALANCE`, `GAS_REQUIRED` | the wallet needs funding |
| `NO_SIGNER` | no wallet key was found |
| `CANCELLED` | Ctrl-C or a no; exit 130 |
| `UNEXPECTED` | a bug: the message has a link to report it |

### Compatibility

Command names, flags, environment variable names, config keys, exit codes,
error codes and the fields of `--json` output are the cli's interface. Within
a minor release they only grow: new fields and codes may appear, and scripts
should ignore what they do not know. A rename or removal is announced with a
warning at least one minor release before it happens, and the warning names
that release. The human-readable output is not part of it; read `--json`.

Deprecated now, and removed in 0.5.0: scaffolding with no command (`4mica`
in a terminal, `4mica --yes`), and `init --type`, `--role` and `--framework`
(use `--template`).

## Environment variables

| Variable | What it does |
| --- | --- |
| `FOURMICA_NETWORK` | network to use, like `--network` |
| `FOURMICA_RPC_URL` | core URL, like `--rpc-url` |
| `FOURMICA_FACILITATOR_URL` | facilitator URL; `https`, or `http` to this machine |
| `FOURMICA_ASSET` | default asset, like `--asset` |
| `FOURMICA_WALLET_PRIVATE_KEY` | the wallet key (see [A key you already have](#a-key-you-already-have)) |
| `FOURMICA_REQUEST_TIMEOUT` | seconds, like `--request-timeout` |
| `FOURMICA_DEBUG=1`, `DEBUG=4mica` | like `--debug` |
| `FOURMICA_CONTRACT_ADDRESS`, `FOURMICA_ETHEREUM_HTTP_RPC_URL`, `FOURMICA_AUTH_URL`, `FOURMICA_BEARER_TOKEN` | passed to `@4mica/sdk`; see its README |
| `NO_COLOR`, `FOURMICA_NO_COLOR` | color off |
| `FORCE_COLOR` | color on when piped; `0` turns it off |
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | proxy for requests, and the hosts that skip it |
| `XDG_CONFIG_HOME` | where `4mica/config.json` and `4mica/wallets/` live |

All of the cli's own variables start with `FOURMICA_`: a shell cannot export
a name that starts with a digit, which is why it is not `4MICA_`.

## Limits

- Wallet keys are plain files, readable by your user only (mode 0600 in a
  0700 directory). They are not encrypted: anything running as you, or a
  backup of your home directory, can read them. There is no keychain,
  passphrase or hardware wallet support yet. On Windows the files rely on
  your profile's permissions.
- One pending withdrawal per asset.
- `payments` cannot name the asset of each payment: core's list does not
  say.
- `fetch --dry-run` sends the request (see [Paying](#paying)).
- Supported on macOS, Linux and Windows, on Node 22 and later.
- There are no man pages: `4mica help <command>` and the
  [docs](https://docs.4mica.io/sdks/cli) are the documentation.
- The cli sends no telemetry, checks for no updates, and starts no
  background process.
