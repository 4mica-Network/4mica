# __PROJECT_NAME__

__DESCRIPTION__

Generated with `4mica init` — part of the [4Mica](https://4mica.io) x402 payment network.

## Run (demo mode — no config)

```bash
npm install
npm run start
```

Demo mode uses a mock verifier and a locally-built payment header, so it runs
with **zero credentials**.

## Go live

Copy `.env.example` → `.env`, fill in your `4MICA_*` credentials, and swap the
mock verifier for `createClient()` from `@4mica/sdk-node`. Set `ANTHROPIC_API_KEY` to power the agent with Claude.

## Manage agents & transactions

```bash
4mica dashboard
```
