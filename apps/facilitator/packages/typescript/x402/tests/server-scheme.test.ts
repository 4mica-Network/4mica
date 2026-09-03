import { describe, expect, it } from 'vitest'

import { FourMicaEvmScheme, SUPPORTED_NETWORKS } from '../src/server/scheme.js'

const scheme = () => new FourMicaEvmScheme()

describe('FourMicaEvmScheme default assets', () => {
  // The name/version pair travels to clients in `extra` and is what they build their EIP-712
  // domain from. A mismatch with the token's own domain makes every signature unverifiable, so
  // these are pinned against the on-chain values rather than assumed uniform across networks.
  it.each([
    ['eip155:11155111', 'USDC', '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'],
    ['eip155:84532', 'USDC', '0x036CbD53842c5426634e7929541eC2318f3dCF7e'],
    ['eip155:8453', 'USD Coin', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'],
  ])('exposes the on-chain EIP-712 domain name for %s', async (network, name, asset) => {
    const parsed = await scheme().parsePrice('$1.00', network as never)

    expect(parsed.asset).toBe(asset)
    expect(parsed.extra).toMatchObject({ name, version: '2' })
  })

  it('converts a decimal price using the asset decimals', async () => {
    const parsed = await scheme().parsePrice('$1.50', 'eip155:8453' as never)

    expect(parsed.amount).toBe('1500000')
  })

  it('covers every supported network', async () => {
    for (const network of SUPPORTED_NETWORKS) {
      await expect(scheme().parsePrice('$1.00', network)).resolves.toBeDefined()
    }
  })

  it('rejects a network with no configured default asset', async () => {
    await expect(scheme().parsePrice('$1.00', 'eip155:1' as never)).rejects.toThrow(
      /No default asset configured/
    )
  })
})
