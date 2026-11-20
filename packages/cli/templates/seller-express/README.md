# __PROJECT_NAME__

__DESCRIPTION__

Generated with `4mica init` — part of the [4Mica](https://4mica.io) x402 payment network.

## Run (demo mode — no config)

```bash
npm install
npm run dev
```

Demo mode uses a stand-in facilitator and a locally-built payment header, so it
runs with **zero credentials**. Start this, then run a matching buyer to exercise the 402 → 200 handshake.

## Go live

Create a `.env` file here with one line, naming the wallet you are paid at:

```bash
PAY_TO=0xYourWalletAddress
```

With `PAY_TO` set, payments are checked by the 4mica facilitator and guaranteed
by 4mica core; without it, any payment is accepted. No code changes, and the
seller needs no key. `4mica wallets create` makes a wallet and prints its
address.

## Manage agents & transactions

```bash
4mica dashboard
```
