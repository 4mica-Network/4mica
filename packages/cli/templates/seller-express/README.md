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

Swap the stand-in facilitator for `new FourMicaFacilitatorClient()` from
`@4mica/x402/server` and set `PAY_TO` to your wallet. The seller needs no key:
the facilitator verifies each payment and gets the guarantee from 4mica core.

## Manage agents & transactions

```bash
4mica dashboard
```
