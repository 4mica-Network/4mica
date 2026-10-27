import { type FacilitatorConfig, HTTPFacilitatorClient } from '@x402/core/server'
import type { PaymentPayload, PaymentRequirements, SettleResponse } from '@x402/core/types'

const DEFAULT_FACILITATOR_URL = 'https://testnet.payment.4mica.io'

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
  constructor(config?: FacilitatorConfig) {
    super({ ...config, url: config?.url ?? DEFAULT_FACILITATOR_URL })
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

/** A `{ receipt, signature }` pair; anything else is not a guarantee receipt. */
function readGuaranteeReceipt(value: unknown): GuaranteeReceiptResponse | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { receipt, signature } = value as Record<string, unknown>
  return typeof receipt === 'string' && typeof signature === 'string'
    ? { receipt, signature }
    : undefined
}
