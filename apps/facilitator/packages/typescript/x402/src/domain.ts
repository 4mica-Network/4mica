import type { Network } from '@x402/core/types'
import type { FourMicaDomainExtra } from './types.js'

/** The `extra` keys that carry core's EIP-712 domain. */
export const DOMAIN_EXTRA_KEYS = ['name', 'version', 'verifyingContract'] as const

/**
 * The EIP-712 domain a 4mica-credit requirement carries in `extra`, or
 * `undefined` when it carries none. A partial set is a misconfigured seller:
 * it throws rather than silently signing under a domain fetched from elsewhere.
 */
export function readDomainExtra(
  extra: Record<string, unknown> | undefined
): FourMicaDomainExtra | undefined {
  if (!extra) return undefined

  const present = DOMAIN_EXTRA_KEYS.filter(
    (key) => typeof extra[key] === 'string' && (extra[key] as string).length > 0
  )
  if (present.length === 0) return undefined
  if (present.length < DOMAIN_EXTRA_KEYS.length) {
    const missing = DOMAIN_EXTRA_KEYS.filter((key) => !present.includes(key)).join(', ')
    throw new Error(
      `4mica-credit requirements carry a partial EIP-712 domain in extra (missing ${missing})`
    )
  }

  return {
    name: extra.name as string,
    version: extra.version as string,
    verifyingContract: extra.verifyingContract as string,
  }
}

/** The chain id of an `eip155:*` CAIP-2 network; `undefined` for any other namespace. */
export function chainIdOf(network: Network | string): number | undefined {
  const [namespace, reference] = network.split(':')
  if (namespace !== 'eip155' || !reference || !/^\d+$/.test(reference)) return undefined
  return Number(reference)
}
