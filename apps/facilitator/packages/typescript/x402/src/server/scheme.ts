import {
  type CorePublicParameters,
  RpcProxy,
  resolveNetworkRpcUrl,
  type SupportedTokensResponse,
} from '@4mica/sdk'
import { SDK_DEFAULT_ASSET_TRANSFER_METHOD } from '@x402/core/server'
import type {
  AssetAmount,
  MoneyParser,
  Network,
  PaymentFlowConfig,
  PaymentRequirements,
  Price,
  SchemeNetworkServer,
} from '@x402/core/types'
import { chainIdOf, DOMAIN_EXTRA_KEYS } from '../domain.js'
import type { FourMicaDomainExtra } from '../types.js'

export const SUPPORTED_NETWORKS: Network[] = ['eip155:11155111', 'eip155:84532', 'eip155:8453']

/** The token a `Money` price resolves to, as core lists it for the network. */
export interface DefaultAsset {
  address: string
  decimals: number
}

export interface FourMicaEvmSchemeOptions {
  /**
   * Core API URL per network. Defaults to the hosted deployments in `@4mica/sdk`'s
   * `NETWORKS`; set an entry to point a network at a self-hosted core.
   */
  coreUrls?: Partial<Record<Network, string>>
  /**
   * Symbol of the token a `Money` price (`"$0.10"`) is denominated in, matched
   * case-insensitively against core's token list. Defaults to `USDC`.
   */
  stablecoinSymbol?: string
}

/**
 * EVM server implementation for the 4mica payment scheme.
 *
 * A `Money` price resolves to the stablecoin core lists for the network
 * (`GET /core/tokens`), so the advertised `asset` is always one core accepts a
 * guarantee against. Every requirement also carries core's EIP-712 domain in
 * `extra` (`name`, `version`, `verifyingContract`, from
 * `GET /core/public-params`), so a payer can sign without calling core. Both
 * are fetched once per network and cached for the life of the instance.
 */
export class FourMicaEvmScheme implements SchemeNetworkServer {
  readonly scheme = '4mica-credit'
  // No on-wire assetTransferMethod: a claim is a claim. The signed payment is
  // verified before the handler runs and settled (guarantee issued) after it
  // — the library's authorization flow.
  readonly defaultAssetTransferMethod = SDK_DEFAULT_ASSET_TRANSFER_METHOD
  readonly paymentFlows: Readonly<Record<string, PaymentFlowConfig>> = {
    [SDK_DEFAULT_ASSET_TRANSFER_METHOD]: {
      supported: ['authorization'],
      default: 'authorization',
    },
  }
  private moneyParsers: MoneyParser[] = []
  private readonly coreUrls: Partial<Record<Network, string>>
  private readonly stablecoinSymbol: string
  private readonly defaultAssets = new Map<Network, Promise<DefaultAsset>>()
  private readonly domains = new Map<Network, Promise<FourMicaDomainExtra>>()

  constructor(options: FourMicaEvmSchemeOptions = {}) {
    this.coreUrls = options.coreUrls ?? {}
    this.stablecoinSymbol = options.stablecoinSymbol ?? 'USDC'
  }

  /** Core's token list. Private static so tests can stub the network call. */
  private static loadSupportedTokens(coreUrl: string): Promise<SupportedTokensResponse> {
    return new RpcProxy(coreUrl).getSupportedTokens()
  }

  /** Core's public parameters. Private static so tests can stub the network call. */
  private static loadPublicParams(coreUrl: string): Promise<CorePublicParameters> {
    return new RpcProxy(coreUrl).getPublicParams()
  }

  /**
   * Register a custom money parser in the parser chain.
   * Multiple parsers can be registered - they will be tried in registration order.
   * Each parser receives a decimal amount (e.g., 1.50 for $1.50).
   * If a parser returns null, the next parser in the chain will be tried.
   * The default parser is always the final fallback.
   *
   * @param parser - Custom function to convert amount to AssetAmount (or null to skip)
   * @returns The server instance for chaining
   *
   * @example
   * evmServer.registerMoneyParser(async (amount, network) => {
   *   // Custom conversion logic
   *   if (amount > 100) {
   *     // Use different token for large amounts
   *     return { amount: (amount * 1e18).toString(), asset: "0xCustomToken" };
   *   }
   *   return null; // Use next parser
   * });
   */
  registerMoneyParser(parser: MoneyParser): FourMicaEvmScheme {
    this.moneyParsers.push(parser)
    return this
  }

  /**
   * Parses a price into an asset amount.
   * If price is already an AssetAmount, returns it directly.
   * If price is Money (string | number), parses to decimal and tries custom parsers.
   * Falls back to the stablecoin core lists for the network if all custom parsers return null.
   *
   * @param price - The price to parse
   * @param network - The network to use
   * @returns Promise that resolves to the parsed asset amount
   */
  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    // If already an AssetAmount, return it directly
    if (typeof price === 'object' && price !== null && 'amount' in price) {
      if (!price.asset) {
        throw new Error(`Asset address must be specified for AssetAmount on network ${network}`)
      }
      return {
        amount: price.amount,
        asset: price.asset,
        extra: price.extra || {},
      }
    }

    // Parse Money to decimal number
    const amount = this.parseMoneyToDecimal(price)

    // Try each custom money parser in order
    for (const parser of this.moneyParsers) {
      const result = await parser(amount, network)
      if (result !== null) {
        return result
      }
    }

    // All custom parsers returned null, use default conversion
    return this.defaultMoneyConversion(amount, network)
  }

  /**
   * Build payment requirements for this scheme/network combination.
   *
   * Adds core's EIP-712 domain to `extra` so the payer can sign without a
   * round trip to core. A domain the resource server set itself is kept; only
   * the missing keys are filled in. The chain id is not added: a client takes
   * it from `network`.
   *
   * @param paymentRequirements - The base payment requirements
   * @param supportedKind - The supported kind from facilitator (unused)
   * @param supportedKind.x402Version - The x402 version
   * @param supportedKind.scheme - The logical payment scheme
   * @param supportedKind.network - The network identifier in CAIP-2 format
   * @param supportedKind.extra - Optional extra metadata regarding scheme/network implementation details
   * @param extensionKeys - Extension keys supported by the facilitator (unused)
   * @returns Payment requirements ready to be sent to clients
   */
  async enhancePaymentRequirements(
    paymentRequirements: PaymentRequirements,
    supportedKind: {
      x402Version: number
      scheme: string
      network: Network
      extra?: Record<string, unknown>
    },
    extensionKeys: string[]
  ): Promise<PaymentRequirements> {
    void supportedKind
    void extensionKeys

    const extra: Record<string, unknown> = { ...(paymentRequirements.extra ?? {}) }
    const missing = DOMAIN_EXTRA_KEYS.filter((key) => typeof extra[key] !== 'string')
    if (missing.length === 0) return paymentRequirements

    const domain = await this.getDomain(paymentRequirements.network as Network)
    for (const key of missing) extra[key] = domain[key]

    return { ...paymentRequirements, extra }
  }

  /**
   * Parse Money (string | number) to a decimal number.
   * Handles formats like "$1.50", "1.50", 1.50, etc.
   *
   * @param money - The money value to parse
   * @returns Decimal number
   */
  private parseMoneyToDecimal(money: string | number): number {
    if (typeof money === 'number') {
      return money
    }

    // Remove $ sign and whitespace, then parse
    const cleanMoney = money.replace(/^\$/, '').trim()
    const amount = parseFloat(cleanMoney)

    if (Number.isNaN(amount)) {
      throw new Error(`Invalid money format: ${money}`)
    }

    return amount
  }

  /**
   * Default money conversion implementation.
   * Converts a decimal amount to the stablecoin core lists for the network.
   *
   * @param amount - The decimal amount (e.g., 1.50)
   * @param network - The network to use
   * @returns The parsed asset amount in the default stablecoin
   */
  private async defaultMoneyConversion(amount: number, network: Network): Promise<AssetAmount> {
    const asset = await this.getDefaultAsset(network)

    return {
      amount: this.convertToTokenAmount(amount.toString(), asset.decimals),
      asset: asset.address,
      // No EIP-3009 domain hints: a 4mica-credit payer signs against core's
      // guarantee domain, never the token's. `enhancePaymentRequirements` adds
      // that domain for every kind of price.
      extra: {},
    }
  }

  /**
   * Convert decimal amount to token units (e.g., 0.10 -> 100000 for 6-decimal tokens)
   *
   * @param decimalAmount - The decimal amount to convert
   * @param decimals - The number of decimals for the token
   * @returns The token amount as a string
   */
  private convertToTokenAmount(decimalAmount: string, decimals: number): string {
    const amount = parseFloat(decimalAmount)
    if (Number.isNaN(amount)) {
      throw new Error(`Invalid amount: ${decimalAmount}`)
    }
    // Convert to smallest unit (e.g., for USDC with 6 decimals: 0.10 * 10^6 = 100000)
    const [intPart, decPart = ''] = String(amount).split('.')
    const paddedDec = decPart.padEnd(decimals, '0').slice(0, decimals)
    const tokenAmount = (intPart + paddedDec).replace(/^0+/, '') || '0'
    return tokenAmount
  }

  private coreUrlFor(network: Network): string {
    const coreUrl = this.coreUrls[network] ?? resolveNetworkRpcUrl(network)
    if (!coreUrl) {
      throw new Error(`No core API URL known for network ${network}; pass one in coreUrls`)
    }
    return coreUrl
  }

  /**
   * The stablecoin core lists for `network`, fetched once and cached. A failed
   * lookup is not cached, so the next price parse retries.
   */
  private getDefaultAsset(network: Network): Promise<DefaultAsset> {
    return cachedLookup(this.defaultAssets, network, () => this.resolveDefaultAsset(network))
  }

  private async resolveDefaultAsset(network: Network): Promise<DefaultAsset> {
    const coreUrl = this.coreUrlFor(network)

    const { tokens } = await FourMicaEvmScheme.loadSupportedTokens(coreUrl)
    const wanted = this.stablecoinSymbol.toLowerCase()
    const token = tokens.find((entry) => entry.symbol.toLowerCase() === wanted)
    if (!token) {
      const listed = tokens.map((entry) => entry.symbol).join(', ') || 'none'
      throw new Error(
        `Core at ${coreUrl} lists no ${this.stablecoinSymbol} for network ${network} (listed: ${listed})`
      )
    }
    if (token.decimals === undefined) {
      throw new Error(
        `Core at ${coreUrl} reports no decimals for ${token.symbol} on network ${network}`
      )
    }

    return { address: token.address, decimals: token.decimals }
  }

  /**
   * Core's EIP-712 domain for `network`, fetched once and cached. A failed
   * lookup is not cached, so the next 402 retries.
   */
  private getDomain(network: Network): Promise<FourMicaDomainExtra> {
    return cachedLookup(this.domains, network, () => this.resolveDomain(network))
  }

  private async resolveDomain(network: Network): Promise<FourMicaDomainExtra> {
    const coreUrl = this.coreUrlFor(network)

    const params = await FourMicaEvmScheme.loadPublicParams(coreUrl)
    // The client derives the chain id from `network`, so a core that serves a
    // different chain would hand out a domain no signature can satisfy.
    const expectedChainId = chainIdOf(network)
    if (expectedChainId !== undefined && params.chainId !== expectedChainId) {
      throw new Error(
        `Core at ${coreUrl} serves chain ${params.chainId}, not ${network}; check coreUrls`
      )
    }

    return {
      name: params.eip712Name,
      version: params.eip712Version,
      verifyingContract: params.contractAddress,
    }
  }
}

/** Memoise a per-network lookup, dropping a rejected entry so the next call retries. */
function cachedLookup<T>(
  cache: Map<Network, Promise<T>>,
  network: Network,
  resolve: () => Promise<T>
): Promise<T> {
  let pending = cache.get(network)
  if (!pending) {
    pending = resolve().catch((err: unknown) => {
      cache.delete(network)
      throw err
    })
    cache.set(network, pending)
  }
  return pending
}
