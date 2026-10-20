import { afterEach, describe, expect, it, vi } from 'vitest'

import { FourMicaFacilitatorClient } from '../src/server/facilitator.js'

describe('FourMicaFacilitatorClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('normalizes 4mica settle responses and preserves the guarantee receipt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          txHash: '0xdeadbeef',
          networkId: 'eip155:11155111',
          receipt: {
            receipt: `0x${'11'.repeat(32)}`,
            signature: `0x${'22'.repeat(65)}`,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const client = new FourMicaFacilitatorClient({ url: 'https://facilitator.example' })

    const result = await client.settle(
      {
        x402Version: 2,
        accepted: {
          scheme: '4mica-credit',
          network: 'eip155:11155111',
          asset: '0x2222222222222222222222222222222222222222',
          amount: '10',
          payTo: '0x1111111111111111111111111111111111111111',
        },
        payload: {
          payload: { version: 'v1' },
          signature: '0x1234',
        },
      } as never,
      {
        scheme: '4mica-credit',
        network: 'eip155:11155111',
        asset: '0x2222222222222222222222222222222222222222',
        amount: '10',
        payTo: '0x1111111111111111111111111111111111111111',
      } as never
    )

    expect(result.success).toBe(true)
    expect(result.transaction).toBe('0xdeadbeef')
    expect(result.network).toBe('eip155:11155111')
    expect(result.txHash).toBe('0xdeadbeef')
    expect(result.networkId).toBe('eip155:11155111')
    expect(result.receipt).toEqual({
      receipt: `0x${'11'.repeat(32)}`,
      signature: `0x${'22'.repeat(65)}`,
    })

    const request = fetchMock.mock.calls[0]?.[1]
    expect(typeof request?.body).toBe('string')
    expect(String(request?.body)).toContain('"x402Version":2')
    expect(String(request?.body)).toContain('"version":"v1"')
  })

  it('reads a receipt a facilitator relays as certificate, but not a BLS certificate', async () => {
    const settleWith = async (body: Record<string, unknown>) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, ...body })))
      )
      const requirements = {
        scheme: '4mica-credit',
        network: 'eip155:84532',
        asset: '0x2222222222222222222222222222222222222222',
        amount: '10',
        payTo: '0x1111111111111111111111111111111111111111',
      }
      return new FourMicaFacilitatorClient({ url: 'https://facilitator.example' }).settle(
        { x402Version: 2, accepted: requirements, payload: {} } as never,
        requirements as never
      )
    }

    const receipt = { receipt: '0xaa', signature: '0xbb' }
    await expect(settleWith({ certificate: receipt })).resolves.toMatchObject({ receipt })
    const bls = await settleWith({ certificate: { claims: '0xaa', signature: '0xbb' } })
    expect(bls.receipt).toBeUndefined()
  })

  it('normalizes alias fields when the facilitator omits txHash/networkId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          transactionHash: '0xabc123',
          network: 'eip155:80002',
          user_address: '0x9999999999999999999999999999999999999999',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const client = new FourMicaFacilitatorClient({ url: 'https://facilitator.example' })
    const result = await client.settle(
      {
        x402Version: 2,
        accepted: {
          scheme: '4mica-credit',
          network: 'eip155:80002',
          asset: '0x2222222222222222222222222222222222222222',
          amount: '10',
          payTo: '0x1111111111111111111111111111111111111111',
        },
        payload: {
          payload: { version: 'v1' },
          signature: '0x1234',
        },
      } as never,
      {
        scheme: '4mica-credit',
        network: 'eip155:80002',
        asset: '0x2222222222222222222222222222222222222222',
        amount: '10',
        payTo: '0x1111111111111111111111111111111111111111',
      } as never
    )

    expect(result.success).toBe(true)
    expect(result.transaction).toBe('0xabc123')
    expect(result.txHash).toBe('0xabc123')
    expect(result.network).toBe('eip155:80002')
    expect(result.networkId).toBe('eip155:80002')
    expect(result.payer).toBe('0x9999999999999999999999999999999999999999')
  })

  it('surfaces facilitator errors using normalized reasons', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error_reason: 'unsupported x402Version 2',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )

    vi.stubGlobal('fetch', fetchMock)

    const client = new FourMicaFacilitatorClient({ url: 'https://facilitator.example' })

    await expect(
      client.settle(
        {
          x402Version: 2,
          accepted: {
            scheme: '4mica-credit',
            network: 'eip155:11155111',
            asset: '0x2222222222222222222222222222222222222222',
            amount: '10',
            payTo: '0x1111111111111111111111111111111111111111',
          },
          payload: {
            payload: { version: 'v1' },
            signature: '0x1234',
          },
        } as never,
        {
          scheme: '4mica-credit',
          network: 'eip155:11155111',
          asset: '0x2222222222222222222222222222222222222222',
          amount: '10',
          payTo: '0x1111111111111111111111111111111111111111',
        } as never
      )
    ).rejects.toThrow('unsupported x402Version 2')
  })
})
