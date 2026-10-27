import type { AddressInfo } from 'node:net'
import { Client, ConfigBuilder } from '@4mica/sdk'
import { decodePaymentResponseHeader } from '@x402/core/http'
import type { Network, SettleResponse } from '@x402/core/types'
import { wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import express from 'express'
import { privateKeyToAccount } from 'viem/accounts'

import { FourMicaEvmScheme } from '../src/client/scheme.js'
import { paymentMiddlewareFromConfig } from '../src/server/express/index.js'
import { FourMicaFacilitatorClient } from '../src/server/facilitator.js'

/** What `apps/facilitator/packages/e2e/stack.sh` wrote to `.dev/x402-e2e.env`. */
export interface Stack {
  coreUrl: string
  facilitatorUrl: string
  network: Network
  asset: string
  payTo: string
  payerKey: `0x${string}`
  maxUncheckpointed: number
}

export function readStack(): Stack {
  const vars = [
    'E2E_CORE_URL',
    'E2E_FACILITATOR_URL',
    'E2E_NETWORK',
    'E2E_ASSET',
    'E2E_PAY_TO',
    'E2E_TS_PAYER_KEY',
    'E2E_MAX_UNCHECKPOINTED',
  ] as const
  const missing = vars.filter((name) => !process.env[name])
  if (missing.length > 0) {
    throw new Error(
      `missing ${missing.join(', ')}; run the e2e tests through apps/facilitator/packages/e2e/stack.sh test`
    )
  }
  const env = process.env as Record<(typeof vars)[number], string>
  return {
    coreUrl: env.E2E_CORE_URL,
    facilitatorUrl: env.E2E_FACILITATOR_URL,
    network: env.E2E_NETWORK as Network,
    asset: env.E2E_ASSET,
    payTo: env.E2E_PAY_TO,
    payerKey: env.E2E_TS_PAYER_KEY as `0x${string}`,
    maxUncheckpointed: Number(env.E2E_MAX_UNCHECKPOINTED),
  }
}

export interface Seller {
  url: string
  close: () => Promise<void>
}

/** A paywalled `GET /paid` costing one wei of `stack.asset`, on the 4mica Express middleware. */
export async function startSeller(stack: Stack): Promise<Seller> {
  const app = express()
  app.use(
    paymentMiddlewareFromConfig(
      {
        'GET /paid': {
          accepts: {
            scheme: '4mica-credit',
            price: { amount: '1', asset: stack.asset },
            network: stack.network,
            payTo: stack.payTo,
          },
        },
      },
      new FourMicaFacilitatorClient({ url: stack.facilitatorUrl })
    )
  )
  app.get('/paid', (_req, res) => {
    res.json({ paid: true })
  })

  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/paid`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

export interface Buyer {
  /** `fetch` that pays 402s through x402 with the 4mica scheme. */
  fetch: typeof fetch
  /** A separate SDK client for the same payer, to read what core recorded. */
  client: Client
}

export async function connectBuyer(stack: Stack, key: `0x${string}`): Promise<Buyer> {
  const account = privateKeyToAccount(key)
  const scheme = await FourMicaEvmScheme.create(account, {
    coreUrls: { [stack.network]: stack.coreUrl },
    networks: [stack.network],
  })
  const client = await Client.connect(
    new ConfigBuilder().rpcUrl(stack.coreUrl).signer(account).build()
  )
  return {
    // Native ETH has no USD price for spend controls to cap.
    fetch: wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [{ network: stack.network, client: scheme }],
      spendControls: false,
    }),
    client,
  }
}

/** The settlement a paid response carries in `PAYMENT-RESPONSE`, if any. */
export function settlementOf(response: Response): SettleResponse | undefined {
  const header = response.headers.get('PAYMENT-RESPONSE')
  return header ? decodePaymentResponseHeader(header) : undefined
}

/**
 * Waits for the next settlement cycle to open, so the payments that follow are
 * the payer's only ones in it.
 */
export async function awaitNextCycle(client: Client, asset: string) {
  const cycle = await client.payment.activeCycle(asset)
  await new Promise((resolve) =>
    setTimeout(resolve, (cycle.periodEnd - cycle.serverTime + 1) * 1000)
  )
}
