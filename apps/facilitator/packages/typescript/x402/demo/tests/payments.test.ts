import type { PaymentPayload, PaymentRequirements } from '@4mica/x402'
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http'
import { describe, expect, it } from 'vitest'
import { fakeDataset } from '../src/apify/dataset.js'
import {
  APIFY_PAYMENT_REQUIRED_BODY,
  EXACT_MAX_TIMEOUT_SECONDS,
  MCP_PAYMENT_META_KEY,
  MCP_PAYMENT_RESPONSE_META_KEY,
  paidToolResult,
  paymentRequiredFor,
  paymentRequiredHeader,
  paymentRequiredToolResult,
  readPaymentPayload,
  shapeOnlyAccepts,
  toolPaymentMeta,
  UPTO_MAX_TIMEOUT_SECONDS,
} from '../src/apify/payments.js'

const PAY_TO = '0x4aAbE17C239eF71c3A26bA7C2b3e0AeBbfC1DF26'
const NETWORK = 'eip155:84532' as const

const CREDIT_ENTRY: PaymentRequirements = {
  scheme: '4mica-credit',
  network: NETWORK,
  asset: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',
  amount: '1000000',
  payTo: PAY_TO,
  maxTimeoutSeconds: UPTO_MAX_TIMEOUT_SECONDS,
  extra: { name: '4Mica', version: '1', verifyingContract: `0x${'1'.repeat(40)}` },
}

const RESOURCE = {
  url: 'http://localhost:3002/v2/acts/demo~scraper/run-sync-get-dataset-items',
  description: 'Run the demo~scraper Actor and return its dataset',
  mimeType: 'application/json',
}

function accepts(): PaymentRequirements[] {
  return [...shapeOnlyAccepts({ network: NETWORK, payTo: PAY_TO, amount: '1000000' }), CREDIT_ENTRY]
}

function signedPayload(): PaymentPayload {
  return {
    x402Version: 2,
    resource: RESOURCE,
    accepted: CREDIT_ENTRY,
    payload: { scheme: 'eip712', claims: { req_id: '1' }, signature: '0xsig' },
  }
}

describe("Apify's 402", () => {
  it('advertises upto and exact ahead of 4mica-credit, all for the same amount and payee', () => {
    const entries = accepts()
    expect(entries.map((entry) => entry.scheme)).toEqual(['upto', 'exact', '4mica-credit'])
    for (const entry of entries) {
      expect(entry.amount).toBe('1000000')
      expect(entry.payTo).toBe(PAY_TO)
      expect(entry.network).toBe(NETWORK)
    }
  })

  it("keeps Apify's windows: hours for upto, a minute for exact", () => {
    const [upto, exact] = accepts()
    expect(upto?.maxTimeoutSeconds).toBe(UPTO_MAX_TIMEOUT_SECONDS)
    expect(exact?.maxTimeoutSeconds).toBe(EXACT_MAX_TIMEOUT_SECONDS)
    expect(upto?.extra).toEqual({ name: 'USDC', version: '2' })
  })

  it('refuses a network it has no Circle USDC address for', () => {
    expect(() => shapeOnlyAccepts({ network: 'eip155:1', payTo: PAY_TO, amount: '1' })).toThrow(
      /eip155:1/
    )
  })

  it('round-trips through the payment-required header as x402 v2', () => {
    const challenge = paymentRequiredFor(RESOURCE, accepts())
    const decoded = decodePaymentRequiredHeader(paymentRequiredHeader(challenge))
    expect(decoded.x402Version).toBe(2)
    expect(decoded.resource.url).toBe(RESOURCE.url)
    expect(decoded.accepts).toHaveLength(3)
    expect(decoded.accepts[2]).toEqual(CREDIT_ENTRY)
  })

  it("uses Apify's error body verbatim", () => {
    expect(APIFY_PAYMENT_REQUIRED_BODY.error.type).toBe('x402-payment-required')
    expect(APIFY_PAYMENT_REQUIRED_BODY.error.message).toContain('PAYMENT-SIGNATURE')
  })
})

describe('readPaymentPayload', () => {
  it('returns undefined when the request carries no payment', () => {
    expect(readPaymentPayload({})).toBeUndefined()
    expect(readPaymentPayload({ meta: { progressToken: 1 } })).toBeUndefined()
  })

  it('decodes the PAYMENT-SIGNATURE header', () => {
    const payload = signedPayload()
    const header = encodePaymentSignatureHeader(payload)
    expect(readPaymentPayload({ header })).toEqual(payload)
    expect(readPaymentPayload({ header: [header] })).toEqual(payload)
  })

  it('prefers the MCP _meta payload over the header', () => {
    const fromMeta = signedPayload()
    const fromHeader = { ...signedPayload(), payload: { scheme: 'eip712', signature: '0xother' } }
    const read = readPaymentPayload({
      header: encodePaymentSignatureHeader(fromHeader),
      meta: { [MCP_PAYMENT_META_KEY]: fromMeta },
    })
    expect(read).toBe(fromMeta)
  })

  it('treats a header that is not a payment as malformed, not unpaid', () => {
    expect(() => readPaymentPayload({ header: 'not base64 json' })).toThrow(/base64/)
    const notAPayment = Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64')
    expect(() => readPaymentPayload({ header: notAPayment })).toThrow(/payment payload/)
  })
})

describe('MCP shapes', () => {
  it('marks the tool paid and lists every accept, with the first one flat', () => {
    const meta = toolPaymentMeta(accepts())
    expect(meta.paymentRequired).toBe(true)
    expect(meta.accepts).toHaveLength(3)
    expect(meta.scheme).toBe('upto')
    expect(meta.payTo).toBe(PAY_TO)
  })

  it('answers an unpaid call with an error result whose structured content is the challenge', () => {
    const challenge = paymentRequiredFor(RESOURCE, accepts())
    const result = paymentRequiredToolResult(challenge)
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({ x402Version: 2 })
    expect(result.structuredContent?.accepts).toHaveLength(3)
    expect(JSON.parse(result.content[0]?.text ?? '')).toEqual(challenge)
  })

  it('returns the dataset with the settlement in _meta once paid', () => {
    const items = fakeDataset('4mica')
    const settlement = { success: true, transaction: '', network: NETWORK, payer: '0xpayer' }
    const result = paidToolResult(items, settlement)
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toEqual({ items })
    expect(result._meta?.[MCP_PAYMENT_RESPONSE_META_KEY]).toBe(settlement)
  })
})

describe('fakeDataset', () => {
  it('produces five rows about the query', () => {
    const items = fakeDataset('Jan Curn x402 talk')
    expect(items).toHaveLength(5)
    expect(items[0]?.title).toContain('Jan Curn x402 talk')
    expect(items[4]?.url).toBe('https://example.com/jan-curn-x402-talk/5')
  })
})
