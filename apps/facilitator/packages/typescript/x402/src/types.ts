import type { PaymentRequirements } from '@x402/core/types'

/**
 * The `extra.validation` object a resource server advertises to gate a
 * payment on an external validator. Present ⇒ the payer signs the same
 * requirement into their claims, and the guarantee only becomes payable once
 * the validator approves it.
 */
export type FourMicaValidationExtra = {
  /** Validator identifier; must be on core's allowlist. */
  validator: string
  /** 0x-prefixed bytes32 the validator must approve. */
  subject: string
  /** Unix seconds; core tightens this to the cycle's resolution cutoff. */
  deadline?: number
  /** 0x-prefixed validator-specific policy bytes. */
  params?: string
}

/**
 * Extra fields the 4mica-credit scheme understands on `paymentRequirements`.
 * There is no tab endpoint any more: clients sign their claim straight from
 * the requirements, minting a random `reqId` locally.
 */
export type FourMicaRequirementsExtra = {
  validation?: FourMicaValidationExtra
  /** Override the 4Mica core API URL the client signs against. */
  rpcUrl?: string
  resource?: {
    url?: string
    description?: string
    mimeType?: string
  }
}

export type FourMicaPaymentRequirements = PaymentRequirements & {
  extra?: FourMicaRequirementsExtra
}
