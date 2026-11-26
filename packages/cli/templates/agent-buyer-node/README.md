# __PROJECT_NAME__

__DESCRIPTION__

Generated with `4mica init` — part of the [4Mica](https://4mica.io) x402 payment network.

## Run (demo mode — no config)

```bash
npm install
npm run start
```

Demo mode uses a stand-in facilitator and a locally-built payment header, so it
runs with **zero credentials**.

## Go live

Create a `.env` file here with the key of the wallet that pays:

```bash
FOURMICA_WALLET_PRIVATE_KEY=0x...
```

With the key set, payments are signed for real through `@4mica/sdk`: its
`fetch` answers a `402` by paying, within 1 USDC a payment, and repeats the
request. No code changes. The wallet needs collateral first:

```bash
4mica wallets create
4mica deposit 10 --asset USDC
```

Set `ANTHROPIC_API_KEY` in the same file to power the agent with Claude.

## Manage agents & transactions

```bash
4mica dashboard
```
