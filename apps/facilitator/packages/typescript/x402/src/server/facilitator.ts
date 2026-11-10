import { type FacilitatorConfig, HTTPFacilitatorClient } from '@x402/core/server'
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
} from '@x402/core/types'

const TESTNET_FACILITATOR_URL = 'https://testnet.payment.4mica.io'
const MAINNET_FACILITATOR_URL = 'https://payment.4mica.io'

/** The hosted 4mica facilitator for each network it serves. */
export const FACILITATOR_URLS: Readonly<Partial<Record<Network, string>>> = {
  'eip155:84532': TESTNET_FACILITATOR_URL,
  'eip155:8453': MAINNET_FACILITATOR_URL,
}

export interface FourMicaFacilitatorConfig extends FacilitatorConfig {
  /**
   * Networks to take from the facilitator's `/supported`; the rest are
   * ignored. Unset takes every network it lists.
   */
  networks?: Network[]
}

/**
 * The operator's guarantee receipt a 4mica `/settle` returns: the receipt
 * bytes and core's ECDSA signature over them, both 0x-hex. Verify it with
 * `@4mica/sdk`'s `client.payment.verifyGuarantee(GuaranteeReceipt.fromRpc(receipt))`.
 */
export interface GuaranteeReceiptResponse {
  receipt: string
  signature: string
}

/**
 * x402's settle response, with the guarantee receipt the facilitator relays
 * under `extra.receipt` lifted out. `extra` also carries 4mica's `retryable`
 * and `details` on a failure.
 */
export type FourMicaSettleResponse = SettleResponse & {
  receipt?: GuaranteeReceiptResponse
}

export class FourMicaFacilitatorClient extends HTTPFacilitatorClient {
  private readonly networks?: ReadonlySet<string>

  /** Defaults to the hosted Base Sepolia facilitator. */
  constructor(config: FourMicaFacilitatorConfig = {}) {
    const { networks, ...facilitatorConfig } = config
    super({ ...facilitatorConfig, url: facilitatorConfig.url ?? TESTNET_FACILITATOR_URL })
    this.networks = networks && new Set(networks)
  }

  /**
   * The facilitator's `/supported`, narrowed to `networks` when set, so a
   * resource server can hold one hosted facilitator per network without
   * either one claiming the other's network.
   */
  async getSupported(): Promise<SupportedResponse> {
    const supported = await super.getSupported()
    const networks = this.networks
    if (!networks) return supported
    return { ...supported, kinds: supported.kinds.filter((kind) => networks.has(kind.network)) }
  }

  /**
   * Settles through the facilitator. A refusal comes back as is, with
   * `success: false`: x402 relays a returned refusal to the payer whole, `extra`
   * included, but drops `extra` from a thrown `SettleError`.
   */
  async settle(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<FourMicaSettleResponse> {
    const settled = await super.settle(paymentPayload, paymentRequirements)
    if (!settled.success) return settled
    return { ...settled, receipt: readGuaranteeReceipt(settled.extra?.receipt) }
  }
}

/**
 * One client per network that has a hosted facilitator, each narrowed to its
 * own network. A network without one is skipped.
 */
export function hostedFacilitatorClients(
  networks: readonly Network[]
): FourMicaFacilitatorClient[] {
  return networks.flatMap((network) => {
    const url = FACILITATOR_URLS[network]
    return url ? [new FourMicaFacilitatorClient({ url, networks: [network] })] : []
  })
}

/** A `{ receipt, signature }` pair; anything else is not a guarantee receipt. */
function readGuaranteeReceipt(value: unknown): GuaranteeReceiptResponse | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { receipt, signature } = value as Record<string, unknown>
  return typeof receipt === 'string' && typeof signature === 'string'
    ? { receipt, signature }
    : undefined
}
