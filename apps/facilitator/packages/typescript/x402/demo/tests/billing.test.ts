import type { PaymentRequirements } from '@4mica/x402'
import { describe, expect, it } from 'vitest'
import {
  billingSummary,
  formatAmount,
  meterRun,
  receipt,
  refundRequirements,
  refundSummary,
  shortAddress,
} from '../src/apify/billing.js'

const SELLER = '0x4aAbE17C239eF71c3A26bA7C2b3e0AeBbfC1DF26'
const BUYER = '0x1111111111111111111111111111111111111111'
const USDC = { decimals: 6, symbol: 'USDC' }

const CAP: PaymentRequirements = {
  scheme: '4mica-credit',
  network: 'eip155:84532',
  asset: '0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f',
  amount: '1000000',
  payTo: SELLER,
  maxTimeoutSeconds: 18_000,
  extra: { name: '4Mica', version: '1', verifyingContract: `0x${'1'.repeat(40)}` },
}

const SETTLEMENT = { success: true, transaction: '', network: 'eip155:84532' as const }

describe('meterRun', () => {
  it('charges results × the per-result price and refunds the rest of the cap', () => {
    expect(meterRun('1000000', '20000', 5)).toEqual({
      cap: '1000000',
      charged: '100000',
      refund: '900000',
      results: 5,
      pricePerResult: '20000',
    })
  })

  it('never charges above the cap', () => {
    const billing = meterRun('1000000', '300000', 5)
    expect(billing.charged).toBe('1000000')
    expect(billing.refund).toBe('0')
  })

  it('works at cent scale: a $0.01 cap, five results at $0.0016', () => {
    const billing = meterRun('10000', '1600', 5)
    expect(billing.charged).toBe('8000')
    expect(billing.refund).toBe('2000')
    expect(formatAmount(billing.charged, USDC)).toBe('0.008 USDC')
    expect(formatAmount(billing.refund, USDC)).toBe('0.002 USDC')
    expect(formatAmount(billing.pricePerResult, USDC)).toBe('0.0016 USDC')
  })

  it('charges nothing for a run that produced nothing', () => {
    const billing = meterRun('1000000', '20000', 0)
    expect(billing.charged).toBe('0')
    expect(billing.refund).toBe('1000000')
  })
})

describe('refundRequirements', () => {
  it('swaps the roles and keeps the scheme, network, asset, window and domain', () => {
    const refund = refundRequirements(CAP, BUYER, '900000')
    expect(refund).toEqual({ ...CAP, payTo: BUYER, amount: '900000' })
  })

  it('does not share the extra object with the cap', () => {
    const refund = refundRequirements(CAP, BUYER, '900000')
    expect(refund.extra).not.toBe(CAP.extra)
  })
})

describe('receipts', () => {
  const receipt = { amount: '900000', from: SELLER, to: BUYER, settlement: SETTLEMENT }

  it('summarises a receipt without its settlement', () => {
    expect(refundSummary(receipt)).toEqual({ amount: '900000', from: SELLER, to: BUYER })
  })

  it('puts the refund on the billing, or null when none was issued', () => {
    const billing = meterRun('1000000', '20000', 5)
    expect(billingSummary(billing, receipt)).toEqual({
      ...billing,
      refunded: { amount: '900000', from: SELLER, to: BUYER, settlement: SETTLEMENT },
    })
    expect(billingSummary(billing, undefined)).toEqual({ ...billing, refunded: null })
  })
})

describe('formatAmount', () => {
  it('prints at least two decimals', () => {
    expect(formatAmount('1000000', USDC)).toBe('1.00 USDC')
    expect(formatAmount('900000', USDC)).toBe('0.90 USDC')
    expect(formatAmount('20000', USDC)).toBe('0.02 USDC')
    expect(formatAmount(123456n, USDC)).toBe('0.123456 USDC')
    expect(formatAmount('0', USDC)).toBe('0.00 USDC')
  })
})

describe('receipt', () => {
  const billing = meterRun('10000', '1600', 5)
  const parties = { buyer: BUYER, seller: SELLER }

  it('is three lines: the cap, the metering, the refund', () => {
    const refund = { amount: '2000', from: SELLER, to: BUYER, settlement: SETTLEMENT }
    const lines = receipt(billing, refund, USDC, parties).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Cap       0.01 USDC')
    expect(lines[0]).toContain(
      `from buyer ${shortAddress(BUYER)} to seller ${shortAddress(SELLER)}`
    )
    expect(lines[1]).toContain('Charged   0.008 USDC')
    expect(lines[1]).toContain('5 results at 0.0016 USDC')
    expect(lines[2]).toContain('Refunded  0.002 USDC')
    expect(lines[2]).toContain('net to 0.008 USDC when the cycle commits')
  })

  it('says the cap stands when the refund could not be issued', () => {
    const lines = receipt(billing, undefined, USDC, parties).split('\n')
    expect(lines[2]).toContain('the 0.002 USDC refund could not be issued; the cap stands')
  })

  it('says so when the run used the whole cap', () => {
    const whole = meterRun('10000', '3000', 5)
    const lines = receipt(whole, undefined, USDC, parties).split('\n')
    expect(lines[1]).toContain('Charged   0.01 USDC')
    expect(lines[2]).toContain('the run used the whole cap')
  })

  it('does not invent a buyer when the payment named none', () => {
    expect(receipt(billing, undefined, USDC, { seller: SELLER })).toContain(
      `from the buyer to seller ${shortAddress(SELLER)}`
    )
  })
})

describe('shortAddress', () => {
  it('keeps enough to tell two addresses apart', () => {
    expect(shortAddress(BUYER)).toBe('0x1111…1111')
    expect(shortAddress(SELLER)).toBe('0x4aAb…DF26')
  })
})
