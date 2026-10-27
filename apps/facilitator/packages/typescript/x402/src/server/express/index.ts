import {
  type FacilitatorClient,
  type PaywallConfig,
  type PaywallProvider,
  type RoutesConfig,
  x402HTTPResourceServer,
  x402ResourceServer,
} from '@x402/core/server'
import type { Network, SchemeNetworkServer } from '@x402/core/types'
import { paymentMiddlewareFromHTTPServer as x402PaymentMiddlewareFromHTTPServer } from '@x402/express'
import { FourMicaFacilitatorClient } from '../facilitator.js'
import { FourMicaEvmScheme, SUPPORTED_NETWORKS } from '../scheme.js'

/**
 * Register the default 4mica scheme server for every hosted network, leaving
 * alone any network the caller already registered one for (for example a
 * `FourMicaEvmScheme` pointed at a self-hosted core).
 */
function registerNetworkServers(server: x402ResourceServer) {
  const schemeServer = new FourMicaEvmScheme()
  for (const network of SUPPORTED_NETWORKS) {
    if (!server.hasRegisteredScheme(network, schemeServer.scheme)) {
      server.register(network, schemeServer)
    }
  }
}

/**
 * Configuration for registering a payment scheme with a specific network
 */
export interface SchemeRegistration {
  /**
   * The network identifier (e.g., 'eip155:84532', 'solana:mainnet')
   */
  network: Network

  /**
   * The scheme server implementation for this network
   */
  server: SchemeNetworkServer
}

/**
 * Express payment middleware for x402 protocol (direct HTTP server instance).
 *
 * `@x402/express`'s middleware with the 4mica scheme registered for every
 * hosted network. A refused settlement answers 402 with the facilitator's
 * response in `PAYMENT-RESPONSE`, so the payer can act on its reason.
 *
 * @param httpServer - Pre-configured x402HTTPResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromHTTPServer, x402ResourceServer, x402HTTPResourceServer } from "@4mica/x402/server/express";
 *
 * const resourceServer = new x402ResourceServer(facilitatorClient)
 *
 * const httpServer = new x402HTTPResourceServer(resourceServer, routes)
 *   .onProtectedRequest(requestHook);
 *
 * app.use(paymentMiddlewareFromHTTPServer(httpServer));
 * ```
 */
export function paymentMiddlewareFromHTTPServer(
  httpServer: x402HTTPResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  registerNetworkServers(httpServer.server)
  return x402PaymentMiddlewareFromHTTPServer(
    httpServer,
    paywallConfig,
    paywall,
    syncFacilitatorOnStart
  )
}

/**
 * Express payment middleware for x402 protocol (direct server instance).
 *
 * Use this when you want to pass a pre-configured x402ResourceServer instance.
 * This provides more flexibility for testing, custom configuration, and reusing
 * server instances across multiple middlewares.
 *
 * @param routes - Route configurations for protected endpoints
 * @param server - Pre-configured x402ResourceServer instance
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddleware } from "@4mica/x402/server/express";
 *
 * const server = new x402ResourceServer(myFacilitatorClient)
 *
 * app.use(paymentMiddleware(routes, server));
 * ```
 */
export function paymentMiddleware(
  routes: RoutesConfig,
  server: x402ResourceServer,
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  const httpServer = new x402HTTPResourceServer(server, routes)

  return paymentMiddlewareFromHTTPServer(httpServer, paywallConfig, paywall, syncFacilitatorOnStart)
}

/**
 * Express payment middleware for x402 protocol (configuration-based).
 *
 * Use this when you want to quickly set up middleware with simple configuration.
 * This function creates and configures the x402ResourceServer internally, with
 * the hosted 4mica facilitator unless one is passed.
 *
 * @param routes - Route configurations for protected endpoints
 * @param facilitatorClients - Optional facilitator client(s) for payment processing
 * @param schemes - Optional array of scheme registrations for server-side payment processing
 * @param paywallConfig - Optional configuration for the built-in paywall UI
 * @param paywall - Optional custom paywall provider (overrides default)
 * @param syncFacilitatorOnStart - Whether to sync with the facilitator on startup (defaults to true)
 * @returns Express middleware handler
 *
 * @example
 * ```typescript
 * import { paymentMiddlewareFromConfig } from "@4mica/x402/server/express";
 *
 * app.use(paymentMiddlewareFromConfig(routes));
 * ```
 */
export function paymentMiddlewareFromConfig(
  routes: RoutesConfig,
  facilitatorClients?: FacilitatorClient | FacilitatorClient[],
  schemes?: SchemeRegistration[],
  paywallConfig?: PaywallConfig,
  paywall?: PaywallProvider,
  syncFacilitatorOnStart: boolean = true
) {
  const facilitators = facilitatorClients
    ? Array.isArray(facilitatorClients)
      ? facilitatorClients
      : [facilitatorClients]
    : []

  if (!facilitators.some((c) => c instanceof FourMicaFacilitatorClient)) {
    facilitators.push(new FourMicaFacilitatorClient())
  }

  const ResourceServer = new x402ResourceServer(facilitators)

  if (schemes) {
    schemes.forEach(({ network, server: schemeServer }) => {
      ResourceServer.register(network, schemeServer)
    })
  }

  return paymentMiddleware(routes, ResourceServer, paywallConfig, paywall, syncFacilitatorOnStart)
}

export { ExpressAdapter, setSettlementOverrides } from '@x402/express'
