# __PROJECT_NAME__

__DESCRIPTION__

Generated with `4mica init` — part of the [4Mica](https://4mica.io) x402 payment network.

## Run (demo mode — no config)

```bash
npm install
npm run start
```

Demo mode uses a stand-in facilitator and a locally-built payment header, so it
runs with **zero credentials**. Start the matching seller first, then run this to pay for the gated route.

## Go live

Copy `.env.example` → `.env`, fill in your `4MICA_*` credentials, and replace the
demo header with `@x402/fetch`'s `wrapFetchWithPaymentFromConfig` and the
`FourMicaEvmScheme` from `@4mica/x402/client`: the wrapped `fetch` pays a `402`
and retries for you.

## Manage agents & transactions

```bash
4mica dashboard
```
