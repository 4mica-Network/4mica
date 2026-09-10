import type { Network, PaymentPayload, PaymentRequired, PaymentRequirements } from '@4mica/x402'
import {
  FourMicaEvmScheme,
  FourMicaFacilitatorClient,
  x402ResourceServer,
} from '@4mica/x402/server'
import type { SettleResponse } from '@x402/core/types'
import {
  paymentRequiredFor,
  type ResourceInfo,
  shapeOnlyAccepts,
  UPTO_MAX_TIMEOUT_SECONDS,
} from './payments.js'

export interface SellerOptions {
  network: Network
  /** Recipient of the guarantees. */
  payTo: string
  /** A money price such as `"$1.00"`, resolved to the USDC core lists for the network. */
  price: string
  /** A self-hosted core for the network; the hosted deployment when unset. */
  coreUrl?: string
  /** The facilitator that verifies and settles; the hosted one when unset. */
  facilitatorUrl?: string
}

export type PaymentOutcome =
  | { status: 'invalid'; reason: string }
  | { status: 'verified'; requirements: PaymentRequirements; payer?: string }

/**
 * The seller half of an Apify-shaped run endpoint: one real `4mica-credit` entry built
 * by the scheme server (asset from core's token list, EIP-712 domain in `extra`), two
 * shape-only entries in front of it, and verify and settle through the facilitator.
 */
export class DemoSeller {
  private constructor(
    private readonly server: x402ResourceServer,
    /** The real entry, the only one a payment can match. */
    readonly requirements: PaymentRequirements,
    /** The advertised entries in Apify's order: `upto`, `exact`, then `4mica-credit`. */
    readonly accepts: PaymentRequirements[]
  ) {}

  static async create(options: SellerOptions): Promise<DemoSeller> {
    const facilitator = new FourMicaFacilitatorClient(
      options.facilitatorUrl ? { url: options.facilitatorUrl } : undefined
    )
    const scheme = new FourMicaEvmScheme(
      options.coreUrl ? { coreUrls: { [options.network]: options.coreUrl } } : {}
    )
    const server = new x402ResourceServer(facilitator).register(options.network, scheme)
    // Learns which scheme and network pairs the facilitator serves; building
    // requirements for an unserved pair throws.
    await server.initialize()

    const [requirements] = await server.buildPaymentRequirements({
      scheme: scheme.scheme,
      network: options.network,
      payTo: options.payTo,
      price: options.price,
      // Apify's window for a run, so a guarantee outlives a slow Actor.
      maxTimeoutSeconds: UPTO_MAX_TIMEOUT_SECONDS,
      // Tells payers where the network's core lives when it is not the hosted one.
      ...(options.coreUrl ? { extra: { rpcUrl: options.coreUrl } } : {}),
    })
    if (!requirements) {
      throw new Error(`No ${scheme.scheme} requirements could be built for ${options.network}`)
    }

    const accepts = [
      ...shapeOnlyAccepts({
        network: options.network,
        payTo: options.payTo,
        amount: requirements.amount,
      }),
      requirements,
    ]
    return new DemoSeller(server, requirements, accepts)
  }

  /** The challenge for one resource, carrying all three entries. */
  paymentRequired(resource: ResourceInfo): PaymentRequired {
    return paymentRequiredFor(resource, this.accepts)
  }

  /**
   * Checks a payment against the real entry and has the facilitator verify the signed
   * guarantee request. A payment that picked a shape-only entry is invalid here, the
   * same way it would be at a seller whose facilitator does not serve that scheme.
   */
  async verify(payload: PaymentPayload): Promise<PaymentOutcome> {
    const requirements = this.server.findMatchingRequirements([this.requirements], payload)
    if (!requirements) {
      const picked = payload.accepted?.scheme ?? 'unknown'
      return {
        status: 'invalid',
        reason: `payment accepted the "${picked}" entry; only ${this.requirements.scheme} can be verified here`,
      }
    }

    const result = await this.server.verifyPayment(payload, requirements)
    if (!result.isValid) {
      return { status: 'invalid', reason: result.invalidReason ?? 'verification failed' }
    }
    return { status: 'verified', requirements, payer: result.payer }
  }

  /** Issues the guarantee in core, binding it to the open settlement cycle. Throws on failure. */
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    return this.server.settlePayment(payload, requirements)
  }
}

export interface SellerEnv {
  network: Network
  payTo: string
  price: string
  coreUrl?: string
  facilitatorUrl?: string
  /** Seconds the fake Actor "runs" before it returns its dataset. */
  runSeconds: number
}

/** The seller configuration both servers read from the environment. */
export function sellerEnv(): SellerEnv {
  const payTo = process.env.PAY_TO_ADDRESS
  if (!payTo) {
    console.error('Error: PAY_TO_ADDRESS environment variable is required')
    process.exit(1)
  }
  return {
    // Base Sepolia by default: the facilitator serves 4mica-credit there for x402 v2.
    network: (process.env.NETWORK || 'eip155:84532') as Network,
    payTo,
    // Apify's run endpoint advertises 1000000 (one USDC); the same figure here.
    price: process.env.ACTOR_PRICE || '$1.00',
    coreUrl: process.env.CORE_URL || undefined,
    facilitatorUrl: process.env.FACILITATOR_URL || undefined,
    runSeconds: Number(process.env.RUN_SECONDS ?? 3),
  }
}
