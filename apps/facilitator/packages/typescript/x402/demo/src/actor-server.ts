import 'dotenv/config'
import { encodePaymentResponseHeader } from '@x402/core/http'
import type { SettleResponse } from '@x402/core/types'
import express from 'express'
import { receipt } from './apify/billing.js'
import { fakeDataset, simulateRun } from './apify/dataset.js'
import {
  APIFY_PAYMENT_REQUIRED_BODY,
  payerOf,
  paymentRequiredHeader,
  REFUND_HEADER,
  readPaymentPayload,
  refundHeader,
  settledFor,
} from './apify/payments.js'
import { DemoSeller, refundAfterRun, sellerEnv } from './apify/seller.js'

/**
 * An HTTP mock of Apify's run endpoint, `POST /v2/acts/<actor>/run-sync-get-dataset-items`,
 * answering unpaid calls with Apify's 402 (body and `payment-required` header) and paid
 * ones with the dataset, a `payment-response` header carrying what the run cost, and a
 * `payment-refund` header for the guarantee that paid the rest of the cap back. Same
 * seller logic as the MCP server; this one is for `curl` and a decoded 402 on screen.
 */
const PORT = Number(process.env.ACTOR_PORT || 3002)
const env = sellerEnv()

async function main() {
  const seller = await DemoSeller.create(env)
  const baseUrl = process.env.ACTOR_URL || `http://localhost:${PORT}`

  const app = express()
  app.use(express.json())

  app.post('/v2/acts/:actorId/run-sync-get-dataset-items', async (req, res) => {
    const actorId = String(req.params.actorId)
    const resource = {
      url: `${baseUrl}${req.path}`,
      description: `Run the ${actorId} Actor and return its dataset`,
      mimeType: 'application/json',
    }

    let payload: ReturnType<typeof readPaymentPayload>
    try {
      payload = readPaymentPayload({ header: req.headers['payment-signature'] })
    } catch (error) {
      res.status(400).json({
        error: { type: 'x402-payment-invalid', message: (error as Error).message },
      })
      return
    }

    if (!payload) {
      console.log(`402 ${req.path}: no payment, challenging with ${seller.accepts.length} accepts`)
      res.status(402)
      res.setHeader('payment-required', paymentRequiredHeader(seller.paymentRequired(resource)))
      res.json(APIFY_PAYMENT_REQUIRED_BODY)
      return
    }

    const outcome = await seller.verify(payload)
    if (outcome.status === 'invalid') {
      console.log(`402 ${req.path}: payment rejected: ${outcome.reason}`)
      res.status(402)
      res.setHeader('payment-required', paymentRequiredHeader(seller.paymentRequired(resource)))
      res.json({ error: { type: 'x402-payment-invalid', message: outcome.reason } })
      return
    }
    const buyer = payerOf(payload) ?? outcome.payer
    console.log(
      `verify ok: ${outcome.requirements.scheme} from ${buyer ?? 'unknown payer'} for a ${outcome.requirements.amount} cap on ${outcome.requirements.network}`
    )

    const query = typeof req.body?.query === 'string' ? req.body.query : actorId
    console.log(`running ${actorId} for "${query}" (${env.runSeconds}s)...`)
    await simulateRun(env.runSeconds)
    const items = fakeDataset(query)

    let settlement: SettleResponse
    try {
      settlement = await seller.settle(payload, outcome.requirements)
    } catch (error) {
      console.log(`402 ${req.path}: settlement failed: ${(error as Error).message}`)
      res.status(402).json({
        error: { type: 'x402-settlement-failed', message: (error as Error).message },
      })
      return
    }
    console.log(`settle ok: cap guarantee issued, payer ${buyer ?? 'unknown'}`)

    const billing = seller.meter(items.length)
    const refund = await refundAfterRun(seller, buyer, billing, resource)
    const parties = { buyer, seller: seller.address }
    console.log(receipt(billing, refund, seller.token, parties))

    res.setHeader('payment-response', encodePaymentResponseHeader(settledFor(settlement, billing)))
    if (refund) res.setHeader(REFUND_HEADER, refundHeader(refund))
    res.json(items)
  })

  app.get('/', (_req, res) => {
    res.json({
      message: 'Apify-shaped x402 demo: run endpoint',
      network: env.network,
      core: env.coreUrl ?? 'hosted',
      facilitator: env.facilitatorUrl ?? 'https://x402.4mica.xyz',
      seller: seller.address,
      cap: env.price,
      resultPrice: env.resultPrice,
      accepts: seller.accepts.map((entry) => entry.scheme),
      endpoint: `POST ${baseUrl}/v2/acts/demo~scraper/run-sync-get-dataset-items`,
    })
  })

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.listen(PORT, () => {
    console.log(`Actor run endpoint on ${baseUrl}, seller ${seller.address}`)
    console.log(`POST ${baseUrl}/v2/acts/demo~scraper/run-sync-get-dataset-items`)
    console.log(
      `Payment required: a ${env.price} cap per run, ${env.resultPrice} per result, on ${env.network}; accepts ${seller.accepts.map((entry) => entry.scheme).join(', ')}`
    )
  })
}

main().catch((error) => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
