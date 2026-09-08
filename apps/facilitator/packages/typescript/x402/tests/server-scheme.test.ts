import { SupportedTokensResponse } from '@4mica/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FourMicaEvmScheme, SUPPORTED_NETWORKS } from '../src/server/scheme.js'

const USDC = '0x2222222222222222222222222222222222222222'
const OTHER = '0x3333333333333333333333333333333333333333'

const coreTokens = (...tokens: { symbol: string; address: string; decimals?: number }[]) =>
  new SupportedTokensResponse(84532, tokens)

/** `loadSupportedTokens` is private static; widen the class so the spy is typed. */
function spyOnLoadSupportedTokens() {
  return vi.spyOn(
    FourMicaEvmScheme as unknown as {
      loadSupportedTokens: (coreUrl: string) => Promise<SupportedTokensResponse>
    },
    'loadSupportedTokens'
  )
}

describe('FourMicaEvmScheme default assets', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The advertised asset must be one core accepts a guarantee against, so it
  // comes from core's own token list rather than a table in this package.
  it('resolves a Money price to the stablecoin core lists for the network', async () => {
    const load = spyOnLoadSupportedTokens().mockResolvedValue(
      coreTokens(
        { symbol: 'WETH', address: OTHER, decimals: 18 },
        { symbol: 'usdc', address: USDC, decimals: 6 }
      )
    )

    const parsed = await new FourMicaEvmScheme().parsePrice('$1.50', 'eip155:84532')

    expect(parsed).toEqual({ amount: '1500000', asset: USDC, extra: {} })
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('https://base.sepolia.api.4mica.xyz/')
  })

  it('asks core once per network', async () => {
    const load = spyOnLoadSupportedTokens().mockResolvedValue(
      coreTokens({ symbol: 'USDC', address: USDC, decimals: 6 })
    )
    const scheme = new FourMicaEvmScheme()

    await scheme.parsePrice('$1.00', 'eip155:84532')
    await scheme.parsePrice(2, 'eip155:84532')
    await scheme.parsePrice('$1.00', 'eip155:8453')

    expect(load.mock.calls.map(([url]) => url)).toEqual([
      'https://base.sepolia.api.4mica.xyz/',
      'https://base.api.4mica.xyz/',
    ])
  })

  it('retries after a failed lookup instead of caching the failure', async () => {
    const load = spyOnLoadSupportedTokens()
      .mockRejectedValueOnce(new Error('core unreachable'))
      .mockResolvedValue(coreTokens({ symbol: 'USDC', address: USDC, decimals: 6 }))
    const scheme = new FourMicaEvmScheme()

    await expect(scheme.parsePrice('$1.00', 'eip155:84532')).rejects.toThrow('core unreachable')
    await expect(scheme.parsePrice('$1.00', 'eip155:84532')).resolves.toMatchObject({
      asset: USDC,
    })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('honours a core URL override and a custom stablecoin symbol', async () => {
    const load = spyOnLoadSupportedTokens().mockResolvedValue(
      coreTokens(
        { symbol: 'USDC', address: USDC, decimals: 6 },
        { symbol: 'EURC', address: OTHER, decimals: 6 }
      )
    )
    const scheme = new FourMicaEvmScheme({
      coreUrls: { 'eip155:84532': 'http://localhost:3000/' },
      stablecoinSymbol: 'EURC',
    })

    const parsed = await scheme.parsePrice('$0.10', 'eip155:84532')

    expect(parsed).toEqual({ amount: '100000', asset: OTHER, extra: {} })
    expect(load).toHaveBeenCalledWith('http://localhost:3000/')
  })

  it('rejects a network with no known core without calling out', async () => {
    const load = spyOnLoadSupportedTokens()

    await expect(new FourMicaEvmScheme().parsePrice('$1.00', 'eip155:1')).rejects.toThrow(
      /No core API URL known for network eip155:1/
    )
    expect(load).not.toHaveBeenCalled()
  })

  it('rejects when core lists no such stablecoin', async () => {
    spyOnLoadSupportedTokens().mockResolvedValue(
      coreTokens({ symbol: 'WETH', address: OTHER, decimals: 18 })
    )

    await expect(new FourMicaEvmScheme().parsePrice('$1.00', 'eip155:84532')).rejects.toThrow(
      /lists no USDC for network eip155:84532 \(listed: WETH\)/
    )
  })

  it('rejects a stablecoin core lists without decimals', async () => {
    spyOnLoadSupportedTokens().mockResolvedValue(coreTokens({ symbol: 'USDC', address: USDC }))

    await expect(new FourMicaEvmScheme().parsePrice('$1.00', 'eip155:84532')).rejects.toThrow(
      /reports no decimals for USDC/
    )
  })

  it('passes an explicit AssetAmount through without asking core', async () => {
    const load = spyOnLoadSupportedTokens()

    const parsed = await new FourMicaEvmScheme().parsePrice(
      { amount: '5', asset: USDC },
      'eip155:84532'
    )

    expect(parsed).toEqual({ amount: '5', asset: USDC, extra: {} })
    expect(load).not.toHaveBeenCalled()
  })

  it('has a hosted core for every supported network', async () => {
    spyOnLoadSupportedTokens().mockResolvedValue(
      coreTokens({ symbol: 'USDC', address: USDC, decimals: 6 })
    )
    const scheme = new FourMicaEvmScheme()

    for (const network of SUPPORTED_NETWORKS) {
      await expect(scheme.parsePrice('$1.00', network)).resolves.toMatchObject({ asset: USDC })
    }
  })
})
