import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FourMicaEvmScheme } from '../src/client/scheme.js'

describe('FourMicaEvmScheme', () => {
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

    vi.spyOn(FourMicaEvmScheme as never, 'createX402Flow' as never).mockResolvedValue({
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

  it('rejects unsupported x402 versions', async () => {
    vi.spyOn(FourMicaEvmScheme as never, 'createX402Flow' as never).mockResolvedValue({
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
