import {
  Client,
  ConfigBuilder,
  type PaymentRequirementsV1,
  X402Flow,
  type X402PaymentRequired,
  type X402ResourceInfo,
} from '@4mica/sdk'
import type {
  Network,
  PaymentPayload,
  PaymentRequirements,
  SchemeNetworkClient,
} from '@x402/core/types'
import type { Account } from 'viem/accounts'
import { SUPPORTED_NETWORKS } from '../server/scheme.js'

const NETWORK_RPC_URLS: Record<Network, string> = {
  'eip155:11155111': 'https://ethereum.sepolia.api.4mica.xyz',
  'eip155:84532': 'https://base.sepolia.api.4mica.xyz',
  'eip155:8453': 'https://base.api.4mica.xyz',
}

export class FourMicaEvmScheme implements SchemeNetworkClient {
  readonly scheme = '4mica-credit'

  private constructor(
    private readonly signer: Account,
    // rpcUrl -> x402Flow
    private readonly x402Flows: Map<string, X402Flow>
  ) {}

  private static async createX402Flow(signer: Account, rpcUrl: string): Promise<X402Flow> {
    const cfg = new ConfigBuilder().rpcUrl(rpcUrl).signer(signer).build()
    const client = await Client.new(cfg)

    return X402Flow.fromClient(client)
  }

  static async create(signer: Account): Promise<FourMicaEvmScheme> {
    const x402Flows = new Map<string, X402Flow>()

    for (const network of SUPPORTED_NETWORKS) {
      const rpcUrl = NETWORK_RPC_URLS[network]
      if (!rpcUrl) continue

      x402Flows.set(rpcUrl, await FourMicaEvmScheme.createX402Flow(signer, rpcUrl))
    }

    return new FourMicaEvmScheme(signer, x402Flows)
  }

  async createPaymentPayload(
    x402Version: number,
    paymentRequirements: PaymentRequirements
  ): Promise<Pick<PaymentPayload, 'x402Version' | 'payload'>> {
    const network = paymentRequirements.network as Network
    if (!network) {
      throw new Error('Network is required in PaymentRequirements')
    }

    const rpcUrl = (paymentRequirements.extra?.rpcUrl as string) ?? NETWORK_RPC_URLS[network]
    if (!rpcUrl) {
      throw new Error(`No RPC URL configured for network ${network}`)
    }

    let x402Flow = this.x402Flows.get(rpcUrl)
    if (!x402Flow) {
      x402Flow = await FourMicaEvmScheme.createX402Flow(this.signer, rpcUrl)
      this.x402Flows.set(rpcUrl, x402Flow)
    }

    if (x402Version === 1) {
      const signed = await x402Flow.signPayment(
        paymentRequirements as unknown as PaymentRequirementsV1,
        this.signer.address
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

      const resource: X402ResourceInfo = {
        url: String(resourcePayload.url ?? ''),
        description: String(resourcePayload.description ?? ''),
        mimeType: String(resourcePayload.mimeType ?? ''),
      }
      const paymentRequired: X402PaymentRequired = {
        x402Version: 2,
        resource,
        accepts: [paymentRequirements],
      }
      const signed = await x402Flow.signPaymentV2(
        paymentRequired,
        paymentRequirements,
        this.signer.address
      )

      return {
        x402Version: 2,
        payload: signed.payload as unknown as Record<string, unknown>,
      }
    }

    throw new Error(`Unsupported x402Version: ${x402Version}`)
  }
}
