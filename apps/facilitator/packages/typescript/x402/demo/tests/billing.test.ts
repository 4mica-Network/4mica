import type { PaymentRequirements } from '@4mica/x402'
import { describe, expect, it } from 'vitest'
import {
  billingSummary,
  describeBilling,
  formatAmount,
  meterRun,
  refundRequirements,
  refundSummary,
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
      refunded: { amount: '900000', from: SELLER, to: BUYER },
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

describe('describeBilling', () => {
  const billing = meterRun('1000000', '20000', 5)

  it('says what was charged and what went back', () => {
    const receipt = { amount: '900000', from: SELLER, to: BUYER, settlement: SETTLEMENT }
    expect(describeBilling(billing, receipt, USDC)).toBe(
      `Charged 0.10 USDC of the 1.00 USDC cap: 5 results at 0.02 USDC. Refunded 0.90 USDC to ${BUYER} as a 4mica-credit guarantee; cap and refund net to 0.10 USDC when the cycle commits.`
    )
  })

  it('says so when the refund could not be issued', () => {
    expect(describeBilling(billing, undefined, USDC)).toContain(
      'The 0.90 USDC refund could not be issued, so the cap stands.'
    )
  })

  it('says so when the run used the whole cap', () => {
    const whole = meterRun('1000000', '300000', 5)
    expect(describeBilling(whole, undefined, USDC)).toBe(
      'Charged 1.00 USDC of the 1.00 USDC cap: 5 results at 0.30 USDC. The run used the whole cap; nothing to refund.'
    )
  })
})
