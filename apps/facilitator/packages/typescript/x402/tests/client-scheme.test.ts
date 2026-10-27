import { SupportedTokensResponse } from '@4mica/sdk'
import { privateKeyToAccount } from 'viem/accounts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FourMicaEvmScheme } from '../src/client/scheme.js'

const USDC = '0x2222222222222222222222222222222222222222'

/** `connect` is private static; widen the class so the spy is typed. */
function spyOnConnect() {
  return vi.spyOn(
    FourMicaEvmScheme as unknown as {
      connect: (...args: unknown[]) => Promise<unknown>
    },
    'connect'
  )
}

/** A connected core whose flow is `flow` and whose payment client is `payment`. */
function payer(flow: object, payment: object = {}) {
  return { flow, payment }
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
    const wire = {
      payload: { version: 'v1', cycle_id: `0x${'33'.repeat(32)}` },
      signature: `0x${'44'.repeat(65)}`,
    }
    const signPaymentV2 = vi.fn().mockResolvedValue({ payload: wire })

    spyOnConnect().mockResolvedValue(
      payer({
        signPayment: vi.fn(),
        signPaymentV2,
      })
    )

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

    expect(result).toEqual({ x402Version: 2, payload: wire })
    expect(signPaymentV2).toHaveBeenCalledTimes(1)
    // The payer is the flow's own signer; no user address is passed in.
    expect(signPaymentV2.mock.calls[0]).toHaveLength(2)

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

  it('connects to Base Sepolia up front by default', async () => {
    const connect = spyOnConnect().mockResolvedValue(payer({}))

    await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`))

    expect(connect.mock.calls.map(([, rpcUrl]) => rpcUrl)).toEqual([
      'https://base.sepolia.api.4mica.io/',
    ])
  })

  it('connects only to the given networks and pays through a core URL override', async () => {
    const signPaymentV2 = vi.fn().mockResolvedValue({ payload: {} })
    const connect = spyOnConnect().mockResolvedValue(
      payer({
        signPayment: vi.fn(),
        signPaymentV2,
      })
    )

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

    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect.mock.calls[0]?.[1]).toBe('http://localhost:3000/')
    expect(signPaymentV2).toHaveBeenCalledTimes(1)
  })

  it('reports the assets core lists as default assets, so spend controls allow them', async () => {
    spyOnConnect().mockResolvedValue(payer({}))

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
    spyOnConnect().mockResolvedValue(
      payer({
        signPayment: vi.fn(),
        signPaymentV2: vi.fn(),
      })
    )

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

describe('FourMicaEvmScheme always signs through core', () => {
  const BASE = {
    scheme: '4mica-credit',
    network: 'eip155:84532',
    asset: USDC,
    amount: '1000',
    payTo: '0x1111111111111111111111111111111111111111',
    maxTimeoutSeconds: 300,
  }
  // What a seller on @4mica/x402 2.0.0-alpha.2 still advertises. A payment
  // needs core's active cycle id, so a domain in extra cannot replace core.
  const STALE_DOMAIN = {
    name: '4Mica-base-sepolia',
    version: '1',
    verifyingContract: '0x41fD0745b0C96D49576b66688d1BF0BB1CbF85b2',
  }

  beforeEach(() => {
    spyOnLoadSupportedTokens()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connects to the core the seller names even when extra carries an EIP-712 domain', async () => {
    const signPayment = vi.fn().mockResolvedValue({ payload: { payload: {}, signature: '0x' } })
    const connect = spyOnConnect().mockResolvedValue(
      payer({
        signPayment,
        signPaymentV2: vi.fn(),
      })
    )
    const scheme = await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`), {
      networks: [],
    })

    await scheme.createPaymentPayload(1, {
      ...BASE,
      extra: { ...STALE_DOMAIN, rpcUrl: 'https://seller.core.example/' },
    } as never)

    expect(connect).toHaveBeenCalledTimes(1)
    expect(connect.mock.calls[0]?.[1]).toBe('https://seller.core.example/')
    expect(signPayment).toHaveBeenCalledTimes(1)
    expect(signPayment.mock.calls[0]).toHaveLength(1)
  })

  it('falls back to the hosted core for the network', async () => {
    const connect = spyOnConnect().mockResolvedValue(
      payer({
        signPayment: vi.fn(),
        signPaymentV2: vi.fn().mockResolvedValue({ payload: {} }),
      })
    )
    const scheme = await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`), {
      networks: [],
    })

    await scheme.createPaymentPayload(2, { ...BASE, extra: STALE_DOMAIN } as never)

    expect(connect.mock.calls.map(([, rpcUrl]) => rpcUrl)).toEqual([
      'https://base.sepolia.api.4mica.io/',
    ])
  })

  it('refuses a network with no known core', async () => {
    const connect = spyOnConnect()
    const scheme = await FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`), {
      networks: [],
    })

    await expect(
      scheme.createPaymentPayload(2, { ...BASE, network: 'eip155:1' } as never)
    ).rejects.toThrow('No core API URL known for network eip155:1')
    expect(connect).not.toHaveBeenCalled()
  })
})

describe('FourMicaEvmScheme recovers refused payments', () => {
  const REQUIREMENTS = {
    scheme: '4mica-credit',
    network: 'eip155:84532',
    asset: USDC,
    amount: '1000',
    payTo: '0x1111111111111111111111111111111111111111',
    maxTimeoutSeconds: 300,
  }

  beforeEach(() => {
    spyOnLoadSupportedTokens()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function connectedScheme(payment: object) {
    spyOnConnect().mockResolvedValue(
      payer({ signPayment: vi.fn(), signPaymentV2: vi.fn() }, payment)
    )
    return FourMicaEvmScheme.create(privateKeyToAccount(`0x${'11'.repeat(32)}`), {
      networks: ['eip155:84532'],
    })
  }

  function respond(scheme: FourMicaEvmScheme, settleResponse: Record<string, unknown>) {
    return scheme.schemeHooks.onPaymentResponse?.({
      paymentPayload: { x402Version: 2, accepted: REQUIREMENTS, payload: {} },
      requirements: REQUIREMENTS,
      settleResponse,
    } as never)
  }

  it('checkpoints and asks x402 to retry when core wants a checkpoint', async () => {
    const checkpointActiveCycle = vi.fn().mockResolvedValue(undefined)
    const scheme = await connectedScheme({ checkpointActiveCycle })

    const result = await respond(scheme, {
      success: false,
      errorReason: 'invalid_4mica_credit_checkpoint_required',
      transaction: '',
      network: 'eip155:84532',
    })

    expect(result).toEqual({ recovered: true })
    expect(checkpointActiveCycle).toHaveBeenCalledWith(USDC)
  })

  it('leaves a successful settlement and an unrecoverable refusal alone', async () => {
    const scheme = await connectedScheme({})

    expect(
      await respond(scheme, { success: true, transaction: '', network: 'eip155:84532' })
    ).toBeUndefined()
    expect(
      await respond(scheme, {
        success: false,
        errorReason: 'insufficient_funds',
        transaction: '',
        network: 'eip155:84532',
      })
    ).toBeUndefined()
  })

  it('leaves the refusal for the caller when the checkpoint fails', async () => {
    const checkpointActiveCycle = vi.fn().mockRejectedValue(new Error('core unreachable'))
    const scheme = await connectedScheme({ checkpointActiveCycle })

    const result = await respond(scheme, {
      success: false,
      errorReason: 'invalid_4mica_credit_checkpoint_required',
      transaction: '',
      network: 'eip155:84532',
    })

    expect(result).toBeUndefined()
  })
})
