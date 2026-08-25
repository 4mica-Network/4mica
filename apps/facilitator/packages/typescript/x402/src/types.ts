import type { PaymentRequirements } from '@x402/core/types'

/**
 * Extra fields required by the 4mica V2 validation policy.
 */
export type FourMicaV2RequirementsExtra = {
  validationRegistryAddress: string
  validatorAddress: string
  validatorAgentId: string | number
  minValidationScore: number
  jobHash: string
  requiredValidationTag?: string
  tabEndpoint?: string
  rpcUrl?: string
  resource?: {
    url?: string
    description?: string
    mimeType?: string
  }
}

export type FourMicaPaymentRequirementsV2 = PaymentRequirements & {
  extra: FourMicaV2RequirementsExtra
}
