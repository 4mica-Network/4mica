import type { PaymentPayload, PaymentRequirements } from '@4mica/x402'
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from '@x402/core/http'
import { describe, expect, it } from 'vitest'
import { meterRun } from '../src/apify/billing.js'
import { fakeDataset } from '../src/apify/dataset.js'
import {
  APIFY_PAYMENT_REQUIRED_BODY,
  EXACT_MAX_TIMEOUT_SECONDS,
  MCP_PAYMENT_META_KEY,
  MCP_PAYMENT_RESPONSE_META_KEY,
  paidToolResult,
  payerOf,
  paymentRequiredFor,
  paymentRequiredHeader,
  paymentRequiredToolResult,
  REFUND_HEADER,
  readPaymentPayload,
  refundHeader,
  settledFor,
  shapeOnlyAccepts,
  toolPaymentMeta,
  UPTO_MAX_TIMEOUT_SECONDS,
} from '../src/apify/payments.js'

const PAY_TO = '0x4aAbE17C239eF71c3A26bA7C2b3e0AeBbfC1DF26'
const NETWORK = 'eip155:84532' as const
const USDC = { decimals: 6, symbol: 'USDC' }
const BUYER = '0x5Ef6a28a5686Df09592B1A1E43FD0BA5Ee3B6a88'

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

describe('payerOf', () => {
  it('reads the buyer from the signed claims, checksummed', () => {
    const payload = signedPayload()
    payload.payload = {
      ...payload.payload,
      claims: { req_id: '1', user_address: '0x5ef6a28a5686df09592b1a1e43fd0ba5ee3b6a88' },
    }
    expect(payerOf(payload)).toBe('0x5Ef6a28a5686Df09592B1A1E43FD0BA5Ee3B6a88')
  })

  it('accepts the camel-case spelling and rejects anything that is not an address', () => {
    const payload = signedPayload()
    payload.payload = { ...payload.payload, claims: { userAddress: `0x${'a'.repeat(40)}` } }
    expect(payerOf(payload)?.toLowerCase()).toBe(`0x${'a'.repeat(40)}`)
    payload.payload = { ...payload.payload, claims: { user_address: 'not-an-address' } }
    expect(payerOf(payload)).toBeUndefined()
    expect(payerOf(signedPayload())).toBeUndefined()
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

  it('returns the receipt, the dataset list, and the settlements once paid', () => {
    const items = fakeDataset('4mica')
    const settlement = { success: true, transaction: '', network: NETWORK, payer: BUYER }
    const billing = meterRun('1000000', '20000', items.length)
    const refund = { amount: billing.refund, from: PAY_TO, to: BUYER, settlement }
    const parties = { buyer: BUYER, seller: PAY_TO }
    const result = paidToolResult(items, settlement, billing, refund, USDC, parties)
    expect(result.isError).toBeUndefined()
    expect(result.content[0]?.text).toContain('Refunded  0.90 USDC')
    expect(result.content[1]?.text).toMatch(/^5 results:\n1\. 4mica: result 1 {2}https:/)
    expect(result.structuredContent).toEqual({
      items,
      billing: {
        ...billing,
        refunded: { amount: '900000', from: PAY_TO, to: BUYER, settlement },
      },
      settlement,
    })
    expect(result._meta).toEqual({
      [MCP_PAYMENT_RESPONSE_META_KEY]: { success: true, network: NETWORK, amount: '100000' },
    })
  })

  it('says the cap stands when no refund was issued', () => {
    const items = fakeDataset('4mica')
    const settlement = { success: true, transaction: '', network: NETWORK }
    const billing = meterRun('1000000', '20000', items.length)
    const result = paidToolResult(items, settlement, billing, undefined, USDC, { seller: PAY_TO })
    expect(result.content[0]?.text).toContain('could not be issued; the cap stands')
    expect(result.structuredContent?.billing).toMatchObject({ refunded: null })
    expect(Object.keys(result._meta ?? {})).toEqual([MCP_PAYMENT_RESPONSE_META_KEY])
  })
})

describe('HTTP shapes', () => {
  it('reports what the run cost in the settlement, the way upto does', () => {
    const settlement = { success: true, transaction: '', network: NETWORK }
    expect(settledFor(settlement, meterRun('1000000', '20000', 5))).toEqual({
      ...settlement,
      amount: '100000',
    })
  })

  it('puts the receipt in the payment-refund header without the certificate', () => {
    const settlement = { success: true, transaction: '', network: NETWORK }
    const receipt = { amount: '900000', from: PAY_TO, to: '0xpayer', settlement }
    expect(REFUND_HEADER).toBe('payment-refund')
    expect(JSON.parse(refundHeader(receipt))).toEqual({
      amount: '900000',
      from: PAY_TO,
      to: '0xpayer',
    })
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
