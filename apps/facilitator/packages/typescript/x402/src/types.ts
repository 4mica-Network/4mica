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
 * The EIP-712 domain of the core a payer signs against, as
 * `GET /core/public-params` reports it (`eip712_name`, `eip712_version`,
 * `contract_address`). The chain id is not carried: it is the CAIP-2
 * reference in `network`, so the two can never disagree.
 */
export type FourMicaDomainExtra = {
  name: string
  version: string
  verifyingContract: string
}

/**
 * Extra fields the 4mica-credit scheme understands on `paymentRequirements`.
 * There is no tab endpoint any more: clients sign their claim straight from
 * the requirements, minting a random `reqId` locally.
 */
export type FourMicaRequirementsExtra = Partial<FourMicaDomainExtra> & {
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
