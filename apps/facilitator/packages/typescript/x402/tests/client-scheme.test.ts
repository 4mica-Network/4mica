import { SupportedTokensResponse } from '@4mica/sdk'
import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FourMicaEvmScheme } from '../src/client/scheme.js'

const USDC = '0x2222222222222222222222222222222222222222'

/** `createX402Flow` is private static; widen the class so the spy is typed. */
function spyOnCreateX402Flow() {
  return vi.spyOn(
    FourMicaEvmScheme as unknown as {
      createX402Flow: (...args: unknown[]) => Promise<unknown>
    },
    'createX402Flow'
  )
}

/** `loadSupportedTokens` is private static too; every connected core answers with USDC. */
function spyOnLoadSupportedTokens() {
  return vi
    .spyOn(
      FourMicaEvmScheme as unknown as {
        loadSupportedTokens: (rpcUrl: string) => Promise<SupportedTokensResponse>
      },
      'loadSupportedTokens'
    )
    .mockResolvedValue(
      new SupportedTokensResponse(84532, [{ symbol: 'USDC', address: USDC, decimals: 6 }])
    )
}

describe('FourMicaEvmScheme', () => {
  beforeEach(() => {
    spyOnLoadSupportedTokens()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes V2 resource metadata through to the SDK flow', async () => {
    const signPaymentV2 = vi.fn().mockResolvedValue({
      payload: {
        claims: {
          version: 'v2',
          validation_request_hash: '0x' + '11'.repeat(32),
          validation_subject_hash: '0x' + '22'.repeat(32),
        },
      },
    })

    spyOnCreateX402Flow().mockResolvedValue({
      signPayment: vi.fn(),
      signPaymentV2,
    } as never)

    const scheme = await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`))

    const requirements = {
      scheme: '4mica-credit',
      network: 'eip155:11155111',
      asset: '0x2222222222222222222222222222222222222222',
      amount: '10',
      payTo: '0x1111111111111111111111111111111111111111',
      extra: {
        rpcUrl: 'https://custom.rpc.example',
        validation: {
          validator: 'validator-id',
          subject: `0x${'42'.repeat(32)}`,
          deadline: 1700000600,
          params: '0xdeadbeef',
        },
        resource: {
          url: 'https://api.example.com/premium',
          description: 'Premium dataset',
          mimeType: 'application/json',
        },
      },
    }

    const result = await scheme.createPaymentPayload(2, requirements as never)

    expect(result.x402Version).toBe(2)
    expect(signPaymentV2).toHaveBeenCalledTimes(1)

    const paymentRequired = signPaymentV2.mock.calls[0]?.[0]
    expect(paymentRequired.resource).toEqual({
      url: 'https://api.example.com/premium',
      description: 'Premium dataset',
      mimeType: 'application/json',
    })

    const accepted = signPaymentV2.mock.calls[0]?.[1]
    expect(accepted).toMatchObject({
      scheme: '4mica-credit',
      network: 'eip155:11155111',
      asset: '0x2222222222222222222222222222222222222222',
      amount: '10',
      payTo: '0x1111111111111111111111111111111111111111',
    })
    expect(accepted.extra).toMatchObject({
      validation: {
        validator: 'validator-id',
        subject: `0x${'42'.repeat(32)}`,
        deadline: 1700000600,
        params: '0xdeadbeef',
      },
    })
  })

  it('connects to every hosted network up front by default', async () => {
    const createX402Flow = spyOnCreateX402Flow().mockResolvedValue({} as never)

    await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`))

    expect(createX402Flow.mock.calls.map(([, rpcUrl]) => rpcUrl)).toEqual([
      'https://ethereum.sepolia.api.4mica.xyz/',
      'https://base.sepolia.api.4mica.xyz/',
      'https://base.api.4mica.xyz/',
    ])
  })

  it('connects only to the given networks and pays through a core URL override', async () => {
    const signPaymentV2 = vi.fn().mockResolvedValue({ payload: {} })
    const createX402Flow = spyOnCreateX402Flow().mockResolvedValue({
      signPayment: vi.fn(),
      signPaymentV2,
    } as never)

    const scheme = await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`), {
      coreUrls: { 'eip155:31337': 'http://localhost:3000/' },
      networks: ['eip155:31337'],
    })
    await scheme.createPaymentPayload(2, {
      scheme: '4mica-credit',
      network: 'eip155:31337',
      asset: '0x2222222222222222222222222222222222222222',
      amount: '10',
      payTo: '0x1111111111111111111111111111111111111111',
    } as never)

    expect(createX402Flow).toHaveBeenCalledTimes(1)
    expect(createX402Flow.mock.calls[0]?.[1]).toBe('http://localhost:3000/')
    expect(signPaymentV2).toHaveBeenCalledTimes(1)
  })

  it('reports the assets core lists as default assets, so spend controls allow them', async () => {
    spyOnCreateX402Flow().mockResolvedValue({} as never)

    const scheme = await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`), {
      coreUrls: { 'eip155:31337': 'http://localhost:3000/' },
      networks: ['eip155:31337'],
    })

    expect(scheme.findDefaultAsset(USDC.toUpperCase(), 'eip155:31337')).toEqual({
      asset: USDC,
      decimals: 6,
      symbol: 'USDC',
    })
    expect(
      scheme.findDefaultAsset('0x3333333333333333333333333333333333333333', 'eip155:31337')
    ).toBeUndefined()
    // Not connected, so nothing is known about it yet.
    expect(scheme.findDefaultAsset(USDC, 'eip155:8453')).toBeUndefined()
  })

  it('rejects unsupported x402 versions', async () => {
    spyOnCreateX402Flow().mockResolvedValue({
      signPayment: vi.fn(),
      signPaymentV2: vi.fn(),
    } as never)

    const scheme = await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`))

    await expect(
      scheme.createPaymentPayload(3, {
        scheme: '4mica-credit',
        network: 'eip155:11155111',
        asset: '0x2222222222222222222222222222222222222222',
        amount: '10',
        payTo: '0x1111111111111111111111111111111111111111',
      } as never)
    ).rejects.toThrow('Unsupported x402Version: 3')
  })
})
