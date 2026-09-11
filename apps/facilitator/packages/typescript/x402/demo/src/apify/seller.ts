import { RpcProxy, resolveNetworkRpcUrl } from '@4mica/sdk'
import type { Network, PaymentPayload, PaymentRequired, PaymentRequirements } from '@4mica/x402'
import { FourMicaEvmScheme as FourMicaPayerScheme } from '@4mica/x402/client'
import {
  FourMicaEvmScheme,
  FourMicaFacilitatorClient,
  x402ResourceServer,
} from '@4mica/x402/server'
import type { SettleResponse } from '@x402/core/types'
import { type Account, privateKeyToAccount } from 'viem/accounts'
import {
  meterRun,
  type RefundReceipt,
  type RunBilling,
  refundRequirements,
  type TokenInfo,
} from './billing.js'
import {
  paymentRequiredFor,
  type ResourceInfo,
  shapeOnlyAccepts,
  UPTO_MAX_TIMEOUT_SECONDS,
} from './payments.js'

export interface SellerOptions {
  network: Network
  /** The seller's wallet: recipient of every cap, payer of every refund. */
  signer: Account
  /**
   * The cap on one run: a money price such as `"$1.00"`, resolved to the USDC core lists for
   * the network.
   */
  price: string
  /** The price of one result, the same way. A run is charged results × this, up to the cap. */
  resultPrice: string
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
 * shape-only entries in front of it, verify and settle through the facilitator, and a
 * refund of the unused cap after the run, paid as a guarantee back to the buyer.
 */
export class DemoSeller {
  private constructor(
    private readonly server: x402ResourceServer,
    private readonly facilitator: FourMicaFacilitatorClient,
    /** Signs the refunds. It signs under the domain the cap advertises, so it never calls core. */
    private readonly payer: FourMicaPayerScheme,
    /** The seller's wallet: `payTo` on the cap, `user` on the refund. */
    readonly address: string,
    /** The real entry, the only one a payment can match. */
    readonly requirements: PaymentRequirements,
    /** The cap's entry priced at one result; its `amount` is the per-result price. */
    private readonly perResult: PaymentRequirements,
    /** The token the cap is priced in, for printing amounts. */
    readonly token: TokenInfo,
    /** The advertised entries in Apify's order: `upto`, `exact`, then `4mica-credit`. */
    readonly accepts: PaymentRequirements[]
  ) {}

  static async create(options: SellerOptions): Promise<DemoSeller> {
    const coreUrls = options.coreUrl ? { [options.network]: options.coreUrl } : undefined
    const facilitator = new FourMicaFacilitatorClient(
      options.facilitatorUrl ? { url: options.facilitatorUrl } : undefined
    )
    const scheme = new FourMicaEvmScheme(coreUrls ? { coreUrls } : {})
    const server = new x402ResourceServer(facilitator).register(options.network, scheme)
    // Learns which scheme and network pairs the facilitator serves; building
    // requirements for an unserved pair throws.
    await server.initialize()

    const build = async (price: string): Promise<PaymentRequirements> => {
      const [requirements] = await server.buildPaymentRequirements({
        scheme: scheme.scheme,
        network: options.network,
        payTo: options.signer.address,
        price,
        // Apify's window for a run, so a guarantee outlives a slow Actor.
        maxTimeoutSeconds: UPTO_MAX_TIMEOUT_SECONDS,
        // Tells payers where the network's core lives when it is not the hosted one.
        ...(options.coreUrl ? { extra: { rpcUrl: options.coreUrl } } : {}),
      })
      if (!requirements) {
        throw new Error(`No ${scheme.scheme} requirements could be built for ${options.network}`)
      }
      return requirements
    }
    const requirements = await build(options.price)
    const perResult = await build(options.resultPrice)
    const token = await tokenOf(requirements.asset, options.network, options.coreUrl)

    const payer = await FourMicaPayerScheme.create(options.signer, {
      networks: [],
      ...(coreUrls ? { coreUrls } : {}),
    })

    const accepts = [
      ...shapeOnlyAccepts({
        network: options.network,
        payTo: options.signer.address,
        amount: requirements.amount,
      }),
      requirements,
    ]
    return new DemoSeller(
      server,
      facilitator,
      payer,
      options.signer.address,
      requirements,
      perResult,
      token,
      accepts
    )
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

  /** Issues the cap guarantee in core, binding it to the open settlement cycle. Throws on failure. */
  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    return this.server.settlePayment(payload, requirements)
  }

  /** What a run that produced `results` results costs against the cap. */
  meter(results: number): RunBilling {
    return meterRun(this.requirements.amount, this.perResult.amount, results)
  }

  /**
   * Pays the buyer back the unused part of the cap: a `4mica-credit` guarantee from the
   * seller to the buyer for `billing.refund`, signed by the seller and settled through the
   * same facilitator. Core locks that much of the seller's collateral until the cycle
   * commits, then nets it against the cap. `undefined` when there is nothing to refund.
   */
  async refund(
    buyer: string,
    billing: RunBilling,
    resource: ResourceInfo
  ): Promise<RefundReceipt | undefined> {
    if (BigInt(billing.refund) === 0n) return undefined

    const requirements = refundRequirements(this.requirements, buyer, billing.refund)
    const signed = await this.payer.createPaymentPayload(2, requirements)
    const payload: PaymentPayload = {
      x402Version: 2,
      resource,
      accepted: requirements,
      payload: signed.payload,
    }
    const settlement = await this.facilitator.settle(payload, requirements)
    return { amount: billing.refund, from: this.address, to: buyer, settlement }
  }
}

/**
 * The refund after a settled run, with every failure logged rather than thrown: the buyer
 * has paid and run by now, so the dataset goes back either way and the result says whether
 * the refund went with it.
 */
export async function refundAfterRun(
  seller: DemoSeller,
  buyer: string | undefined,
  billing: RunBilling,
  resource: ResourceInfo
): Promise<RefundReceipt | undefined> {
  if (!buyer) {
    console.log('refund skipped: the settlement named no payer')
    return undefined
  }
  try {
    const receipt = await seller.refund(buyer, billing, resource)
    if (receipt) {
      console.log(
        `refund ok: guarantee for ${receipt.amount} from ${receipt.from} to ${receipt.to}`
      )
    }
    return receipt
  } catch (error) {
    console.log(`refund failed: ${(error as Error).message}`)
    return undefined
  }
}

/** The token core lists at `asset`, for printing amounts. */
async function tokenOf(asset: string, network: Network, coreUrl?: string): Promise<TokenInfo> {
  const rpcUrl = coreUrl ?? resolveNetworkRpcUrl(network)
  if (!rpcUrl) throw new Error(`No core API URL known for network ${network}`)
  const { tokens } = await new RpcProxy(rpcUrl).getSupportedTokens()
  const token = tokens.find((entry) => entry.address.toLowerCase() === asset.toLowerCase())
  if (!token || token.decimals === undefined) {
    throw new Error(`core on ${network} does not list ${asset}`)
  }
  return { decimals: token.decimals, symbol: token.symbol }
}

export type SellerEnv = SellerOptions & {
  /** Seconds the fake Actor "runs" before it returns its dataset. */
  runSeconds: number
}

/** The seller configuration both servers read from the environment. */
export function sellerEnv(): SellerEnv {
  const key = process.env.SELLER_PRIVATE_KEY
  if (!key?.startsWith('0x')) {
    console.error('Error: SELLER_PRIVATE_KEY environment variable must be set and start with 0x')
    console.error(
      'It is the seller wallet: it receives the caps and pays the refunds, so fund it too.'
    )
    process.exit(1)
  }
  return {
    // Base Sepolia by default: the facilitator serves 4mica-credit there for x402 v2.
    network: (process.env.NETWORK || 'eip155:84532') as Network,
    signer: privateKeyToAccount(key as `0x${string}`),
    // Apify's run endpoint advertises 1000000 (one USDC); the same figure here.
    price: process.env.ACTOR_PRICE || '$1.00',
    // A pay-per-event price: five results at $0.02 charge $0.10 of the $1.00 cap.
    resultPrice: process.env.RESULT_PRICE || '$0.02',
    coreUrl: process.env.CORE_URL || undefined,
    facilitatorUrl: process.env.FACILITATOR_URL || undefined,
    runSeconds: Number(process.env.RUN_SECONDS ?? 3),
  }
}
