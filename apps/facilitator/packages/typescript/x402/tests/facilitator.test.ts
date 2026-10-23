import { SettleError } from '@x402/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FourMicaFacilitatorClient } from '../src/server/facilitator.js'

const REQUIREMENTS = {
  scheme: '4mica-credit',
  network: 'eip155:84532',
  asset: '0x2222222222222222222222222222222222222222',
  amount: '10',
  payTo: '0x1111111111111111111111111111111111111111',
}
const PAYLOAD = {
  x402Version: 2,
  accepted: REQUIREMENTS,
  payload: { payload: { version: 'v1' }, signature: '0x1234' },
}
const RECEIPT = { receipt: `0x${'11'.repeat(32)}`, signature: `0x${'22'.repeat(65)}` }

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function settle() {
  return new FourMicaFacilitatorClient({ url: 'https://facilitator.example' }).settle(
    PAYLOAD as never,
    REQUIREMENTS as never
  )
}

describe('FourMicaFacilitatorClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lifts the guarantee receipt out of extra', async () => {
    const fetchMock = respondWith({
      success: true,
      payer: '0x9999999999999999999999999999999999999999',
      transaction: '',
      network: 'eip155:84532',
      extra: { receipt: RECEIPT },
    })

    const result = await settle()

    expect(result.success).toBe(true)
    expect(result.transaction).toBe('')
    expect(result.network).toBe('eip155:84532')
    expect(result.payer).toBe('0x9999999999999999999999999999999999999999')
    expect(result.receipt).toEqual(RECEIPT)

    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('"x402Version":2')
    expect(body).toContain('"version":"v1"')
  })

  it('leaves receipt empty when extra carries none, or a BLS-shaped one', async () => {
    respondWith({ success: true, transaction: '', network: 'eip155:84532' })
    expect((await settle()).receipt).toBeUndefined()

    respondWith({
      success: true,
      transaction: '',
      network: 'eip155:84532',
      extra: { receipt: { claims: '0xaa', signature: '0xbb' } },
    })
    expect((await settle()).receipt).toBeUndefined()
  })

  it('throws a SettleError carrying the reason and message of a refusal', async () => {
    respondWith({
      success: false,
      errorReason: 'invalid_4mica_credit_checkpoint_required',
      errorMessage: 'checkpoint required',
      transaction: '',
      network: 'eip155:84532',
      extra: { retryable: false, details: { uncheckpointed: 64 } },
    })

    const error = await settle().catch((err: unknown) => err)

    expect(error).toBeInstanceOf(SettleError)
    expect((error as SettleError).errorReason).toBe('invalid_4mica_credit_checkpoint_required')
    expect((error as SettleError).errorMessage).toBe('checkpoint required')
  })

  it('throws on a non-200 response', async () => {
    respondWith('unsupported x402Version 3', 422)
    await expect(settle()).rejects.toThrow('unsupported x402Version 3')
  })
})
