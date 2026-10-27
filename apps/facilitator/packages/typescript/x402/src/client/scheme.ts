import {
  Client,
  ConfigBuilder,
  RpcProxy,
  resolveNetworkRpcUrl,
  PaymentRequirementsV2 as SdkPaymentRequirementsV2,
  type SupportedTokenInfo,
  type SupportedTokensResponse,
  X402Flow,
  X402PaymentRequired,
  X402ResourceInfo,
} from '@4mica/sdk'
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeClientHooks,
  SchemeNetworkClient,
} from '@x402/core/types'
import type { Account } from 'viem/accounts'
import { SUPPORTED_NETWORKS } from '../server/scheme.js'
import { type RecoveringPayer, recoverRefusedPayment } from './recovery.js'

export interface FourMicaEvmSchemeClientOptions {
  /**
   * Core API URL per network, overriding the hosted deployments in `@4mica/sdk`'s
   * `NETWORKS`; set an entry to pay on a self-hosted core.
   */
  coreUrls?: Partial<Record<Network, string>>
  /**
   * Networks to connect to up front. Defaults to every hosted network plus the
   * keys of `coreUrls`. Any other network connects lazily on its first payment.
   */
  networks?: Network[]
}

/** A connected core: the flow that signs for it and the client behind it. */
interface Payer {
  flow: Pick<X402Flow, 'signPayment' | 'signPaymentV2'>
  payment: RecoveringPayer
}

/** What `findDefaultAsset` reports for an asset core lists: `@x402/core`'s `DefaultAsset`. */
export interface FourMicaDefaultAsset {
  asset: string
  decimals: number
  symbol: string
}

export class FourMicaEvmScheme implements SchemeNetworkClient {
  readonly scheme = '4mica-credit'
  /**
   * When the facilitator refuses a payment for something the payer can fix
   * (a checkpoint core wants, a stale cycle or clock, a checkpoint cutoff),
   * fix it and have x402 retry the request once with a freshly signed payment.
   * A recovery that fails leaves the refusal for the caller.
   */
  readonly schemeHooks: SchemeClientHooks = {
    onPaymentResponse: async ({ requirements, settleResponse }) => {
      if (!settleResponse || settleResponse.success) return
      const payer = this.payers.get(this.rpcUrlFor(requirements) ?? '')
      if (!payer) return
      try {
        if (await recoverRefusedPayment(payer.payment, requirements.asset, settleResponse)) {
          return { recovered: true }
        }
      } catch {
        // The caller still gets the refusal, which names what to fix.
      }
    },
  }
  // rpcUrl -> connected core
  private readonly payers = new Map<string, Payer>()
  // rpcUrl -> the tokens that core accepts guarantees against
  private readonly tokensByRpcUrl = new Map<string, SupportedTokenInfo[]>()

  private constructor(
    private readonly signer: Account,
    private readonly coreUrls: Partial<Record<Network, string>>
  ) {}

  private static async connect(signer: Account, rpcUrl: string): Promise<Payer> {
    const cfg = new ConfigBuilder().rpcUrl(rpcUrl).signer(signer).build()
    const client = await Client.connect(cfg)

    return { flow: X402Flow.fromClient(client), payment: client.payment }
  }

  /** Core's token list. Private static so tests can stub the network call. */
  private static loadSupportedTokens(rpcUrl: string): Promise<SupportedTokensResponse> {
    return new RpcProxy(rpcUrl).getSupportedTokens()
  }

  static async create(
    signer: Account,
    options: FourMicaEvmSchemeClientOptions = {}
  ): Promise<FourMicaEvmScheme> {
    const coreUrls = options.coreUrls ?? {}
    const networks = options.networks ?? [
      ...SUPPORTED_NETWORKS,
      ...(Object.keys(coreUrls) as Network[]),
    ]
    const scheme = new FourMicaEvmScheme(signer, coreUrls)

    for (const network of new Set(networks)) {
      const rpcUrl = scheme.coreUrl(network)
      if (rpcUrl) await scheme.payerFor(rpcUrl)
    }

    return scheme
  }

  findDefaultAsset(asset: string, network: Network): FourMicaDefaultAsset | undefined {
    const rpcUrl = this.coreUrl(network)
    const tokens = rpcUrl ? this.tokensByRpcUrl.get(rpcUrl) : undefined
    const token = tokens?.find((entry) => entry.address.toLowerCase() === asset.toLowerCase())
    if (!token || token.decimals === undefined) return undefined

    return { asset: token.address, decimals: token.decimals, symbol: token.symbol }
  }

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements
  ): Promise<Pick<PaymentPayload, 'x402Version' | 'payload'>> {
    const network = paymentRequirements.network as Network
    if (!network) {
      throw new Error('Network is required in PaymentRequirements')
    }

    const rpcUrl = this.rpcUrlFor(paymentRequirements)
    if (!rpcUrl) {
      throw new Error(`No core API URL known for network ${network}`)
    }
    const x402Flow = (await this.payerFor(rpcUrl)).flow

    if (x402Version === 1) {
      const signed = await x402Flow.signPayment(
        paymentRequirements as unknown as Record<string, unknown>
      )
      return {
        x402Version: 1,
        payload: signed.payload as unknown as Record<string, unknown>,
      }
    } else if (x402Version === 2) {
      const resourcePayload =
        paymentRequirements.extra &&
        typeof paymentRequirements.extra === 'object' &&
        'resource' in paymentRequirements.extra &&
        typeof paymentRequirements.extra.resource === 'object' &&
        paymentRequirements.extra.resource !== null
          ? (paymentRequirements.extra.resource as Record<string, unknown>)
          : {}

      const accepted = SdkPaymentRequirementsV2.fromRaw(
        paymentRequirements as unknown as Record<string, unknown>
      )
      const paymentRequired = new X402PaymentRequired({
        x402Version: 2,
        resource: new X402ResourceInfo({
          url: String(resourcePayload.url ?? ''),
          description: String(resourcePayload.description ?? ''),
          mimeType: String(resourcePayload.mimeType ?? ''),
        }),
        accepts: [accepted],
      })
      const signed = await x402Flow.signPaymentV2(paymentRequired, accepted)

      return {
        x402Version: 2,
        payload: signed.payload as unknown as Record<string, unknown>,
      }
    }

    throw new Error(`Unsupported x402Version: ${x402Version}`)
  }

  private coreUrl(network: Network): string | undefined {
    return this.coreUrls[network] ?? resolveNetworkRpcUrl(network)
  }

  /**
   * The core that signs `paymentRequirements`. Every payment carries core's
   * active settlement cycle, so the payer always connects to a core: the one a
   * resource server names in `extra.rpcUrl`, then the payer's own overrides,
   * then the hosted deployment.
   */
  private rpcUrlFor(paymentRequirements: PaymentRequirements): string | undefined {
    return (
      (paymentRequirements.extra?.rpcUrl as string | undefined) ||
      this.coreUrl(paymentRequirements.network as Network)
    )
  }

  /** A core, connected and its token list loaded on first use. */
  private async payerFor(rpcUrl: string): Promise<Payer> {
    let payer = this.payers.get(rpcUrl)
    if (!payer) {
      payer = await FourMicaEvmScheme.connect(this.signer, rpcUrl)
      const { tokens } = await FourMicaEvmScheme.loadSupportedTokens(rpcUrl)
      this.payers.set(rpcUrl, payer)
      this.tokensByRpcUrl.set(rpcUrl, tokens)
    }
    return payer
  }
}
